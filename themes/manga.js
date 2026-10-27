/* ===================================================
   ISpeedType — Tema inmersivo: BATALLA MANGA (Shonen)
   Depende de themes/immersive.js (motor) y themes/manga.css (estilos).

   Aquí vive lo que el CSS no puede hacer solo:
     - onda de energía (Ki) al completar una palabra sin errores,
     - estrella de impacto + globo de onomatopeya al fallar,
     - líneas de velocidad en los bordes con un combo alto,
     - el ¡K.O.! al terminar la partida,
     - el sonido (todo sintetizado con Web Audio: no hay archivos de audio).

   Optimización (la justa, sin tocar lo importante):
     - Efectos = un grupo pequeño de elementos reutilizables que solo animan
       transform / opacity. Nada se anima letra por letra.
     - Las posiciones se leen dentro de requestAnimationFrame, todas juntas.
     - Hay un tope de efectos simultáneos; si se escribe muy rápido se omiten.
   =================================================== */
(function () {
    'use strict';

    const T = window.ImmersiveThemes;
    if (!T) return;

    const A = T.audio;

    const POOL_SIZE = 10;        // máximo de ondas / estrellas a la vez
    const BUBBLES = 2;           // globos de onomatopeya a la vez
    const MAX_QUEUE = 3;         // letras pendientes de dibujar por fotograma
    const LINES_AT = 15;         // combo en el que aparecen las líneas de velocidad
    const LINES_MAX_AT = 30;     // combo en el que se intensifican (= racha de la app)

    // Onomatopeyas de dolor por idioma
    const OOF = {
        es: ['¡ARGH!', '¡PUM!', '¡UGH!', '¡GRR!', '¡AY!', '¡ZAS!'],
        en: ['ARGH!', 'BAM!', 'UGH!', 'GRR!', 'OOF!', 'WHAM!']
    };
    const KO_TEXT = { es: '¡K.O.!', en: 'K.O.!' };

    const lang = () => (window.I18N && window.I18N.lang === 'en') ? 'en' : 'es';

    // ---------------------------------------------------
    // Efectos visuales
    // ---------------------------------------------------
    let layer = null;            // contenedor fijo de efectos
    let lines = null;            // líneas de velocidad
    let pool = [];
    let poolCursor = 0;
    let bubbles = [];
    let bubbleCursor = 0;
    let lastOof = -1;
    let queue = [];
    let raf = 0;
    let card = null;
    let shakeAnim = null;
    let comboCard = null;
    let koEl = null;

    function ensureLayer() {
        if (layer) return;
        layer = document.createElement('div');
        layer.className = 'mg-fx';
        layer.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < POOL_SIZE; i++) {
            const el = document.createElement('div');
            el.className = 'mg-fx-item';
            el._busy = false;
            pool.push(el);
            layer.appendChild(el);
        }
        for (let i = 0; i < BUBBLES; i++) {
            const el = document.createElement('div');
            el.className = 'mg-fx-item mg-bubble';
            el._busy = false;
            bubbles.push(el);
            layer.appendChild(el);
        }
        document.body.appendChild(layer);
    }

    function ensureLines() {
        if (lines) return;
        lines = document.createElement('div');
        lines.className = 'mg-lines';
        lines.setAttribute('aria-hidden', 'true');
        document.body.appendChild(lines);
    }

    function takeItem(kind) {
        for (let i = 0; i < POOL_SIZE; i++) {
            const el = pool[(poolCursor + i) % POOL_SIZE];
            if (!el._busy) {
                poolCursor = (poolCursor + i + 1) % POOL_SIZE;
                el._busy = true;
                el.className = 'mg-fx-item mg-' + kind;
                el.textContent = '';
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

    function queueFx(item) {
        if (queue.length >= MAX_QUEUE) queue.shift();
        queue.push(item);
        if (!raf) raf = requestAnimationFrame(flush);
    }

    const rand = (a, b) => a + Math.random() * (b - a);
    const place = (x, y, extra) => 'translate(' + x + 'px,' + y + 'px) translate(-50%,-50%)' + (extra ? ' ' + extra : '');

    function flush() {
        raf = 0;
        const items = queue;
        queue = [];
        if (!layer) return; // el tema se apagó mientras esperaba el fotograma

        // 1) Leer todas las posiciones juntas…
        const rects = items.map(it => {
            const target = it.word || it.el;
            return target && target.isConnected ? target.getBoundingClientRect() : null;
        });

        // 2) …y después crear las animaciones.
        for (let i = 0; i < items.length; i++) {
            const r = rects[i];
            if (!r || r.width === 0) continue;
            const it = items[i];
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;

            if (it.kind === 'aura') {
                const el = takeItem('aura');
                if (!el) continue;
                const sx = (r.width + 70) / 100;
                const sy = (r.height + 46) / 100;
                play(el, [
                    { transform: place(cx, cy, 'scale(' + (sx * 0.55) + ',' + (sy * 0.55) + ')'), opacity: 0.9 },
                    { transform: place(cx, cy, 'scale(' + (sx * 1.15) + ',' + (sy * 1.15) + ')'), opacity: 0 }
                ], { duration: 340, easing: 'ease-out' });
            } else {
                // Error: estrella de impacto con la letra vibrando + globo de dolor
                const pow = takeItem('pow');
                if (pow) {
                    pow.textContent = it.char;
                    const rot = rand(-25, 25);
                    const j = 3.5; // amplitud de la vibración (px)
                    const f = [];
                    for (let k = 0; k <= 6; k++) {
                        const dx = k === 6 ? 0 : (k % 2 ? j : -j) * rand(0.6, 1.2);
                        const dy = k === 6 ? 0 : (k % 3 ? -j : j) * rand(0.5, 1.1);
                        f.push({
                            transform: place(cx + dx, cy + dy, 'rotate(' + (rot + dx) + 'deg) scale(' + (k === 0 ? 0.4 : 1.1 - k * 0.02) + ')'),
                            opacity: k === 6 ? 0 : 1,
                            offset: k / 6
                        });
                    }
                    play(pow, f, { duration: 420, easing: 'linear' });
                }
                popBubble(cx, r.top);
            }
        }
    }

    function popBubble(cx, top) {
        const el = bubbles[bubbleCursor % BUBBLES];
        bubbleCursor++;
        if (!el) return;
        if (el._anim) el._anim.cancel();
        const words = OOF[lang()];
        let n;
        do { n = Math.floor(Math.random() * words.length); } while (n === lastOof && words.length > 1);
        lastOof = n;
        el.textContent = words[n];
        const x = Math.max(70, Math.min(window.innerWidth - 70, cx));
        const y = Math.max(40, top - 20);
        const rot = rand(-8, 8);
        const base = 'translate(' + x + 'px,' + y + 'px) translate(-50%,-100%) rotate(' + rot + 'deg)';
        el._busy = true;
        el._anim = el.animate([
            { transform: base + ' scale(.3)', opacity: 0 },
            { transform: base + ' scale(1.2)', opacity: 1, offset: 0.14 },
            { transform: base + ' scale(1)', opacity: 1, offset: 0.24 },
            { transform: base + ' scale(1)', opacity: 1, offset: 0.78 },
            { transform: base + ' scale(.95) translateY(-6px)', opacity: 0 }
        ], { duration: 760, easing: 'ease-out' });
        el._anim.onfinish = () => { el._busy = false; };
    }

    function shakeBox() {
        if (!card) card = document.querySelector('.typing-card');
        if (!card || !card.animate) return;
        if (shakeAnim) shakeAnim.cancel();
        shakeAnim = card.animate([
            { transform: 'translate(0,0)' },
            { transform: 'translate(-7px,2px)' },
            { transform: 'translate(6px,-2px)' },
            { transform: 'translate(-5px,1px)' },
            { transform: 'translate(4px,-1px)' },
            { transform: 'translate(-2px,0)' },
            { transform: 'translate(0,0)' }
        ], { duration: 260, easing: 'ease-out' });
    }

    function setLines(count) {
        if (!lines) return;
        lines.classList.toggle('mg-lines-on', count >= LINES_AT);
        lines.classList.toggle('mg-lines-max', count >= LINES_MAX_AT);
    }

    // ¡K.O.! en el centro de la pantalla
    function showKO(heavy) {
        if (T.reducedMotion) return;
        if (koEl) koEl.remove();
        koEl = document.createElement('div');
        koEl.className = 'mg-ko';
        koEl.setAttribute('aria-hidden', 'true');
        const burst = document.createElement('div');
        burst.className = 'mg-ko-burst';
        const text = document.createElement('div');
        text.className = 'mg-ko-text';
        text.textContent = KO_TEXT[lang()];
        koEl.appendChild(burst);
        koEl.appendChild(text);
        document.body.appendChild(koEl);

        const el = koEl;
        const rot = heavy ? 'rotate(-10deg)' : 'rotate(-6deg)';
        text.animate([
            { transform: rot + ' scale(3.2)', opacity: 0 },
            { transform: rot + ' scale(.9)', opacity: 1, offset: 0.18 },
            { transform: rot + ' scale(1.06)', offset: 0.28 },
            { transform: rot + ' scale(1)', offset: 0.4 },
            { transform: rot + ' scale(1)', opacity: 1, offset: 1 }
        ], { duration: 1500, fill: 'forwards', easing: 'ease-out' });
        burst.animate([
            { transform: 'scale(.4)', opacity: 0 },
            { transform: 'scale(1)', opacity: 0.85, offset: 0.2 },
            { transform: 'scale(1.12)', opacity: 0.85 }
        ], { duration: 1500, fill: 'forwards', easing: 'ease-out' });
        const anim = el.animate([
            { opacity: 0 },
            { opacity: 1, offset: 0.08 },
            { opacity: 1, offset: 0.78 },
            { opacity: 0 }
        ], { duration: 1500, fill: 'forwards' });
        anim.onfinish = () => { el.remove(); if (koEl === el) koEl = null; };
    }

    // ---------------------------------------------------
    // Sonido (síntesis con Web Audio)
    // ---------------------------------------------------

    // Puñetazo: golpe grave que cae en tono + ruido sordo + chasquido de contacto.
    function punch(t0, heavy) {
        const k = heavy ? 0.78 : 1;
        A.tone(t0, { f0: rand(135, 175) * k, f1: 44, dur: heavy ? 0.17 : 0.12, gain: heavy ? 0.5 : 0.4 });
        A.noiseHit(t0, { type: 'lowpass', freq: rand(800, 1200) * k, q: 0.7, dur: 0.06, gain: 0.34 });
        A.noiseHit(t0, { freq: rand(2200, 3000), q: 1, dur: 0.014, gain: 0.16 });
    }

    // Corte de katana: siseo agudo que sube + tintineo metálico.
    function slash(t0, loud) {
        A.noiseHit(t0, { freq: 1600, freq2: rand(7500, 9500), q: 1.2, dur: 0.11, attack: 0.025, gain: loud ? 0.34 : 0.26 });
        A.tone(t0 + 0.07, { f0: rand(3000, 3600), dur: 0.2, gain: 0.03, type: 'sine' });
    }

    // Error: golpe sordo + quejido que cae.
    function hurt(t0) {
        A.tone(t0, { f0: 280, f1: 85, dur: 0.22, gain: 0.2, type: 'sawtooth' });
        A.tone(t0, { f0: 90, f1: 38, dur: 0.18, gain: 0.45 });
        A.noiseHit(t0, { type: 'lowpass', freq: 600, q: 0.7, dur: 0.1, gain: 0.3 });
    }

    // ¡K.O.!: explosión grave + barrido de ruido + campanada.
    function knockout(t0, low) {
        const k = low ? 0.7 : 1;
        A.tone(t0, { f0: 130 * k, f1: 26, dur: 0.95, gain: 0.6 });
        A.noiseHit(t0, { type: 'lowpass', freq: 3200 * k, freq2: 160, q: 0.8, dur: 0.7, gain: 0.45, attack: 0.006 });
        A.noiseHit(t0, { freq: 2600, q: 1, dur: 0.02, gain: 0.25 });
        if (low) {
            A.tone(t0 + 0.1, { f0: 330, f1: 55, dur: 0.7, gain: 0.2, type: 'sawtooth' });
        } else {
            A.tone(t0 + 0.14, { f0: 1046, dur: 1.1, gain: 0.12 });
            A.tone(t0 + 0.14, { f0: 1568, dur: 1.2, gain: 0.08 });
            A.tone(t0 + 0.14, { f0: 2093, dur: 0.9, gain: 0.04 });
        }
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
            if (e.ok) {
                // Con la racha alta, más cortes de espada; el espacio siempre pega fuerte.
                const slashChance = lastCombo >= LINES_AT ? 0.4 : 0.15;
                if (e.char !== ' ' && Math.random() < slashChance) sound(t0 => slash(t0));
                else sound(t0 => punch(t0, e.char === ' '));
            } else {
                sound(hurt);
            }
        }

        // Efectos visuales
        if (T.reducedMotion) return;
        ensureLayer();
        if (!e.el) return;
        if (e.ok) {
            // Palabra completada sin errores: onda de energía alrededor de la palabra.
            if (e.char === ' ') {
                const word = e.el.previousElementSibling;
                if (word && word.classList.contains('word') && !word.querySelector('.char-error')) {
                    queueFx({ kind: 'aura', word: word });
                }
            }
        } else {
            queueFx({ kind: 'pow', el: e.el, char: e.el.textContent || '' });
            shakeBox();
        }
    }

    function onCombo(count) {
        if (!comboCard) comboCard = document.getElementById('combo-stat-card');
        if (comboCard) comboCard.classList.toggle('mg-power', count >= LINES_MAX_AT);
        ensureLines();
        setLines(count);
        // Cada 10 aciertos seguidos: doble corte de espada.
        if (count > lastCombo && count > 0 && count % 10 === 0) {
            sound(t0 => { slash(t0, true); slash(t0 + 0.09, true); });
        }
        lastCombo = count;
    }

    function onEnd(kind) {
        if (lines) setLines(0);
        if (kind === 'gameover') {
            sound(t0 => knockout(t0, true));
            showKO(true);
        } else {
            sound(t0 => { slash(t0, true); knockout(t0 + 0.12, false); });
            showKO(false);
        }
    }

    function onActivate() {
        lastCombo = 0;
        comboCard = null;
        card = null;
        ensureLines();
        if (!T.reducedMotion) ensureLayer();
    }

    function onDeactivate() {
        queue = [];
        if (shakeAnim) { shakeAnim.cancel(); shakeAnim = null; }
        if (!comboCard) comboCard = document.getElementById('combo-stat-card');
        if (comboCard) comboCard.classList.remove('mg-power');
        if (layer) {
            layer.remove();
            layer = null;
            pool = [];
            bubbles = [];
            poolCursor = 0;
            bubbleCursor = 0;
        }
        if (lines) { lines.remove(); lines = null; }
        if (koEl) { koEl.remove(); koEl = null; }
        comboCard = null;
        card = null;
    }

    T.register('manga', {
        bodyClass: 'theme-manga',
        fontHref: 'https://fonts.googleapis.com/css2?family=Bangers&family=Londrina+Solid:wght@400;900&display=swap',
        on: {
            activate: onActivate,
            deactivate: onDeactivate,
            key: onKey,
            combo: onCombo,
            end: onEnd
        }
    });
})();
