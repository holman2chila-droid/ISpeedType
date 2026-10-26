// Prueba end-to-end contra un servidor corriendo (wrangler dev).
// Uso: BASE=http://127.0.0.1:8787 node test/e2e.mjs
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const ORIGIN = 'http://localhost:8080';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, body, { origin = ORIGIN } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (origin) headers.Origin = origin;
    const res = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => null) };
}

function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function humanSteps(n, ms, seed = 3) {
    const r = rng(seed);
    return Array.from({ length: n }, () => {
        const g = Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
        return Math.max(25, Math.round(ms * Math.exp(0.45 * g)));
    });
}
function humanLog(text, ms, seed) {
    const steps = humanSteps(text.length, ms, seed);
    let t = 0;
    return text.split('').map((c, i) => { const ev = [c, t]; t += steps[i]; return ev; });
}

function openWs(path) {
    const ws = new WebSocket(BASE.replace('http', 'ws') + path, { headers: { Origin: ORIGIN } });
    const inbox = [];
    const waiters = [];
    ws.addEventListener('message', (e) => {
        const m = JSON.parse(e.data);
        const i = waiters.findIndex((w) => w.pred(m));
        if (i >= 0) waiters.splice(i, 1)[0].resolve(m); else inbox.push(m);
    });
    const opened = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    return {
        ws, opened,
        send: (o) => ws.send(JSON.stringify(o)),
        next(type, timeout = 15000) {
            const pred = (m) => m.type === type;
            const i = inbox.findIndex(pred);
            if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
            return new Promise((resolve, reject) => {
                waiters.push({ pred, resolve });
                setTimeout(() => reject(new Error('timeout esperando ' + type)), timeout);
            });
        }
    };
}

async function typeLive(conn, text, ms, seed, { constant = false } = {}) {
    const steps = constant ? text.split('').map(() => ms) : humanSteps(text.length, ms, seed);
    let t = 0;
    for (let i = 0; i < text.length; i++) {
        conn.send({ type: 'k', k: text[i], t });
        t += steps[i];
        await sleep(steps[i]);
    }
}

const ok = (name) => console.log('  ✔', name);

// 1. Origen
{
    const r = await api('/api/leaderboard', null, { origin: null });
    assert.equal(r.status, 403); ok('sin Origin permitido → 403');
    const r2 = await api('/api/leaderboard', null, { origin: 'https://malicioso.example' });
    assert.equal(r2.status, 403); ok('origen ajeno → 403');
}

// 2. Jugadores
const bad = await api('/api/player', { nick: '<script>' });
assert.equal(bad.data.error, 'bad-nick'); ok('nick inválido rechazado');
const SUF = Math.random().toString(36).slice(2, 6);
const A = (await api('/api/player', { nick: 'Alicia' + SUF })).data;
const B = (await api('/api/player', { nick: 'Beto' + SUF })).data;
const dup = await api('/api/player', { nick: 'ALICIA' + SUF.toUpperCase() });
assert.equal(dup.data.error, 'nick-taken'); ok('nick duplicado (sin importar mayúsculas) rechazado');
assert.ok(A.id && A.secret && B.id); ok('jugadores creados');
assert.equal((await api('/api/race/start', { id: A.id, secret: 'x', lang: 'es' })).status, 401); ok('secreto falso → 401');

// 3. Ranking: trampas rechazadas
{
    const race = (await api('/api/race/start', { id: A.id, secret: A.secret, lang: 'es' })).data;
    const forged = race.text.split('').map((c, i) => [c, i * 80]);
    const r = await api('/api/race/submit', { id: A.id, secret: A.secret, raceId: race.raceId, events: forged });
    assert.equal(r.data.reason, 'robotic-timing'); ok('log con tiempos de bot rechazado');
    const again = await api('/api/race/submit', { id: A.id, secret: A.secret, raceId: race.raceId, events: humanLog(race.text, 150, 1) });
    assert.equal(again.data.error, 'race-used'); ok('carrera reutilizada rechazada');
}
await sleep(2100);
{
    const race = (await api('/api/race/start', { id: A.id, secret: A.secret, lang: 'es' })).data;
    const r = await api('/api/race/submit', { id: A.id, secret: A.secret, raceId: race.raceId, events: humanLog(race.text, 120, 2) });
    assert.equal(r.data.reason, 'clock-mismatch'); ok('entregar antes de tiempo (log inventado) rechazado');
}

