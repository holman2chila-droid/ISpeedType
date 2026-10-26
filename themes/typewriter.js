/* ===================================================
   ISpeedType — Tema inmersivo: MÁQUINA DE ESCRIBIR ANTIGUA (Noir / Vintage)
   Depende de themes/immersive.js (motor) y themes/typewriter.css (estilos).

   Es un tema analógico: casi todo es CSS. Aquí vive solo el sonido
   (sintetizado con Web Audio: no hay archivos de audio):
     - cada tecla: el golpe metálico y seco de un martillo Underwood,
     - la barra espaciadora: un golpe más grave y sordo,
     - el timbre ("¡Cling!") y el retorno de carro cuando la escritura salta
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
    // ---------------------------------------------------

    // Golpe de martillo: chasquido metálico + golpe seco del bastidor + rebote.
    function strike(t0, k) {
        const g = k || 1;
        A.noiseHit(t0, { type: 'highpass', freq: rand(1800, 2600), q: 0.8, dur: 0.012, gain: 0.26 * g });
        A.noiseHit(t0 + 0.003, { freq: rand(800, 1100), q: 1.2, dur: 0.032, gain: 0.12 * g });
        A.tone(t0, { f0: rand(150, 195), f1: 80, dur: 0.065, gain: 0.3 * g });
        A.tone(t0, { f0: rand(2300, 3100), dur: 0.05, gain: 0.03 * g, type: 'triangle' });
        // el martillo vuelve a su sitio
        A.noiseHit(t0 + rand(0.04, 0.052), { type: 'highpass', freq: 3200, dur: 0.006, gain: 0.08 * g });
    }

    // Barra espaciadora: un "thock" más grave y sordo.
    function spacebar(t0) {
        A.tone(t0, { f0: rand(105, 125), f1: 58, dur: 0.12, gain: 0.4 });
        A.noiseHit(t0, { type: 'lowpass', freq: 700, q: 0.7, dur: 0.065, gain: 0.3 });
        A.noiseHit(t0, { type: 'highpass', freq: 2400, dur: 0.01, gain: 0.1 });
    }

    // Fallo: dos martillos chocan y se atascan.
    function jam(t0) {
        strike(t0, 0.9);
        strike(t0 + 0.028, 0.8);
        A.tone(t0 + 0.01, { f0: 150, f1: 62, dur: 0.14, gain: 0.16, type: 'sawtooth' });
        A.noiseHit(t0 + 0.01, { type: 'lowpass', freq: 520, q: 0.7, dur: 0.1, gain: 0.26 });
    }

    // Timbre mecánico: campanilla de acero con parciales no armónicos.
    function bell(t0) {
        const partials = [
            [2480, 0.11, 1.15],
            [3720, 0.055, 0.8],
            [5840, 0.03, 0.45],
            [1240, 0.05, 0.9]
        ];
        partials.forEach(function (p) {
            A.tone(t0, { f0: p[0], dur: p[2], gain: p[1] });
        });
        A.noiseHit(t0, { type: 'highpass', freq: 4000, dur: 0.02, gain: 0.12 });
    }

    // Retorno de carro: el carro se desliza (barrido) y el trinquete va "tic-tic-tic".
    function carriage(t0) {
        A.noiseHit(t0, { freq: 700, freq2: 3200, q: 1.1, dur: 0.24, attack: 0.05, gain: 0.1 });
        for (let i = 0; i < 7; i++) {
            A.noiseHit(t0 + i * (0.034 - i * 0.002), { type: 'highpass', freq: 3000, dur: 0.006, gain: 0.07 });
        }
        A.tone(t0 + 0.26, { f0: 120, f1: 70, dur: 0.07, gain: 0.22 }); // tope del carro
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
        if (wrapped) sound(t0 => { bell(t0); carriage(t0 + 0.07); });
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
            sound(t0 => { jam(t0); jam(t0 + 0.16); A.tone(t0 + 0.3, { f0: 110, f1: 45, dur: 0.4, gain: 0.25 }); });
        } else {
            // Hoja terminada: retorno de carro y timbre final.
            sound(t0 => { carriage(t0); bell(t0 + 0.34); });
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
