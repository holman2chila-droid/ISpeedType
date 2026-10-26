// ===== ISpeedType — backend online (Cloudflare Worker) =====
// El frontend sigue en GitHub Pages; este Worker solo expone /api/*.
//
//   POST /api/player            { nick }                          -> { id, secret, nick, elo }
//   POST /api/player/me         { id, secret }                    -> { id, nick, elo, wins, losses }
//   POST /api/player/nick       { id, secret, nick }              -> { nick }
//   POST /api/race/start        { id, secret, lang }              -> { raceId, text }
//   POST /api/race/submit       { id, secret, raceId, events }    -> { wpm, accuracy, best, rank, ... }
//   GET  /api/leaderboard?lang=es&board=wpm|elo                   -> [ ... ]
//   POST /api/room/new                                            -> { code }
//   GET  /api/matchmake         (WebSocket)
//   GET  /api/room/<code|mm-…>  (WebSocket)
import { Leaderboard } from './leaderboard.js';
import { Matchmaker } from './matchmaker.js';
import { Room } from './room.js';

export { Leaderboard, Matchmaker, Room };

const MAX_BODY = 256 * 1024;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para dictarlo fácil

function allowedOrigin(request, env) {
    const origin = request.headers.get('Origin');
    if (!origin) return null;
    const list = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    return list.includes(origin) ? origin : null;
}

function json(data, status, origin) {
    const headers = { 'Content-Type': 'application/json; charset=utf-8' };
    if (origin) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Vary'] = 'Origin';
    }
    return new Response(JSON.stringify(data), { status, headers });
}

async function readBody(request) {
    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > MAX_BODY) return null;
    const text = await request.text();
    if (text.length > MAX_BODY) return null;
    try { return JSON.parse(text); } catch { return null; }
}

function newCode() {
    const a = new Uint8Array(6);
    crypto.getRandomValues(a);
    return [...a].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const origin = allowedOrigin(request, env);
        const path = url.pathname;

        if (!path.startsWith('/api/')) return new Response('ISpeedType API', { status: 200 });

        if (request.method === 'OPTIONS') {
            if (!origin) return new Response(null, { status: 403 });
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Max-Age': '86400',
                    'Vary': 'Origin'
                }
            });
        }

        // Solo el sitio oficial (y localhost en desarrollo) puede usar la API desde un navegador
        if (!origin) return json({ error: 'forbidden-origin' }, 403, null);

        const lb = env.LEADERBOARD.get(env.LEADERBOARD.idFromName('global'));

        // ---- WebSockets ----
        if (path === '/api/matchmake') {
            if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected-websocket' }, 426, origin);
            const mm = env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global'));
            return mm.fetch(request);
        }
        const roomMatch = path.match(/^\/api\/room\/((?:mm-[0-9a-f-]{36})|(?:[A-Z2-9]{6}))$/);
        if (roomMatch) {
            if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected-websocket' }, 426, origin);
            const name = roomMatch[1].startsWith('mm-') ? roomMatch[1] : 'pv-' + roomMatch[1];
            const stub = env.ROOM.get(env.ROOM.idFromName(name));
            const u = new URL(request.url);
            u.searchParams.set('room', name);
            return stub.fetch(new Request(u, request));
        }

        // ---- HTTP ----
        if (request.method === 'GET' && path === '/api/leaderboard') {
            const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'es';
            const board = url.searchParams.get('board') === 'elo' ? 'elo' : 'wpm';
            return json(await lb.top(lang, board, Number(url.searchParams.get('limit') || 50)), 200, origin);
        }

        if (request.method !== 'POST') return json({ error: 'not-found' }, 404, origin);
        if (path === '/api/room/new') return json({ code: newCode() }, 200, origin);

        const body = await readBody(request);
        if (!body || typeof body !== 'object') return json({ error: 'bad-body' }, 400, origin);

        let out;
        switch (path) {
            case '/api/player':
                out = await lb.createPlayer(body.nick, request.headers.get('CF-Connecting-IP') || 'local');
                break;
            case '/api/player/me':
                out = (await lb.auth(body.id, body.secret)) || { error: 'unauthorized' };
                break;
            case '/api/player/nick':
                out = await lb.setNick(body.id, body.secret, body.nick);
                break;
            case '/api/race/start':
                out = await lb.startRace(body.id, body.secret, body.lang);
                break;
            case '/api/race/submit':
                if (!Array.isArray(body.events) || body.events.length > 5000) { out = { error: 'bad-body' }; break; }
                out = await lb.submitRace(body.id, body.secret, body.raceId, body.events);
                break;
            default:
                return json({ error: 'not-found' }, 404, origin);
        }
        const status = !out.error ? 200
            : out.error === 'unauthorized' ? 401
            : out.error === 'rate-limited' ? 429
            : 400;
        return json(out, status, origin);
    }
};
