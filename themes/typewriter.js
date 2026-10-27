/* ===================================================
   ISpeedType — Tema inmersivo: MÁQUINA DE ESCRIBIR ANTIGUA (Noir / Vintage)
   Depende de themes/immersive.js (motor) y themes/typewriter.css (estilos).

   Es un tema analógico: casi todo es CSS. Aquí vive solo el sonido
   (sintetizado con Web Audio: no hay archivos de audio):
     - cada tecla: chasquido seco del martillo contra el rodillo, con el marco vibrando y el rebote,
     - la barra espaciadora: un golpe más grave y sordo,
     - el timbre ("¡ding!") y el retorno de carro cuando la escritura salta
       a la línea siguiente, y al terminar,
     - un fallo: el martillo se atasca (golpe doble y sordo).

   Optimización: no hay efectos visuales que animar. La única lectura de layout
   (saber si una palabra saltó de línea) se hace dentro de requestAnimationFrame
   y solo al pulsar el espacio.
   =================================================== */
(function () {
    'use strict';

    const T = window.ImmersiveThemes;
    if (!T) return;

    const A = T.audio;
    const rand = (a, b) => a + Math.random() * (b - a);

    function sound(fn, delay) {
        if (!A.ready()) return;
        try { fn(A.ctx.currentTime + (delay || 0.002)); } catch (e) { /* un fallo de audio nunca debe afectar al juego */ }
    }

    // ---------------------------------------------------
    // Voces
    // Una máquina de verdad no suena a "bip" ni a teclado: es un chasquido seco y muy corto
    // (el tipo de letra golpea el rodillo), con el marco metálico vibrando un instante, un golpe
    // sordo del rodillo y, un poco después, el martillo que rebota al volver a su sitio.
    // ---------------------------------------------------

    // Resonancia metálica que se apaga sola (un "modo" del marco / de la campanilla).
    function ring(t0, f, gain, decay) {
        const ctx = A.ctx;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0 + 0.0012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
        o.connect(g);
        g.connect(A.out);
        o.start(t0);
        o.stop(t0 + decay + 0.02);
    }

    // Golpe de martillo. k = fuerza (0.6 suave ... 1.3 fuerte).
    function strike(t0, k) {
        const g = (k || 1) * rand(0.85, 1.1) * 1.9;
        const d = rand(0.94, 1.07); // cada tecla suena un poco distinta
        // 1) recorrido de la tecla: "tk" sordo justo antes
        A.noiseHit(t0, { freq: 900 * d, q: 1.4, dur: 0.012, gain: 0.07 * g });
        // 2) el chasquido: el tipo golpea el papel y el rodillo (muy corto, brillante)
        const t = t0 + 0.011;
        A.noiseHit(t, { type: 'highpass', freq: 1800 * d, q: 0.7, dur: 0.007, attack: 0.0006, gain: 0.5 * g });
        A.noiseHit(t, { freq: 3100 * d, q: 1.6, dur: 0.02, attack: 0.0008, gain: 0.3 * g });
        // 3) el marco metálico vibra un instante
        ring(t, 1240 * d, 0.045 * g, 0.05);
        ring(t, 2370 * d, 0.03 * g, 0.035);
        ring(t, 4150 * d, 0.014 * g, 0.022);
        // 4) golpe sordo del rodillo de goma
        A.noiseHit(t, { type: 'lowpass', freq: 380, q: 0.7, dur: 0.04, attack: 0.001, gain: 0.34 * g });
        A.tone(t, { f0: 175 * d, f1: 95, dur: 0.05, gain: 0.2 * g });
        // 5) el martillo rebota al volver a su reposo
        A.noiseHit(t + rand(0.048, 0.066), { freq: 2200 * d, q: 1.2, dur: 0.009, gain: 0.09 * g });
        A.noiseHit(t + rand(0.07, 0.09), { type: 'highpass', freq: 3000, dur: 0.005, gain: 0.04 * g });
    }

    // Barra espaciadora: el carro avanza un paso: "ka-clunk" más hueco y pesado.
    function spacebar(t0) {
        A.noiseHit(t0, { freq: 700, q: 1.2, dur: 0.014, gain: 0.144 });
        const t = t0 + 0.012;
        A.noiseHit(t, { type: 'lowpass', freq: 520, q: 0.8, dur: 0.075, attack: 0.002, gain: 0.828 });
        A.tone(t, { f0: rand(120, 138), f1: 62, dur: 0.1, gain: 0.612 });
        A.noiseHit(t, { type: 'highpass', freq: 2000, dur: 0.008, gain: 0.288 });
        ring(t, 860, 0.03, 0.06);
        // el trinquete del carro
        A.noiseHit(t + 0.045, { freq: 3400, q: 2, dur: 0.008, gain: 0.126 });
    }

    // Fallo: dos martillos chocan y se atascan, con un traqueteo seco.
    function jam(t0) {
        strike(t0, 0.9);
        strike(t0 + 0.022, 1.05);
        A.noiseHit(t0 + 0.012, { type: 'lowpass', freq: 450, q: 0.8, dur: 0.12, gain: 0.3 });
        A.tone(t0 + 0.012, { f0: 140, f1: 58, dur: 0.14, gain: 0.2, type: 'triangle' });
        for (let i = 0; i < 3; i++) {
            A.noiseHit(t0 + 0.07 + i * 0.03, { freq: 2600, q: 2, dur: 0.007, gain: 0.07 });
        }
    }

    // Timbre: la campanilla de acero ("¡ding!") con parciales no armónicos y cola larga.
    function bell(t0) {
        A.noiseHit(t0, { type: 'highpass', freq: 3500, dur: 0.012, gain: 0.16 }); // el martillito golpea
        [[2093, 0.12, 1.7], [5770, 0.07, 1.0], [11300, 0.018, 0.5], [3120, 0.045, 1.2], [1570, 0.035, 1.4]]
            .forEach(function (p) { ring(t0 + 0.001, p[0], p[1], p[2]); });
    }

    // Retorno de carro: la palanca arrastra el carro con un trinquete que "zumba" (clics cada vez
    // más rápidos) y termina con un golpe seco contra el tope.
    function carriage(t0) {
        // arrastre
        A.noiseHit(t0, { freq: 500, freq2: 1600, q: 0.9, dur: 0.5, attack: 0.08, gain: 0.05 });
        let t = t0;
        let gap = 0.036;
        for (let i = 0; i < 16; i++) {
            A.noiseHit(t, { freq: rand(2400, 3200), q: 2.2, dur: 0.006, attack: 0.0005, gain: 0.1 });
            A.noiseHit(t, { type: 'lowpass', freq: 600, dur: 0.012, gain: 0.05 });
            t += gap;
            gap = Math.max(0.017, gap * 0.94);
        }
        // tope del carro
        const e = t + 0.03;
        A.noiseHit(e, { type: 'lowpass', freq: 420, q: 0.8, dur: 0.1, attack: 0.001, gain: 0.5 });
        A.tone(e, { f0: 110, f1: 55, dur: 0.12, gain: 0.34 });
        A.noiseHit(e, { type: 'highpass', freq: 1800, dur: 0.01, gain: 0.2 });
        ring(e, 980, 0.04, 0.09);
    }

    // ---------------------------------------------------
    // Salto de línea: ¿la palabra siguiente quedó en otra línea?
    // ---------------------------------------------------
    let raf = 0;
    let pendingSpace = null;

    function checkWrap() {
        raf = 0;
        const sp = pendingSpace;
        pendingSpace = null;
        if (!sp || !sp.isConnected) return;
        const prev = sp.previousElementSibling;   // la palabra que acabas de terminar
        const next = sp.nextElementSibling;       // la que empieza ahora
        const a = sp.getBoundingClientRect();
        // El navegador puede dejar el espacio al final de la línea o al inicio de la siguiente:
        // hay salto de línea si el espacio cae más abajo que la palabra anterior
        // o si la palabra siguiente cae más abajo que el espacio.
        let wrapped = false;
        if (prev) wrapped = a.top > prev.getBoundingClientRect().top + a.height * 0.6;
        if (!wrapped && next) wrapped = next.getBoundingClientRect().top > a.top + a.height * 0.6;
        if (wrapped) sound(t0 => { bell(t0); carriage(t0 + 0.2); });
    }

    // ---------------------------------------------------
    // Eventos del juego
    // ---------------------------------------------------
    let lastKeySound = 0;

    function onKey(e) {
        const now = performance.now();
        if (now - lastKeySound > 18) { // si llegan teclas casi a la vez, solo suena una
            lastKeySound = now;
            if (!e.ok) sound(jam);
            else if (e.char === ' ') sound(spacebar);
            else sound(t0 => strike(t0));
        }

        // Al pulsar el espacio, mira (un fotograma después) si la escritura saltó de línea.
        if (e.ok && e.char === ' ' && e.el) {
            pendingSpace = e.el;
            if (!raf) raf = requestAnimationFrame(checkWrap);
        }
    }

    function onEnd(kind) {
        if (kind === 'gameover') {
            sound(t0 => { jam(t0); jam(t0 + 0.16); jam(t0 + 0.31); A.tone(t0 + 0.4, { f0: 110, f1: 45, dur: 0.4, gain: 0.25 }); });
        } else {
            // Hoja terminada: retorno de carro y timbre final.
            sound(t0 => { carriage(t0); bell(t0 + 0.62); });
        }
    }

    function onDeactivate() {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        pendingSpace = null;
    }

    T.register('typewriter', {
        bodyClass: 'theme-typewriter',
        fontHref: 'https://fonts.googleapis.com/css2?family=Special+Elite&display=swap',
        on: {
            deactivate: onDeactivate,
            key: onKey,
            end: onEnd
        }
    });
})();
