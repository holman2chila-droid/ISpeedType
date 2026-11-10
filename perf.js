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

    // --- Modo ahorro (html.low-power) ---
    // Quita los efectos más caros de pintar (desenfoques de fondo, brillos animados) cuando:
    //   · el navegador no acelera por hardware (render por software), o
    //   · es Brave (su gestión de la iGPU a 144 Hz puede disparar el consumo), o
    //   · se fuerza con ?lowpower=1 (o se desactiva con ?lowpower=0). Se recuerda en localStorage.
    function setLow(on) { root.classList.toggle('low-power', !!on); }
    function detectLowPower() {
        let forced = null;
        try {
            const q = new URLSearchParams(location.search).get('lowpower');
            if (q === '1' || q === '0') { forced = q === '1'; localStorage.setItem('speedtype-lowpower', q); }
            else forced = { '1': true, '0': false }[localStorage.getItem('speedtype-lowpower')] ;
        } catch (e) { /* sin almacenamiento */ }
        if (forced !== undefined && forced !== null) { setLow(forced); return; }
        // Render por software (sin GPU)
        try {
            const gl = document.createElement('canvas').getContext('webgl');
            if (gl) {
                const ext = gl.getExtension('WEBGL_debug_renderer_info');
                const r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
                if (/swiftshader|llvmpipe|software|basic render/i.test(r)) setLow(true);
                const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
            }
        } catch (e) { /* sin WebGL */ }
        // Brave
        try {
            if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
                navigator.brave.isBrave().then((yes) => { if (yes) setLow(true); }).catch(() => {});
            }
        } catch (e) { /* no es Brave */ }
    }
    detectLowPower();

    window.SpeedPerf = {
        limiter,
        get lowPower() { return root.classList.contains('low-power'); },
        get idle() { return root.classList.contains('is-idle'); },
        get hidden() { return document.hidden; }
    };
})();
