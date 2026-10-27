/* ===================================================
   ISpeedType — MODO ASEDIO (infinito, estilo roguelike)

   Palabras que llegan volando desde fuera de la pantalla hacia el núcleo del centro.
   Hay que escribirlas (Espacio o Enter para destruirlas) antes de que lo toquen.
   Las oleadas no terminan nunca: cada una es más rápida, más larga y más dura.

   Arquitectura
   ------------
   - AsedioGame: toda la lógica del juego. No toca nada fuera de su contenedor.
       .init()     enlaza el DOM, los eventos y el observador de tamaño
       .start()    empieza (o reinicia) una partida desde la oleada 1
       .pause() / .resume()
       .destroy()  desmonta todo (loop, listeners, palabras)
   - Los sistemas globales de la web se enchufan por 'hooks' (ver DEFAULT_HOOKS y el
     bloque "CONEXIONES CON LA WEB" al final del archivo). Cada punto de unión lleva
     el comentario  // CONECTAR AQUÍ  y ya está conectado a:
         · Sonido del tema (Sí/No)    -> ImmersiveThemes.audio
         · Salón de Logros            -> ISpeedTypeBridge.unlockAchievement
         · Estadísticas y precisión   -> ISpeedTypeBridge.showResults (registra la partida)

   Rendimiento
   -----------
   - Un único requestAnimationFrame; dt acotado (50 ms) para que una pestaña en segundo
     plano no teletransporte las palabras.
   - Las palabras se mueven SOLO con transform: translate3d (GPU) y will-change: transform.
   - Nada de lecturas de layout dentro del loop: el tamaño de cada palabra se mide una vez
     al crearla y el del contenedor lo avisa un ResizeObserver.
   - El texto resaltado/pendiente de cada palabra solo se toca cuando cambia.
   =================================================== */
