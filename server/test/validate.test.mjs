import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay, ReplayState, checkHuman } from '../src/validate.js';

const TEXT = 'El veloz murciélago hindú comía feliz cardillo y kiwi. Después se marchó volando hacia la montaña.';

// Genera un log "humano": intervalos con dispersión (aprox. log-normal) alrededor de msPerChar
function humanLog(text, msPerChar, { typoAt = -1, seed = 1 } = {}) {
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const events = [];
    let t = 0;
    const step = () => {
        const g = Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
        return Math.max(25, Math.round(msPerChar * Math.exp(0.45 * g)));
    };
    for (let i = 0; i < text.length; i++) {
        if (i === typoAt) {
            events.push(['x', t]); t += step();
            events.push(['\b', t]); t += step();
        }
        events.push([text[i], t]);
        t += step();
    }
    // el primer evento tiene t = 0 y el último es el final
    return events;
}

test('partida humana válida: WPM igual a la fórmula del cliente', () => {
    const ev = humanLog(TEXT, 180, { typoAt: 10 });
    const r = replay(TEXT, ev);
    assert.equal(r.ok, true, r.reason);
    const dur = ev[ev.length - 1][1];
    assert.equal(r.duration, dur);
    assert.equal(r.wpm, Math.round((TEXT.length / 5) / (dur / 60000)));
    assert.equal(r.errors, 1);
    assert.ok(r.accuracy < 100);
});

test('bot con intervalos constantes es rechazado', () => {
    const ev = TEXT.split('').map((c, i) => [c, i * 60]);
    assert.equal(replay(TEXT, ev).reason, 'robotic-timing');
});

test('WPM imposible es rechazado', () => {
    const ev = humanLog(TEXT, 20, { seed: 7 }); // ~600 WPM
    assert.equal(replay(TEXT, ev).ok, false);
});

test('texto incompleto o con error sin corregir es rechazado', () => {
    const ev = humanLog(TEXT.slice(0, -5), 180);
    assert.equal(replay(TEXT, ev).reason, 'incomplete');
    const wrong = humanLog(TEXT, 180);
    wrong[5] = ['#', wrong[5][1]];
    assert.equal(replay(TEXT, wrong).reason, 'incomplete');
});

test('tiempos manipulados son rechazados', () => {
    const ev = humanLog(TEXT, 180);
    ev[3] = [ev[3][0], 1];                 // retrocede en el tiempo
    assert.equal(replay(TEXT, ev).reason, 'bad-time');
    const ev2 = humanLog(TEXT, 180).map(([k, t]) => [k, t + 500]); // no arranca en 0
    assert.equal(replay(TEXT, ev2).reason, 'bad-time');
});

test('escribir más allá del texto y teclas inválidas son rechazados', () => {
    const ev = humanLog(TEXT, 180);
    ev.push(['z', ev[ev.length - 1][1] + 100]);
    assert.equal(replay(TEXT, ev).reason, 'overflow');
    assert.equal(replay(TEXT, [['ab', 0]]).reason, 'bad-key');
    assert.equal(replay(TEXT, []).reason, 'no-events');
});

test('ReplayState: progreso solo cuenta correctas consecutivas', () => {
    const st = new ReplayState('hola');
    st.apply('h'); st.apply('x'); st.apply('l');
    assert.equal(st.consec, 1);
    st.apply('\b'); st.apply('\b');
    st.apply('o'); st.apply('l'); st.apply('a');
    assert.equal(st.completed, true);
    assert.equal(st.errors, 1); // 'l' en la posición 2 era correcta
});

test('checkHuman ignora logs muy cortos y detecta ráfagas', () => {
    assert.equal(checkHuman([0, 10, 20]), null);
    const bursts = [];
    let t = 0;
    for (let i = 0; i < 60; i++) { t += i % 2 ? 5 : 300 + (i * 37) % 200; bursts.push(t); }
    assert.equal(checkHuman(bursts), 'burst-timing');
});
