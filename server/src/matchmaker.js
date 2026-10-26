// ===== Durable Object: cola de emparejamiento 1v1 =====
// Los jugadores se conectan por WebSocket, se autentican con el primer mensaje
// y esperan. Cuando hay dos del mismo idioma se les manda el id de una sala nueva.
// Usa la API de hibernación: si nadie habla, el objeto no consume tiempo de cómputo.
import { DurableObject } from 'cloudflare:workers';

export class Matchmaker extends DurableObject {
    async fetch(request) {
        if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
        const pair = new WebSocketPair();
        this.ctx.acceptWebSocket(pair[1]);
        pair[1].serializeAttachment({ ready: false });
        return new Response(null, { status: 101, webSocket: pair[0] });
    }

    async webSocketMessage(ws, raw) {
        let msg;
        try { msg = JSON.parse(raw); } catch { return ws.close(1003, 'bad-json'); }
        const att = ws.deserializeAttachment() || {};
        if (att.ready || msg.type !== 'hello') return;

        const lb = this.env.LEADERBOARD.get(this.env.LEADERBOARD.idFromName('global'));
        const player = await lb.auth(msg.id, msg.secret);
        if (!player) {
            ws.send(JSON.stringify({ type: 'error', error: 'unauthorized' }));
            return ws.close(1008, 'unauthorized');
        }
        const lang = msg.lang === 'en' ? 'en' : 'es';

        // Un mismo jugador en dos pestañas: se descarta la conexión vieja
        for (const other of this.ctx.getWebSockets()) {
            const o = other.deserializeAttachment();
            if (other !== ws && o && o.ready && !o.matched && o.id === player.id) {
                o.matched = true; other.serializeAttachment(o);
                try { other.close(1000, 'replaced'); } catch { /* ya cerrado */ }
            }
        }

        const rival = this.ctx.getWebSockets().find((other) => {
            if (other === ws) return false;
            const o = other.deserializeAttachment();
            return o && o.ready && !o.matched && o.lang === lang && o.id !== player.id;
        });

        if (!rival) {
            ws.serializeAttachment({ ready: true, matched: false, id: player.id, lang, since: Date.now() });
            ws.send(JSON.stringify({ type: 'waiting' }));
            return;
        }

        const r = rival.deserializeAttachment();
        r.matched = true; rival.serializeAttachment(r);
        ws.serializeAttachment({ ready: true, matched: true, id: player.id, lang });

        const room = 'mm-' + crypto.randomUUID();
        for (const s of [ws, rival]) {
            try {
                s.send(JSON.stringify({ type: 'matched', room, lang }));
                s.close(1000, 'matched');
            } catch { /* el rival se fue justo ahora: su sala quedará sin él y ganará el otro por abandono */ }
        }
    }

    webSocketClose(ws) { try { ws.close(); } catch { /* ok */ } }
    webSocketError(ws) { try { ws.close(); } catch { /* ok */ } }
}
