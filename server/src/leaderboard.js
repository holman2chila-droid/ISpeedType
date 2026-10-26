// ===== Durable Object: jugadores, carreras en solitario, ranking y ELO =====
// Una sola instancia global ("global"). Guarda todo en su SQLite embebido.
import { DurableObject } from 'cloudflare:workers';
import { replay } from './validate.js';
import { TEXTS } from './texts.js';

const RACE_TTL_MS = 15 * 60 * 1000;   // una carrera emitida caduca a los 15 min
const RACE_COOLDOWN_MS = 2000;        // mínimo entre carreras del mismo jugador
const COUNTDOWN_MS = 3000;            // cuenta regresiva del cliente antes de poder escribir
const PLAYERS_PER_IP_PER_HOUR = 10;
const ELO_START = 1000;
const ELO_K = 32;

export function cleanNick(nick) {
    if (typeof nick !== 'string') return null;
    const n = nick.normalize('NFC').trim().replace(/\s+/g, ' ');
    if (n.length < 2 || n.length > 16) return null;
    if (!/^[\p{L}\p{N} _.-]+$/u.test(n)) return null;
    return n;
}

function randomId(bytes = 16) {
    const a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(s) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class Leaderboard extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.sql = ctx.storage.sql;
        this.ipHits = new Map(); // ip -> [timestamps] (en memoria: basta como freno)
        this.sql.exec(`
            CREATE TABLE IF NOT EXISTS players (
                id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, nick TEXT NOT NULL,
                elo INTEGER NOT NULL DEFAULT ${ELO_START}, wins INTEGER NOT NULL DEFAULT 0,
                losses INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, last_race INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS races (
                id TEXT PRIMARY KEY, player_id TEXT NOT NULL, lang TEXT NOT NULL,
                text_idx INTEGER NOT NULL, issued INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS results (
                id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, lang TEXT NOT NULL,
                wpm INTEGER NOT NULL, acc INTEGER NOT NULL, duration INTEGER NOT NULL, created INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS results_lang_wpm ON results(lang, wpm DESC);
        `);
    }

    // ---- Jugadores ----
    async createPlayer(nick, ip) {
        const n = cleanNick(nick);
        if (!n) return { error: 'bad-nick' };
        const now = Date.now();
        const hits = (this.ipHits.get(ip) || []).filter((t) => now - t < 3600_000);
        if (hits.length >= PLAYERS_PER_IP_PER_HOUR) return { error: 'rate-limited' };
        if (this.nickTaken(n, '')) return { error: 'nick-taken' };
        hits.push(now);
        this.ipHits.set(ip, hits);

        const id = randomId(12);
        const secret = randomId(24);
        this.sql.exec('INSERT INTO players (id, secret_hash, nick, created) VALUES (?, ?, ?, ?)',
            id, await sha256(secret), n, now);
        return { id, secret, nick: n, elo: ELO_START };
    }

    // Nicks únicos (sin distinguir mayúsculas) para que nadie se haga pasar por otro en el ranking
    nickTaken(nick, exceptId) {
        return this.sql.exec('SELECT 1 FROM players WHERE nick = ? COLLATE NOCASE AND id != ? LIMIT 1', nick, exceptId).toArray().length > 0;
    }

    async auth(id, secret) {
        if (typeof id !== 'string' || typeof secret !== 'string') return null;
        const row = this.sql.exec('SELECT * FROM players WHERE id = ?', id).toArray()[0];
        if (!row || row.secret_hash !== await sha256(secret)) return null;
        return { id: row.id, nick: row.nick, elo: row.elo, wins: row.wins, losses: row.losses };
    }

    async setNick(id, secret, nick) {
        if (!await this.auth(id, secret)) return { error: 'unauthorized' };
        const n = cleanNick(nick);
        if (!n) return { error: 'bad-nick' };
        if (this.nickTaken(n, id)) return { error: 'nick-taken' };
        this.sql.exec('UPDATE players SET nick = ? WHERE id = ?', n, id);
        return { nick: n };
    }

    // ---- Carreras en solitario (ranking de WPM) ----
    async startRace(id, secret, lang) {
        const p = await this.auth(id, secret);
        if (!p) return { error: 'unauthorized' };
        const bank = TEXTS[lang];
        if (!bank) return { error: 'bad-lang' };
        const now = Date.now();
        const last = this.sql.exec('SELECT last_race FROM players WHERE id = ?', id).one().last_race;
        if (now - last < RACE_COOLDOWN_MS) return { error: 'rate-limited' };

        const textIdx = Math.floor(Math.random() * bank.length);
        const raceId = randomId(16);
        this.sql.exec('INSERT INTO races (id, player_id, lang, text_idx, issued) VALUES (?, ?, ?, ?, ?)',
            raceId, id, lang, textIdx, now);
        this.sql.exec('UPDATE players SET last_race = ? WHERE id = ?', now, id);
        this.sql.exec('DELETE FROM races WHERE issued < ?', now - RACE_TTL_MS); // limpieza
        return { raceId, text: bank[textIdx] };
    }

    async submitRace(id, secret, raceId, events) {
        const p = await this.auth(id, secret);
        if (!p) return { error: 'unauthorized' };
        const race = this.sql.exec('SELECT * FROM races WHERE id = ? AND player_id = ?', raceId, id).toArray()[0];
        if (!race) return { error: 'unknown-race' };
        if (race.used) return { error: 'race-used' };
        this.sql.exec('UPDATE races SET used = 1 WHERE id = ?', raceId); // un solo intento por carrera

        const now = Date.now();
        if (now - race.issued > RACE_TTL_MS) return { error: 'race-expired' };

        const r = replay(TEXTS[race.lang][race.text_idx], events);
        if (!r.ok) return { error: 'rejected', reason: r.reason };

        // No se puede entregar antes de que haya pasado (de verdad) el tiempo que dice el log
        if (now - race.issued < r.duration + COUNTDOWN_MS - 500) return { error: 'rejected', reason: 'clock-mismatch' };

        this.sql.exec('INSERT INTO results (player_id, lang, wpm, acc, duration, created) VALUES (?, ?, ?, ?, ?, ?)',
            id, race.lang, r.wpm, r.accuracy, r.duration, now);
        const best = this.sql.exec('SELECT MAX(wpm) AS b FROM results WHERE player_id = ? AND lang = ?', id, race.lang).one().b;
        const rank = this.sql.exec(
            'SELECT COUNT(*) AS c FROM (SELECT player_id, MAX(wpm) AS b FROM results WHERE lang = ? GROUP BY player_id) WHERE b > ?',
            race.lang, best).one().c + 1;
        return { wpm: r.wpm, accuracy: r.accuracy, errors: r.errors, duration: r.duration, best, rank };
    }

    async top(lang, board, limit = 50) {
        limit = Math.max(1, Math.min(100, limit | 0));
        if (board === 'elo') {
            return this.sql.exec(
                'SELECT nick, elo, wins, losses FROM players WHERE wins + losses > 0 ORDER BY elo DESC LIMIT ?', limit).toArray();
        }
        if (!TEXTS[lang]) return [];
        return this.sql.exec(`
            SELECT p.nick, r.wpm, r.acc, r.created FROM results r
            JOIN (SELECT player_id, MAX(wpm) AS b FROM results WHERE lang = ? GROUP BY player_id) m
              ON m.player_id = r.player_id AND m.b = r.wpm
            JOIN players p ON p.id = r.player_id
            WHERE r.lang = ?
            GROUP BY r.player_id ORDER BY r.wpm DESC, r.created ASC LIMIT ?`, lang, lang, limit).toArray();
    }

    // ---- 1v1: actualiza ELO (solo partidas de matchmaking) ----
    async recordMatch(winnerId, loserId) {
        const w = this.sql.exec('SELECT elo FROM players WHERE id = ?', winnerId).toArray()[0];
        const l = this.sql.exec('SELECT elo FROM players WHERE id = ?', loserId).toArray()[0];
        if (!w || !l) return null;
        const expected = 1 / (1 + 10 ** ((l.elo - w.elo) / 400));
        const delta = Math.max(1, Math.round(ELO_K * (1 - expected)));
        this.sql.exec('UPDATE players SET elo = elo + ?, wins = wins + 1 WHERE id = ?', delta, winnerId);
        this.sql.exec('UPDATE players SET elo = MAX(100, elo - ?), losses = losses + 1 WHERE id = ?', delta, loserId);
        return { delta, winnerElo: w.elo + delta, loserElo: Math.max(100, l.elo - delta) };
    }
}
