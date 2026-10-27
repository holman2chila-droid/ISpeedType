/* ===================================================
   ISpeedType — Tema inmersivo: RITUAL MALDITO (Halloween)
   Depende de themes/immersive.js (motor) y themes/halloween.css (estilos).

   Efectos:
     - cada letra correcta enciende su vela: una llama naranja sube y se apaga;
       con una racha larga (combo >= 20) la llama se vuelve verde espectral,
     - cada error hace sangrar la letra (una gota cae) y susurra un fantasma,
     - murciélagos que cruzan el cielo de vez en cuando y en bandada con las rachas,
     - un relámpago suave y poco frecuente (un solo pulso, nunca parpadeo),
     - niebla y escena: CSS puro.

   Sonido (todo sintetizado con Web Audio; no hace falta ningún archivo):
     - pasos que crujen sobre madera podrida al teclear (el espacio pesa más),
     - un zumbido grave que late, crujidos, un búho lejano y algún lamento durante el test,
     - coro al llegar a cada múltiplo de 10 del combo, campanadas al terminar,
     - risa maligna al perder una vida o la partida.

   Risa y susurro grabados (opcional): pon las rutas en LAUGH_FILES / WHISPER_FILES.
   Si no cargan, se usa un lamento sintetizado como reserva.

   Rendimiento: pools fijos de elementos, solo transform/opacity (WAAPI), las
   posiciones se leen dentro de requestAnimationFrame y las colas tienen tope.
   Con "reducir movimiento" no hay llamas, gotas, murciélagos ni relámpagos.
   =================================================== */
