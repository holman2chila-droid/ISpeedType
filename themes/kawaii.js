/* ===================================================
   ISpeedType — Tema inmersivo: KAWAII (Nube Dulce)
   Depende de themes/immersive.js (motor) y themes/kawaii.css (estilos).

   Aquí vive lo que el CSS no puede hacer solo:
     - Nubi, la mascota (un conejito de nube) que reacciona a lo que haces,
     - corazones y estrellas que saltan al acertar, "boing" al fallar,
     - confeti al terminar,
     - el sonido (marimba suave sintetizada con Web Audio: no hay archivos de audio).

   Optimización:
     - Los corazones usan un grupo pequeño de elementos reutilizables (pool).
     - Todo se anima con transform / opacity (Web Animations API).
     - La posición de la letra se lee dentro de requestAnimationFrame.
     - Con "reducir movimiento" no hay fondo flotante, rebotes ni confeti (el sonido sí).
   =================================================== */
(function () {
    'use strict';

    const T = window.ImmersiveThemes;
    if (!T) return;

    const A = T.audio;
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = (arr) => arr[(Math.random() * arr.length) | 0];
    const isEN = () => (document.documentElement.lang || '').toLowerCase().indexOf('en') === 0;

    // Keyframes que saltan de golpe: el easing va ENTRE keyframes, no en toda la animación.
    const stepped = (frames) => frames.map((f, i) => (i < frames.length - 1 ? Object.assign({ easing: 'steps(1, end)' }, f) : f));

    const POP_COLORS = ['#ff6fa8', '#b79bff', '#5fd3b3', '#ffb03b', '#ff8fbd'];
    const POP_SHAPES = ['♥', '★', '✦', '✿', '♥'];
    const FLOATERS = ['☁', '♥', '★', '✦', '✿', '☁', '♥', '✧'];
    const POOL_SIZE = 12;
    const MAX_QUEUE = 3;

    // Mascota: SVG propio. Cuerpo de nube + orejas largas de conejito + cachetes + estrellita.
    const MASCOT_SVG =
        '<svg viewBox="0 0 120 138" xmlns="http://www.w3.org/2000/svg">' +
        // orejas (contorno)
        '<g fill="#fff" stroke="#8a68a6" stroke-width="3.2" stroke-linejoin="round">' +
        '<path d="M40 56 C26 22 32 4 43 6 C55 8 55 36 53 56 Z"/>' +
        '<path d="M80 56 C94 22 88 4 77 6 C65 8 65 36 67 56 Z"/>' +
        '</g>' +
        '<path d="M42 50 C35 28 38 14 43 14 C49 15 49 34 48 50 Z" fill="#ffc2dc"/>' +
        '<path d="M78 50 C85 28 82 14 77 14 C71 15 71 34 72 50 Z" fill="#ffc2dc"/>' +
        // cuerpo de nube: primero los contornos, luego el relleno blanco encima
        '<g fill="#8a68a6" stroke="#8a68a6" stroke-width="6">' +
        '<circle cx="60" cy="92" r="30"/><circle cx="33" cy="100" r="19"/><circle cx="87" cy="100" r="19"/>' +
        '<circle cx="45" cy="78" r="21"/><circle cx="75" cy="78" r="21"/>' +
        '</g>' +
        '<g fill="#fff">' +
        '<circle cx="60" cy="92" r="30"/><circle cx="33" cy="100" r="19"/><circle cx="87" cy="100" r="19"/>' +
        '<circle cx="45" cy="78" r="21"/><circle cx="75" cy="78" r="21"/>' +
        '</g>' +
        // patitas
        '<ellipse cx="45" cy="124" rx="9" ry="6" fill="#5fd3b3" stroke="#8a68a6" stroke-width="3"/>' +
        '<ellipse cx="75" cy="124" rx="9" ry="6" fill="#5fd3b3" stroke="#8a68a6" stroke-width="3"/>' +
        // cachetes
        '<circle cx="37" cy="97" r="6.5" fill="#ffb3d3" opacity=".8"/><circle cx="83" cy="97" r="6.5" fill="#ffb3d3" opacity=".8"/>' +
        // cara feliz
        '<g class="kw-eyes-happy" fill="none" stroke="#5b3b72" stroke-width="3.4" stroke-linecap="round">' +
        '<path d="M41 90 q5 -7 10 0"/><path d="M69 90 q5 -7 10 0"/></g>' +
        '<path class="kw-mouth-happy" d="M54 98 q6 7 12 0" fill="none" stroke="#5b3b72" stroke-width="3.2" stroke-linecap="round"/>' +
        // cara triste
        '<g class="kw-eyes-sad" fill="none" stroke="#5b3b72" stroke-width="3.4" stroke-linecap="round">' +
        '<path d="M41 88 q5 6 10 0"/><path d="M69 88 q5 6 10 0"/></g>' +
        '<path class="kw-mouth-sad" d="M54 103 q6 -6 12 0" fill="none" stroke="#5b3b72" stroke-width="3.2" stroke-linecap="round"/>' +
        '<path class="kw-eyes-sad" d="M80 96 q3 5 0 8 q-3 -3 0 -8" fill="#8fd5ff" stroke="none"/>' +
        // cara de asombro
        '<g class="kw-eyes-wow" fill="#5b3b72"><ellipse cx="46" cy="89" rx="4.2" ry="5.6"/><ellipse cx="74" cy="89" rx="4.2" ry="5.6"/>' +
        '<circle cx="47.4" cy="87" r="1.5" fill="#fff"/><circle cx="75.4" cy="87" r="1.5" fill="#fff"/></g>' +
        '<ellipse class="kw-mouth-wow" cx="60" cy="100" rx="4" ry="5" fill="#5b3b72"/>' +
        // estrellita en la oreja
        '<path d="M31 22 l2.6 5.4 5.9 .8 -4.3 4.1 1 5.9 -5.2 -2.8 -5.2 2.8 1 -5.9 -4.3 -4.1 5.9 -.8z" fill="#ffd86b" stroke="#8a68a6" stroke-width="2" stroke-linejoin="round" transform="translate(-2 4) scale(.9)"/>' +
        '</svg>';

    const SAY = {
        es: {
            hello: ['¡Hola! Soy Nubi ☁', '¡Vamos a escribir! ✿'],
            ok: ['¡Genial! ✨', '¡Qué rápido! ♥', '¡Sigue así!'],
            err: ['¡Ay! Tú puedes ♥', 'Sin miedo, ¡otra vez!', '¡Casi! ✿'],
            combo: ['¡Racha de {n}! ✨', '¡Wow, {n} seguidas! ♥'],
            win: ['¡Lo lograste! 🎉'],
            lose: ['¡Otra vez, tú puedes! 💪']
        },
        en: {
            hello: ["Hi! I'm Nubi ☁", "Let's type! ✿"],
            ok: ['Great! ✨', 'So fast! ♥', 'Keep going!'],
            err: ['Oops! You can do it ♥', 'No worries, again!', 'So close! ✿'],
            combo: ['{n} in a row! ✨', 'Wow, {n} streak! ♥'],
            win: ['You did it! 🎉'],
            lose: ['Try again, you got this! 💪']
        }
    };
    const say = (kind, n) => pick((isEN() ? SAY.en : SAY.es)[kind]).replace('{n}', n);

    let fxLayer = null, pops = null, mascot = null, bubble = null, bannerEl = null;
    let pool = [], poolCursor = 0, queue = [], raf = 0;
    let card = null, boingAnim = null;
    let moodTimer = 0, bubbleTimer = 0, introTimer = 0;
    let lastCombo = 0, lastSay = 0, okCount = 0, wasFire = false, lastKeySound = 0;

    // ---------------------------------------------------
    // Escena: fondo flotante + mascota + capa de efectos
    // ---------------------------------------------------
    function build() {
        if (fxLayer) return;
        fxLayer = document.createElement('div');
        fxLayer.className = 'kw-fx';
        fxLayer.setAttribute('aria-hidden', 'true');
        let html = '';
        const colors = ['#ff9ec7', '#c8b3ff', '#8fe6cd', '#ffd86b', '#ffb3d3'];
        for (let i = 0; i < 16; i++) {
            const size = 16 + ((Math.random() * 30) | 0);
            html += '<span class="kw-float" style="left:' + rand(2, 96).toFixed(1) + '%;font-size:' + size + 'px;color:' + pick(colors) +
                ';animation-duration:' + rand(22, 46).toFixed(1) + 's;animation-delay:' + (-rand(0, 40)).toFixed(1) + 's">' + pick(FLOATERS) + '</span>';
        }
        fxLayer.innerHTML = html;

        mascot = document.createElement('div');
        mascot.className = 'kw-mascot';
        mascot.setAttribute('aria-hidden', 'true');
        mascot.innerHTML = MASCOT_SVG + '<div class="kw-bubble"></div>';
        bubble = mascot.querySelector('.kw-bubble');

        pops = document.createElement('div');
        pops.className = 'kw-pops';
        pops.setAttribute('aria-hidden', 'true');
        pool = [];
        for (let i = 0; i < POOL_SIZE; i++) {
            const el = document.createElement('span');
            el.className = 'kw-pop';
            el._busy = false;
            pool.push(el);
            pops.appendChild(el);
        }

        bannerEl = document.createElement('div');
        bannerEl.className = 'kw-banner';
        bannerEl.setAttribute('aria-hidden', 'true');

        document.body.append(fxLayer, mascot, pops, bannerEl);
    }

    function destroy() {
        clearTimeout(moodTimer); clearTimeout(bubbleTimer); clearTimeout(introTimer);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        queue = [];
        if (boingAnim) { boingAnim.cancel(); boingAnim = null; }
        [fxLayer, mascot, pops, bannerEl].forEach(el => { if (el) el.remove(); });
        fxLayer = mascot = bubble = pops = bannerEl = null;
        pool = []; poolCursor = 0;
        const cardEl = document.querySelector('.typing-card');
        if (cardEl) cardEl.classList.remove('kw-rainbow');
        const combo = document.getElementById('combo-stat-card');
        if (combo) combo.style.removeProperty('--kw-fill');
        card = null;
    }

    // Estado de ánimo de Nubi: 'happy' (por defecto), 'sad', 'wow'
    function mood(name, ms) {
        if (!mascot) return;
        mascot.classList.toggle('is-sad', name === 'sad');
        mascot.classList.toggle('is-wow', name === 'wow');
        clearTimeout(moodTimer);
        if (name !== 'happy') moodTimer = setTimeout(() => mood('happy'), ms || 900);
    }

    function speak(text, ms) {
        if (!bubble) return;
        bubble.textContent = text;
        bubble.classList.add('is-on');
        clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(() => { if (bubble) bubble.classList.remove('is-on'); }, ms || 2200);
    }

    // Rebote de Nubi (solo transform)
    function hop(strong) {
        if (!mascot || !mascot.animate || T.reducedMotion) return;
        const h = strong ? -26 : -12;
        mascot.animate([
            { transform: 'translateY(0) scale(1.05, 0.92)' },
            { transform: 'translateY(' + h + 'px) scale(0.96, 1.06)', offset: 0.45 },
            { transform: 'translateY(0) scale(1.06, 0.94)', offset: 0.8 },
            { transform: 'translateY(0) scale(1, 1)' }
        ], { duration: strong ? 520 : 340, easing: 'ease-out' });
    }

    function wobble() {
        if (!mascot || !mascot.animate || T.reducedMotion) return;
        mascot.animate([
            { transform: 'rotate(0)' }, { transform: 'rotate(-8deg)' }, { transform: 'rotate(7deg)' },
            { transform: 'rotate(-4deg)' }, { transform: 'rotate(0)' }
        ], { duration: 380, easing: 'ease-in-out' });
    }

    // ---------------------------------------------------
    // Corazones / estrellas al acertar
    // ---------------------------------------------------
    function takePop() {
        for (let i = 0; i < POOL_SIZE; i++) {
            const el = pool[(poolCursor + i) % POOL_SIZE];
            if (!el._busy) {
                poolCursor = (poolCursor + i + 1) % POOL_SIZE;
                el._busy = true;
                return el;
            }
        }
        return null;
    }

    function queuePop(el) {
        if (queue.length >= MAX_QUEUE) queue.shift();
        queue.push(el);
        if (!raf) raf = requestAnimationFrame(flush);
    }

    function flush() {
        raf = 0;
        const items = queue;
        queue = [];
        if (!pops) return;
        const rects = items.map(el => (el.isConnected ? el.getBoundingClientRect() : null)); // todas las lecturas juntas
        for (let i = 0; i < items.length; i++) {
            const r = rects[i];
            if (!r || r.width === 0) continue;
            const pop = takePop();
            if (!pop) break;
            pop.textContent = pick(POP_SHAPES);
            pop.style.color = pick(POP_COLORS);
            const x = r.left + r.width / 2;
            const y = r.top;
            const dx = rand(-16, 16);
            const rot = rand(-40, 40);
            const a = pop.animate([
                { transform: 'translate(' + x + 'px,' + y + 'px) translate(-50%,0) scale(.3) rotate(0deg)', opacity: 0 },
                { transform: 'translate(' + (x + dx * 0.4) + 'px,' + (y - 14) + 'px) translate(-50%,0) scale(1.15) rotate(' + (rot * 0.5) + 'deg)', opacity: 1, offset: 0.3 },
                { transform: 'translate(' + (x + dx) + 'px,' + (y - 38) + 'px) translate(-50%,0) scale(.8) rotate(' + rot + 'deg)', opacity: 0 }
            ], { duration: 650, easing: 'ease-out' });
            const free = () => { pop._busy = false; };
            a.onfinish = free;
            a.oncancel = free;
        }
    }

    // "Boing" de la caja de texto al fallar (elástico, solo transform)
    function boing() {
        if (!card) card = document.querySelector('.typing-card');
        if (!card || !card.animate) return;
        if (boingAnim) boingAnim.cancel();
        boingAnim = card.animate([
            { transform: 'scale(1,1)' },
            { transform: 'scale(1.015,0.975)', offset: 0.2 },
            { transform: 'scale(0.99,1.02)', offset: 0.45 },
            { transform: 'scale(1.006,0.994)', offset: 0.7 },
            { transform: 'scale(1,1)' }
        ], { duration: 360, easing: 'ease-out' });
    }

    // Confeti de colores al terminar
    function confetti() {
        if (T.reducedMotion || !document.body.animate) return;
        const colors = ['#ff6fa8', '#ffd86b', '#5fd3b3', '#b79bff', '#ff8fbd', '#8fd5ff'];
        const w = window.innerWidth, h = window.innerHeight;
        for (let i = 0; i < 34; i++) {
            const el = document.createElement('div');
            el.className = 'kw-confetti';
            el.style.background = pick(colors);
            if (Math.random() < 0.4) el.style.borderRadius = '50%';
            document.body.appendChild(el);
            const x0 = w / 2 + rand(-60, 60);
            const y0 = h * 0.38;
            const x1 = x0 + rand(-w * 0.45, w * 0.45);
            const y1 = h * 0.38 + rand(h * 0.2, h * 0.65);
            const a = el.animate([
                { transform: 'translate(' + x0 + 'px,' + y0 + 'px) rotate(0deg) scale(1)', opacity: 1 },
                { transform: 'translate(' + ((x0 + x1) / 2) + 'px,' + (y0 - rand(60, 160)) + 'px) rotate(' + rand(120, 360) + 'deg) scale(1)', opacity: 1, offset: 0.35 },
                { transform: 'translate(' + x1 + 'px,' + y1 + 'px) rotate(' + rand(360, 900) + 'deg) scale(.8)', opacity: 0 }
            ], { duration: rand(1100, 1900), easing: 'cubic-bezier(.2,.7,.4,1)' });
            a.onfinish = a.oncancel = () => el.remove();
        }
    }

    function showBanner(text, cls) {
        if (!bannerEl) return;
        bannerEl.textContent = text;
        bannerEl.className = 'kw-banner ' + cls;
        if (!bannerEl.animate) return;
        const frames = T.reducedMotion
            ? [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
            : [
                { opacity: 0, transform: 'translate(-50%,-50%) scale(.3)' },
                { opacity: 1, transform: 'translate(-50%,-50%) scale(1.12)', offset: 0.15 },
                { opacity: 1, transform: 'translate(-50%,-50%) scale(.97)', offset: 0.25 },
                { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.35 },
                { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.85 },
                { opacity: 0, transform: 'translate(-50%,-50%) scale(.9)' }
            ];
        bannerEl.animate(frames, { duration: 2200, easing: 'ease-out' });
    }

    // ---------------------------------------------------
    // Sonido: marimba suave (pentatónica) + golpecito de tecla blando
    // ---------------------------------------------------
    const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66]; // do re mi sol la do' re'

    function sound(fn) {
        if (!A.ready()) return;
        try { fn(A.ctx.currentTime + 0.002); } catch (e) { /* un fallo de audio nunca debe afectar al juego */ }
    }

    // Una nota de marimba: sinusoide con un armónico corto y caída rápida.
    function marimba(t0, f, gain, dur) {
        const d = dur || 0.26;
        A.tone(t0, { f0: f, dur: d, gain: gain, type: 'sine' });
        A.tone(t0, { f0: f * 4, dur: d * 0.25, gain: gain * 0.28, type: 'sine' });
    }

    function softKey(t0, big) {
        A.noiseHit(t0, { type: 'lowpass', freq: big ? 500 : 900, q: 0.7, dur: 0.025, gain: 0.07 });
    }

    function boingSound(t0) {
        A.tone(t0, { f0: 420, f1: 170, dur: 0.2, gain: 0.16, type: 'sine' });
        A.tone(t0 + 0.07, { f0: 300, f1: 150, dur: 0.2, gain: 0.08, type: 'triangle' });
    }

    // ---------------------------------------------------
    // Eventos del juego
    // ---------------------------------------------------
    function onKey(e) {
        const now = performance.now();
        if (e.ok) {
            okCount++;
            if (now - lastKeySound > 20) {
                lastKeySound = now;
                const idx = e.char === ' ' ? 0 : (okCount * 3) % 5 + (wasFire ? 1 : 0);
                sound(t0 => { softKey(t0, e.char === ' '); marimba(t0, SCALE[idx], 0.085, 0.22); });
            }
            if (!T.reducedMotion && e.el && e.char !== ' ' && Math.random() < 0.5) queuePop(e.el);
            if (okCount % 18 === 0 && now - lastSay > 2500) { lastSay = now; mood('happy'); speak(say('ok')); hop(false); }
        } else {
            if (now - lastKeySound > 20) { lastKeySound = now; sound(boingSound); }
            mood('sad', 1000);
            wobble();
            boing();
            if (now - lastSay > 3500) { lastSay = now; speak(say('err')); }
        }
    }

    function onCombo(count, onFire) {
        if (count > lastCombo && count > 0 && count % 10 === 0) {
            sound(t0 => { [0, 2, 4, 5].forEach((n, i) => marimba(t0 + i * 0.06, SCALE[n], 0.07, 0.3)); });
            mood('wow', 900);
            hop(true);
            speak(say('combo', count));
            lastSay = performance.now();
        }
        lastCombo = count;

        const combo = document.getElementById('combo-stat-card');
        if (combo) combo.style.setProperty('--kw-fill', Math.min(count / 30, 1).toFixed(3));

        const fire = !!onFire;
        if (fire !== wasFire) {
            wasFire = fire;
            if (!card) card = document.querySelector('.typing-card');
            if (card) card.classList.toggle('kw-rainbow', fire);
        }
    }

    function onEnd(kind) {
        if (kind === 'gameover') {
            mood('sad', 3000);
            speak(say('lose'), 3000);
            showBanner(isEN() ? 'Oh no…' : '¡Ay, no!', 'is-bad');
            sound(t0 => { marimba(t0, 392, 0.1, 0.4); marimba(t0 + 0.2, 329.63, 0.1, 0.4); marimba(t0 + 0.4, 261.63, 0.1, 0.6); });
        } else {
            mood('wow', 3000);
            hop(true);
            speak(say('win'), 3000);
            showBanner(isEN() ? 'You did it! ✨' : '¡Lo lograste! ✨', 'is-good');
            confetti();
            sound(t0 => { [0, 2, 3, 5, 6].forEach((n, i) => marimba(t0 + i * 0.1, SCALE[n], 0.09, 0.4)); });
        }
    }

    function onActivate() {
        lastCombo = 0; okCount = 0; wasFire = false; card = null;
        build();
        introTimer = setTimeout(() => speak(say('hello'), 2600), 450);
    }

    T.register('kawaii', {
        bodyClass: 'theme-kawaii',
        fontHref: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap',
        on: {
            activate: onActivate,
            deactivate: destroy,
            key: onKey,
            combo: onCombo,
            end: onEnd
        }
    });
})();