// 4. Ranking: partida válida (espera el tiempo real)
await sleep(2100);
{
    const race = (await api('/api/race/start', { id: A.id, secret: A.secret, lang: 'es' })).data;
    const events = humanLog(race.text, 70, 5);
    await sleep(events[events.length - 1][1] + 3200);
    const r = await api('/api/race/submit', { id: A.id, secret: A.secret, raceId: race.raceId, events });
    assert.ok(r.data.wpm > 0, JSON.stringify(r.data));
    const dur = events[events.length - 1][1];
    assert.equal(r.data.wpm, Math.round((race.text.length / 5) / (dur / 60000)));
    assert.equal(r.data.rank, 1);
    ok(`partida válida aceptada: ${r.data.wpm} WPM, puesto ${r.data.rank}`);
    const top = (await api('/api/leaderboard?lang=es')).data;
    assert.equal(top[0].nick, A.nick); ok('aparece en el ranking');
}

// 5. Matchmaking + 1v1 completo
{
    const ma = openWs('/api/matchmake'); await ma.opened;
    ma.send({ type: 'hello', id: A.id, secret: A.secret, lang: 'es' });
    await ma.next('waiting');
    const mb = openWs('/api/matchmake'); await mb.opened;
    mb.send({ type: 'hello', id: B.id, secret: B.secret, lang: 'es' });
    const [xa, xb] = await Promise.all([ma.next('matched'), mb.next('matched')]);
    assert.equal(xa.room, xb.room); ok('matchmaking empareja a ambos en la misma sala');

    const ra = openWs('/api/room/' + xa.room); const rb = openWs('/api/room/' + xa.room);
    await Promise.all([ra.opened, rb.opened]);
    ra.send({ type: 'hello', id: A.id, secret: A.secret, lang: 'es' });
    rb.send({ type: 'hello', id: B.id, secret: B.secret, lang: 'es' });
    const [sa] = await Promise.all([ra.next('start'), rb.next('start')]);
    assert.ok(sa.ranked); ok('sala arranca con texto del servidor');
    await sleep(sa.goIn);
    // A escribe rápido, B lento (y no termina antes)
    const pA = typeLive(ra, sa.text, 55, 11);
    const pB = typeLive(rb, sa.text.slice(0, 30), 200, 12);
    const progress = await rb.next('p');
    assert.ok(progress.id === A.id || progress.id === B.id); ok('progreso del rival retransmitido');
    const [ea] = await Promise.all([ra.next('end', 30000), pA]);
    await pB.catch(() => {});
    assert.equal(ea.winner, A.id, JSON.stringify(ea));
    assert.ok(ea.elo && ea.elo.delta > 0);
    ok(`gana el más rápido (${ea.results.find((x) => x.id === A.id).wpm} WPM), ELO +${ea.elo.delta}`);
    const elo = (await api('/api/leaderboard?board=elo')).data;
    assert.equal(elo[0].nick, A.nick); ok('ranking ELO actualizado');
}

// 6. Sala privada: salida en falso y bot
async function privateRoom() {
    const { code } = (await api('/api/room/new', {})).data;
    const ra = openWs('/api/room/' + code); const rb = openWs('/api/room/' + code);
    await Promise.all([ra.opened, rb.opened]);
    ra.send({ type: 'hello', id: A.id, secret: A.secret, lang: 'es' });
    rb.send({ type: 'hello', id: B.id, secret: B.secret, lang: 'es' });
    const [s] = await Promise.all([ra.next('start'), rb.next('start')]);
    return { ra, rb, s };
}
{
    const { ra, s } = await privateRoom();
    assert.equal(s.ranked, false);
    ra.send({ type: 'k', k: s.text[0], t: 0 }); // antes del "¡ya!"
    const e = await ra.next('end');
    assert.equal(e.winner, B.id); assert.match(e.reason, /early-start/);
    ok('sala privada no cuenta ELO; salida en falso descalifica');
}
{
    const { rb, s } = await privateRoom();
    await sleep(s.goIn);
    await typeLive(rb, s.text, 60, 0, { constant: true });
    const e = await rb.next('end');
    assert.equal(e.winner, A.id); assert.match(e.reason, /robotic-timing/);
    ok('bot con intervalos constantes descalificado en 1v1');
}
{
    const { ra, rb, s } = await privateRoom();
    await sleep(s.goIn);
    ra.send({ type: 'k', k: s.text[0], t: 0 });
    rb.ws.close();
    const e = await ra.next('end');
    assert.equal(e.winner, A.id); assert.match(e.reason, /left/);
    ok('abandono da la victoria al rival');
}
console.log('\nE2E OK');
process.exit(0);
