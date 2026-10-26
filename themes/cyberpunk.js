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
    // Keyframes que saltan de golpe (efecto glitch): el easing va ENTRE keyframes, no en toda la animación.
    const stepped = (frames) => frames.map((f, i) => (i < frames.length - 1 ? Object.assign({ easing: 'steps(1, end)' }, f) : f));
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
        syncReadWindow();
    }

    function onMutations(list) {
        for (let i = 0; i < list.length; i++) {
            const added = list[i].addedNodes;
            for (let j = 0; j < added.length; j++) if (added[j].nodeType === 1) newNodes.push(added[j]);
        }
        if (newNodes.length && !pendingScan) pendingScan = requestAnimationFrame(scanNew);
    }

    // Zona legible: las próximas READ_AHEAD letras se muestran en claro para saber qué escribir;
    // más allá siguen cifradas. Se recalcula tras cada tecla (también con Retroceso).
    const READ_AHEAD = 40;
    let walker = null;
    let syncRaf = 0;

    function reveal(span) {
        const node = span.firstChild;
        if (span._real !== undefined && node && node.data === span._enc) node.data = span._real;
        if (!span.classList.contains('cp-read')) span.classList.add('cp-read');
    }

    function hide(span) {
        if (span.classList.contains('cp-read')) span.classList.remove('cp-read');
        if (span._real !== undefined) encrypt(span); // vuelve a cifrar (si la app había reescrito la real)
    }

    function syncReadWindow() {
        syncRaf = 0;
        if (!display) return;
        const cur = display.querySelector('.char-current');
        if (!cur) return;
        if (!walker) {
            walker = document.createTreeWalker(display, NodeFilter.SHOW_ELEMENT, {
                acceptNode: n => (n.classList.contains('char') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP)
            });
        }
        walker.currentNode = cur;
        for (let i = 0; i < READ_AHEAD + 6; i++) {
            const n = walker.nextNode();
            if (!n) break;
            if (!n.classList.contains('char-pending')) continue;
            if (i < READ_AHEAD) reveal(n); else hide(n);
        }
    }

    function scheduleSync() {
        if (!syncRaf) syncRaf = requestAnimationFrame(syncReadWindow);
    }

    function onKeydown(e) {
        if (e.key === 'Backspace') scheduleSync();
    }

    function decryptAll() {
        if (!display) return;
        const spans = display.querySelectorAll('.char');
        for (let i = 0; i < spans.length; i++) {
            const s = spans[i];
            if (s._real !== undefined && s.firstChild && s.firstChild.data === s._enc) s.firstChild.data = s._real;
            s._real = s._enc = undefined;
            s.classList.remove('cp-read');
        }
    }

    // ---------------------------------------------------
    // Efectos visuales
    // ---------------------------------------------------
    // Destello al acertar: la letra "se desencripta" con un parpadeo corto.
    function flashChar(el, ch) {
        if (!el || !el.animate) return;
        el.animate(stepped([
            { opacity: 0.2, color: '#ffffff' },
            { opacity: 1, color: '#00f0ff', offset: 0.3 },
            { opacity: 0.4, color: '#00f0ff', offset: 0.55 },
            { opacity: 1, color: '#39ff88' }
        ]), { duration: 240 });

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
        glitchAnim = display.animate(stepped([
            { transform: 'none', filter: 'none' },
            { transform: 'skewX(-10deg) translateX(-7px)', filter: split(3), offset: 0.14 },
            { transform: 'skewX(7deg) translateX(6px)', filter: split(-3), offset: 0.3 },
            { transform: 'skewX(-4deg) translateX(2px)', filter: split(2), offset: 0.5 },
            { transform: 'skewX(3deg) translateX(-3px)', filter: split(-2), offset: 0.7 },
            { transform: 'none', filter: 'none' }
        ]), { duration: 320 });
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
    // Ambiente (ciudad, rejilla, lluvia de datos) y HUD de terminal
    // Todo vive en dos capas fijas; solo se animan transform/opacity.
    // ---------------------------------------------------
    const NODE_NAMES = { setup: 'LOBBY', typing: 'ACTIVE_RUN', results: 'DEBRIEF', tutor: 'TRAINING' };
    const hex = () => '0x' + ((Math.random() * 0xffff) | 0).toString(16).toUpperCase().padStart(4, '0');

    let fx = null, hud = null, alertEl = null, bannerEl = null;
    let logEl = null, clockEl = null, nodeEl = null, statusEl = null, meters = [];
    let hudTimer = 0, bootTimers = [];
    let okCount = 0, lastLog = 0, wasFire = false, statusTimer = 0;

    function buildRain() {
        const cols = 14;
        let html = '';
        for (let i = 0; i < cols; i++) {
            let txt = '';
            const n = 22 + ((Math.random() * 10) | 0);
            for (let j = 0; j < n; j++) txt += '0123456789ABCDEF'[(Math.random() * 16) | 0] + '\n';
            const left = ((i + Math.random() * 0.8) / cols * 100).toFixed(1);
            const dur = (11 + Math.random() * 14).toFixed(1);
            const delay = (-Math.random() * 20).toFixed(1);
            html += '<div class="cp-rain-col" style="left:' + left + '%;animation-duration:' + dur + 's;animation-delay:' + delay + 's">' + txt + '</div>';
        }
        return html;
    }

    function ensureFx() {
        if (fx) return;
        fx = document.createElement('div');
        fx.className = 'cp-fx';
        fx.setAttribute('aria-hidden', 'true');
        fx.innerHTML =
            '<div class="cp-sun"></div>' +
            '<div class="cp-city"></div>' +
            '<div class="cp-floor"><div class="cp-grid"></div></div>' +
            '<div class="cp-rain">' + buildRain() + '</div>';

        hud = document.createElement('div');
        hud.className = 'cp-hud';
        hud.setAttribute('aria-hidden', 'true');
        hud.innerHTML =
            '<i class="cp-br cp-br-tl"></i><i class="cp-br cp-br-tr"></i><i class="cp-br cp-br-bl"></i><i class="cp-br cp-br-br"></i>' +
            '<div class="cp-hud-box cp-hud-tl"><b>TERMINAL_2077</b><span>NEURAL.LINK // v4.2.1</span><span class="cp-node">NODE: LOBBY</span></div>' +
            '<div class="cp-hud-box cp-hud-tr"><b class="cp-clock">00:00:00</b><span>UPLINK <em>▮▮▮▮▯</em></span><span>35.6762N 139.6503E</span></div>' +
            '<div class="cp-hud-box cp-hud-bl"><div class="cp-log"></div></div>' +
            '<div class="cp-hud-box cp-hud-br">' +
            '<span class="cp-status">STATUS: NOMINAL</span>' +
            '<div class="cp-meter"><u>CPU</u><s><q></q></s></div>' +
            '<div class="cp-meter"><u>ICE</u><s><q></q></s></div>' +
            '<div class="cp-meter"><u>SYNC</u><s><q></q></s></div>' +
            '</div>';

        alertEl = document.createElement('div');
        alertEl.className = 'cp-alert';
        alertEl.setAttribute('aria-hidden', 'true');
        bannerEl = document.createElement('div');
        bannerEl.className = 'cp-banner';
        bannerEl.setAttribute('aria-hidden', 'true');

        document.body.append(fx, hud, alertEl, bannerEl);
        logEl = hud.querySelector('.cp-log');
        clockEl = hud.querySelector('.cp-clock');
        nodeEl = hud.querySelector('.cp-node');
        statusEl = hud.querySelector('.cp-status');
        meters = [].slice.call(hud.querySelectorAll('.cp-meter q'));

        hudTick();
        hudTimer = setInterval(hudTick, 1000);
    }

    function hudTick() {
        if (!clockEl) return;
        const d = new Date();
        clockEl.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
        // Medidores que "respiran" (transform: no repinta ni recalcula layout)
        for (let i = 0; i < meters.length; i++) {
            meters[i].style.transform = 'scaleX(' + (0.25 + Math.random() * 0.7).toFixed(2) + ')';
        }
    }

    function log(msg, cls) {
        if (!logEl) return;
        const now = performance.now();
        if (!cls && now - lastLog < 140) return; // no saturar el log al teclear rápido
        lastLog = now;
        const row = document.createElement('div');
        row.textContent = msg;
        if (cls) row.className = cls;
        logEl.appendChild(row);
        while (logEl.childNodes.length > 5) logEl.removeChild(logEl.firstChild);
    }

    function setStatus(text, cls, ms) {
        if (!statusEl) return;
        statusEl.textContent = 'STATUS: ' + text;
        statusEl.className = 'cp-status' + (cls ? ' ' + cls : '');
        clearTimeout(statusTimer);
        if (ms) statusTimer = setTimeout(() => setStatus(wasFire ? 'OVERCLOCK' : 'NOMINAL', wasFire ? 'is-ok' : ''), ms);
    }

    function flashAlert() {
        if (!alertEl || !alertEl.animate || T.reducedMotion) return;
        alertEl.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 320, easing: 'ease-out' });
    }

    function showBanner(text, cls) {
        if (!bannerEl) return;
        bannerEl.textContent = text;
        bannerEl.setAttribute('data-text', text);
        bannerEl.className = 'cp-banner ' + cls;
        if (!bannerEl.animate) return;
        const frames = T.reducedMotion
            ? [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
            : [
                { opacity: 0, transform: 'translate(-50%,-50%) skewX(-18deg) scaleX(1.15)' },
                { opacity: 1, transform: 'translate(-50%,-50%) skewX(8deg)', offset: 0.1 },
                { opacity: 0.4, transform: 'translate(-50%,-50%) skewX(-5deg)', offset: 0.16 },
                { opacity: 1, transform: 'translate(-50%,-50%) skewX(0)', offset: 0.24 },
                { opacity: 1, transform: 'translate(-50%,-50%)', offset: 0.82 },
                { opacity: 0, transform: 'translate(-50%,-50%) scale(1.06)' }
            ];
        bannerEl.animate(stepped(frames), { duration: 2000 });
    }

    function boot() {
        const lines = ['> BOOT SEQUENCE INIT', '> NEURAL LINK ........ OK', '> LOADING DECRYPT.MOD . OK', '> WELCOME, RUNNER'];
        lines.forEach((l, i) => bootTimers.push(setTimeout(() => log(l, 'is-sys'), 180 + i * 260)));
    }

    function destroyFx() {
        clearInterval(hudTimer); hudTimer = 0;
        clearTimeout(statusTimer);
        bootTimers.forEach(clearTimeout); bootTimers = [];
        [fx, hud, alertEl, bannerEl].forEach(el => { if (el) el.remove(); });
        fx = hud = alertEl = bannerEl = logEl = clockEl = nodeEl = statusEl = null;
        meters = [];
        const card = document.querySelector('.typing-card');
        if (card) card.classList.remove('cp-overclock');
        const combo = document.getElementById('combo-stat-card');
        if (combo) combo.style.removeProperty('--cp-fill');
    }

    // ---------------------------------------------------
    // Eventos del juego
    // ---------------------------------------------------
    function onKey(e) {
        scheduleSync();
        const now = performance.now();
        if (now - lastKeySound > 18) { // si llegan teclas casi a la vez, solo suena una
            lastKeySound = now;
            if (e.ok) sound(t0 => keyClick(t0, e.char === ' '));
            else sound(errorBuzz);
        }

        if (e.ok) {
            if (++okCount % 25 === 0) log('DECRYPT ' + hex() + ' ........ OK');
        } else {
            log('! ICE BREACH @' + hex(), 'is-warn');
            setStatus('BREACH', 'is-warn', 900);
            flashAlert();
        }

        if (T.reducedMotion) return;
        if (e.ok) {
            if (e.char !== ' ') flashChar(e.el, e.char);
        } else {
            glitch();
        }
    }

    function onCombo(count, onFire) {
        if (count > lastCombo && count > 0 && count % 10 === 0) {
            sound(t0 => blips(t0, [660, 880, 1320], 0.055, 0.05));
            log('COMBO x' + count + ' // SYNC ' + hex());
        }
        lastCombo = count;

        // Medidor segmentado de la tarjeta de combo (se llena con la racha)
        const combo = document.getElementById('combo-stat-card');
        if (combo) combo.style.setProperty('--cp-fill', Math.min(count / 30, 1).toFixed(3));

        // Racha activa = "overclock"
        const fire = !!onFire;
        if (fire !== wasFire) {
            wasFire = fire;
            const card = document.querySelector('.typing-card');
            if (card) card.classList.toggle('cp-overclock', fire);
            if (hud) hud.classList.toggle('is-overclock', fire);
            if (fire) { log('>> OVERCLOCK ENGAGED', 'is-ok'); setStatus('OVERCLOCK', 'is-ok'); }
            else { log('>> OVERCLOCK LOST', 'is-warn'); setStatus('NOMINAL', ''); }
        }
    }

    function onSection(name) {
        if (nodeEl) nodeEl.textContent = 'NODE: ' + (NODE_NAMES[name] || String(name).toUpperCase());
        if (name === 'typing') { okCount = 0; log('> RUN INITIATED // ' + hex(), 'is-sys'); }
    }

    function onEnd(kind) {
        if (kind === 'gameover') {
            showBanner('CONNECTION LOST', 'is-bad');
            log('!! CONNECTION LOST', 'is-warn');
            if (!T.reducedMotion) glitch();
            sound(t0 => {
                errorBuzz(t0);
                A.tone(t0 + 0.05, { f0: 600, f1: 40, dur: 0.55, gain: 0.16, type: 'sawtooth' });
                A.noiseHit(t0 + 0.1, { type: 'highpass', freq: 4000, q: 0.6, dur: 0.3, gain: 0.12 });
            });
        } else {
            showBanner('ACCESS GRANTED', 'is-good');
            log('>> ACCESS GRANTED', 'is-ok');
            sound(t0 => blips(t0, [523, 659, 784, 1047], 0.09, 0.06));
        }
    }

    function onActivate() {
        lastCombo = 0;
        wasFire = false;
        okCount = 0;
        ensureFx();
        boot();
        display = document.getElementById('text-display');
        if (!display) return;
        observer = new MutationObserver(onMutations);
        observer.observe(display, { childList: true });
        encryptTree(display);                       // si ya hay texto en pantalla
        syncReadWindow();
        document.addEventListener('keydown', onKeydown, true);
    }

    function onDeactivate() {
        destroyFx();
        if (observer) { observer.disconnect(); observer = null; }
        if (pendingScan) { cancelAnimationFrame(pendingScan); pendingScan = 0; }
        newNodes = [];
        document.removeEventListener('keydown', onKeydown, true);
        decryptAll();
        if (syncRaf) { cancelAnimationFrame(syncRaf); syncRaf = 0; }
        walker = null;
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
            section: onSection,
            end: onEnd
        }
    });
})();
