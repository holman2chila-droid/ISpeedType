// ===== Durable Object: sala 1v1 (servidor autoritativo) =====
// Cada pulsación llega en vivo; el servidor la aplica contra el texto, sella el
// tiempo con SU reloj y retransmite el progreso al rival. El cliente nunca decide
// quién gana ni cuánto WPM hizo.
//   - Salas "mm-…": creadas por el matchmaking → cuentan para el ELO
//   - Salas "pv-…": privadas con código (entre amigos) → no cuentan para el ELO
import { DurableObject } from 'cloudflare:workers';
import { ReplayState, checkHuman, LIMITS } from './validate.js';
import { TEXTS } from './texts.js';

const COUNTDOWN_MS = 4000;          // desde "start" hasta poder escribir (3, 2, 1, ¡ya!)
const EARLY_TOLERANCE_MS = 250;     // latencia aceptada para la primera tecla
const RACE_TIMEOUT_MS = 3 * 60 * 1000;
const JOIN_TIMEOUT_MS = 60 * 1000;  // si el rival no llega en 1 min, se cierra la sala

export class Room extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.players = new Map();   // id -> { ws, nick, elo, st, clientTimes, firstAt, finishedAt, flagged }
        this.phase = 'waiting';     // waiting | countdown | racing | ended
        this.text = '';
        this.goAt = 0;
        this.ranked = false;
        this.timers = [];
    }

    async fetch(request) {
        if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
        const name = new URL(request.url).searchParams.get('room') || '';
        this.ranked = name.startsWith('mm-');
        const pair = new WebSocketPair();
        const ws = pair[1];
        ws.accept();
        ws.addEventListener('message', (e) => this.onMessage(ws, e.data).catch((err) => this.fail(ws, String(err))));
        ws.addEventListener('close', () => this.onClose(ws));
        ws.addEventListener('error', () => this.onClose(ws));
        if (this.timers.length === 0) this.later(() => this.phase === 'waiting' && this.shutdown('timeout'), JOIN_TIMEOUT_MS);
        return new Response(null, { status: 101, webSocket: pair[0] });
    }

    later(fn, ms) { this.timers.push(setTimeout(fn, ms)); }
    send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch { /* socket cerrado */ } }
    broadcast(obj) { for (const p of this.players.values()) this.send(p.ws, obj); }
    fail(ws, error) { this.send(ws, { type: 'error', error }); try { ws.close(1008, error.slice(0, 100)); } catch { /* ok */ } }
    playerOf(ws) { for (const [id, p] of this.players) if (p.ws === ws) return [id, p]; return [null, null]; }

    async onMessage(ws, raw) {
        let msg;
        try { msg = JSON.parse(raw); } catch { return this.fail(ws, 'bad-json'); }

        if (msg.type === 'hello') return this.onHello(ws, msg);

        const [id, p] = this.playerOf(ws);
        if (!p) return;

        if (msg.type === 'k') {
            if (this.phase !== 'racing' && this.phase !== 'countdown') return;
            const now = Date.now();
            if (now < this.goAt - EARLY_TOLERANCE_MS) return this.disqualify(id, 'early-start');
            if (this.phase === 'countdown') this.phase = 'racing';
            if (p.finishedAt) return;
            if (p.firstAt === null) p.firstAt = now;

            const err = p.st.apply(msg.k);
            if (err) return this.disqualify(id, err);
            if (Number.isFinite(msg.t)) p.clientTimes.push(msg.t);

            const elapsed = now - p.firstAt;
            this.broadcast({
                type: 'p', id,
                pos: p.st.consec, len: p.st.chars.length,
                wpm: elapsed > 0 ? Math.round((p.st.consec / 5) / (elapsed / 60000)) : 0
            });

            if (p.st.completed) {
                p.finishedAt = now;
                const dur = now - p.firstAt;
                const wpm = p.st.wpmAt(dur);
                const human = checkHuman(p.clientTimes);
                if (wpm > LIMITS.MAX_WPM || dur < LIMITS.MIN_DURATION_MS) return this.disqualify(id, 'too-fast');
                if (human) return this.disqualify(id, human);
                return this.end(id, 'finished');
            }
        }
    }

    async onHello(ws, msg) {
        if (this.phase !== 'waiting') return this.fail(ws, 'room-busy');
        const lb = this.env.LEADERBOARD.get(this.env.LEADERBOARD.idFromName('global'));
        const player = await lb.auth(msg.id, msg.secret);
        if (!player) return this.fail(ws, 'unauthorized');
        if (this.players.has(player.id)) {
            // reconexión antes de empezar: se reemplaza el socket viejo
            const old = this.players.get(player.id);
            try { old.ws.close(1000, 'replaced'); } catch { /* ok */ }
        } else if (this.players.size >= 2) {
            return this.fail(ws, 'room-full');
        }
        if (this.players.size === 0 && !this.lang) this.lang = msg.lang === 'en' ? 'en' : 'es';

        this.players.set(player.id, {
            ws, nick: player.nick, elo: player.elo,
            st: null, clientTimes: [], firstAt: null, finishedAt: null
        });
        this.send(ws, { type: 'joined', you: player.id, ranked: this.ranked, players: this.players.size });

        if (this.players.size === 2) this.start();
        else this.send(ws, { type: 'waiting' });
    }

    start() {
        const bank = TEXTS[this.lang || 'es'];
        this.text = bank[Math.floor(Math.random() * bank.length)];
        this.phase = 'countdown';
        const now = Date.now();
        this.goAt = now + COUNTDOWN_MS;
        const roster = [...this.players].map(([id, p]) => ({ id, nick: p.nick, elo: p.elo }));
        for (const p of this.players.values()) p.st = new ReplayState(this.text);
        this.broadcast({ type: 'start', text: this.text, goIn: COUNTDOWN_MS, players: roster, ranked: this.ranked });
        this.later(() => this.timeout(), COUNTDOWN_MS + RACE_TIMEOUT_MS);
    }

    async disqualify(id, reason) {
        if (this.phase === 'ended') return;
        const other = [...this.players.keys()].find((k) => k !== id);
        await this.end(other || null, 'disqualified:' + reason, id);
    }

    async timeout() {
        if (this.phase === 'ended') return;
        // Gana quien más avanzó; empate si van igual
        const [a, b] = [...this.players];
        if (!a || !b) return this.end(a ? a[0] : null, 'timeout');
        const pa = a[1].st.consec, pb = b[1].st.consec;
        await this.end(pa === pb ? null : (pa > pb ? a[0] : b[0]), 'timeout');
    }

    async end(winnerId, reason, loserId = null) {
        if (this.phase === 'ended') return;
        this.phase = 'ended';
        const ids = [...this.players.keys()];
        if (!loserId && winnerId) loserId = ids.find((k) => k !== winnerId) || null;

        let elo = null;
        if (this.ranked && winnerId && loserId) {
            const lb = this.env.LEADERBOARD.get(this.env.LEADERBOARD.idFromName('global'));
            elo = await lb.recordMatch(winnerId, loserId);
        }

        const results = ids.map((id) => {
            const p = this.players.get(id);
            const dur = p.finishedAt && p.firstAt !== null ? p.finishedAt - p.firstAt : null;
            return {
                id, nick: p.nick,
                finished: !!p.finishedAt,
                wpm: dur ? p.st.wpmAt(dur) : 0,
                accuracy: p.st ? p.st.accuracy : 100,
                pos: p.st ? p.st.consec : 0,
                len: p.st ? p.st.chars.length : 0
            };
        });
        this.broadcast({ type: 'end', winner: winnerId, reason, results, elo, ranked: this.ranked });
        this.later(() => this.shutdown('ended'), 1000);
    }

    async onClose(ws) {
        const [id] = this.playerOf(ws);
        if (!id) return;
        if (this.phase === 'waiting') { this.players.delete(id); return; }
        if (this.phase === 'countdown' || this.phase === 'racing') await this.disqualify(id, 'left');
    }

    shutdown(reason) {
        for (const t of this.timers) clearTimeout(t);
        this.timers = [];
        for (const p of this.players.values()) {
            if (reason === 'timeout') this.send(p.ws, { type: 'error', error: 'no-opponent' });
            try { p.ws.close(1000, reason); } catch { /* ok */ }
        }
        this.players.clear();
    }
}
