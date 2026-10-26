/* ===================================================
   ISpeedType — Tema inmersivo: CYBERPUNK (Terminal 2077)
   Depende de themes/immersive.js (motor) y themes/cyberpunk.css (estilos).

   Aquí vive lo que el CSS no puede hacer solo:
     - el texto por escribir se ve como código cifrado (glifos al azar) y se
       "desencripta" cuando el cursor llega a cada letra,
     - destello + micro-parpadeo al acertar,
     - glitch de video (canales rojo/azul + skew) al fallar,
     - el sonido (todo sintetizado con Web Audio: no hay archivos de audio).

   Optimización:
     - Los glifos se aplican por bloque (chunk) cuando la app monta texto nuevo
       (MutationObserver); no hay temporizadores recorriendo el texto.
     - Nada se anima letra por letra de forma continua: solo la letra recién
       escrita parpadea, y el glitch es UNA animación sobre el bloque de texto.
     - Con "reducir movimiento" no hay destellos ni glitch (el sonido sí).
   =================================================== */
(function () {
    'use strict';

    const T = window.ImmersiveThemes;
    if (!T) return;

    const A = T.audio;

    const GLYPHS = '01#$%&*+=<>?/\\|[]{}ABCDEF23456789';
    const rand = (a, b) => a + Math.random() * (b - a);
    const glyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

    let display = null;      // #text-display
    let observer = null;
    let pendingScan = 0;     // rAF del escaneo de chunks nuevos
    let newNodes = [];
    let glitchAnim = null;
    let lastKeySound = 0;
    let lastScramble = 0;
    let lastCombo = 0;

    // ---------------------------------------------------
    // Texto cifrado
    // ---------------------------------------------------
    // Cifra una letra pendiente: guarda la real y el glifo puesto, para poder
    // distinguir si la app ya la reescribió (p. ej. al volver atrás con Retroceso).
    function encrypt(span) {
        if (!span.classList.contains('char-pending') || span.classList.contains('char-space')) return;
        const node = span.firstChild;
        if (!node || node.nodeType !== 3) return;
        const real = span._real !== undefined && node.data === span._enc ? span._real : node.data;
        if (!real || real === ' ' || /\s/.test(real)) return;
        const g = glyph();
        span._real = real;
        span._enc = g;
        node.data = g;
    }

    function encryptTree(root) {
        const spans = root.classList && root.classList.contains('char') ? [root] : root.querySelectorAll ? root.querySelectorAll('.char-pending') : [];
        for (let i = 0; i < spans.length; i++) encrypt(spans[i]);
    }

    function scanNew() {
        pendingScan = 0;
        const nodes = newNodes;
        newNodes = [];
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].isConnected) encryptTree(nodes[i]);
        }
    }

    function onMutations(list) {
        for (let i = 0; i < list.length; i++) {
            const added = list[i].addedNodes;
            for (let j = 0; j < added.length; j++) if (added[j].nodeType === 1) newNodes.push(added[j]);
        }
        if (newNodes.length && !pendingScan) pendingScan = requestAnimationFrame(scanNew);
    }

    // Al borrar con Retroceso la app vuelve a mostrar la letra real: se cifra otra vez.
    function reencryptAfterBackspace() {
        requestAnimationFrame(() => {
            if (!display) return;
            const spans = display.querySelectorAll('.char-pending');
            for (let i = 0; i < spans.length; i++) {
                const s = spans[i];
                if (s._real !== undefined && s.firstChild && s.firstChild.data === s._real) encrypt(s);
            }
        });
    }

    function onKeydown(e) {
        if (e.key === 'Backspace') reencryptAfterBackspace();
    }

    function decryptAll() {
        if (!display) return;
        const spans = display.querySelectorAll('.char');
        for (let i = 0; i < spans.length; i++) {
            const s = spans[i];
            if (s._real !== undefined && s.firstChild && s.firstChild.data === s._enc) s.firstChild.data = s._real;
            s._real = s._enc = undefined;
        }
    }

    // ---------------------------------------------------
    // Efectos visuales
    // ---------------------------------------------------
    // Destello al acertar: la letra "se desencripta" con un parpadeo corto.
    function flashChar(el, ch) {
        if (!el || !el.animate) return;
        el.animate([
            { opacity: 0.2, color: '#ffffff' },
            { opacity: 1, color: '#00f0ff', offset: 0.3 },
            { opacity: 0.4, color: '#00f0ff', offset: 0.55 },
            { opacity: 1, color: '#39ff88' }
        ], { duration: 240, easing: 'steps(1, end)' });

        // Un glifo intermedio durante ~50 ms antes de asentarse en la letra real.
        const now = performance.now();
        const node = el.firstChild;
        if (node && node.nodeType === 3 && ch && ch !== ' ' && now - lastScramble > 45) {
            lastScramble = now;
            node.data = glyph();
            setTimeout(() => {
                if (node.data !== ch && el.classList.contains('char-correct')) node.data = ch;
            }, 55);
        }
    }

    // Glitch de video: canales rojo/azul desplazados + skew, todo sobre el bloque de texto.
    function glitch() {
        if (!display || !display.animate) return;
        if (glitchAnim) glitchAnim.cancel();
        const split = (x) => 'drop-shadow(' + x + 'px 0 rgba(255,0,60,.9)) drop-shadow(' + (-x) + 'px 0 rgba(0,240,255,.9))';
        glitchAnim = display.animate([
            { transform: 'none', filter: 'none' },
            { transform: 'skewX(-10deg) translateX(-7px)', filter: split(3), offset: 0.14 },
            { transform: 'skewX(7deg) translateX(6px)', filter: split(-3), offset: 0.3 },
            { transform: 'skewX(-4deg) translateX(2px)', filter: split(2), offset: 0.5 },
            { transform: 'skewX(3deg) translateX(-3px)', filter: split(-2), offset: 0.7 },
            { transform: 'none', filter: 'none' }
        ], { duration: 320, easing: 'steps(1, end)' });
        glitchAnim.onfinish = glitchAnim.oncancel = () => { glitchAnim = null; };
    }

    // ---------------------------------------------------
    // Sonido: teclado mecánico de perfil bajo + clics electrónicos
    // ---------------------------------------------------
    function sound(fn) {
        if (!A.ready()) return;
        try { fn(A.ctx.currentTime + 0.002); } catch (e) { /* un fallo de audio nunca debe afectar al juego */ }
    }

    // Pulsación: clic seco del interruptor + golpe grave del fondo + "blip" electrónico.
    function keyClick(t0, big) {
        const k = big ? 0.7 : 1;
        A.noiseHit(t0, { type: 'highpass', freq: rand(2600, 3400) * k, q: 0.7, dur: 0.012, gain: 0.2 });
        A.noiseHit(t0 + 0.006, { type: 'bandpass', freq: rand(900, 1300) * k, q: 1.2, dur: 0.032, gain: 0.13 });
        A.tone(t0, { f0: 150 * k, f1: 70 * k, dur: 0.05, gain: 0.17, type: 'sine' });
        A.tone(t0 + 0.002, { f0: rand(2300, 3000), f1: 1700, dur: 0.028, gain: 0.03, type: 'square' });
        if (big) A.noiseHit(t0 + 0.05, { type: 'bandpass', freq: rand(1500, 2100), q: 1.5, dur: 0.035, gain: 0.1 }); // estabilizador
    }

    // Error: zumbido digital con ráfagas de estática.
    function errorBuzz(t0) {
        A.tone(t0, { f0: 190, f1: 80, dur: 0.14, gain: 0.14, type: 'sawtooth' });
        A.tone(t0, { f0: 62, dur: 0.16, gain: 0.12, type: 'square' });
        A.noiseHit(t0, { type: 'highpass', freq: 3500, q: 0.6, dur: 0.03, gain: 0.2 });
        A.noiseHit(t0 + 0.06, { type: 'highpass', freq: 5000, q: 0.6, dur: 0.025, gain: 0.16 });
        A.noiseHit(t0 + 0.11, { type: 'bandpass', freq: 2200, q: 0.8, dur: 0.04, gain: 0.14 });
    }

    function blips(t0, notes, step, gain) {
        for (let i = 0; i < notes.length; i++) {
            A.tone(t0 + i * step, { f0: notes[i], dur: 0.09, gain: gain, type: 'square' });
            A.tone(t0 + i * step, { f0: notes[i] * 2, dur: 0.06, gain: gain * 0.4, type: 'triangle' });
        }
    }

    // ---------------------------------------------------
    // Eventos del juego
    // ---------------------------------------------------
    function onKey(e) {
        const now = performance.now();
        if (now - lastKeySound > 18) { // si llegan teclas casi a la vez, solo suena una
            lastKeySound = now;
            if (e.ok) sound(t0 => keyClick(t0, e.char === ' '));
            else sound(errorBuzz);
        }

        if (T.reducedMotion) return;
        if (e.ok) {
            if (e.char !== ' ') flashChar(e.el, e.char);
        } else {
            glitch();
        }
    }

    function onCombo(count) {
        if (count > lastCombo && count > 0 && count % 10 === 0) {
            sound(t0 => blips(t0, [660, 880, 1320], 0.055, 0.05));
        }
        lastCombo = count;
    }

    function onEnd(kind) {
        if (kind === 'gameover') {
            if (!T.reducedMotion) glitch();
            sound(t0 => {
                errorBuzz(t0);
                A.tone(t0 + 0.05, { f0: 600, f1: 40, dur: 0.55, gain: 0.16, type: 'sawtooth' });
                A.noiseHit(t0 + 0.1, { type: 'highpass', freq: 4000, q: 0.6, dur: 0.3, gain: 0.12 });
            });
        } else {
            sound(t0 => blips(t0, [523, 659, 784, 1047], 0.09, 0.06));
        }
    }

    function onActivate() {
        lastCombo = 0;
        display = document.getElementById('text-display');
        if (!display) return;
        observer = new MutationObserver(onMutations);
        observer.observe(display, { childList: true });
        encryptTree(display);                       // si ya hay texto en pantalla
        document.addEventListener('keydown', onKeydown, true);
    }

    function onDeactivate() {
        if (observer) { observer.disconnect(); observer = null; }
        if (pendingScan) { cancelAnimationFrame(pendingScan); pendingScan = 0; }
        newNodes = [];
        document.removeEventListener('keydown', onKeydown, true);
        decryptAll();
        if (glitchAnim) { glitchAnim.cancel(); glitchAnim = null; }
        display = null;
    }

    T.register('cyberpunk', {
        bodyClass: 'theme-cyberpunk',
        fontHref: 'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap',
        on: {
            activate: onActivate,
            deactivate: onDeactivate,
            key: onKey,
            combo: onCombo,
            end: onEnd
        }
    });
})();
