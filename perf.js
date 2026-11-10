/* ===================================================
   ISpeedType — Control de rendimiento (perf.js)
   Objetivo: que el juego NO gaste CPU/GPU de más en pantallas de alta
   frecuencia (120/144/240 Hz) ni cuando nadie lo está mirando.

   - SpeedPerf.limiter(fps): limitador de fotogramas con corrección de deriva.
     Se usa dentro de un requestAnimationFrame: si devuelve false, se salta
     el fotograma. Los bucles del juego usan delta time, así que la velocidad
     de juego es idéntica a 60 que a 144 Hz.
   - Clase html.is-hidden  -> pestaña oculta: todas las animaciones CSS en pausa.
   - Clase html.is-idle    -> en el lobby y sin actividad durante IDLE_MS:
                              animaciones decorativas en pausa (vuelven al mover
                              el ratón, tocar o pulsar una tecla).
   =================================================== */
(function () {
    'use strict';

    const IDLE_MS = 6000;
    const root = document.documentElement;

    // Limitador de fotogramas (acumula el tiempo ideal para no perder fps por redondeo)
    function limiter(fps) {
        const step = 1000 / fps;
        let next = 0;
        return function allow(now) {
            if (now + 3.5 < next) return false;          // aún no toca (margen para pantallas de 144 Hz)
            next = (next && now - next < step * 2 ? next : now) + step;
            return true;
        };
    }

    // --- Pestaña oculta ---
    function onVisibility() { root.classList.toggle('is-hidden', document.hidden); }
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();

    // --- Inactividad (solo fuera de las partidas) ---
    let idleTimer = 0;
    function inGame() { return root.classList.contains('modo-juego'); }
    function wake() {
        if (root.classList.contains('is-idle')) root.classList.remove('is-idle');
        clearTimeout(idleTimer);
        idleTimer = setTimeout(sleep, IDLE_MS);
    }
    function sleep() {
        if (inGame() || document.hidden) { idleTimer = setTimeout(sleep, IDLE_MS); return; }
        root.classList.add('is-idle');
    }
    ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) =>
        window.addEventListener(ev, wake, { passive: true, capture: true }));
    wake();

    window.SpeedPerf = {
        limiter,
        get idle() { return root.classList.contains('is-idle'); },
        get hidden() { return document.hidden; }
    };
})();
