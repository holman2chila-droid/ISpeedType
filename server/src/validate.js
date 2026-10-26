// ===== Validador autoritativo de partidas =====
// El cliente NUNCA manda su WPM: manda el registro de pulsaciones y el servidor
// lo reproduce contra el texto que él mismo emitió. Las fórmulas son las mismas
// que usa app.js para que el número coincida con lo que el jugador vio.
//
// Formato de evento: [k, t]
//   k: un carácter escrito, o "\b" para retroceso
//   t: milisegundos (enteros) desde la primera pulsación (el primer evento tiene t = 0)

export const LIMITS = {
    MAX_WPM: 250,              // por encima: imposible para un humano en este test
    MIN_DURATION_MS: 1500,
    MAX_DURATION_MS: 10 * 60 * 1000,
    MIN_INTERVALS_FOR_STATS: 20,
    MIN_CV: 0.12,              // coef. de variación mínimo entre teclas (bots = intervalos constantes)
    FAST_INTERVAL_MS: 15,      // intervalo "imposiblemente" corto si se repite mucho
    MAX_FAST_FRACTION: 0.35,
    MAX_EVENTS_FACTOR: 4       // eventos máx = 4 × largo del texto (errores + retrocesos)
};

// Estado incremental: lo usan tanto el replay completo (ranking) como la sala 1v1 (en vivo)
export class ReplayState {
    constructor(text) {
        this.chars = text.split('');   // igual que app.js: characters = originalText.split('')
        this.typed = [];
        this.total = 0;                // pulsaciones de carácter (sin retrocesos)
        this.correct = 0;
        this.errors = 0;
        this.consec = 0;               // correctas seguidas desde el inicio (progreso real)
        this.events = 0;
    }

    // Devuelve null si el evento es válido, o un string con el motivo si no lo es
    apply(k) {
        this.events++;
        if (this.events > this.chars.length * LIMITS.MAX_EVENTS_FACTOR + 50) return 'too-many-events';
        if (k === '\b') {
            if (this.typed.length > 0) {
                this.typed.pop();
                if (this.consec > this.typed.length) this.consec = this.typed.length;
            }
            return null;
        }
        if (typeof k !== 'string' || k.length !== 1) return 'bad-key';
        const idx = this.typed.length;
        if (idx >= this.chars.length) return 'overflow';
        this.total++;
        const ok = k === this.chars[idx];
        if (ok) this.correct++; else this.errors++;
        if (this.consec === idx && ok) this.consec++;
        this.typed.push(k);
        return null;
    }

    get completed() {
        return this.consec === this.chars.length && this.typed.length === this.chars.length;
    }

    get accuracy() {
        return this.total > 0 ? Math.round((this.correct / this.total) * 100) : 100;
    }

    wpmAt(ms) {
        const minutes = ms / 60000;
        return minutes > 0 ? Math.round((this.chars.length / 5) / minutes) : 0;
    }
}

// Chequeos de "humanidad" sobre los tiempos. No es infalible (un bot con jitter
// aleatorio puede pasarlos) pero bloquea scripts triviales y logs inventados.
export function checkHuman(times) {
    const intervals = [];
    for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
    if (intervals.length < LIMITS.MIN_INTERVALS_FOR_STATS) return null;

    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (mean <= 0) return 'zero-time';
    const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
    const cv = Math.sqrt(variance) / mean;
    if (cv < LIMITS.MIN_CV) return 'robotic-timing';

    const fast = intervals.filter((x) => x < LIMITS.FAST_INTERVAL_MS).length / intervals.length;
    if (fast > LIMITS.MAX_FAST_FRACTION) return 'burst-timing';
    return null;
}

// Replay completo de una partida en solitario (ranking)
export function replay(text, events) {
    if (!Array.isArray(events) || events.length === 0) return { ok: false, reason: 'no-events' };

    const st = new ReplayState(text);
    const times = [];
    let lastT = -1;

    for (const ev of events) {
        if (!Array.isArray(ev) || ev.length !== 2) return { ok: false, reason: 'bad-event' };
        const [k, t] = ev;
        if (!Number.isInteger(t) || t < 0 || t < lastT) return { ok: false, reason: 'bad-time' };
        if (times.length === 0 && t !== 0) return { ok: false, reason: 'bad-time' };
        if (t > LIMITS.MAX_DURATION_MS) return { ok: false, reason: 'too-long' };
        const err = st.apply(k);
        if (err) return { ok: false, reason: err };
        times.push(t);
        lastT = t;
    }

    if (!st.completed) return { ok: false, reason: 'incomplete' };

    const duration = lastT;
    if (duration < LIMITS.MIN_DURATION_MS) return { ok: false, reason: 'too-fast' };
    const wpm = st.wpmAt(duration);
    if (wpm > LIMITS.MAX_WPM) return { ok: false, reason: 'too-fast' };

    const human = checkHuman(times);
    if (human) return { ok: false, reason: human };

    return { ok: true, wpm, accuracy: st.accuracy, errors: st.errors, duration };
}