(function () {
    'use strict';

    const T = window.ImmersiveThemes;
    if (!T) return;

    const A = T.audio;
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // Archivos opcionales (relativos a index.html). Vacío = solo sonido sintetizado.
    const LAUGH_FILES = [
        "themes/halloween/laugh1.mp3",
        "themes/halloween/laugh2.mp3",
        "themes/halloween/laugh3.mp3"
    ];
    const WHISPER_FILES = [];

    const FLAME_POOL = 16;
    const DRIP_POOL = 6;
    const BAT_POOL = 3;
    const SPECTRAL_AT = 20;

    let layers = [];
    let flames = [], drips = [], bats = [];
    let flameIdx = 0, dripIdx = 0;
    let flameQueue = [], dripQueue = [];
    let raf = 0;
    let inTest = false;
    let lastLives = null;
    let spectral = false;
    let lastWhisper = 0;
    let lastKeySound = 0;
    let batTimer = 0, boltTimer = 0, creakTimer = 0;
    let boltEl = null;
    let ambience = null;
    let laughBufs = [], whisperBufs = [];
    let loading = false;

    function el(cls) {
        const d = document.createElement('div');
        d.className = cls;
        d.setAttribute('aria-hidden', 'true');
        document.body.appendChild(d);
        layers.push(d);
        return d;
    }

    function sound(fn, delay) {
        if (!A.ready()) return;
        try { fn(A.ctx.currentTime + (delay || 0.002)); } catch (e) { /* un fallo de audio nunca debe afectar al juego */ }
    }

    // ---------------------------------------------------
    // Voces sintetizadas
    // ---------------------------------------------------

    // Paso sobre madera podrida: golpe sordo + crujido que sube + gravilla.
    function step(t0, heavy) {
        const k = heavy ? 1.5 : 1;
        A.tone(t0, { f0: rand(88, 112), f1: 48, dur: 0.11 * k, gain: 0.34 * k });
        A.noiseHit(t0, { type: 'lowpass', freq: 600, q: 0.7, dur: 0.07 * k, gain: 0.24 * k });
        // el tablón cruje
        const f = rand(260, 420);
        A.tone(t0 + 0.01, { f0: f, f1: f * rand(1.5, 2.1), dur: rand(0.07, 0.12), gain: 0.05, type: 'sawtooth' });
        A.noiseHit(t0 + 0.012, { freq: rand(900, 1500), freq2: rand(2200, 3200), q: 5, dur: 0.09, gain: 0.07 });
        // gravilla y astillas
        for (let i = 0; i < 3; i++) {
            A.noiseHit(t0 + 0.02 + i * rand(0.014, 0.026), { type: 'highpass', freq: rand(2500, 4200), dur: 0.012, gain: 0.05 });
        }
    }

    // Lamento fantasmal de reserva (cuatro voces desafinadas que bajan, con vibrato).
    function wail(t0, dur, level) {
        dur = dur || 1.6;
        const ctx = A.ctx;
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.0001, t0);
        master.gain.exponentialRampToValueAtTime(0.1 * (level || 1), t0 + 0.35);
        master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        const formant = ctx.createBiquadFilter();
        formant.type = 'bandpass';
        formant.frequency.setValueAtTime(700, t0);
        formant.frequency.linearRampToValueAtTime(420, t0 + dur);
        formant.Q.value = 2.2;
        formant.connect(master);
        master.connect(A.out);
        const wet = ctx.createGain();
        wet.gain.value = 0.9;
        master.connect(wet);
        wet.connect(A.reverb());

        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 5.2;
        lfoGain.gain.value = 7;
        lfo.connect(lfoGain);
        lfo.start(t0);
        lfo.stop(t0 + dur + 0.05);

        [-9, -3, 4, 10].forEach(function (det) {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(220, t0);
            o.frequency.exponentialRampToValueAtTime(130, t0 + dur);
            o.detune.value = det * 4;
            lfoGain.connect(o.frequency);
            o.connect(formant);
            o.start(t0);
            o.stop(t0 + dur + 0.05);
        });
    }

    // "Ja-ja-ja" sintetizado, solo se usa si no hay risa grabada.
    function synthLaugh(t0) {
        wail(t0, 1.8, 1);
        for (let i = 0; i < 4; i++) {
            A.noiseHit(t0 + i * 0.16, { freq: 700, freq2: 400, q: 3, dur: 0.12, gain: 0.07, attack: 0.02 });
        }
    }

    function laugh(delay) {
        if (!A.ready()) return;
        const have = laughBufs.filter(Boolean);
        const buf = have.length ? pick(have) : null;
        if (buf) {
            A.playBuffer(buf, { gain: 0.85, send: 0.5, rate: rand(0.96, 1.04), when: A.ctx.currentTime + (delay || 0) });
        } else {
            sound(synthLaugh, delay || 0.02);
        }
    }

    function whisper() {
        const now = performance.now();
        if (now - lastWhisper < 600) return;
        lastWhisper = now;
        if (!A.ready()) return;
        const haveW = whisperBufs.filter(Boolean);
        const buf = haveW.length ? pick(haveW) : null;
        if (buf) {
            A.playBuffer(buf, { gain: 0.5, send: 0.7, rate: rand(0.95, 1.05) });
            return;
        }
        // Susurro: sílabas de ruido filtrado por formantes, muy "lejos"
        sound(function (t0) {
            const ctx = A.ctx;
            const wet = ctx.createGain();
            wet.gain.value = 0.8;
            wet.connect(A.reverb());
            const syl = pick([2, 3]);
            for (let i = 0; i < syl; i++) {
                const s = ctx.createBufferSource();
                s.buffer = A.noise;
                const f = ctx.createBiquadFilter();
                f.type = 'bandpass';
                f.frequency.value = pick([1700, 2300, 2900]);
                f.Q.value = 4;
                const g = ctx.createGain();
                const t = t0 + i * 0.17;
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(0.1, t + 0.05);
                g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
                s.connect(f); f.connect(g); g.connect(wet); g.connect(A.out);
                s.start(t, Math.random() * 0.5, 0.2);
            }
        });
    }

    function thunder(t0) {
        A.noiseHit(t0, { type: 'lowpass', freq: 360, freq2: 90, q: 0.8, dur: 2.2, gain: 0.5, attack: 0.18 });
        A.noiseHit(t0 + 0.4, { type: 'lowpass', freq: 220, freq2: 60, q: 0.8, dur: 1.8, gain: 0.3, attack: 0.25 });
        A.tone(t0, { f0: 70, f1: 34, dur: 1.6, gain: 0.32 });
    }

    function bell(t0) {
        [[196, 0.16, 2.6], [392, 0.07, 2.0], [587, 0.04, 1.4], [235, 0.05, 2.2]].forEach(function (p) {
            A.tone(t0, { f0: p[0], dur: p[2], gain: p[1] });
        });
        A.noiseHit(t0, { type: 'highpass', freq: 3000, dur: 0.02, gain: 0.07 });
    }

    // Coro: acorde menor que se hincha y se apaga.
    function choir(t0) {
        const ctx = A.ctx;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 1100;
        f.connect(g);
        g.connect(A.out);
        const w = ctx.createGain();
        w.gain.value = 0.7;
        g.connect(w);
        w.connect(A.reverb());
        [220, 261.6, 329.6, 440].forEach(function (hz, i) {
            const o = ctx.createOscillator();
            o.type = 'triangle';
            o.frequency.value = hz * (i % 2 ? 1.004 : 0.996);
            o.connect(f);
            o.start(t0);
            o.stop(t0 + 1.7);
        });
    }

    function whoosh(t0) {
        A.noiseHit(t0, { freq: 400, freq2: 3200, q: 1.2, dur: 0.7, attack: 0.25, gain: 0.14 });
        A.tone(t0, { f0: 110, f1: 330, dur: 0.6, gain: 0.08, type: 'triangle' });
    }

    function creak(t0) {
        const f = rand(110, 190);
        A.tone(t0, { f0: f, f1: f * rand(0.7, 1.6), dur: rand(0.5, 1.1), gain: 0.045, type: 'sawtooth' });
        A.noiseHit(t0, { freq: rand(500, 900), freq2: rand(300, 1200), q: 8, dur: 0.8, gain: 0.03, attack: 0.15 });
    }

    // ---------------------------------------------------
    // Ambiente durante el test: un zumbido grave que late (dos tonos casi iguales),
    // un acorde disonante muy tenue y sucesos aislados (crujidos, búho, lamento lejano).
    // Sin ruido continuo: el ruido filtrado suena a oleaje y rompe el ambiente.
    function startAmbience() {
        if (ambience || !A.ready()) return;
        try {
            const ctx = A.ctx;
            const master = ctx.createGain();
            master.gain.setValueAtTime(0.0001, ctx.currentTime);
            master.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 3);
            master.connect(A.out);
            const wet = ctx.createGain();
            wet.gain.value = 0.6;
            master.connect(wet);
            wet.connect(A.reverb());

            const nodes = [];
            // [frecuencia, volumen]: 55 y 55.7 Hz laten ~0.7 veces por segundo
            [[55, 0.05], [55.7, 0.05], [82.4, 0.018], [110.4, 0.012]].forEach(function (p) {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = 'sine';
                o.frequency.value = p[0];
                g.gain.value = p[1];
                o.connect(g); g.connect(master);
                o.start();
                nodes.push(o);
            });
            // Segunda menor, casi inaudible, que sube y baja muy despacio
            const lfo = ctx.createOscillator();
            const lg = ctx.createGain();
            lfo.frequency.value = 0.07;
            lg.gain.value = 0.006;
            lfo.connect(lg);
            lfo.start();
            nodes.push(lfo);
            [349.2, 369.99].forEach(function (hz) {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = 'sine';
                o.frequency.value = hz;
                g.gain.value = 0.007;
                lg.connect(g.gain);
                o.connect(g); g.connect(master);
                o.start();
                nodes.push(o);
            });
            ambience = { master: master, nodes: nodes };
            scheduleEvent();
        } catch (e) { ambience = null; }
    }

    function stopAmbience() {
        clearTimeout(creakTimer);
        creakTimer = 0;
        const amb = ambience;
        ambience = null;
        if (!amb) return;
        try {
            const t = A.ctx.currentTime;
            amb.master.gain.cancelScheduledValues(t);
            amb.master.gain.setValueAtTime(Math.max(amb.master.gain.value, 0.0001), t);
            amb.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
            amb.nodes.forEach(function (n) { try { n.stop(t + 0.7); } catch (e) { /* ya parado */ } });
        } catch (e) { /* nada */ }
    }

    // Búho lejano: dos "uuu-uuu" suaves con mucho eco
    function owl(t0) {
        const ctx = A.ctx;
        const wet = ctx.createGain();
        wet.gain.value = 1;
        wet.connect(A.reverb());
        [0, 0.5].forEach(function (dt, i) {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            const f = i ? 330 : 400;
            o.type = 'sine';
            o.frequency.setValueAtTime(f, t0 + dt);
            o.frequency.exponentialRampToValueAtTime(f * 0.9, t0 + dt + 0.32);
            g.gain.setValueAtTime(0.0001, t0 + dt);
            g.gain.exponentialRampToValueAtTime(0.055, t0 + dt + 0.07);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.36);
            o.connect(g); g.connect(A.out); g.connect(wet);
            o.start(t0 + dt);
            o.stop(t0 + dt + 0.4);
        });
    }

    function scheduleEvent() {
        clearTimeout(creakTimer);
        creakTimer = setTimeout(function () {
            if (!ambience) return;
            const r = Math.random();
            if (r < 0.55) sound(creak);
            else if (r < 0.85) sound(owl);
            else sound(function (t0) { wail(t0, 2.2, 0.45); });
            scheduleEvent();
        }, rand(6000, 14000));
    }

    // ---------------------------------------------------
    // Llamas y gotas (pools)
    // ---------------------------------------------------
    function buildPools() {
        for (let i = 0; i < FLAME_POOL; i++) flames.push(el('hw-flame'));
        for (let i = 0; i < DRIP_POOL; i++) drips.push(el('hw-drip'));
        for (let i = 0; i < BAT_POOL; i++) bats.push(el('hw-bat'));
    }

    function frame() {
        raf = 0;
        // Lecturas de layout primero, escrituras (animaciones) después
        const f = flameQueue.splice(0, 4).map(function (e) { return e.isConnected ? e.getBoundingClientRect() : null; });
        const d = dripQueue.splice(0, 3).map(function (e) { return e.isConnected ? e.getBoundingClientRect() : null; });
        flameQueue.length = 0;
        dripQueue.length = 0;
        f.forEach(function (r) { if (r) flame(r); });
        d.forEach(function (r) { if (r) drip(r); });
    }

    function schedule() {
        if (!raf) raf = requestAnimationFrame(frame);
    }

    function flame(r) {
        const n = flames[flameIdx++ % flames.length];
        const x = r.left + r.width / 2 - 8;
        const y = r.top - 6;
        n.getAnimations().forEach(function (a) { a.cancel(); });
        n.animate([
            { transform: 'translate(' + x + 'px,' + y + 'px) scale(0.4, 0.3)', opacity: 0 },
            { transform: 'translate(' + (x + rand(-2, 2)) + 'px,' + (y - 9) + 'px) scale(1, 1.1)', opacity: 1, offset: 0.25 },
            { transform: 'translate(' + (x + rand(-3, 3)) + 'px,' + (y - 16) + 'px) scale(0.8, 1)', opacity: 0.85, offset: 0.6 },
            { transform: 'translate(' + (x + rand(-5, 5)) + 'px,' + (y - 30) + 'px) scale(0.3, 0.5)', opacity: 0 }
        ], { duration: 650, easing: 'ease-out' });
    }

    function drip(r) {
        const n = drips[dripIdx++ % drips.length];
        const x = r.left + r.width / 2 - 1.5 + rand(-3, 3);
        const y = r.bottom - 6;
        n.getAnimations().forEach(function (a) { a.cancel(); });
        n.animate([
            { transform: 'translate(' + x + 'px,' + y + 'px) scaleY(0.2)', opacity: 0.95 },
            { transform: 'translate(' + x + 'px,' + y + 'px) scaleY(1)', opacity: 1, offset: 0.25 },
            { transform: 'translate(' + x + 'px,' + (y + 46) + 'px) scaleY(1)', opacity: 0.9, offset: 0.75 },
            { transform: 'translate(' + x + 'px,' + (y + 64) + 'px) scaleY(0.6)', opacity: 0 }
        ], { duration: 950, easing: 'cubic-bezier(.4,0,.9,.6)' });
    }

    // ---------------------------------------------------
    // Murciélagos
    // ---------------------------------------------------
    function flyBat(b, delay) {
        const w = window.innerWidth, h = window.innerHeight;
        const ltr = Math.random() < 0.5;
        const y0 = rand(h * 0.05, h * 0.38);
        const x0 = ltr ? -60 : w + 60, x1 = ltr ? w + 60 : -60;
        const s = rand(0.7, 1.3) * (ltr ? 1 : -1);
        const dur = rand(4200, 7000);
        b.getAnimations().forEach(function (a) { a.cancel(); });
        b.animate([
            { transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(' + s + ',' + Math.abs(s) + ')', opacity: 0 },
            { transform: 'translate(' + (x0 + (x1 - x0) * 0.1) + 'px,' + (y0 + 8) + 'px) scale(' + s + ',' + Math.abs(s) + ')', opacity: 0.9, offset: 0.08 },
            { transform: 'translate(' + (x0 + (x1 - x0) * 0.4) + 'px,' + (y0 - rand(30, 70)) + 'px) scale(' + s + ',' + Math.abs(s) + ')', opacity: 0.9, offset: 0.4 },
            { transform: 'translate(' + (x0 + (x1 - x0) * 0.7) + 'px,' + (y0 + rand(20, 60)) + 'px) scale(' + s + ',' + Math.abs(s) + ')', opacity: 0.9, offset: 0.7 },
            { transform: 'translate(' + x1 + 'px,' + (y0 - rand(10, 40)) + 'px) scale(' + s + ',' + Math.abs(s) + ')', opacity: 0 }
        ], { duration: dur, delay: delay || 0, easing: 'linear' });
    }

    function batFlock(n) {
        if (T.reducedMotion || !T.active) return;
        for (let i = 0; i < Math.min(n, bats.length); i++) flyBat(bats[i], i * 280);
    }

    function scheduleBat() {
        clearTimeout(batTimer);
        batTimer = setTimeout(function () {
            if (inTest && !T.reducedMotion) {
                const free = bats.filter(function (b) { return !b.getAnimations().length; });
                if (free.length) flyBat(pick(free));
            }
            if (inTest) scheduleBat();
        }, rand(5000, 11000));
    }

    // ---------------------------------------------------
    // Relámpago: un único pulso suave, raro y solo en el cielo
    // ---------------------------------------------------
    function bolt() {
        if (T.reducedMotion || !boltEl) return;
        boltEl.getAnimations().forEach(function (a) { a.cancel(); });
        boltEl.animate([{ opacity: 0 }, { opacity: 0.45, offset: 0.2 }, { opacity: 0 }], { duration: 1100, easing: 'ease-out' });
        sound(thunder, rand(0.5, 1.2));
    }

    function scheduleBolt() {
        clearTimeout(boltTimer);
        boltTimer = setTimeout(function () {
            if (!inTest) return;
            bolt();
            scheduleBolt();
        }, rand(14000, 26000));
    }

    // ---------------------------------------------------
    // Estado espectral (racha >= 20)
    // ---------------------------------------------------
    function setSpectral(on) {
        if (on === spectral) return;
        spectral = on;
        document.body.classList.toggle('hw-spectral', on);
        if (on) sound(whoosh);
    }

    // ---------------------------------------------------
    // Eventos del juego
    // ---------------------------------------------------
    function onKey(e) {
        if (!inTest) { inTest = true; startRound(); }
        preload();
        const now = performance.now();
        if (now - lastKeySound > 18) {
            lastKeySound = now;
            if (!e.ok) { whisper(); }
            else sound(function (t0) { step(t0, e.char === ' '); });
        }
        if (T.reducedMotion || !e.el) return;
        if (e.ok) {
            if (e.char !== ' ' && flameQueue.length < 6) { flameQueue.push(e.el); schedule(); }
        } else if (dripQueue.length < 4) {
            dripQueue.push(e.el);
            schedule();
        }
    }

    function onCombo(count) {
        setSpectral(count >= SPECTRAL_AT);
        if (count > 0 && count % 10 === 0) {
            sound(choir);
            if (count % 20 === 0) batFlock(3);
        }
    }

    function onLife(remaining) {
        const prev = lastLives;
        lastLives = remaining;
        if (prev == null || remaining >= prev) return;
        // Perder la última vida lo cubre 'end(gameover)': no se ríe dos veces
        if (remaining > 0) {
            laugh(0.05);
            batFlock(3);
        }
    }

    function startRound() {
        preload();
        startAmbience();
        scheduleBat();
        scheduleBolt();
    }

    function stopRound() {
        inTest = false;
        clearTimeout(batTimer);
        clearTimeout(boltTimer);
        batTimer = boltTimer = 0;
        stopAmbience();
    }

    function onEnd(kind) {
        stopRound();
        setSpectral(false);
        if (kind === 'gameover') {
            sound(thunder);
            laugh(0.25);
            if (!T.reducedMotion) { bolt(); batFlock(3); }
        } else {
            sound(function (t0) { bell(t0); bell(t0 + 1.1); });
            if (!T.reducedMotion) batFlock(3);
        }
    }

    function onSection(name) {
        if (name === 'typing') {
            lastLives = null;
            preload();
            // El ambiente empieza con la primera tecla (así el audio ya está desbloqueado)
            inTest = true;
            scheduleBat();
            scheduleBolt();
            startAmbience();
        } else {
            stopRound();
            setSpectral(false);
        }
    }

    // Carga las grabaciones en cuanto hay audio. Se llama en cada tecla/sección hasta que
    // están todas (A.load no recuerda los fallos, así que reintenta sin repetir descargas).
    function preload() {
        if (!A.ready()) return;
        if (laughBufs.length >= LAUGH_FILES.length && whisperBufs.length >= WHISPER_FILES.length) return;
        if (loading) return;
        loading = true;
        const jobs = [];
        LAUGH_FILES.forEach(function (u, i) { if (!laughBufs[i]) jobs.push(A.load(u).then(function (b) { if (b) laughBufs[i] = b; })); });
        WHISPER_FILES.forEach(function (u, i) { if (!whisperBufs[i]) jobs.push(A.load(u).then(function (b) { if (b) whisperBufs[i] = b; })); });
        Promise.all(jobs).then(function () {
            loading = false;
            if (laughBufs.filter(Boolean).length >= LAUGH_FILES.length) document.removeEventListener('pointerdown', onFirstGesture);
        }, function () { loading = false; });
    }

    function onActivate() {
        layers = [];
        flames = []; drips = []; bats = [];
        flameQueue = []; dripQueue = [];
        el('hw-fog hw-fog-back');
        el('hw-fog hw-fog-front');
        boltEl = el('hw-bolt');
        buildPools();
        inTest = false;
        lastLives = null;
        spectral = false;
        laughBufs = []; whisperBufs = []; loading = false;
        // El audio se crea con el primer gesto del usuario: se reintenta al primer toque o tecla
        preload();
        document.addEventListener('pointerdown', onFirstGesture);
    }

    function onFirstGesture() {
        if (T.active !== 'halloween') return;
        setTimeout(preload, 400);
        if (laughBufs.filter(Boolean).length >= LAUGH_FILES.length) {
            document.removeEventListener('pointerdown', onFirstGesture);
            }
    }

    function onDeactivate() {
        stopRound();
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        document.removeEventListener('pointerdown', onFirstGesture);
        flameQueue = []; dripQueue = [];
        layers.forEach(function (n) { n.getAnimations().forEach(function (a) { a.cancel(); }); n.remove(); });
        layers = []; flames = []; drips = []; bats = []; boltEl = null;
        document.body.classList.remove('hw-spectral');
        spectral = false;
    }

    T.register('halloween', {
        bodyClass: 'theme-halloween',
        fontHref: 'https://fonts.googleapis.com/css2?family=Creepster&family=New+Rocker&display=swap',
        on: {
            activate: onActivate,
            deactivate: onDeactivate,
            key: onKey,
            combo: onCombo,
            life: onLife,
            end: onEnd,
            section: onSection
        }
    });
})();
