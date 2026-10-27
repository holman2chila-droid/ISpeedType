/* ===================================================
   ISpeedType — Temas inmersivos (motor)

   Los temas inmersivos son un extra OCULTO: se desbloquean haciendo
   10 clics seguidos en el logo. Este archivo contiene lo común a todos:
     - el desbloqueo secreto y su persistencia,
     - activar / desactivar un tema (clase en <body>),
     - el motor de audio compartido (Web Audio, sin archivos de sonido),
     - el reparto de eventos del juego hacia el tema activo.

   Cada tema vive en su propio archivo (themes/<nombre>.js + .css) y se
   registra con ImmersiveThemes.register('id', definición).

   Eventos que app.js envía con ImmersiveThemes.emit(...):
     'key'   -> { ok, el, char }   tecla procesada (ok = acierto)
     'combo' -> (combo, enFuego)   el combo cambió
     'end'   -> 'finish' | 'gameover'   terminó la partida
   =================================================== */
(function () {
    'use strict';

    const KEY_UNLOCKED = 'speedtype-immersive-unlocked';
    const KEY_ACTIVE = 'speedtype-immersive';
    const KEY_SOUND = 'speedtype-immersive-sound';
    const KEY_BASE_THEME = 'speedtype-theme'; // el tema de color normal (lo guarda app.js)

    const CLICKS_TO_UNLOCK = 10;   // clics en el logo para desbloquear
    const MAX_GAP_MS = 2000;       // si pasa más tiempo entre clics, la cuenta se reinicia

    // localStorage puede no estar disponible (modo privado, bloqueado...): nunca debe romper nada.
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } },
        del(k) { try { localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } }
    };

    const html = document.documentElement;
    const body = document.body;
    const themes = {};
    const loadedFonts = {};
    const reduceMotionMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

    let unlocked = store.get(KEY_UNLOCKED) === '1';

    // ---------------------------------------------------
    // Audio compartido
    // Un único AudioContext para todos los temas. Se crea tras un gesto del
    // usuario (los navegadores bloquean el audio antes de eso).
    // ---------------------------------------------------
    const audio = {
        ctx: null,
        out: null,     // nodo de salida: conectar aquí las voces
        noise: null,   // AudioBuffer de ruido blanco reutilizable

        get enabled() { return store.get(KEY_SOUND) !== '0'; },

        setEnabled(on) {
            store.set(KEY_SOUND, on ? '1' : '0');
            if (on) audio.init();
            syncUI();
        },

        // Crea (o reanuda) el contexto. Llamar siempre dentro de un gesto del usuario.
        init() {
            if (!audio.enabled) return;
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            if (!audio.ctx) {
                try {
                    audio.ctx = new AC({ latencyHint: 'interactive' });
                } catch (e) {
                    audio.ctx = null;
                    return;
                }
                const limiter = audio.ctx.createDynamicsCompressor(); // evita saturación si suenan varias voces
                const master = audio.ctx.createGain();
                master.gain.value = 0.7;
                master.connect(limiter);
                limiter.connect(audio.ctx.destination);
                audio.out = master;

                const len = audio.ctx.sampleRate; // 1 segundo de ruido blanco
                const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
                audio.noise = buf;
            }
            if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => { });
        },

        // ¿Se puede sonar ahora mismo?
        ready() {
            return !!(audio.ctx && audio.ctx.state === 'running' && audio.enabled);
        },

        // ---- Voces básicas reutilizables por cualquier tema (llamar solo si ready()) ----

        // Golpe de ruido filtrado. o: { freq, freq2?, q?, type?, gain, dur, attack? }
        // (freq2: el filtro barre de freq a freq2 durante el golpe).
        noiseHit(t0, o) {
            const ctx = audio.ctx;
            const src = ctx.createBufferSource();
            src.buffer = audio.noise;
            const flt = ctx.createBiquadFilter();
            flt.type = o.type || 'bandpass';
            flt.frequency.setValueAtTime(o.freq, t0);
            if (o.freq2) flt.frequency.exponentialRampToValueAtTime(o.freq2, t0 + o.dur);
            flt.Q.value = o.q || 1;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(o.gain, t0 + (o.attack || 0.003));
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
            src.connect(flt);
            flt.connect(g);
            g.connect(audio.out);
            src.start(t0, Math.random() * 0.5, o.dur + 0.05);
        },

        // ---- Archivos de audio opcionales (p. ej. una risa grabada) ----

        // Carga y decodifica un archivo. Devuelve una promesa con el AudioBuffer, o null si algo falla
        // (no existe, formato no soportado, sin audio...): el tema debe tener siempre un sonido de reserva.
        load(url) {
            audio._cache = audio._cache || {};
            if (audio._cache[url]) return audio._cache[url];
            const job = (async () => {
                try {
                    if (!audio.ctx) return null;
                    const res = await fetch(url);
                    if (!res.ok) return null;
                    const data = await res.arrayBuffer();
                    return await new Promise((ok, fail) => audio.ctx.decodeAudioData(data, ok, fail));
                } catch (e) { return null; }
            })();
            audio._cache[url] = job;
            // Un fallo (p. ej. aún no hay contexto de audio) no se recuerda: se podrá reintentar
            job.then((b) => { if (!b && audio._cache[url] === job) delete audio._cache[url]; });
            return job;
        },

        playBuffer(buf, o) {
            if (!buf || !audio.ready()) return;
            o = o || {};
            const ctx = audio.ctx;
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.playbackRate.value = o.rate || 1;
            const g = ctx.createGain();
            g.gain.value = o.gain == null ? 0.8 : o.gain;
            src.connect(g);
            g.connect(audio.out);
            if (o.send) {
                const s = ctx.createGain();
                s.gain.value = o.send;
                g.connect(s);
                s.connect(audio.reverb());
            }
            src.start(o.when || ctx.currentTime);
        },

        // Reverb compartido (eco de sala grande). Devuelve el nodo de entrada: conectar aquí
        // lo que deba sonar "lejos". La respuesta al impulso se genera por código.
        reverb() {
            if (audio._rev) return audio._rev;
            const ctx = audio.ctx;
            const secs = 2.4;
            const len = Math.floor(ctx.sampleRate * secs);
            const ir = ctx.createBuffer(2, len, ctx.sampleRate);
            for (let c = 0; c < 2; c++) {
                const d = ir.getChannelData(c);
                let lp = 0;
                for (let i = 0; i < len; i++) {
                    lp += (Math.random() * 2 - 1 - lp) * 0.35; // apaga los agudos: suena a lejos
                    d[i] = lp * Math.pow(1 - i / len, 2.6);
                }
            }
            const conv = ctx.createConvolver();
            conv.buffer = ir;
            const wet = ctx.createGain();
            wet.gain.value = 0.9;
            conv.connect(wet);
            wet.connect(audio.out);
            audio._rev = conv;
            return conv;
        },

        // Tono con caída o subida de frecuencia. o: { f0, f1?, type?, gain, dur }
        tone(t0, o) {
            const ctx = audio.ctx;
            const osc = ctx.createOscillator();
            osc.type = o.type || 'sine';
            osc.frequency.setValueAtTime(o.f0, t0);
            if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(o.gain, t0 + 0.004);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
            osc.connect(g);
            g.connect(audio.out);
            osc.start(t0);
            osc.stop(t0 + o.dur + 0.02);
        }
    };

    // ---------------------------------------------------
    // API pública
    // ---------------------------------------------------
    const api = {
        active: null,          // id del tema inmersivo activo (o null)
        audio: audio,
        get unlocked() { return unlocked; },
        get reducedMotion() { return !!(reduceMotionMQ && reduceMotionMQ.matches); },

        register(id, def) {
            themes[id] = def;
            // Si era el tema guardado, se aplica en cuanto se registra (evita parpadeo al cargar).
            if (unlocked && store.get(KEY_ACTIVE) === id && !api.active) activate(id, true);
            syncUI();
        },

        activate: (id) => activate(id, false),
        deactivate: () => deactivate(),
        emit(type, a, b) {
            const def = api.active && themes[api.active];
            const fn = def && def.on && def.on[type];
            if (fn) fn(a, b);
        },

        // Útil para probar: vuelve a bloquear los temas y quita el activo.
        reset() {
            deactivate();
            unlocked = false;
            store.del(KEY_UNLOCKED);
            store.del(KEY_ACTIVE);
            syncUI();
        }
    };
    window.ImmersiveThemes = api;

    // ---------------------------------------------------
    // Activar / desactivar
    // ---------------------------------------------------
    function loadFont(def) {
        if (!def.fontHref || loadedFonts[def.fontHref]) return;
        loadedFonts[def.fontHref] = true;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = def.fontHref;
        document.head.appendChild(link);
    }

    function activate(id, silent) {
        const def = themes[id];
        if (!def || !unlocked || api.active === id) return;
        // Algunos temas piden confirmación antes (p. ej. una advertencia). Solo cuando el usuario
        // los elige a mano: al restaurar el tema guardado al cargar la página no se vuelve a preguntar.
        if (!silent && def.beforeActivate) {
            def.beforeActivate(() => { if (api.active !== id) doActivate(id, false); });
            return;
        }
        doActivate(id, silent);
    }

    function doActivate(id, silent) {
        const def = themes[id];
        if (!def || !unlocked || api.active === id) return;
        if (api.active) deactivate();

        loadFont(def);
        body.classList.add(def.bodyClass); // classList (no className): app.js usa otras clases en <body>
        api.active = id;
        store.set(KEY_ACTIVE, id);
        enforceDarkBase();
        if (!silent) audio.init(); // activar desde el menú es un gesto del usuario
        if (def.on && def.on.activate) def.on.activate();
        syncUI();
    }

    function deactivate() {
        const id = api.active;
        if (!id) return;
        const def = themes[id];
        body.classList.remove(def.bodyClass);
        api.active = null;
        store.del(KEY_ACTIVE);
        if (def.on && def.on.deactivate) def.on.deactivate();
        // Devuelve el tema de color normal que tenía el usuario.
        const base = store.get(KEY_BASE_THEME) || 'dark';
        if (html.getAttribute('data-theme') !== base) html.setAttribute('data-theme', base);
        syncUI();
    }

    // Los temas inmersivos se construyen sobre la base oscura: así no se mezclan con las reglas
    // especiales del tema "Claro". El tema normal elegido por el usuario no se pierde (sigue guardado).
    function enforceDarkBase() {
        if (api.active && html.getAttribute('data-theme') !== 'dark') {
            html.setAttribute('data-theme', 'dark');
        }
    }
    new MutationObserver(enforceDarkBase).observe(html, { attributes: true, attributeFilter: ['data-theme'] });

    // ---------------------------------------------------
    // Interfaz: sección del menú de temas
    // ---------------------------------------------------
    function syncUI() {
        const section = document.getElementById('immersive-section');
        if (section) section.classList.toggle('hidden', !unlocked);

        document.querySelectorAll('.immersive-option').forEach(btn => {
            const on = btn.dataset.immersive === api.active;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            btn.classList.toggle('hidden', !themes[btn.dataset.immersive]);
        });

        // Mientras hay un tema inmersivo, ningún tema normal aparece como "activo".
        const base = html.getAttribute('data-theme');
        document.querySelectorAll('.theme-option').forEach(btn => {
            btn.classList.toggle('active', !api.active && btn.dataset.theme === (store.get(KEY_BASE_THEME) || base));
        });

        const soundBtn = document.getElementById('immersive-sound');
        if (soundBtn) {
            const on = audio.enabled;
            soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
            soundBtn.classList.toggle('is-off', !on);
            const icon = soundBtn.querySelector('.immersive-sound-icon');
            if (icon) icon.textContent = on ? '🔊' : '🔇';
            const label = soundBtn.querySelector('.immersive-sound-state');
            if (label && window.I18N) label.textContent = window.I18N.t(on ? 'ui.immersive-sound-on' : 'ui.immersive-sound-off');
        }
    }

    function t(key) {
        return window.I18N ? window.I18N.t(key) : key;
    }

    function showToast(message) {
        const old = document.querySelector('.immersive-toast');
        if (old) old.remove();
        const el = document.createElement('div');
        el.className = 'immersive-toast';
        el.setAttribute('role', 'status');
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.classList.add('is-hiding'), 4200);
        setTimeout(() => el.remove(), 4700);
    }

    // ---------------------------------------------------
    // Desbloqueo secreto: 10 clics seguidos en el logo
    // ---------------------------------------------------
    function unlock() {
        if (unlocked) return;
        unlocked = true;
        store.set(KEY_UNLOCKED, '1');
        syncUI();
        showToast(t('ui.immersive-unlocked'));

        // Abre el menú de temas para que se vea dónde quedó la opción nueva.
        // (setTimeout: el clic en el logo también cierra el menú desde app.js; esto va después.)
        setTimeout(() => {
            const dd = document.getElementById('theme-dropdown');
            if (dd) dd.classList.remove('hidden');
        }, 0);
    }

    function setupLogo() {
        const logo = document.getElementById('logo-home');
        if (!logo) return;
        let count = 0;
        let last = 0;
        logo.addEventListener('click', () => {
            if (unlocked) return;
            const now = Date.now();
            if (now - last > MAX_GAP_MS) count = 0;
            last = now;
            count++;

            if (count >= CLICKS_TO_UNLOCK) {
                count = 0;
                unlock();
            } else if (count >= 5 && !api.reducedMotion && logo.animate) {
                // Pista muy sutil de que algo está pasando (solo a partir del 5.º clic).
                logo.animate(
                    [{ rotate: '0deg' }, { rotate: '-3deg' }, { rotate: '3deg' }, { rotate: '0deg' }],
                    { duration: 220 }
                );
            }
        });
    }

    // ---------------------------------------------------
    // Arranque
    // ---------------------------------------------------
    function setup() {
        setupLogo();

        // Opciones inmersivas del menú
        document.querySelectorAll('.immersive-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.immersive;
                if (api.active === id) deactivate(); else activate(id, false);
                const dd = document.getElementById('theme-dropdown');
                if (dd) dd.classList.add('hidden');
            });
        });

        // Elegir un tema de color normal apaga el inmersivo.
        // (setTimeout: deja que app.js termine de aplicar su tema primero.)
        document.querySelectorAll('.theme-option').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!api.active) return;
                setTimeout(() => { deactivate(); }, 0);
            });
        });

        const soundBtn = document.getElementById('immersive-sound');
        if (soundBtn) soundBtn.addEventListener('click', () => audio.setEnabled(!audio.enabled));

        // El audio solo puede iniciarse tras un gesto del usuario.
        const wake = () => { if (api.active) audio.init(); };
        document.addEventListener('keydown', wake, { capture: true, passive: true });
        document.addEventListener('pointerdown', wake, { capture: true, passive: true });

        if (window.I18N && window.I18N.onChange) window.I18N.onChange(syncUI);
        syncUI();
    }

    setup();
})();
