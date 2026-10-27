/* ===================================================
   ISpeedType — Tema inmersivo: GRECIA CLÁSICA (Olimpo de Mármol)
   Depende de themes/immersive.js (motor) y themes/greek.css (estilos).

   Aquí vive lo que el CSS no puede hacer solo:
     - las columnas jónicas, el friso con lema en griego y el estilóbato,
     - los dioses del Olimpo: según tu racha, un medallón de oro cambia
       (Hermes → Atenea → Apolo → Poseidón → Zeus) y un pergamino habla,
     - destellos dorados al acertar, grieta en el mármol al fallar,
     - rayo de Zeus en los grandes hitos, Nike al ganar, el Hades al perder,
     - el sonido (cítara/arpa sintetizada con Web Audio: sin archivos de audio).

   Optimización:
     - Los destellos usan un grupo pequeño de elementos reutilizables (pool).
     - Todo se anima con transform / opacity (Web Animations API).
     - La posición de la letra se lee dentro de requestAnimationFrame.
     - Con "reducir movimiento" no hay destellos, grietas ni rayos (el sonido sí).
   =================================================== */
(function () {
    'use strict';

    const T = window.ImmersiveThemes;
    if (!T) return;

    const A = T.audio;
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = (arr) => arr[(Math.random() * arr.length) | 0];
    const isEN = () => (document.documentElement.lang || '').toLowerCase().indexOf('en') === 0;

    const POOL_SIZE = 12;
    const MAX_QUEUE = 3;
    const POP_SHAPES = ['✦', '❖', '✧', '⚜', '✦'];
    const POP_COLORS = ['#d4a843', '#e8cf8a', '#b8892b', '#f1d98a'];

    // ---------------------------------------------------
    // Dioses (se desbloquean con la racha)
    // ---------------------------------------------------
    // Iconos de línea sencillos, dibujados en un viewBox 48x48.
    const ICONS = {
        hermes: '<path d="M24 38V12M24 12c-4-4-8-4-12-2 4 0 6 2 8 4M24 12c4-4 8-4 12-2-4 0-6 2-8 4M18 22c-4-1-7 0-9 2 3 0 5 1 7 3M30 22c4-1 7 0 9 2-3 0-5 1-7 3"/><circle cx="24" cy="9" r="2.5" class="f"/>',
        athena: '<path d="M10 32c0-12 6-20 15-20 8 0 13 6 13 14v6H10z"/><path d="M24 12V6M20 8h8M14 30h24"/><circle cx="26" cy="24" r="2.2" class="f"/>',
        apollo: '<circle cx="24" cy="24" r="7" class="f"/><path d="M24 6v6M24 36v6M6 24h6M36 24h6M11 11l4 4M33 33l4 4M37 11l-4 4M15 33l-4 4"/>',
        poseidon: '<path d="M24 42V12M12 12v10c0 5 5 8 12 8s12-3 12-8V12M12 12l-3-5M36 12l3-5M24 12V5"/><path d="M20 38h8"/>',
        zeus: '<path d="M28 4L12 26h10L18 44 36 20H25z" class="f"/>',
        hades: '<path d="M24 42V10M14 12v8c0 4 4 6 10 6s10-2 10-6v-8M14 12l-3-6M34 12l3-6"/><path d="M16 40c3-4 13-4 16 0"/>',
        nike: '<path d="M24 40V10"/><path d="M24 36c-8 0-13-6-13-14 6 0 12 4 13 14zM24 36c8 0 13-6 13-14-6 0-12 4-13 14zM24 24c-5-2-7-7-6-12 5 1 7 6 6 12zM24 24c5-2 7-7 6-12-5 1-7 6-6 12z"/>'
    };

    const GODS = [
        { at: 10, id: 'hermes', es: 'Hermes', en: 'Hermes' },
        { at: 20, id: 'athena', es: 'Atenea', en: 'Athena' },
        { at: 30, id: 'apollo', es: 'Apolo', en: 'Apollo' },
        { at: 50, id: 'poseidon', es: 'Poseidón', en: 'Poseidon' },
        { at: 80, id: 'zeus', es: 'Zeus', en: 'Zeus' }
    ];

    // Lo que dice cada dios al entrar (pergamino).
    const VOICE = {
        es: {
            hermes: 'Hermes te presta sus sandalias aladas.',
            athena: 'Atenea guía tus dedos con sabiduría.',
            apollo: 'Apolo ilumina tu ritmo con la lira.',
            poseidon: 'Poseidón agita las olas a tu favor.',
            zeus: 'Zeus lanza su rayo: ¡eres imparable!',
            err: ['Hasta los dioses tropiezan.', 'El mármol se agrieta…', 'Respira, mortal.'],
            win: 'Nike corona tu victoria con laurel.',
            lose: 'El Hades te reclama… por ahora.',
            hello: 'Escribe, mortal. El Olimpo observa.'
        },
        en: {
            hermes: 'Hermes lends you his winged sandals.',
            athena: 'Athena guides your fingers with wisdom.',
            apollo: 'Apollo lights your rhythm with the lyre.',
            poseidon: 'Poseidon stirs the waves in your favour.',
            zeus: 'Zeus hurls his thunderbolt: unstoppable!',
            err: ['Even the gods stumble.', 'The marble cracks…', 'Breathe, mortal.'],
            win: 'Nike crowns your victory with laurel.',
            lose: 'Hades claims you… for now.',
            hello: 'Type, mortal. Olympus is watching.'
        }
    };
    const voice = () => (isEN() ? VOICE.en : VOICE.es);

    // Columna jónica: capitel con volutas, fuste (CSS) y basa.
    const CAP_SVG =
        '<svg class="gr-cap" viewBox="0 0 120 52" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="4" y="2" width="112" height="9" fill="#f4eedd" stroke="#8a6516" stroke-width="2"/>' +
        '<rect x="10" y="11" width="100" height="6" fill="#e6dcc0" stroke="#8a6516" stroke-width="1.5"/>' +
        '<g fill="#f4eedd" stroke="#8a6516" stroke-width="2">' +
        '<circle cx="22" cy="30" r="12"/><circle cx="98" cy="30" r="12"/>' +
        '<path d="M22 18h76v24H22z" stroke="none"/>' +
        '<path d="M22 18h76M22 42h76"/></g>' +
        '<g fill="none" stroke="#8a6516" stroke-width="2" stroke-linecap="round">' +
        '<path d="M22 30m-7 0a7 7 0 1 1 7 7M22 30m-3 0a3 3 0 1 1 3 3"/>' +
        '<path d="M98 30m7 0a7 7 0 1 0-7 7M98 30m3 0a3 3 0 1 0-3 3"/></g>' +
        '<path d="M30 42h60l-4 8H34z" fill="#e6dcc0" stroke="#8a6516" stroke-width="1.5"/>' +
        '</svg>';
    const BASE_SVG =
        '<svg class="gr-base" viewBox="0 0 120 40" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M22 0h76l6 10H16z" fill="#e6dcc0" stroke="#8a6516" stroke-width="1.5"/>' +
        '<rect x="10" y="10" width="100" height="10" rx="5" fill="#f4eedd" stroke="#8a6516" stroke-width="1.5"/>' +
        '<rect x="4" y="20" width="112" height="10" fill="#e6dcc0" stroke="#8a6516" stroke-width="1.5"/>' +
        '<rect x="0" y="30" width="120" height="10" fill="#f4eedd" stroke="#8a6516" stroke-width="1.5"/>' +
        '</svg>';

    let fx = null, medal = null, medalCoin = null, medalName = null, scroll = null, scrollTimer = 0;
    let pops = null, crack = null, bolt = null, flash = null, bannerEl = null;
    let pool = [], poolCursor = 0, queue = [], raf = 0;
    let card = null, introTimer = 0, crackAnim = null;
    let okCount = 0, lastCombo = 0, lastKeySound = 0, lastSay = 0, godIdx = -1, wasFire = false;

    function el(tag, cls, html) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (html != null) n.innerHTML = html;
        return n;
    }

    function build() {
        destroy();
        fx = el('div', 'gr-fx');
        fx.setAttribute('aria-hidden', 'true');
        fx.innerHTML =
            '<div class="gr-frieze"><span>ΓΝΩΘΙ ΣΕΑΥΤΟΝ</span><span>·</span><span>ΜΗΔΕΝ ΑΓΑΝ</span></div>' +
            '<div class="gr-col gr-col-l">' + CAP_SVG + '<div class="gr-shaft"></div>' + BASE_SVG + '</div>' +
            '<div class="gr-col gr-col-r">' + CAP_SVG + '<div class="gr-shaft"></div>' + BASE_SVG + '</div>' +
            '<div class="gr-steps"></div>';
        document.body.appendChild(fx);

        medal = el('div', 'gr-medal', '<div class="gr-medal-coin"></div><div class="gr-medal-name"></div>');
        medalCoin = medal.firstChild;
        medalName = medal.lastChild;
        medal.setAttribute('aria-hidden', 'true');
        document.body.appendChild(medal);

        scroll = el('div', 'gr-scroll');
        scroll.setAttribute('aria-hidden', 'true');
        document.body.appendChild(scroll);

        pops = el('div', 'gr-pops');
        pool = [];
        for (let i = 0; i < POOL_SIZE; i++) {
            const p = el('span', 'gr-pop');
            pops.appendChild(p);
            pool.push(p);
        }
        document.body.appendChild(pops);

        crack = el('div', 'gr-crack',
            '<svg viewBox="-60 -60 120 120" width="120" height="120"><path d="M0 0L-18 -12L-30 -34M0 0L16 -8L34 -14M0 0L-6 20L-22 36M0 0L12 18L8 40M-18 -12L-34 -8M16 -8L20 -26" stroke-width="2.4"/>' +
            '<path d="M0 0L-18 -12L-30 -34M0 0L16 -8L34 -14M0 0L-6 20L-22 36M0 0L12 18L8 40" stroke="#fff" stroke-width="0.8" opacity=".55"/></svg>');
        document.body.appendChild(crack);

        bolt = el('div', 'gr-bolt', '<svg viewBox="0 0 160 600" width="160" height="100%" preserveAspectRatio="none"><polyline points="90,0 60,150 100,160 50,330 95,340 40,600"/></svg>');
        document.body.appendChild(bolt);
        flash = el('div', 'gr-flash');
        document.body.appendChild(flash);
        bannerEl = el('div', 'gr-banner');
        document.body.appendChild(bannerEl);
        pool.forEach(p => { p._busy = false; });
    }

    function destroy() {
        clearTimeout(introTimer);
        clearTimeout(scrollTimer);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        queue = [];
        if (crackAnim) { crackAnim.cancel(); crackAnim = null; }
        [fx, medal, scroll, pops, crack, bolt, flash, bannerEl].forEach(n => { if (n) n.remove(); });
        fx = medal = medalCoin = medalName = scroll = pops = crack = bolt = flash = bannerEl = null;
        pool = []; poolCursor = 0;
        const c = document.querySelector('.typing-card');
        if (c) c.classList.remove('gr-blessed');
        const combo = document.getElementById('combo-stat-card');
        if (combo) combo.style.removeProperty('--gr-fill');
        card = null; godIdx = -1;
    }

    function say(html, ms) {
        if (!scroll) return;
        scroll.innerHTML = html;
        scroll.classList.add('is-on');
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => { if (scroll) scroll.classList.remove('is-on'); }, ms || 2600);
    }

    function setGod(i) {
        if (!medal) return;
        godIdx = i;
        if (i < 0) { medal.classList.remove('is-on'); return; }
        const g = GODS[i];
        medalCoin.innerHTML = '<svg viewBox="0 0 48 48">' + ICONS[g.id] + '</svg>';
        medalName.textContent = isEN() ? g.en : g.es;
        medal.classList.add('is-on');
    }

    // ---------------------------------------------------
    // Destellos dorados al acertar
    // ---------------------------------------------------
    function takePop() {
        for (let i = 0; i < POOL_SIZE; i++) {
            const p = pool[(poolCursor + i) % POOL_SIZE];
            if (!p._busy) { poolCursor = (poolCursor + i + 1) % POOL_SIZE; p._busy = true; return p; }
        }
        return null;
    }

    function queueRead(elm, kind) {
        if (queue.length >= MAX_QUEUE) queue.shift();
        queue.push({ elm, kind });
        if (!raf) raf = requestAnimationFrame(flush);
    }

    function flush() {
        raf = 0;
        const items = queue;
        queue = [];
        if (!pops) return;
        const rects = items.map(it => (it.elm.isConnected ? it.elm.getBoundingClientRect() : null));
        for (let i = 0; i < items.length; i++) {
            const r = rects[i];
            if (!r || r.width === 0) continue;
            const x = r.left + r.width / 2, y = r.top + r.height / 2;
            if (items[i].kind === 'crack') { doCrack(x, y); continue; }
            const p = takePop();
            if (!p) break;
            p.textContent = pick(POP_SHAPES);
            p.style.color = pick(POP_COLORS);
            const dx = rand(-14, 14), rot = rand(-50, 50);
            const a = p.animate([
                { transform: 'translate(' + x + 'px,' + (y - 6) + 'px) translate(-50%,-50%) scale(.3) rotate(0deg)', opacity: 0 },
                { transform: 'translate(' + (x + dx * 0.4) + 'px,' + (y - 20) + 'px) translate(-50%,-50%) scale(1.2) rotate(' + (rot * 0.5) + 'deg)', opacity: 1, offset: 0.3 },
                { transform: 'translate(' + (x + dx) + 'px,' + (y - 42) + 'px) translate(-50%,-50%) scale(.7) rotate(' + rot + 'deg)', opacity: 0 }
            ], { duration: 620, easing: 'ease-out' });
            const free = () => { p._busy = false; };
            a.onfinish = free; a.oncancel = free;
        }
    }

    // Grieta en el mármol bajo la letra fallada
    function doCrack(x, y) {
        if (!crack || !crack.animate) return;
        if (crackAnim) crackAnim.cancel();
        const rot = rand(0, 360);
        crackAnim = crack.animate([
            { transform: 'translate(' + x + 'px,' + y + 'px) rotate(' + rot + 'deg) scale(.4)', opacity: 0.95 },
            { transform: 'translate(' + x + 'px,' + y + 'px) rotate(' + rot + 'deg) scale(1)', opacity: 0.95, offset: 0.2 },
            { transform: 'translate(' + x + 'px,' + y + 'px) rotate(' + rot + 'deg) scale(1)', opacity: 0.7, offset: 0.7 },
            { transform: 'translate(' + x + 'px,' + y + 'px) rotate(' + rot + 'deg) scale(1)', opacity: 0 }
        ], { duration: 650, easing: 'ease-out' });
    }

    // Sacudida seca de la tarjeta (piedra que tiembla)
    function shake() {
        if (!card) card = document.querySelector('.typing-card');
        if (!card || !card.animate || T.reducedMotion) return;
        card.animate([
            { transform: 'translate(0,0)' }, { transform: 'translate(-3px,1px)' }, { transform: 'translate(3px,-1px)' },
            { transform: 'translate(-2px,0)' }, { transform: 'translate(0,0)' }
        ], { duration: 220, easing: 'ease-out' });
    }

    // Rayo de Zeus
    function lightning() {
        if (T.reducedMotion || !bolt || !bolt.animate) return;
        const x = rand(window.innerWidth * 0.2, window.innerWidth * 0.8);
        bolt.style.left = x + 'px';
        bolt.animate([{ opacity: 1 }, { opacity: 0.2, offset: 0.2 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 420 });
        flash.animate([{ opacity: 0.85 }, { opacity: 0.15, offset: 0.25 }, { opacity: 0.6, offset: 0.4 }, { opacity: 0 }], { duration: 520, easing: 'ease-out' });
    }

    function showBanner(html, cls) {
        if (!bannerEl) return;
        bannerEl.innerHTML = html;
        bannerEl.className = 'gr-banner ' + cls;
        if (!bannerEl.animate) return;
        const frames = T.reducedMotion
            ? [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
            : [
                { opacity: 0, transform: 'translate(-50%,-50%) scale(1.5)' },
                { opacity: 1, transform: 'translate(-50%,-50%) scale(.96)', offset: 0.15 },
                { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.25 },
                { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.85 },
                { opacity: 0, transform: 'translate(-50%,-50%) scale(1)' }
            ];
        bannerEl.animate(frames, { duration: 2400, easing: 'ease-out' });
    }

    // ---------------------------------------------------
    // Sonido: cítara / arpa en modo dórico + golpes de piedra
    // ---------------------------------------------------
    // Escala dórica sobre re: re mi fa sol la si do re'
    const SCALE = [293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25, 587.33, 659.25];

    function sound(fn) {
        if (!A.ready()) return;
        try { fn(A.ctx.currentTime + 0.002); } catch (e) { /* el audio nunca debe romper el juego */ }
    }

    // Cuerda pulsada: triángulo + armónico agudo, caída rápida.
    function pluck(t0, f, gain, dur) {
        const d = dur || 0.4;
        A.tone(t0, { f0: f, dur: d, gain: gain, type: 'triangle' });
        A.tone(t0, { f0: f * 2, dur: d * 0.5, gain: gain * 0.35, type: 'sine' });
    }

    function stoneTap(t0) {
        A.noiseHit(t0, { type: 'bandpass', freq: 1400, q: 1.2, dur: 0.03, gain: 0.07 });
    }

    function crackSound(t0) {
        A.noiseHit(t0, { type: 'highpass', freq: 1800, q: 0.8, dur: 0.06, gain: 0.16 });
        A.tone(t0, { f0: 140, f1: 60, dur: 0.16, gain: 0.14, type: 'square' });
    }

    function thunder(t0) {
        A.noiseHit(t0, { type: 'lowpass', freq: 380, q: 0.7, attack: 0.02, dur: 1.1, gain: 0.3 });
        A.tone(t0, { f0: 70, f1: 38, dur: 0.9, gain: 0.2, type: 'sine' });
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
                const idx = e.char === ' ' ? 0 : (okCount * 2) % 7 + (wasFire ? 1 : 0);
                sound(t0 => { stoneTap(t0); pluck(t0, SCALE[idx], 0.07, 0.3); });
            }
            if (!T.reducedMotion && e.el && e.char !== ' ' && Math.random() < 0.45) queueRead(e.el, 'pop');
        } else {
            if (now - lastKeySound > 20) { lastKeySound = now; sound(crackSound); }
            shake();
            if (!T.reducedMotion && e.el) queueRead(e.el, 'crack');
            if (now - lastSay > 4000) {
                lastSay = now;
                say('<small>' + (isEN() ? 'THE ORACLE' : 'EL ORÁCULO') + '</small>' + pick(voice().err), 2200);
            }
        }
    }

    function onCombo(count, onFire) {
        if (count > lastCombo) {
            // ¿Subimos de dios?
            let g = -1;
            for (let i = 0; i < GODS.length; i++) if (count >= GODS[i].at) g = i;
            if (g > godIdx) {
                setGod(g);
                const id = GODS[g].id;
                say('<small>' + (isEN() ? GODS[g].en : GODS[g].es).toUpperCase() + '</small>' + voice()[id], 3000);
                lastSay = performance.now();
                sound(t0 => { [0, 2, 4, 6].forEach((n, i) => pluck(t0 + i * 0.07, SCALE[n], 0.08, 0.5)); });
                if (id === 'zeus' || id === 'poseidon') { lightning(); sound(thunder); }
            } else if (count > 0 && count % 25 === 0) {
                lightning();
                sound(thunder);
            }
        } else if (count < lastCombo && count === 0) {
            setGod(-1);
        }
        lastCombo = count;

        const combo = document.getElementById('combo-stat-card');
        if (combo) combo.style.setProperty('--gr-fill', Math.min(count / 50, 1).toFixed(3));

        const fire = !!onFire;
        if (fire !== wasFire) {
            wasFire = fire;
            if (!card) card = document.querySelector('.typing-card');
            if (card) card.classList.toggle('gr-blessed', fire);
        }
    }

    function onEnd(kind) {
        setGod(-1);
        if (kind === 'gameover') {
            say('<small>ΑΙΔΗΣ</small>' + voice().lose, 3200);
            showBanner(isEN() ? 'HADES CLAIMS YOU' : 'EL HADES TE RECLAMA', 'is-bad');
            sound(t0 => { [4, 2, 1, 0].forEach((n, i) => pluck(t0 + i * 0.22, SCALE[n], 0.1, 0.7)); thunder(t0 + 0.1); });
        } else {
            say('<small>ΝΙΚΗ</small>' + voice().win, 3200);
            showBanner(isEN() ? 'GLORY!' : '¡GLORIA!', 'is-good');
            lightning();
            sound(t0 => { [0, 2, 3, 4, 6, 7].forEach((n, i) => pluck(t0 + i * 0.1, SCALE[n], 0.09, 0.6)); });
        }
    }

    function onActivate() {
        lastCombo = 0; okCount = 0; wasFire = false; card = null; godIdx = -1;
        build();
        introTimer = setTimeout(() => say('<small>ΖΕΥΣ</small>' + voice().hello, 2800), 450);
    }

    T.register('greek', {
        bodyClass: 'theme-greek',
        fontHref: 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap',
        on: {
            activate: onActivate,
            deactivate: destroy,
            key: onKey,
            combo: onCombo,
            end: onEnd
        }
    });
})();
