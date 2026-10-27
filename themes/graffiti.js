/* ===================================================
   ISpeedType — Tema inmersivo: GRAFITI CALLEJERO
   Depende de themes/immersive.js (motor) y themes/graffiti.css (estilos).

   Aquí vive lo que el CSS no puede hacer solo:
     - chorreo de pintura y bruma de spray al acertar una letra,
     - mancha negra al fallar y temblor de la caja de texto,
     - la lata de aerosol del combo (se llena con la racha),
     - el sonido (todo sintetizado con Web Audio: no hay archivos de audio).

   Optimización (la justa, sin tocar lo importante):
     - Nada se anima letra por letra: los efectos usan un grupo pequeño de
       elementos reutilizables y solo animan transform/opacity.
     - La posición de la letra se lee dentro de requestAnimationFrame, cuando
       el navegador de todos modos calcula el layout del fotograma.
     - Hay un tope de efectos simultáneos; si se escribe muy rápido se omiten.
   =================================================== */
(function () {
    'use strict';

    const T = window.ImmersiveThemes;
    if (!T) return;

    const A = T.audio;

    // Colores de spray; coinciden con el ciclo de colores del CSS (nth-child 3n+1, 3n+2, 3n).
    const PALETTE = ['#00f0ff', '#ff2fa3', '#39ff14'];
    const FILL_AT = 30;          // combo con el que la lata está llena (= racha de la app)
    const POOL_SIZE = 14;        // máximo de efectos visuales a la vez
    const MAX_QUEUE = 3;         // letras pendientes de dibujar por fotograma
    const DRIP_CHANCE = 0.4;     // no todas las letras chorrean: se ve más natural y cuesta menos

    // ---------------------------------------------------
    // Efectos visuales (pool reutilizable)
    // ---------------------------------------------------
    let layer = null;            // contenedor fijo donde viven los efectos
    let pool = [];
    let poolCursor = 0;
    let queue = [];
    let raf = 0;
    let card = null;             // caja de texto (para el temblor)
    let shakeAnim = null;
    let comboCard = null;

    function ensureLayer() {
        if (layer) return;
        layer = document.createElement('div');
        layer.className = 'gf-fx';
        layer.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < POOL_SIZE; i++) {
            const el = document.createElement('div');
            el.className = 'gf-fx-item';
            el._busy = false;
            pool.push(el);
            layer.appendChild(el);
        }
        document.body.appendChild(layer);
    }

    function takeItem(kind, color) {
        for (let i = 0; i < POOL_SIZE; i++) {
            const el = pool[(poolCursor + i) % POOL_SIZE];
            if (!el._busy) {
                poolCursor = (poolCursor + i + 1) % POOL_SIZE;
                el._busy = true;
                el.className = 'gf-fx-item gf-' + kind;
                el.style.setProperty('--c', color);
                return el;
            }
        }
        return null; // todo ocupado: se omite este efecto
    }

    function play(el, frames, options) {
        const anim = el.animate(frames, options);
        const free = () => { el._busy = false; };
        anim.onfinish = free;
        anim.oncancel = free;
    }

    // Índice de la letra dentro de su palabra (1 = primera): decide su color en el CSS.
    function colorOf(el) {
        let n = 1;
        for (let s = el.previousElementSibling; s; s = s.previousElementSibling) n++;
        return PALETTE[(n - 1) % 3];
    }

    function queueFx(item) {
        if (queue.length >= MAX_QUEUE) queue.shift();
        queue.push(item);
        if (!raf) raf = requestAnimationFrame(flush);
    }

    function flush() {
        raf = 0;
        const items = queue;
        queue = [];
        if (!layer) return; // el tema se apagó mientras esperaba el fotograma

        // 1) Leer todas las posiciones juntas…
        const rects = items.map(it => (it.el.isConnected ? it.el.getBoundingClientRect() : null));

        // 2) …y después crear las animaciones.
        for (let i = 0; i < items.length; i++) {
            const r = rects[i];
            if (!r || r.width === 0) continue;
            const it = items[i];
            const cx = r.left + r.width / 2;

            if (it.ok) {
                const mist = takeItem('mist', it.color);
                if (mist) {
                    const y = r.top + r.height / 2;
                    play(mist, [
                        { transform: 'translate(' + cx + 'px,' + y + 'px) translate(-50%,-50%) scale(.35)', opacity: 0.85 },
                        { transform: 'translate(' + cx + 'px,' + y + 'px) translate(-50%,-50%) scale(1.5)', opacity: 0 }
                    ], { duration: 280, easing: 'ease-out' });
                }
                if (it.drip) {
                    const drip = takeItem('drip', it.color);
                    if (drip) {
                        const x = cx;
                        const y = r.bottom - 6;
                        const dist = 8 + Math.random() * 10;
                        const dur = 650 + Math.random() * 450;
                        play(drip, [
                            { transform: 'translate(' + x + 'px,' + y + 'px) translateX(-50%) scaleY(.12)', opacity: 0.95 },
                            { transform: 'translate(' + x + 'px,' + y + 'px) translateX(-50%) scaleY(1)', opacity: 0.95, offset: 0.65 },
                            { transform: 'translate(' + x + 'px,' + (y + dist) + 'px) translateX(-50%) scaleY(1)', opacity: 0 }
                        ], { duration: dur, easing: 'cubic-bezier(.3,.6,.4,1)' });
                    }
                }
            } else {
                const splat = takeItem('splat', '#000');
                if (splat) {
                    const y = r.top + r.height / 2;
                    const rot = (Math.random() * 60 - 30) + 'deg';
                    play(splat, [
                        { transform: 'translate(' + cx + 'px,' + y + 'px) translate(-50%,-50%) rotate(' + rot + ') scale(.3)', opacity: 1 },
                        { transform: 'translate(' + cx + 'px,' + y + 'px) translate(-50%,-50%) rotate(' + rot + ') scale(1.25)', opacity: 0.95, offset: 0.35 },
                        { transform: 'translate(' + cx + 'px,' + y + 'px) translate(-50%,-50%) rotate(' + rot + ') scale(1.35)', opacity: 0 }
                    ], { duration: 420, easing: 'ease-out' });
                }
            }
        }
    }

    function shakeBox() {
        if (!card) card = document.querySelector('.typing-card');
        if (!card || !card.animate) return;
        if (shakeAnim) shakeAnim.cancel();
        shakeAnim = card.animate([
            { transform: 'translate(0,0) rotate(0)' },
            { transform: 'translate(-5px,1px) rotate(-.4deg)' },
            { transform: 'translate(5px,-1px) rotate(.4deg)' },
            { transform: 'translate(-4px,0) rotate(-.2deg)' },
            { transform: 'translate(3px,0) rotate(.2deg)' },
            { transform: 'translate(0,0) rotate(0)' }
        ], { duration: 220, easing: 'ease-out' });
    }

    // ---------------------------------------------------
    // Sonido (síntesis con Web Audio)
    // ---------------------------------------------------
    const rand = (a, b) => a + Math.random() * (b - a);

    // Golpe corto de ruido filtrado: la "canica" chocando dentro de la lata.
    function noiseHit(t0, o) {
        const ctx = A.ctx;
        const src = ctx.createBufferSource();
        src.buffer = A.noise;
        const flt = ctx.createBiquadFilter();
        flt.type = o.type || 'bandpass';
        flt.frequency.value = o.freq;
        flt.Q.value = o.q || 1;
        const g = ctx.createGain();
        const peak = o.gain;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack || 0.003));
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
        src.connect(flt);
        flt.connect(g);
        g.connect(A.out);
        src.start(t0, Math.random() * 0.5, o.dur + 0.05);
    }

    function tone(t0, o) {
        const ctx = A.ctx;
        const osc = ctx.createOscillator();
        osc.type = o.type || 'sine';
        osc.frequency.setValueAtTime(o.f0, t0);
        if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(o.gain, t0 + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
        osc.connect(g);
        g.connect(A.out);
        osc.start(t0);
        osc.stop(t0 + o.dur + 0.02);
    }

    // "Shack": una sacudida de la lata (dos golpes de canica + un tintineo metálico).
    function shack(t0, big) {
        const k = big ? 0.75 : 1; // el espacio suena más grave y lleno
        noiseHit(t0, { freq: rand(3000, 4200) * k, q: 2.5, dur: 0.024, gain: 0.3 });
        noiseHit(t0 + 0.03, { freq: rand(2200, 3000) * k, q: 2, dur: 0.032, gain: 0.22 });
        tone(t0 + 0.004, { f0: rand(2000, 2600) * k, dur: 0.06, gain: 0.04, type: 'triangle' });
        if (big) noiseHit(t0 + 0.065, { freq: rand(1600, 2200), q: 1.6, dur: 0.04, gain: 0.2 });
    }

    // "Pshh": el gas del aerosol.
    function hiss(t0, dur, gain) {
        const ctx = A.ctx;
        const src = ctx.createBufferSource();
        src.buffer = A.noise;
        src.loop = true;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 3200;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(5200, t0);
        bp.frequency.linearRampToValueAtTime(7600, t0 + dur);
        bp.Q.value = 0.6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0 + 0.035);
        g.gain.setValueAtTime(gain, t0 + dur * 0.55);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(hp);
        hp.connect(bp);
        bp.connect(g);
        g.connect(A.out);
        src.start(t0, Math.random() * 0.5);
        src.stop(t0 + dur + 0.05);
    }

    // Golpe sordo (error): el tapón de la lata o un golpe contra la pared.
    function clank(t0) {
        tone(t0, { f0: 190, f1: 60, dur: 0.15, gain: 0.35, type: 'triangle' });
        noiseHit(t0, { type: 'lowpass', freq: 700, q: 0.7, dur: 0.09, gain: 0.3 });
    }

    function sound(fn) {
        if (!A.ready()) return;
        try { fn(A.ctx.currentTime + 0.002); } catch (e) { /* un fallo de audio nunca debe afectar al juego */ }
    }

    // ---------------------------------------------------
    // Eventos del juego
    // ---------------------------------------------------
    let lastCombo = 0;
    let lastKeySound = 0;

    function onKey(e) {
        // Sonido
        const now = performance.now();
        if (now - lastKeySound > 18) { // si llegan teclas casi a la vez, solo suena una
            lastKeySound = now;
            if (e.ok) sound(t0 => shack(t0, e.char === ' '));
            else sound(clank);
        }

        // Efectos visuales
        if (T.reducedMotion) return;
        ensureLayer();
        if (!e.el) return;
        if (e.ok) {
            if (e.char === ' ') return; // los espacios no se pintan
            queueFx({ el: e.el, ok: true, color: colorOf(e.el), drip: Math.random() < DRIP_CHANCE });
        } else {
            queueFx({ el: e.el, ok: false });
            shakeBox();
        }
    }

    function onCombo(count, onFire) {
        if (!comboCard) comboCard = document.getElementById('combo-stat-card');
        if (comboCard) {
            const fill = Math.min(count / FILL_AT, 1);
            comboCard.style.setProperty('--gf-fill', fill.toFixed(3));
            comboCard.classList.toggle('gf-full', fill >= 1);
        }
        // Racha: cada 10 aciertos seguidos, el siseo del spray.
        if (count > lastCombo && count > 0 && count % 10 === 0) {
            const full = count >= FILL_AT && onFire !== false;
            sound(t0 => hiss(t0, full ? 0.65 : 0.34, full ? 0.26 : 0.2));
        }
        lastCombo = count;
    }

    function onEnd(kind) {
        if (kind === 'gameover') {
            sound(t0 => {
                clank(t0);
                tone(t0 + 0.05, { f0: 320, f1: 50, dur: 0.5, gain: 0.22, type: 'sawtooth' });
                hiss(t0 + 0.1, 0.45, 0.1);
            });
        } else {
            sound(t0 => {
                shack(t0);
                shack(t0 + 0.11);
                shack(t0 + 0.22);
                hiss(t0 + 0.4, 0.9, 0.28);
            });
        }
    }

    function onActivate() {
        lastCombo = 0;
        comboCard = null;
        card = null;
        if (!T.reducedMotion) ensureLayer();
    }

    function onDeactivate() {
        queue = [];
        if (shakeAnim) { shakeAnim.cancel(); shakeAnim = null; }
        if (!comboCard) comboCard = document.getElementById('combo-stat-card');
        if (comboCard) {
            comboCard.style.removeProperty('--gf-fill');
            comboCard.classList.remove('gf-full');
        }
        if (layer) {
            layer.remove();
            layer = null;
            pool = [];
            poolCursor = 0;
        }
        comboCard = null;
        card = null;
    }

    T.register('graffiti', {
        bodyClass: 'theme-graffiti',
        fontHref: 'https://fonts.googleapis.com/css2?family=Permanent+Marker&family=Caveat+Brush&display=swap',
        on: {
            activate: onActivate,
            deactivate: onDeactivate,
            key: onKey,
            combo: onCombo,
            end: onEnd
        }
    });
})();