(function () {
    'use strict';

    // ---------------------------------------------------
    // Utilidades
    // ---------------------------------------------------
    const rand = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => Math.floor(rand(a, b + 1));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const tr = (k, v) => (window.I18N ? window.I18N.t(k, v) : k);

    // ---------------------------------------------------
    // Progresión de oleadas
    // ---------------------------------------------------
    // Devuelve la configuración de la oleada n (n >= 1). Función pura: fácil de ajustar y probar.
    //   speed        px/s a tamaño de referencia (se escala con el contenedor)
    //   interval     segundos entre apariciones
    //   burst        palabras que salen a la vez en cada aparición
    //   total        palabras de la oleada (hay que despejarlas para pasar a la siguiente)
    //   armorChance  probabilidad de que una palabra venga "blindada"
    //   armorRatio   fracción de sus letras que se cambia por números/símbolos
    function waveConfig(n) {
        if (n <= 3) {                                   // Fácil
            return { tier: 'easy', min: 3, max: 5, speed: 50 + (n - 1) * 6, interval: 3,
                burst: 1, total: 6 + n * 2, armorChance: 0, armorRatio: 0, tech: false };
        }
        if (n <= 6) {                                   // Media
            return { tier: 'medium', min: 5, max: 8, speed: 75 + (n - 4) * 8, interval: 2,
                burst: 1, total: 10 + (n - 3) * 2, armorChance: 0, armorRatio: 0, tech: false };
        }
        if (n <= 9) {                                   // Difícil: palabras largas y "Blindado"
            return { tier: 'hard', min: 7, max: 12, speed: 105 + (n - 7) * 10, interval: 1.5,
                burst: 1, total: 14 + (n - 6) * 2, armorChance: 0.35 + (n - 7) * 0.08, armorRatio: 0.3, tech: false };
        }
        const k = n - 10;                               // Imposible: ráfagas, velocidad extrema, vocabulario técnico
        return { tier: 'insane', min: 8, max: 14, speed: Math.min(320, 150 + k * 12),
            interval: Math.max(1.8, 3.2 - k * 0.1), burst: Math.min(6, 2 + Math.floor(k / 2)),
            total: Math.min(42, 20 + k * 2), armorChance: Math.min(0.7, 0.5 + k * 0.02), armorRatio: 0.3, tech: true };
    }

    // ---------------------------------------------------
    // Banco de palabras
    // ---------------------------------------------------
    const TECH = {
        es: ['algoritmo', 'compilador', 'recursividad', 'asincronia', 'middleware', 'encapsulamiento', 'polimorfismo',
            'criptografia', 'serializacion', 'arquitectura', 'sincronizacion', 'virtualizacion', 'optimizacion',
            'refactorizacion', 'interoperabilidad', 'parametrizacion', 'concurrencia', 'escalabilidad', 'enrutamiento',
            'autenticacion', 'dependencias', 'repositorio', 'contenedores', 'microservicios', 'transpilador',
            'paralelismo', 'multiproceso', 'desbordamiento', 'inyeccion', 'cortafuegos', 'protocolo', 'framework'],
        en: ['algorithm', 'compiler', 'recursion', 'asynchronous', 'middleware', 'encapsulation', 'polymorphism',
            'cryptography', 'serialization', 'architecture', 'synchronization', 'virtualization', 'optimization',
            'refactoring', 'interoperability', 'parameterization', 'concurrency', 'scalability', 'routing',
            'authentication', 'dependencies', 'repository', 'containers', 'microservices', 'transpiler',
            'parallelism', 'multithreading', 'overflow', 'injection', 'firewall', 'protocol', 'framework']
    };
    const BASIC = {
        es: ['sol', 'luna', 'mar', 'pan', 'casa', 'gato', 'perro', 'rio', 'nube', 'viento', 'fuego', 'tierra', 'noche',
            'camino', 'puerta', 'ventana', 'bosque', 'montana', 'estrella', 'tormenta', 'castillo', 'dragon', 'espada',
            'escudo', 'guerrero', 'velocidad', 'teclado', 'palabra', 'defensa', 'enemigo'],
        en: ['sun', 'moon', 'sea', 'bread', 'house', 'cat', 'dog', 'river', 'cloud', 'wind', 'fire', 'earth', 'night',
            'road', 'door', 'window', 'forest', 'mountain', 'star', 'storm', 'castle', 'dragon', 'sword', 'shield',
            'warrior', 'velocity', 'keyboard', 'word', 'defense', 'enemy']
    };

    // Sustituciones "blindadas": cada letra tiene un par de reemplazos legibles
    const ARMOR = { a: '@4', e: '3', i: '1!', o: '0', s: '$5', t: '7+', l: '1', b: '8', g: '9', z: '2' };
    const ARMOR_FALLBACK = '#%&*=+';

    function armorize(word, ratio) {
        const chars = word.split('');
        const want = Math.max(1, Math.round(chars.length * ratio));
        const idx = chars.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, want);
        idx.forEach((i) => {
            const subs = ARMOR[chars[i]] || ARMOR_FALLBACK;
            chars[i] = subs[Math.floor(Math.random() * subs.length)];
        });
        return chars.join('');
    }

    class WordBank {
        constructor() { this.lang = null; this.byLen = new Map(); this.all = []; }

        // Construye el banco con las palabras de los textos de práctica del idioma actual
        build(lang) {
            if (this.lang === lang) return;
            this.lang = lang;
            const src = lang === 'en'
                ? (typeof typingTextsEn !== 'undefined' ? typingTextsEn : null)
                : (typeof typingTexts !== 'undefined' ? typingTexts : null);
            const set = new Set(BASIC[lang] || BASIC.es);
            if (src) {
                Object.keys(src).forEach((cat) => {
                    const list = src[cat];
                    if (!Array.isArray(list)) return;
                    list.forEach((txt) => {
                        if (typeof txt !== 'string') return;
                        // Sin tildes (la ñ se conserva): así se puede jugar con cualquier teclado
                        const clean = txt.toLowerCase().replace(/ñ/g, '\u0001').normalize('NFD')
                            .replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'ñ');
                        (clean.match(/[a-zñ]+/g) || []).forEach((w) => { if (w.length >= 3 && w.length <= 12) set.add(w); });
                    });
                });
            }
            this.all = Array.from(set);
            this.byLen = new Map();
            this.all.forEach((w) => {
                if (!this.byLen.has(w.length)) this.byLen.set(w.length, []);
                this.byLen.get(w.length).push(w);
            });
        }

        // Una palabra de entre min y max letras. 'avoid' = primeras letras ya en pantalla (evita ambigüedad).
        pick(min, max, tech, avoid) {
            const pool = [];
            if (tech) {
                (TECH[this.lang] || TECH.es).forEach((w) => { if (w.length >= min && w.length <= max + 4) pool.push(w); });
            }
            for (let l = min; l <= max; l++) {
                const list = this.byLen.get(l);
                if (list) for (let i = 0; i < list.length; i++) pool.push(list[i]);
            }
            if (!pool.length) return pick(BASIC[this.lang] || BASIC.es);
            let w = pick(pool);
            for (let tries = 0; tries < 12 && avoid && avoid.has(w[0]); tries++) w = pick(pool);
            return w;
        }
    }

    // ---------------------------------------------------
    // Conexiones por defecto (se sustituyen desde fuera con opts.hooks)
    // ---------------------------------------------------
    const DEFAULT_HOOKS = {
        // CONECTAR AQUÍ — Sistema de Sonido ("Sonido del tema": Sí/No).
        // kind: 'type' | 'kill' | 'error' | 'damage' | 'wave' | 'gameover'
        sound: function () { },
        // CONECTAR AQUÍ — Salón de Logros. id: 'asedio-3', 'asedio-6', 'asedio-10', 'asedio-15', 'asedio-combo-25'
        unlockAchievement: function () { },
        // CONECTAR AQUÍ — Estadísticas de Errores y Precisión del sitio.
        // Recibe el resumen final de la partida (ver _gameOver) y muestra la pantalla de resultados.
        gameOver: function () { },
        // Avisa a los temas inmersivos ('combo' | 'life' | 'end'). Opcional.
        themeEvent: function () { }
    };

    // ---------------------------------------------------
    // Juego
    // ---------------------------------------------------
    const MAX_DT = 0.05;          // s: tope por fotograma
    const START_DELAY = 1.2;      // s antes de la primera oleada
    const INTERMISSION = 2.4;     // s entre oleadas
    const MARGIN = 28;            // px fuera del borde donde nace cada palabra
    const BASE_LIVES = 5;

    class AsedioGame {
        constructor(opts) {
            this.o = opts || {};
            this.hooks = Object.assign({}, DEFAULT_HOOKS, this.o.hooks || {});
            this.bank = new WordBank();
            this.ready = false;
            this.running = false;
            this._raf = 0;
            this.words = [];
            this._tick = this._tick.bind(this);
            this._onInput = this._onInput.bind(this);
            this._onKeyDown = this._onKeyDown.bind(this);
            this._onVisibility = this._onVisibility.bind(this);
            this._onContainerClick = () => { if (this.running) this.o.input.focus(); };
            this._resetState();
        }

        // --- Ciclo de vida público ---

        init() {
            if (this.ready) return this;
            const o = this.o;
            this.container = o.container;
            this.core = o.core;
            this.input = o.input;
            this.banner = o.banner;
            this.hud = o.hud || {};
            this.input.addEventListener('input', this._onInput);
            this.input.addEventListener('keydown', this._onKeyDown);
            this.container.addEventListener('pointerdown', this._onContainerClick);
            document.addEventListener('visibilitychange', this._onVisibility);
            this._measure();
            if (typeof ResizeObserver !== 'undefined') {
                this._ro = new ResizeObserver(() => this._measure());
                this._ro.observe(this.container);
            }
            this.ready = true;
            return this;
        }

        // Empieza una partida nueva (si ya había una, la reinicia)
        start() {
            if (!this.ready) this.init();
            this._clearWords();
            this._resetState();
            this.bank.build(window.I18N ? window.I18N.lang : 'es');
            this.input.disabled = false;
            this.input.value = '';
            this.input.classList.remove('has-error');
            this.container.classList.remove('is-paused', 'is-over');
            this.core.classList.remove('is-hit');
            this._measure();
            this._renderHud(true);
            this.state = 'start';
            this.timer = START_DELAY;
            this.running = true;
            this._showBanner(tr('asedio.ready'), START_DELAY);
            this._last = performance.now();
            cancelAnimationFrame(this._raf);
            this._raf = requestAnimationFrame(this._tick);
            this.input.focus();
        }

        pause() {
            if (!this.running || this.state === 'over') return;
            this.running = false;
            cancelAnimationFrame(this._raf);
            this._raf = 0;
            this.container.classList.add('is-paused');
            this._showBanner(tr('asedio.paused'), 0);
            this.input.blur();
            if (this.o.onPauseChange) this.o.onPauseChange(true);
        }

        resume() {
            if (this.running || this.state === 'over' || !this.ready) return;
            this.running = true;
            this.container.classList.remove('is-paused');
            this._hideBanner();
            this._last = performance.now();
            this._raf = requestAnimationFrame(this._tick);
            this.input.focus();
            if (this.o.onPauseChange) this.o.onPauseChange(false);
        }

        togglePause() { this.running ? this.pause() : this.resume(); }

        // Desmonta todo: loop, listeners, observador y palabras
        destroy() {
            this.running = false;
            cancelAnimationFrame(this._raf);
            this._raf = 0;
            clearTimeout(this._coreTimer);
            if (this.ready) {
                this.input.removeEventListener('input', this._onInput);
                this.input.removeEventListener('keydown', this._onKeyDown);
                this.container.removeEventListener('pointerdown', this._onContainerClick);
                document.removeEventListener('visibilitychange', this._onVisibility);
                if (this._ro) { this._ro.disconnect(); this._ro = null; }
                this._clearWords();
                this.input.value = '';
                this.input.classList.remove('has-error');
                this.container.classList.remove('is-paused', 'is-over');
                this.core.classList.remove('is-hit');
                this._hideBanner();
            }
            this.ready = false;
            this.state = 'idle';
        }

        // Estado público de solo lectura (útil para pruebas y para otros módulos)
        get snapshot() {
            return { wave: this.wave, score: this.score, lives: this.lives, combo: this.combo,
                words: this.words.length, state: this.state, running: this.running };
        }

        // --- Estado ---

        _resetState() {
            this.wave = 0;
            this.cfg = null;
            this.score = 0;
            this.lives = BASE_LIVES;
            this.combo = 0;
            this.bestCombo = 0;
            this.kills = 0;
            this.killedChars = 0;
            this.keystrokes = 0;
            this.correctKeys = 0;
            this.errors = 0;
            this.keys = {};
            this.buffer = '';
            this.spawned = 0;
            this.spawnTimer = 0;
            this.timer = 0;
            this.bannerTimer = 0;
            this.activeSeconds = 0;
            this.state = 'idle';
            this._hudCache = {};
            this._targetWord = null;
        }

        _measure() {
            if (!this.container) return;
            this.W = this.container.clientWidth;
            this.H = this.container.clientHeight;
            this.cx = this.W / 2;
            this.cy = this.H / 2;
            this.coreR = this.core ? this.core.offsetWidth / 2 : 32;
            // En contenedores pequeños las palabras van más despacio para que sigan siendo jugables
            this.scale = clamp(Math.min(this.W, this.H * 1.6) / 760, 0.6, 1.25);
        }

        // --- Loop ---

        _tick(now) {
            if (!this.running) return;
            this._raf = requestAnimationFrame(this._tick);
            let dt = (now - this._last) / 1000;
            this._last = now;
            if (dt > MAX_DT) dt = MAX_DT;
            if (dt <= 0) return;
            if (this.state !== 'over') this.activeSeconds += dt;

            // Banner temporal
            if (this.bannerTimer > 0) {
                this.bannerTimer -= dt;
                if (this.bannerTimer <= 0) this._hideBanner();
            }

            // Máquina de estados de las oleadas
            if (this.state === 'start' || this.state === 'intermission') {
                this.timer -= dt;
                if (this.timer <= 0) this._startWave(this.wave + 1);
            } else if (this.state === 'spawning') {
                this.spawnTimer -= dt;
                if (this.spawnTimer <= 0) {
                    this.spawnTimer += this.cfg.interval;
                    const n = Math.min(this.cfg.burst, this.cfg.total - this.spawned);
                    for (let i = 0; i < n; i++) this._spawnWord();
                    this.spawned += n;
                    if (this.spawned >= this.cfg.total) this.state = 'clearing';
                }
            } else if (this.state === 'clearing' && this.words.length === 0) {
                this._waveCleared();
            }

            this._updateWords(dt);
        }

        _updateWords(dt) {
            const words = this.words;
            for (let i = words.length - 1; i >= 0; i--) {
                const w = words[i];
                w.x += w.vx * dt;
                w.y += w.vy * dt;
                w.el.style.transform = 'translate3d(' + w.x.toFixed(1) + 'px,' + w.y.toFixed(1) + 'px,0) translate(-50%,-50%)';
                const dx = this.cx - w.x, dy = this.cy - w.y;
                // Choca cuando el borde de la palabra (en la dirección de avance) toca el radio del núcleo
                const reach = this.coreR + w.reach;
                if (dx * dx + dy * dy <= reach * reach) {
                    this._coreHit(w);
                    if (this.state === 'over') return;
                }
            }
        }

        // --- Oleadas ---

        _startWave(n) {
            this.wave = n;
            this.cfg = waveConfig(n);
            this.spawned = 0;
            this.spawnTimer = 0.5;
            this.state = 'spawning';
            let msg = tr('asedio.waveBanner', { n });
            if (this.cfg.burst > 1) msg += ' — ' + tr('asedio.burst');
            else if (this.cfg.armorChance > 0) msg += ' — ' + tr('asedio.armored');
            this._showBanner(msg, 2);
            this.hooks.sound('wave');
            this._renderHud();
        }

        _waveCleared() {
            const bonus = 100 * this.wave;
            this.score += bonus;
            this.state = 'intermission';
            this.timer = INTERMISSION;
            this._showBanner(tr('asedio.waveCleared', { n: this.wave, bonus }), INTERMISSION - 0.2);
            this.hooks.sound('wave');
            // CONECTAR AQUÍ — Salón de Logros: oleadas superadas
            if (this.wave >= 3) this.hooks.unlockAchievement('asedio-3');
            if (this.wave >= 6) this.hooks.unlockAchievement('asedio-6');
            if (this.wave >= 10) this.hooks.unlockAchievement('asedio-10');
            if (this.wave >= 15) this.hooks.unlockAchievement('asedio-15');
            this._renderHud();
        }

        // --- Palabras ---

        _spawnWord() {
            const cfg = this.cfg;
            const avoid = new Set(this.words.map((w) => w.text[0]));
            let text = this.bank.pick(cfg.min, cfg.max, cfg.tech, avoid);
            const armored = cfg.armorChance > 0 && Math.random() < cfg.armorChance;
            if (armored) text = armorize(text, cfg.armorRatio);

            // Estructura: <span.asedio-word (posición)> <span.asedio-word-body (efectos)> <mark/> <span.rest/> </span></span>
            const el = document.createElement('span');
            el.className = 'asedio-word' + (armored ? ' is-armored' : '');
            const body = document.createElement('span');
            body.className = 'asedio-word-body';
            const mark = document.createElement('mark');
            mark.className = 'asedio-typed';
            const rest = document.createElement('span');
            rest.className = 'asedio-rest';
            rest.textContent = text;
            body.appendChild(mark);
            body.appendChild(rest);
            el.appendChild(body);
            this.container.appendChild(el);

            // Se mide una sola vez (única lectura de layout por palabra)
            const w = el.offsetWidth, h = el.offsetHeight;

            // Punto de aparición estrictamente fuera de los bordes: 0 arriba, 1 abajo, 2 izquierda, 3 derecha
            const side = randInt(0, 3);
            let x, y;
            if (side === 0) { x = rand(w / 2, Math.max(w / 2, this.W - w / 2)); y = -h / 2 - MARGIN; }
            else if (side === 1) { x = rand(w / 2, Math.max(w / 2, this.W - w / 2)); y = this.H + h / 2 + MARGIN; }
            else if (side === 2) { x = -w / 2 - MARGIN; y = rand(h / 2, Math.max(h / 2, this.H - h / 2)); }
            else { x = this.W + w / 2 + MARGIN; y = rand(h / 2, Math.max(h / 2, this.H - h / 2)); }

            // Vector unitario hacia el centro × velocidad de la oleada
            const dx = this.cx - x, dy = this.cy - y;
            const dist = Math.hypot(dx, dy) || 1;
            const ux = dx / dist, uy = dy / dist;
            const speed = cfg.speed * this.scale * rand(0.92, 1.08);

            const word = {
                text, el, mark, rest, armored,
                x, y, vx: ux * speed, vy: uy * speed,
                reach: Math.abs(ux) * w / 2 + Math.abs(uy) * h / 2,
                m: 0, target: false, cand: false
            };
            el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) translate(-50%,-50%)';
            this.words.push(word);
            // Si ya había algo escrito, la palabra nueva entra en la comparación
            if (this.buffer) this._refreshTargets();
        }

        _removeWord(w, cls) {
            const i = this.words.indexOf(w);
            if (i >= 0) this.words.splice(i, 1);
            w.el.classList.add(cls);
            // Se retira el nodo en cuanto acaba el efecto rápido (CSS ~180 ms)
            setTimeout(() => { if (w.el.parentNode) w.el.parentNode.removeChild(w.el); }, 220);
            if (this._targetWord === w) this._targetWord = null;
        }

        _clearWords() {
            this.words.forEach((w) => { if (w.el.parentNode) w.el.parentNode.removeChild(w.el); });
            this.words = [];
            this._targetWord = null;
            if (this.container) {
                Array.prototype.slice.call(this.container.querySelectorAll('.asedio-word')).forEach((n) => n.remove());
            }
        }

        // --- Entrada ---

        _anyPrefix(v) {
            for (let i = 0; i < this.words.length; i++) if (this.words[i].text.startsWith(v)) return true;
            return false;
        }

        _onInput() {
            if (!this.running) { this.input.value = this.buffer; return; }
            let v = this.input.value;
            if (/\s/.test(v)) { v = v.replace(/\s+/g, ''); this.input.value = v; }
            const prev = this.buffer;
            this.buffer = v;
            let ok = true;
            if (v.length > prev.length) {
                const ch = v[v.length - 1].toLowerCase();
                this.keystrokes++;
                const ks = this.keys[ch] || (this.keys[ch] = [0, 0]);
                ks[0]++;
                ok = this._anyPrefix(v);
                if (ok) {
                    this.correctKeys++;
                    this.hooks.sound('type');
                } else {
                    this.errors++;
                    ks[1]++;
                    this._resetCombo();
                    this.hooks.sound('error');
                }
            } else {
                ok = !v || this._anyPrefix(v);
            }
            this.input.classList.toggle('has-error', !ok && v.length > 0);
            this._refreshTargets();
        }

        _onKeyDown(e) {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                if (this.running) this._submit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.togglePause();
            }
        }

        // Espacio/Enter: destruye la palabra que coincide exactamente con el buffer
        _submit() {
            const v = this.buffer;
            if (!v) return;
            let hit = null, best = Infinity;
            for (let i = 0; i < this.words.length; i++) {
                const w = this.words[i];
                if (w.text === v) {
                    // si hay varias iguales, la más cercana al núcleo
                    const d = (this.cx - w.x) * (this.cx - w.x) + (this.cy - w.y) * (this.cy - w.y);
                    if (d < best) { best = d; hit = w; }
                }
            }
            if (hit) {
                this._kill(hit);
            } else {
                // Enviaste algo que no es una palabra completa: cuenta como fallo
                this.errors++;
                this._resetCombo();
                this.hooks.sound('error');
            }
            this._clearBuffer();
        }

        _clearBuffer() {
            this.buffer = '';
            this.input.value = '';
            this.input.classList.remove('has-error');
            this._refreshTargets();
        }

        _kill(w) {
            this._removeWord(w, 'is-destroyed');
            this.kills++;
            this.killedChars += w.text.length;
            this.combo++;
            if (this.combo > this.bestCombo) this.bestCombo = this.combo;
            // Puntos: 10 por letra (×1.5 si venía blindada) con multiplicador de combo (+5 % por acierto, tope ×3.5)
            const mult = 1 + Math.min(this.combo - 1, 50) * 0.05;
            this.score += Math.round(w.text.length * 10 * (w.armored ? 1.5 : 1) * mult);
            this.hooks.sound('kill');
            this.hooks.themeEvent('combo', this.combo, this.combo >= 10);
            // CONECTAR AQUÍ — Salón de Logros: racha de combo
            if (this.combo >= 25) this.hooks.unlockAchievement('asedio-combo-25');
            this._renderHud();
        }

        _resetCombo() {
            if (this.combo === 0) return;
            this.combo = 0;
            this.hooks.themeEvent('combo', 0, false);
            this._renderHud();
        }

        // Resalta lo escrito en la palabra con más progreso; el resto de coincidencias queda "candidata"
        _refreshTargets() {
            const v = this.buffer;
            let target = null, bestM = 0, bestD = Infinity;
            const words = this.words;
            if (v) {
                for (let i = 0; i < words.length; i++) {
                    const w = words[i];
                    if (!w.text.startsWith(v)) continue;
                    const d = (this.cx - w.x) * (this.cx - w.x) + (this.cy - w.y) * (this.cy - w.y);
                    if (v.length > bestM || (v.length === bestM && d < bestD)) { bestM = v.length; bestD = d; target = w; }
                }
            }
            for (let i = 0; i < words.length; i++) {
                const w = words[i];
                const matches = !!v && w.text.startsWith(v);
                const isTarget = w === target;
                const m = isTarget ? v.length : 0;
                if (w.m !== m) {
                    w.mark.textContent = w.text.slice(0, m);
                    w.rest.textContent = w.text.slice(m);
                    w.m = m;
                }
                if (w.target !== isTarget) { w.el.classList.toggle('is-target', isTarget); w.target = isTarget; }
                if (w.cand !== (matches && !isTarget)) { w.cand = matches && !isTarget; w.el.classList.toggle('is-candidate', w.cand); }
            }
            this._targetWord = target;
        }

        // --- Núcleo ---

        _coreHit(w) {
            this._removeWord(w, 'is-crashed');
            this.lives--;
            this._resetCombo();
            this.core.classList.remove('is-hit');
            void this.core.offsetWidth; // reinicia la animación de daño
            this.core.classList.add('is-hit');
            clearTimeout(this._coreTimer);
            this._coreTimer = setTimeout(() => this.core.classList.remove('is-hit'), 520);
            this.hooks.sound('damage');
            this.hooks.themeEvent('life', Math.max(0, this.lives), BASE_LIVES);
            this._renderHud();
            // Si lo escrito solo coincidía con la palabra que acaba de romperse, el buffer se limpia
            if (this.buffer && !this._anyPrefix(this.buffer)) this._clearBuffer();
            else this._refreshTargets();
            if (this.lives <= 0) this._gameOver();
        }

        _gameOver() {
            this.state = 'over';
            this.running = false;
            cancelAnimationFrame(this._raf);
            this._raf = 0;
            this.input.disabled = true;
            this.container.classList.add('is-over');
            this.hooks.sound('gameover');
            const minutes = this.activeSeconds / 60;
            const summary = {
                wave: this.wave,
                score: this.score,
                kills: this.kills,
                bestCombo: this.bestCombo,
                errors: this.errors,
                keystrokes: this.keystrokes,
                chars: this.killedChars,
                seconds: this.activeSeconds,
                wpm: minutes > 0 ? Math.round((this.killedChars / 5) / minutes) : 0,
                accuracy: this.keystrokes > 0 ? Math.round((this.correctKeys / this.keystrokes) * 100) : 100,
                keys: this.keys
            };
            this.hooks.themeEvent('end', 'gameover');
            // CONECTAR AQUÍ — Estadísticas de Errores y Precisión + pantalla de resultados
            this.hooks.gameOver(summary);
        }

        // --- Interfaz ---

        _renderHud(force) {
            const h = this.hud, c = this._hudCache;
            const set = (key, el, val) => {
                if (!el) return;
                if (force || c[key] !== val) { c[key] = val; el.textContent = val; }
            };
            set('wave', h.wave, this.wave || 1);
            set('score', h.score, this.score);
            set('lives', h.lives, Math.max(0, this.lives));
            set('combo', h.combo, this.combo);
        }

        _showBanner(text, seconds) {
            if (!this.banner) return;
            this.banner.textContent = text;
            this.banner.classList.remove('hidden');
            this.bannerTimer = seconds;
        }

        _hideBanner() {
            if (!this.banner) return;
            this.banner.classList.add('hidden');
            this.bannerTimer = 0;
        }

        _onVisibility() {
            // Si se cambia de pestaña, la partida se pausa sola
            if (document.hidden && this.running) this.pause();
        }
    }

    window.AsedioGame = AsedioGame;
    window.AsedioGame.waveConfig = waveConfig;   // para pruebas y para ajustar la dificultad
    window.AsedioGame.armorize = armorize;

    // ===================================================
    // CONEXIONES CON LA WEB
    // Aquí es donde AsedioGame se enlaza con los sistemas globales del proyecto.
    // ===================================================
    function boot() {
        const $ = (id) => document.getElementById(id);
        const section = $('asedio-section');
        const startBtn = $('btn-asedio-start');
        const bridge = window.ISpeedTypeBridge;
        if (!section || !startBtn || !bridge) return;

        // --- CONECTAR AQUÍ — Sistema de Sonido: "Sonido del tema" (Sí/No) ---
        // El interruptor vive en el menú de temas (ImmersiveThemes.audio.enabled). Si no hay tema
        // inmersivo activo o el sonido está en "No", audio.ready() es falso y no suena nada.
        function sfx(kind) {
            const T = window.ImmersiveThemes;
            const A = T && T.audio;
            if (!A || !T.active || !A.ready()) return;
            try {
                const t = A.ctx.currentTime + 0.002;
                if (kind === 'type') {
                    A.noiseHit(t, { type: 'highpass', freq: 2600, dur: 0.012, gain: 0.05 });
                } else if (kind === 'kill') {
                    A.tone(t, { f0: 520, f1: 980, dur: 0.09, gain: 0.12, type: 'triangle' });
                    A.noiseHit(t, { type: 'highpass', freq: 3000, dur: 0.05, gain: 0.07 });
                } else if (kind === 'error') {
                    A.tone(t, { f0: 150, f1: 90, dur: 0.1, gain: 0.12, type: 'sawtooth' });
                } else if (kind === 'damage') {
                    A.tone(t, { f0: 110, f1: 38, dur: 0.35, gain: 0.4 });
                    A.noiseHit(t, { type: 'lowpass', freq: 700, freq2: 150, dur: 0.3, gain: 0.35 });
                } else if (kind === 'wave') {
                    A.tone(t, { f0: 392, dur: 0.18, gain: 0.1, type: 'triangle' });
                    A.tone(t + 0.12, { f0: 587, dur: 0.28, gain: 0.1, type: 'triangle' });
                } else if (kind === 'gameover') {
                    A.tone(t, { f0: 220, f1: 55, dur: 0.9, gain: 0.3, type: 'sawtooth' });
                }
            } catch (e) { /* un fallo de audio nunca debe romper la partida */ }
        }

        // Los temas inmersivos reaccionan a combo/vidas/final (sonidos y efectos propios del tema)
        function themeEvent(type, a, b) {
            const T = window.ImmersiveThemes;
            if (!T || !T.active) return;
            try { T.emit(type, a, b); } catch (e) { /* los efectos del tema nunca deben afectar al juego */ }
        }

        const game = new AsedioGame({
            container: $('asedio-container'),
            core: $('asedio-core'),
            input: $('asedio-input'),
            banner: $('asedio-banner'),
            hud: { wave: $('asedio-wave'), score: $('asedio-score'), lives: $('asedio-lives'), combo: $('asedio-combo') },
            onPauseChange: (paused) => {
                const b = $('asedio-pause-btn');
                if (b) b.querySelector('span').textContent = tr(paused ? 'asedio.resume' : 'asedio.pause');
            },
            hooks: {
                sound: sfx,
                // CONECTAR AQUÍ — Salón de Logros (los logros 'asedio-*' están definidos en app.js)
                unlockAchievement: (id) => bridge.unlockAchievement(id),
                themeEvent: themeEvent,
                // CONECTAR AQUÍ — Estadísticas y precisión: showResults registra la partida en el
                // historial (modo "asedio") y reutiliza la pantalla de resultados del sitio.
                gameOver: (s) => {
                    bridge.showResults({
                        kind: 'gameover',
                        wpm: s.wpm, accuracy: s.accuracy, seconds: s.seconds, errors: s.errors,
                        chars: s.chars, words: s.kills, keys: s.keys,
                        dif: tr('asedio.waveBanner', { n: s.wave }),
                        subtitle: tr('asedio.sub', { n: s.wave }),
                        extras: [
                            { label: tr('asedio.res-wave'), value: s.wave },
                            { label: tr('asedio.res-score'), value: s.score },
                            { label: tr('asedio.res-combo'), value: s.bestCombo }
                        ]
                    });
                }
            }
        });

        function enter() {
            bridge.enterMode('asedio', {
                restart: () => { bridge.showSection('asedio'); game.start(); },
                exit: () => game.destroy()
            });
            game.init();
            game.start();
        }

        startBtn.addEventListener('click', enter);
        $('asedio-pause-btn').addEventListener('click', () => game.togglePause());
        $('asedio-restart-btn').addEventListener('click', () => game.start());
        $('asedio-exit-btn').addEventListener('click', () => bridge.exitToLobby());

        window.ISpeedTypeAsedio = game;   // acceso público: .init() .start() .pause() .resume() .destroy()
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
