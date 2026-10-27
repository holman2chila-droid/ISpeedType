// ===== ISpeedType — Typing Speed Test App =====

(function () {
    'use strict';

    // Traducción: I18N.t(clave, variables). Definido en i18n/i18n.js
    const tr = (key, vars) => window.I18N.t(key, vars);

    // ===== DOM Elements =====
    const setupSection = document.getElementById('setup-section');
    const asedioSection = document.getElementById('asedio-section');
    const typingSection = document.getElementById('typing-section');
    const resultsSection = document.getElementById('results-section');

    const textInput = document.getElementById('text-input');
    const startBtn = document.getElementById('start-btn');

    const textDisplay = document.getElementById('text-display');
    const typingInput = document.getElementById('typing-input');
    const typingHint = document.getElementById('typing-hint');

    const countdownOverlay = document.getElementById('countdown-overlay');
    const countdownNumber = document.getElementById('countdown-number');
    const countdownLabel = document.getElementById('countdown-label');

    const wpmDisplay = document.getElementById('wpm-display');
    const accuracyDisplay = document.getElementById('accuracy-display');
    const timeDisplay = document.getElementById('time-display');
    const errorsDisplay = document.getElementById('errors-display');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    const restartBtn = document.getElementById('restart-btn');
    const newTextBtn = document.getElementById('new-text-btn');

    const resultWpm = document.getElementById('result-wpm');
    const resultAccuracy = document.getElementById('result-accuracy');
    const resultTime = document.getElementById('result-time');
    const resultErrors = document.getElementById('result-errors');
    const resultsRestartBtn = document.getElementById('results-restart-btn');
    const resultsNewBtn = document.getElementById('results-new-btn');

    // Theme elements
    const themeMenuEl = document.getElementById('theme-menu');
    const themeToggle = document.getElementById('theme-toggle');
    const themeDropdown = document.getElementById('theme-dropdown');
    const themeOptions = document.querySelectorAll('.theme-option');

    // Random text buttons
    const btnRandShort = document.getElementById('btn-rand-short');
    const btnRandNoAccent = document.getElementById('btn-rand-noaccent');
    const btnRandLearn = document.getElementById('btn-rand-learn');
    const btnRandPhilosophy = document.getElementById('btn-rand-philosophy');
    const btnRandRomance = document.getElementById('btn-rand-romance');
    const btnRandSayings = document.getElementById('btn-rand-sayings');
    const btnRandClassic = document.getElementById('btn-rand-classic');
    const btnRandLong = document.getElementById('btn-rand-long');

    // Lives Mode DOM elements
    const livesModeSwitch = document.getElementById('lives-mode-switch');
    const difficultyWrapper = document.getElementById('difficulty-wrapper');
    const diffButtons = document.querySelectorAll('#difficulty-wrapper .btn-diff');
    const statsBar = document.getElementById('stats-bar');
    const livesStatCard = document.getElementById('lives-stat-card');
    const livesCountDisplay = document.getElementById('lives-count');
    const livesHeartsDisplay = document.getElementById('lives-hearts');
    const resultsCard = document.querySelector('.results-card');
    const resultsTitle = document.querySelector('.results-title');
    const resultsSubtitle = document.querySelector('.results-subtitle');

    // Fade Mode DOM elements
    const fadeModeSwitch = document.getElementById('fade-mode-switch');
    const fadeSpeedWrapper = document.getElementById('fade-speed-wrapper');
    const speedButtons = document.querySelectorAll('.btn-speed');

    // Streak Combo DOM elements (siempre activo en partida)
    const comboStatCard = document.getElementById('combo-stat-card');
    const comboCountDisplay = document.getElementById('combo-count');
    const comboLabelDisplay = document.getElementById('combo-label');

    // Storm Mode DOM elements
    const stormModeSwitch = document.getElementById('storm-mode-switch');
    const stormDiffWrapper = document.getElementById('storm-diff-wrapper');
    const stormDiffButtons = document.querySelectorAll('.btn-storm-diff');

    // Dead Zone DOM elements
    const deadzoneModeSwitch = document.getElementById('deadzone-mode-switch');
    const deadzoneDiffWrapper = document.getElementById('deadzone-diff-wrapper');
    const deadzoneDiffButtons = document.querySelectorAll('.btn-deadzone-diff');
    const deadzoneBanner = document.getElementById('deadzone-banner');
    const deadzoneKeysDisplay = document.getElementById('deadzone-keys');

    // Anti-Cheat & Practice Mode DOM elements
    const anticheatWarning = document.getElementById('anticheat-warning');
    const anticheatWarningDesc = document.getElementById('anticheat-warning-desc');
    const btnPracticeStart = document.getElementById('btn-practice-start');
    const practiceModeBanner = document.getElementById('practice-mode-banner');

    // Achievement Modal & Toast DOM elements
    const achievementsToggle = document.getElementById('achievements-toggle');
    const achievementsBadgeCount = document.getElementById('achievements-badge-count');
    const achievementsModal = document.getElementById('achievements-modal');
    const achievementsClose = document.getElementById('achievements-close');
    const achievementsProgressScore = document.getElementById('achievements-progress-score');
    const achievementsBarFill = document.getElementById('achievements-bar-fill');
    const achievementsGrid = document.getElementById('achievements-grid');
    const achievementsReset = document.getElementById('achievements-reset');
    const achCatButtons = document.querySelectorAll('.ach-cat-btn');
    const achievementContainer = document.getElementById('achievement-container');
    // Tutor Mode DOM elements
    const tutorSection = document.getElementById('tutor-section');
    const btnTutorStart = document.getElementById('btn-tutor-start');
    const tutorExitBtn = document.getElementById('tutor-exit-btn');
    const tutorLevelLabel = document.getElementById('tutor-level-label');
    const tutorLevelBtns = document.querySelectorAll('.tutor-level-btn');
    const tutorTextDisplay = document.getElementById('tutor-text-display');
    const tutorProgressBar = document.getElementById('tutor-progress-bar');
    const tutorProgressText = document.getElementById('tutor-progress-text');
    const tutorRestartBtn = document.getElementById('tutor-restart-btn');
    const tutorNextBtn = document.getElementById('tutor-next-btn');
    const tutorKeys = document.querySelectorAll('.tutor-keyboard .kb-key');
    const tutorFingers = document.querySelectorAll('.tutor-hands .finger');

    // ===== State =====
    let isTutorMode = false;
    let tutorCurrentLevel = 1;
    let tutorUnlockedLevel = 1;
    let tutorText = '';
    let tutorCursor = 0;
    let tutorCharSpans = [];

    try {
        const savedUnlocked = localStorage.getItem('speedtype-tutor-unlocked');
        if (savedUnlocked) {
            tutorUnlockedLevel = parseInt(savedUnlocked, 10) || 1;
        }
    } catch (e) {
        console.warn('Error reading speedtype-tutor-unlocked:', e);
    }
    let originalText = '';
    let characters = [];       // Array of expected characters
    let charSpans = [];        // Cached span references
    let typedChars = [];       // Array of characters the user has typed

    // ===== Render incremental del texto (rendimiento con textos largos) =====
    // Antes, cada tecla repintaba TODAS las letras del texto (O(n)). Ahora se
    // recuerda el estado ya pintado de cada letra y solo se tocan las que cambian.
    const ST_PENDING = 0, ST_CORRECT = 1, ST_ERROR = 2, ST_CURRENT = 3;
    const STATE_CLASSES = ['char-pending', 'char-correct', 'char-error', 'char-current'];
    let charState = new Uint8Array(0); // Estado pintado de cada letra (ST_*)
    let renderedLen = 0;               // typedChars.length en el último pintado
    let dirtyFrom = Infinity;          // Índice más bajo de typedChars modificado desde el último pintado
    let errorCount = 0;                // Letras con error pintadas actualmente
    let consecCorrect = 0;             // Letras correctas seguidas desde el inicio (hasta el primer error)
    // Últimos valores escritos en la barra de stats (evita reescribir el DOM sin cambios)
    const lastStats = { wpm: null, accuracy: null, errors: null, progress: null, time: null };

    let totalKeystrokes = 0;   // Total characters typed (not backspaces)
    let correctKeystrokes = 0; // Correct characters typed
    let totalErrors = 0;       // Total incorrect keystrokes
    let startTime = null;
    let timerInterval = null;
    let isStarted = false;
    let isFinished = false;

    // Countdown state
    let isCountingDown = false;
    let countdownInterval = null;
    let countdownTimeout = null;

    // ===== Lives Mode State =====
    let isLivesMode = false;
    let maxLives = 5;
    let currentLives = 5;
    let isGameOver = false;

    // ===== Fade Mode State =====
    let isFadeMode = false;
    let fadeWpm = 40;               // Default: Medio
    let fadeIndex = 0;              // Next char index to fade out
    let fadeRafId = null;           // requestAnimationFrame ID
    let fadeAccumulator = 0;        // Accumulated time (ms) for fractional char progress
    let fadePrevTimestamp = null;   // Last rAF timestamp

    // ===== Streak Combo State (Siempre activo) =====
    let currentCombo = 0;
    let isOnFire = false;
    const FIRE_THRESHOLD = 30;

    // ===== Word Streak & User Statistics State (Gamificación) =====
    let currentWordStreak = 0;       // Racha de palabras correctas seguidas sin cometer errores
    let currentWordHadError = false; // Indica si la palabra en curso tuvo algún fallo
    let selectedAchievementCat = 'all';
    let isEligibleForAchievements = true; // Interruptor antitrampas: false si falla validación y juega en práctica

    // Cargar estadísticas guardadas del usuario
    let userStats = {
        testsCompleted: 0,
        maxWordStreak: 0,
        modesDone: {}          // modos especiales completados al menos una vez (logro Todoterreno)
    };

    try {
        const savedStats = localStorage.getItem('speedtype-user-stats');
        if (savedStats) {
            userStats = Object.assign(userStats, JSON.parse(savedStats));
        }
    } catch (err) {
        console.warn('Error reading speedtype-user-stats:', err);
    }
    // Limpieza: una racha de miles de palabras solo pudo salir de un pegado (ya bloqueado)
    if (!(userStats.maxWordStreak <= 3000)) userStats.maxWordStreak = 0;

    // ===== Estadísticas por tecla de la partida en curso: { letra: [pulsaciones, fallos] } =====
    let sessionKeys = {};

    // ===== Modo online (online.js): recibe cada pulsación para mandarla al servidor =====
    let onlineHook = null;     // { push(ch), pop(), finish(), cancel() } o null

    function trackKey(expectedChar, ok) {
        if (!expectedChar || expectedChar === ' ' || expectedChar === '\n') return;
        const k = expectedChar.toLowerCase();
        const entry = sessionKeys[k] || (sessionKeys[k] = [0, 0]);
        entry[0]++;
        if (!ok) entry[1]++;
    }

    // ===== Storm Mode State =====
    let isStormMode = false;
    let stormInterval = null;
    let stormIntervalMs = 4000;         // Milisegundos entre cada impacto de tormenta
    let stormCharCount = 2;             // Cantidad de letras transformadas por impacto
    let scrambledPositions = new Set(); // Conjunto de índices que han sido transformados

    // ===== Dead Zone State =====
    let isDeadzoneMode = false;
    let deadKeysCount = 3;              // Cantidad de teclas rotas a sortear (2 a 5)
    let deadKeys = [];                  // Teclas rotas asignadas para la partida

    // ===== Theme State =====
    let currentTheme = localStorage.getItem('speedtype-theme') || 'dark';

    // ===== Initialize =====
    function init() {
        // Logo (icono + texto): lleva al lobby. En juego usa el historial; en el lobby sube al inicio.
        const logoHome = document.getElementById('logo-home');
        if (logoHome) {
            const irAlInicio = () => {
                if (modoJuegoActivo) volverAlLobby();
                else window.scrollTo({ top: 0, behavior: 'smooth' });
            };
            logoHome.addEventListener('click', irAlInicio);
            logoHome.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    irAlInicio();
                }
            });
        }

        // Pie de página: accesos rápidos a las secciones del producto
        document.querySelectorAll('[data-footer-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const accion = btn.dataset.footerAction;
                if (accion === 'modos') {
                    setupSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else if (accion === 'aprendizaje' && btnTutorStart) {
                    btnTutorStart.click();
                } else if (accion === 'logros') {
                    const b = document.getElementById('achievements-toggle');
                    if (b) b.click();
                } else if (accion === 'estadisticas') {
                    const b = document.getElementById('stats-toggle');
                    if (b) b.click();
                }
            });
        });

        // La página siempre arranca en el lobby: se limpia cualquier estado/ruta de juego (p. ej. tras recargar en #lobby/vidas)
        try {
            history.replaceState(null, '', location.pathname + location.search + '#lobby');
        } catch (e) { /* historial no disponible */ }

        // Apply saved theme
        applyTheme(currentTheme);

        // Ensure start button is active
        startBtn.disabled = false;

        // --- Theme menu events ---
        themeToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            themeDropdown.classList.toggle('hidden');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!themeMenuEl.contains(e.target)) {
                themeDropdown.classList.add('hidden');
            }
        });

        // Theme option buttons
        themeOptions.forEach(btn => {
            btn.addEventListener('click', () => {
                applyTheme(btn.dataset.theme);
                themeDropdown.classList.add('hidden');
            });
        });

        // --- Setup events ---
        textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleStartAttempt();
            }
        });

        textInput.addEventListener('input', () => {
            hideAntiCheatWarning();
        });

        startBtn.addEventListener('click', () => {
            handleStartAttempt();
        });

        if (btnPracticeStart) {
            btnPracticeStart.addEventListener('click', () => {
                handleStartAttempt(true);
            });
        }

        // --- Random Texts events ---
        function setRandomText(type) {
            hideAntiCheatWarning();
            const textsArray = textBank()[type];
            if (textsArray && textsArray.length > 0) {
                const randomIndex = Math.floor(Math.random() * textsArray.length);
                textInput.value = textsArray[randomIndex];
            }
        }

        btnRandShort.addEventListener('click', () => setRandomText('short'));
        btnRandNoAccent.addEventListener('click', () => setRandomText('noaccent'));
        if (btnRandLearn) btnRandLearn.addEventListener('click', () => setRandomText('learn'));
        if (btnRandPhilosophy) btnRandPhilosophy.addEventListener('click', () => setRandomText('philosophy'));
        if (btnRandRomance) btnRandRomance.addEventListener('click', () => setRandomText('romance'));
        if (btnRandSayings) btnRandSayings.addEventListener('click', () => setRandomText('sayings'));
        btnRandClassic.addEventListener('click', () => setRandomText('classic'));
        btnRandLong.addEventListener('click', () => setRandomText('long'));

        // --- Typing events ---
        // Anti-pegado: no se puede pegar, soltar ni cortar texto en la prueba
        ['paste', 'drop', 'cut'].forEach(ev => typingInput.addEventListener(ev, (e) => {
            e.preventDefault();
            notifyPasteBlocked();
        }));
        typingInput.addEventListener('beforeinput', (e) => {
            if (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop' || e.inputType === 'insertFromYank') {
                e.preventDefault();
                notifyPasteBlocked();
            }
        });
        typingInput.addEventListener('input', handleInput);
        typingInput.addEventListener('keydown', handleKeydown);

        // --- Controls ---
        restartBtn.addEventListener('click', restartTest);
        newTextBtn.addEventListener('click', volverAlLobby);
        resultsRestartBtn.addEventListener('click', () => {
            // Modos externos (Asedio) se reinician a sí mismos; el resto usa el reinicio normal
            if (externalMode && externalHandlers && externalHandlers.restart) externalHandlers.restart();
            else restartTest();
        });
        resultsNewBtn.addEventListener('click', volverAlLobby);

        // Click text display to focus input
        textDisplay.addEventListener('click', () => {
            if (!isCountingDown && !typingInput.disabled) {
                typingInput.focus();
            }
        });

        // --- Exclusividad de Modos de Juego (Solo uno activo a la vez) ---
        function setExclusiveMode(modeName, isChecked) {
            // Apagar todos los modos
            isLivesMode = false;
            isFadeMode = false;
            isStormMode = false;
            isDeadzoneMode = false;

            // Desmarcar otros switches y ocultar sus selectores si no es el modo actual
            if (modeName !== 'lives') {
                if (livesModeSwitch) livesModeSwitch.checked = false;
                if (difficultyWrapper) difficultyWrapper.classList.add('hidden');
            }
            if (modeName !== 'fade') {
                if (fadeModeSwitch) fadeModeSwitch.checked = false;
                if (fadeSpeedWrapper) fadeSpeedWrapper.classList.add('hidden');
            }
            if (modeName !== 'storm') {
                if (stormModeSwitch) stormModeSwitch.checked = false;
                if (stormDiffWrapper) stormDiffWrapper.classList.add('hidden');
            }
            if (modeName !== 'deadzone') {
                if (deadzoneModeSwitch) deadzoneModeSwitch.checked = false;
                if (deadzoneDiffWrapper) deadzoneDiffWrapper.classList.add('hidden');
            }

            // Activar el modo seleccionado si fue marcado, o esconder su propio selector si se apagó
            if (isChecked) {
                if (modeName === 'lives') {
                    isLivesMode = true;
                    if (difficultyWrapper) difficultyWrapper.classList.remove('hidden');
                } else if (modeName === 'fade') {
                    isFadeMode = true;
                    if (fadeSpeedWrapper) fadeSpeedWrapper.classList.remove('hidden');
                } else if (modeName === 'storm') {
                    isStormMode = true;
                    if (stormDiffWrapper) stormDiffWrapper.classList.remove('hidden');
                } else if (modeName === 'deadzone') {
                    isDeadzoneMode = true;
                    if (deadzoneDiffWrapper) deadzoneDiffWrapper.classList.remove('hidden');
                }
            } else {
                // Si el switch del propio modo se apagó, esconder su selector
                if (modeName === 'lives' && difficultyWrapper) {
                    difficultyWrapper.classList.add('hidden');
                } else if (modeName === 'fade' && fadeSpeedWrapper) {
                    fadeSpeedWrapper.classList.add('hidden');
                } else if (modeName === 'storm' && stormDiffWrapper) {
                    stormDiffWrapper.classList.add('hidden');
                } else if (modeName === 'deadzone' && deadzoneDiffWrapper) {
                    deadzoneDiffWrapper.classList.add('hidden');
                }
            }
        }

        // Listeners de los switches con exclusividad mutua
        if (livesModeSwitch) {
            livesModeSwitch.addEventListener('change', (e) => setExclusiveMode('lives', e.target.checked));
        }

        diffButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                diffButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                maxLives = parseInt(btn.dataset.lives, 10);
                currentLives = maxLives;
            });
        });

        if (fadeModeSwitch) {
            fadeModeSwitch.addEventListener('change', (e) => setExclusiveMode('fade', e.target.checked));
        }

        speedButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                speedButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                fadeWpm = parseInt(btn.dataset.wpm, 10);
            });
        });

        if (stormModeSwitch) {
            stormModeSwitch.addEventListener('change', (e) => setExclusiveMode('storm', e.target.checked));
        }

        stormDiffButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                stormDiffButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                stormIntervalMs = parseInt(btn.dataset.interval, 10) || 4000;
                stormCharCount = parseInt(btn.dataset.count, 10) || 2;
            });
        });

        if (deadzoneModeSwitch) {
            deadzoneModeSwitch.addEventListener('change', (e) => setExclusiveMode('deadzone', e.target.checked));
        }

        deadzoneDiffButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                deadzoneDiffButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                deadKeysCount = parseInt(btn.dataset.keys, 10) || 3;
            });
        });

        // --- Sistema de Logros: Inicialización & Eventos de Modal ---
        loadAchievementsFromStorage();
        updateAchievementsBadge();
        if (achievementsReset) achievementsReset.addEventListener('click', resetAchievements);

        if (achievementsToggle) {
            achievementsToggle.addEventListener('click', () => {
                renderAchievementsGrid();
                updateAchievementsBadge();
                if (achievementsModal) achievementsModal.classList.remove('hidden');
            });
        }

        if (achievementsClose) {
            achievementsClose.addEventListener('click', () => {
                if (achievementsModal) achievementsModal.classList.add('hidden');
            });
        }

        if (achievementsModal) {
            achievementsModal.addEventListener('click', (e) => {
                if (e.target === achievementsModal) {
                    achievementsModal.classList.add('hidden');
                }
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && achievementsModal && !achievementsModal.classList.contains('hidden')) {
                achievementsModal.classList.add('hidden');
            }
        });

        achCatButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                achCatButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedAchievementCat = btn.dataset.category || 'all';
                renderAchievementsGrid();
            });
        });

        // --- Modo Aprendizaje (Tutor) Eventos ---
        if (btnTutorStart) {
            btnTutorStart.addEventListener('click', enterTutorMode);
        }

        if (tutorExitBtn) {
            tutorExitBtn.addEventListener('click', volverAlLobby);
        }

        if (tutorRestartBtn) {
            tutorRestartBtn.addEventListener('click', () => loadTutorLevel(tutorCurrentLevel));
        }

        if (tutorNextBtn) {
            tutorNextBtn.addEventListener('click', () => {
                if (tutorCurrentLevel < TUTOR_LESSONS.length) {
                    loadTutorLevel(tutorCurrentLevel + 1);
                } else {
                    loadTutorLevel(1);
                }
            });
        }

        tutorLevelBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const lvl = parseInt(btn.dataset.level, 10);
                loadTutorLevel(lvl);
            });
        });

        window.addEventListener('keydown', handleTutorKeydown);
    }

    // ===== Pick random text across ALL available categories =====
    function getRandomTextFromAll() {
        const bank = textBank();
        const allCategories = Object.keys(bank);
        const randomCat = allCategories[Math.floor(Math.random() * allCategories.length)];
        const categoryArray = bank[randomCat];
        return categoryArray[Math.floor(Math.random() * categoryArray.length)];
    }

    // ===== Word Helpers for Word-by-Word typing =====
    function getCurrentWordTyped() {
        let lastSpaceIndex = -1;
        for (let i = typedChars.length - 1; i >= 0; i--) {
            if (i < characters.length && characters[i] === ' ') {
                lastSpaceIndex = i;
                break;
            }
        }
        return typedChars.slice(lastSpaceIndex + 1).join('');
    }

    function getTargetWord() {
        const cursorIndex = typedChars.length;
        if (cursorIndex >= characters.length) return '';

        if (characters[cursorIndex] === ' ') {
            return '[Espacio]';
        }

        let start = cursorIndex;
        while (start > 0 && characters[start - 1] !== ' ') {
            start--;
        }

        let end = cursorIndex;
        while (end < characters.length && characters[end] !== ' ') {
            end++;
        }

        return characters.slice(start, end).join('');
    }

    function syncInputBox() {
        const currentWordTyped = getCurrentWordTyped();
        typingInput.value = currentWordTyped;

        const target = getTargetWord();
        const cursorIndex = typedChars.length;
        const nextChar = cursorIndex < characters.length ? characters[cursorIndex] : null;

        if (typedChars.length >= characters.length) {
            typingInput.placeholder = tr('ph.done');
        } else if (isDeadzoneMode && isDeadKeyChar(nextChar)) {
            typingInput.placeholder = tr('ph.deadkey');
        } else if (target === '[Espacio]') {
            typingInput.placeholder = tr('ph.space');
        } else if (target) {
            typingInput.placeholder = tr('ph.type', { w: target });
        } else {
            typingInput.placeholder = tr('ph.start');
        }
    }

    // Banco de textos según el idioma activo (texts.js = español, texts-en.js = inglés)
    function textBank() {
        if (window.I18N.lang === 'en' && typeof typingTextsEn !== 'undefined') return typingTextsEn;
        return typingTexts;
    }

    // ===== Theme =====
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        currentTheme = theme;
        localStorage.setItem('speedtype-theme', theme);

        // Update active state in dropdown
        themeOptions.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
    }

    // ===== ANTI-CHEAT & CUSTOM TEXT VALIDATION =====
    function checkIfSystemText(text) {
        if (!text) return false;
        const normalized = text.trim();
        // Un texto predefinido cuenta como "del sistema" en cualquiera de los dos idiomas
        const banks = [];
        if (typeof typingTexts !== 'undefined') banks.push(typingTexts);
        if (typeof typingTextsEn !== 'undefined') banks.push(typingTextsEn);
        for (const bank of banks) {
            for (const cat in bank) {
                if (bank[cat] && bank[cat].some(t => t.trim() === normalized)) {
                    return true;
                }
            }
        }
        return false;
    }

    function validateCustomText(text) {
        if (!text || typeof text !== 'string') {
            return { isValid: false, reason: tr('ac.empty') };
        }

        // Limpieza de espacios dobles y saltos de línea innecesarios
        const cleanText = text.trim().replace(/\s+/g, ' ');
        if (cleanText.length === 0) {
            return { isValid: false, reason: tr('ac.empty') };
        }

        const words = cleanText.split(' ').filter(w => w.length > 0);
        const totalWords = words.length;

        if (totalWords < 3) {
            return { isValid: false, reason: tr('ac.min3') };
        }

        // Filtro 1: Longitud Mínima de Palabras Únicas (Diversidad Léxica >= 40% si totalWords > 10)
        const normalizedWords = words.map(w =>
            w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
        ).filter(Boolean);

        const uniqueWords = new Set(normalizedWords).size;
        const lexicalDiversity = (uniqueWords / totalWords) * 100;

        if (totalWords > 10 && lexicalDiversity < 40) {
            return {
                isValid: false,
                reason: tr('ac.diversity', { pct: Math.round(lexicalDiversity) })
            };
        }

        // Filtro 2: Patrones Repetitivos de Caracteres (El truco "aaaaa")
        const repetitiveRegex = /(.)\1{3,}/i;
        for (const word of words) {
            if (repetitiveRegex.test(word)) {
                return {
                    isValid: false,
                    reason: tr('ac.repeat', { w: word })
                };
            }
        }

        // Filtro 3: Longitud Promedio de las Palabras (2.5 a 15 caracteres)
        const totalLetters = words.reduce((acc, w) => acc + w.length, 0);
        const avgWordLength = totalLetters / totalWords;

        if (avgWordLength < 2.5) {
            return {
                isValid: false,
                reason: tr('ac.short', { avg: avgWordLength.toFixed(1) })
            };
        }

        if (avgWordLength > 15) {
            return {
                isValid: false,
                reason: tr('ac.long', { avg: avgWordLength.toFixed(1) })
            };
        }

        return { isValid: true, reason: null };
    }

    function checkAntiCheat(text) {
        return validateCustomText(text).isValid;
    }

    function showAntiCheatWarning(reason) {
        if (textInput) {
            textInput.classList.remove('shake-error', 'has-anticheat-error');
            void textInput.offsetWidth; // Force CSS reflow to re-trigger shake animation
            textInput.classList.add('shake-error', 'has-anticheat-error');
        }
        if (startBtn) {
            startBtn.classList.remove('shake-error');
            void startBtn.offsetWidth;
            startBtn.classList.add('shake-error');
        }
        if (anticheatWarningDesc) {
            anticheatWarningDesc.textContent = reason || tr('ui.anticheat-warning-desc');
        }
        if (anticheatWarning) {
            anticheatWarning.classList.remove('hidden', 'shake-error');
            void anticheatWarning.offsetWidth;
            anticheatWarning.classList.add('shake-error');
        }
    }

    function hideAntiCheatWarning() {
        if (textInput) {
            textInput.classList.remove('has-anticheat-error', 'shake-error');
        }
        if (startBtn) {
            startBtn.classList.remove('shake-error');
        }
        if (anticheatWarning) {
            anticheatWarning.classList.remove('shake-error');
            anticheatWarning.classList.add('hidden');
        }
    }

    function handleStartAttempt(forcePractice = false) {
        const rawText = textInput.value.trim();

        // 1. Si el textarea está vacío, cargar texto aleatorio del sistema
        if (rawText.length === 0) {
            textInput.value = getRandomTextFromAll();
            isEligibleForAchievements = true;
            hideAntiCheatWarning();
            startTest();
            return;
        }

        // 2. Si el texto coincide con una categoría del sistema
        const isSystemText = checkIfSystemText(rawText);

        if (isSystemText) {
            isEligibleForAchievements = true;
            hideAntiCheatWarning();
            startTest();
            return;
        }

        // 3. Si el usuario pulsó expresamente "Modo Práctica"
        if (forcePractice) {
            isEligibleForAchievements = false;
            hideAntiCheatWarning();
            startTest();
            return;
        }

        // 4. Validar texto personalizado contra filtros antitrampas
        const validation = validateCustomText(rawText);

        if (validation.isValid) {
            isEligibleForAchievements = true;
            hideAntiCheatWarning();
            startTest();
        } else {
            // Rechazar y mostrar retroalimentación estética con vibración/shake sin spam de toasts de logros
            showAntiCheatWarning(validation.reason);
        }
    }

    // ===== Start Test =====
    function startTest() {
        // If text is empty, pick a random text from all categories
        if (textInput.value.trim().length === 0) {
            textInput.value = getRandomTextFromAll();
            isEligibleForAchievements = true;
        }

        originalText = textInput.value.trimEnd();
        characters = originalText.split('');
        typedChars = [];
        consecCorrect = 0;
        totalKeystrokes = 0;
        correctKeystrokes = 0;
        totalErrors = 0;
        startTime = null;
        isStarted = false;
        isFinished = false;
        isGameOver = false;
        currentWordHadError = false;

        // Reset lives for this round
        currentLives = maxLives;
        sessionKeys = {};

        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        clearCountdown();
        stopFadeLoop();

        // Build the character display & reset stats
        renderTextDisplay();
        updateStats();
        syncInputBox();

        // Configure survival mode atmosphere & lives stat card
        if (isLivesMode) {
            document.body.classList.add('survival-active');
            livesStatCard.classList.remove('hidden');
            statsBar.classList.add('has-lives');
            updateLivesUI();
        } else {
            document.body.classList.remove('survival-active');
            livesStatCard.classList.add('hidden');
            statsBar.classList.remove('has-lives');
        }

        // Configure Fade Mode atmosphere
        if (isFadeMode) {
            document.body.classList.add('fade-active');
        } else {
            document.body.classList.remove('fade-active');
        }

        // Configure Practice Mode Atmosphere (Anti-Cheat)
        if (!isEligibleForAchievements) {
            document.body.classList.add('practice-active');
            if (practiceModeBanner) practiceModeBanner.classList.remove('hidden');
        } else {
            document.body.classList.remove('practice-active');
            if (practiceModeBanner) practiceModeBanner.classList.add('hidden');
        }

        // Configure Streak Combo (Siempre activo)
        currentCombo = 0;
        deactivateFire();
        updateComboUI();
        if (comboStatCard) {
            comboStatCard.classList.remove('hidden');
        }

        // Configure Storm Mode
        clearStorm();
        if (isStormMode) {
            document.body.classList.add('storm-active');
        } else {
            document.body.classList.remove('storm-active');
        }

        // Configure Dead Zone
        clearDeadzone();
        if (isDeadzoneMode) {
            pickDeadKeys();
            document.body.classList.add('deadzone-active');
            if (deadzoneBanner) deadzoneBanner.classList.remove('hidden');
        } else {
            document.body.classList.remove('deadzone-active');
            if (deadzoneBanner) deadzoneBanner.classList.add('hidden');
        }

        // Switch to typing view
        showSection('typing');
        typingInput.classList.remove('has-error');
        typingInput.classList.remove('damage-hit');
        typingInput.disabled = true;

        // Start 3-second animated countdown
        startCountdown(() => {
            typingInput.disabled = false;
            typingInput.focus();
        });
    }

    // ===== Lives Mode Helpers =====
    function updateLivesUI() {
        if (!isLivesMode) return;
        livesCountDisplay.textContent = currentLives;

        // Temas inmersivos: avisan de las vidas que quedan (el tema compara con la vez anterior).
        const T = window.ImmersiveThemes;
        if (T && T.active) T.emit('life', currentLives, maxLives);

        if (maxLives === 1) {
            livesHeartsDisplay.textContent = currentLives === 1 ? '💀' : '☠️';
        } else {
            livesHeartsDisplay.textContent = '❤️'.repeat(Math.max(0, currentLives)) + '🖤'.repeat(Math.max(0, maxLives - currentLives));
        }
    }

    // ===== 3s Countdown =====
    function startCountdown(callback) {
        isCountingDown = true;
        countdownOverlay.classList.remove('hidden');

        function triggerPulse(numText, labelText) {
            countdownNumber.textContent = numText;
            countdownLabel.textContent = labelText;
            countdownNumber.classList.remove('pulse');
            void countdownNumber.offsetWidth; // Force CSS reflow to re-trigger animation
            countdownNumber.classList.add('pulse');
        }

        let currentCount = 3;
        triggerPulse('3', tr('cd.ready'));

        countdownInterval = setInterval(() => {
            currentCount--;
            if (currentCount === 2) {
                triggerPulse('2', tr('cd.set'));
            } else if (currentCount === 1) {
                triggerPulse('1', tr('cd.type'));
            } else if (currentCount === 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;
                triggerPulse(tr('cd.go'), tr('cd.goLabel'));

                countdownTimeout = setTimeout(() => {
                    countdownOverlay.classList.add('hidden');
                    isCountingDown = false;
                    if (typeof callback === 'function') {
                        callback();
                    }
                }, 500);
            }
        }, 1000);
    }

    function clearCountdown() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        if (countdownTimeout) {
            clearTimeout(countdownTimeout);
            countdownTimeout = null;
        }
        isCountingDown = false;
        if (countdownOverlay) {
            countdownOverlay.classList.add('hidden');
        }
    }

    // ===== Render Text Display (con ventana deslizante) =====
    // RENDIMIENTO con textos larguísimos: antes se creaba UN <span> por letra de
    // todo el texto (200 000 letras = 430 000 nodos, ~1 GB de memoria). Cada cambio
    // (p. ej. activar/quitar la racha verde) obligaba al navegador a recalcular
    // estilos y layout de TODOS esos nodos => lagazos.
    // Ahora el texto se divide en "chunks" de ~400 letras y solo se mantienen en el
    // DOM los que rodean al cursor (unos pocos miles de letras). Lo demás vive solo
    // en los arreglos `characters` / `charState` / `typedChars`, que son baratos.
    // Textos cortos (<= ~4 000 letras) se montan completos, igual que antes.
    const CHUNK_CHARS = 400;   // tamaño aproximado de cada chunk (corta en un espacio)
    const WIN_BEHIND = 2;      // chunks que se conservan detrás del cursor
    const WIN_AHEAD = 4;       // chunks que se montan por delante del cursor
    const WIN_SLACK = 2;       // histéresis: no se desmonta hasta pasarse por esto
    let chunkStarts = [0];     // índice de la primera letra de cada chunk (+ total al final)
    let chunkEls = [];         // wrapper DOM de cada chunk montado (undefined si no)
    let mStart = 0, mEnd = 0;  // chunks montados: [mStart, mEnd)
    let isWindowed = false;

    function renderTextDisplay() {
        textDisplay.innerHTML = '';
        charSpans = new Array(characters.length);
        scrambledPositions.clear(); // la tormenta anterior no debe "pintar" este texto

        // Reiniciar el estado del render incremental y la caché de stats
        charState = new Uint8Array(characters.length);
        if (characters.length > 0) charState[0] = ST_CURRENT;
        renderedLen = 0;
        dirtyFrom = Infinity;
        errorCount = 0;
        lastStats.wpm = lastStats.accuracy = lastStats.errors = lastStats.progress = lastStats.time = null;

        // Partir el texto en chunks que terminan justo después de un espacio
        // (así ninguna palabra queda cortada entre dos chunks).
        chunkStarts = [0];
        let sinceCut = 0;
        for (let i = 0; i < characters.length; i++) {
            sinceCut++;
            if (sinceCut >= CHUNK_CHARS && characters[i] === ' ' && i + 1 < characters.length) {
                chunkStarts.push(i + 1);
                sinceCut = 0;
            }
        }
        chunkStarts.push(characters.length);

        chunkEls = new Array(chunkStarts.length - 1);
        mStart = mEnd = 0;
        isWindowed = (chunkStarts.length - 1) > (WIN_BEHIND + WIN_AHEAD + 2 * WIN_SLACK + 1);
        textDisplay.classList.toggle('windowed', isWindowed);
        textDisplay.scrollTop = 0;

        syncWindow(0);
    }

    // Construye el DOM de un chunk respetando el estado actual de cada letra
    // (correcta / error / pendiente / cursor / desvanecida / tormenta).
    function buildChunk(k) {
        const start = chunkStarts[k];
        const end = chunkStarts[k + 1];
        const typedLen = typedChars.length;
        const fadeActive = isFadeMode && isStarted;

        const wrap = document.createElement('span');
        wrap.className = 'chunk'; // display: contents (ver CSS): no altera el flujo del texto
        let currentWord = document.createElement('span');
        currentWord.className = 'word';

        for (let i = start; i < end; i++) {
            const char = characters[i];
            const state = charState[i];
            const span = document.createElement('span');

            let shown = char;
            if (state === ST_ERROR && i < typedLen) {
                const typed = typedChars[i];
                shown = typed === ' ' ? '·' : typed;
            }
            span.textContent = shown;

            let cls = 'char ' + STATE_CLASSES[state];
            if (char === ' ') cls += ' char-space';
            if (scrambledPositions.has(i)) cls += ' char-scrambled';
            if (fadeActive) {
                if (i < fadeIndex) cls += ' char-faded';
                else if (i === fadeIndex && fadeIndex > 0) cls += ' char-ghost-front';
            }
            span.className = cls;

            if (char === ' ') {
                if (currentWord.firstChild) {
                    wrap.appendChild(currentWord);
                    currentWord = document.createElement('span');
                    currentWord.className = 'word';
                }
                wrap.appendChild(span);
            } else {
                currentWord.appendChild(span);
            }

            charSpans[i] = span;
        }

        if (currentWord.firstChild) wrap.appendChild(currentWord);
        chunkEls[k] = wrap;
        return wrap;
    }

    function unmountChunk(k) {
        const el = chunkEls[k];
        if (el) {
            el.remove();
            chunkEls[k] = undefined;
        }
        const end = chunkStarts[k + 1];
        for (let i = chunkStarts[k]; i < end; i++) charSpans[i] = undefined;
    }

    // Índice del chunk que contiene la letra `idx` (búsqueda binaria)
    function chunkOf(idx) {
        let lo = 0, hi = chunkStarts.length - 2;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (chunkStarts[mid] <= idx) lo = mid; else hi = mid - 1;
        }
        return lo;
    }

    // Mantiene montados solo los chunks cercanos al cursor.
    function syncWindow(cursor) {
        const n = chunkStarts.length - 1;
        if (n <= 0) return;

        const c = chunkOf(Math.min(cursor, characters.length - 1));
        const lo = isWindowed ? Math.max(0, c - WIN_BEHIND) : 0;
        const hi = isWindowed ? Math.min(n - 1, c + WIN_AHEAD) : n - 1;

        // ¿Cambia lo que hay arriba del cursor? Entonces el contenido se desplaza
        // y hay que compensar el scroll para que el cursor no "salte".
        const topChanges = mEnd > mStart && (mStart < lo - WIN_SLACK || mStart > lo);
        const anchor = topChanges ? charSpans[cursor] : null;
        const anchorTop = anchor ? anchor.getBoundingClientRect().top : 0;

        // Desmontar lo que quedó lejos (con histéresis para no repetir montajes)
        while (mEnd > mStart && mStart < lo - WIN_SLACK) unmountChunk(mStart++);
        while (mEnd > mStart && mEnd - 1 > hi + WIN_SLACK) unmountChunk(--mEnd);
        if (mEnd <= mStart) mStart = mEnd = lo;

        // Montar lo que falta, antes y después
        while (mStart > lo) {
            mStart--;
            textDisplay.insertBefore(buildChunk(mStart), textDisplay.firstChild);
        }
        if (mEnd <= hi) {
            const frag = document.createDocumentFragment();
            while (mEnd <= hi) frag.appendChild(buildChunk(mEnd++));
            textDisplay.appendChild(frag);
        }

        if (anchor && charSpans[cursor] === anchor) {
            textDisplay.scrollTop += anchor.getBoundingClientRect().top - anchorTop;
        }
    }

    // ===== Registro de cambios en typedChars (para el render incremental) =====
    // También mantiene `consecCorrect` (largo del prefijo correcto) al día en O(1),
    // en vez de recorrer todo el texto escrito en cada tecla y cada 100 ms.
    function pushTyped(ch) {
        const idx = typedChars.length;
        if (idx < dirtyFrom) dirtyFrom = idx;
        if (consecCorrect === idx && ch === characters[idx]) consecCorrect++;
        typedChars.push(ch);
        if (onlineHook) onlineHook.push(ch);
    }

    function popTyped() {
        if (onlineHook && typedChars.length > 0) onlineHook.pop();
        typedChars.pop();
        const len = typedChars.length;
        if (len < dirtyFrom) dirtyFrom = len;
        if (consecCorrect > len) consecCorrect = len;
    }

    // ===== Handle Input (character typed) =====
    // Aviso breve (en el placeholder) cuando se intenta pegar texto
    let pasteNoticeTimer = null;
    function notifyPasteBlocked() {
        typingInput.classList.remove('shake-error');
        void typingInput.offsetWidth;
        typingInput.classList.add('shake-error');
        typingInput.placeholder = tr('paste.blocked');
        clearTimeout(pasteNoticeTimer);
        pasteNoticeTimer = setTimeout(() => { typingInput.classList.remove('shake-error'); syncInputBox(); }, 1800);
    }

    function handleInput(e) {
        if (isTutorMode || isFinished || isCountingDown || isGameOver) return;

        // Start timer on first keypress
        if (!isStarted) {
            isStarted = true;
            startTime = Date.now();
            timerInterval = setInterval(updateTimer, 100);

            // Kick off fade loop on first keypress
            if (isFadeMode) {
                startFadeLoop();
            }

            // Kick off storm loop on first keypress
            if (isStormMode) {
                startStormLoop();
            }
        }

        const prevWord = getCurrentWordTyped();
        const inputVal = typingInput.value;

        // Red de seguridad: si de golpe entran varios caracteres (pegado por otra vía,
        // arrastre, autocompletado raro) se descarta; el teclado real mete 1-2 como máximo.
        if (inputVal.length - prevWord.length > 2) {
            typingInput.value = prevWord;
            notifyPasteBlocked();
            return;
        }

        if (inputVal.length > prevWord.length) {
            // New character(s) typed or pasted
            const newChars = inputVal.slice(prevWord.length);
            for (const char of newChars) {
                if (typedChars.length >= characters.length) break;

                const expectedChar = characters[typedChars.length];
                const isDeadKey = isDeadKeyChar(expectedChar);

                if (isDeadKey) {
                    // In Dead Zone: only [Space] skips the broken key
                    if (char === ' ') {
                        pushTyped(expectedChar); // Mark as correctly resolved
                        totalKeystrokes++;
                        correctKeystrokes++;
                        currentCombo++;
                        if (currentCombo >= FIRE_THRESHOLD && !isOnFire) {
                            activateFire();
                        }

                        // Si el carácter esperado era un espacio y no hubo errores en la palabra
                        if (expectedChar === ' ') {
                            if (!currentWordHadError) {
                                currentWordStreak++;
                                userStats.maxWordStreak = Math.max(userStats.maxWordStreak, currentWordStreak);
                                saveUserStats();
                                checkStreakAchievements();
                            }
                            currentWordHadError = false;
                        }
                    } else {
                        // Any other key (including pressing the broken key itself) is an ERROR!
                        pushTyped(char === expectedChar ? '•' : char);
                        totalKeystrokes++;
                        totalErrors++;
                        currentCombo = 0;
                        currentWordHadError = true;
                        currentWordStreak = 0;
                        if (isOnFire) {
                            deactivateFire();
                        }
                        if (isLivesMode) {
                            currentLives--;
                            updateLivesUI();
                            typingInput.classList.remove('damage-hit');
                            void typingInput.offsetWidth; // Force reflow to re-trigger animation
                            typingInput.classList.add('damage-hit');
                            if (currentLives <= 0) {
                                syncInputBox();
                                updateDisplay();
                                updateStats();
                                updateComboUI();
                                triggerGameOver();
                                return;
                            }
                        }
                    }
                } else {
                    // Normal key comparison
                    pushTyped(char);
                    totalKeystrokes++;
                    trackKey(expectedChar, char === expectedChar);

                    if (char === expectedChar) {
                        correctKeystrokes++;
                        currentCombo++;
                        if (currentCombo >= FIRE_THRESHOLD && !isOnFire) {
                            activateFire();
                        }

                        // Si se completó una palabra al pulsar espacio con éxito
                        if (expectedChar === ' ') {
                            if (!currentWordHadError) {
                                currentWordStreak++;
                                userStats.maxWordStreak = Math.max(userStats.maxWordStreak, currentWordStreak);
                                saveUserStats();
                                checkStreakAchievements();
                            }
                            currentWordHadError = false;
                        }
                    } else {
                        totalErrors++;
                        currentCombo = 0;
                        currentWordHadError = true;
                        currentWordStreak = 0;
                        if (isOnFire) {
                            deactivateFire();
                        }

                        // ===== LIVES MODE: Deduct a life on each error =====
                        if (isLivesMode) {
                            currentLives--;
                            updateLivesUI();

                            // Damage hit visual feedback
                            typingInput.classList.remove('damage-hit');
                            void typingInput.offsetWidth; // Force reflow to re-trigger animation
                            typingInput.classList.add('damage-hit');

                            // Game Over if no lives left
                            if (currentLives <= 0) {
                                syncInputBox();
                                updateDisplay();
                                updateStats();
                                updateComboUI();
                                triggerGameOver();
                                return;
                            }
                        }
                    }
                }
                updateComboUI();
                fxKey();
            }
        } else if (inputVal.length < prevWord.length) {
            // Deletion via mobile/IME input event
            const diff = prevWord.length - inputVal.length;
            for (let i = 0; i < diff; i++) {
                if (typedChars.length > 0) {
                    popTyped();
                }
            }
        }

        // Sync input box value & placeholder
        syncInputBox();

        // Update display and stats
        updateDisplay();
        updateStats();
        scrollToCurrent();

        // Check collision in Fade Mode immediately if user is behind or left errors behind
        if (isFadeMode && isStarted) {
            const consecutiveCorrect = getConsecutiveCorrect();
            if (fadeIndex > consecutiveCorrect) {
                triggerGhostOver();
                return;
            }
        }

        // Check if test is complete
        checkCompletion();
    }

    // ===== Handle Keydown (Backspace, Tab) =====
    function handleKeydown(e) {
        if (isTutorMode || isFinished || isCountingDown || isGameOver) return;

        if (e.key === 'Backspace') {
            e.preventDefault();
            if (typedChars.length > 0) {
                // In Fade Mode: cannot backspace into characters that have already vanished
                if (isFadeMode && typedChars.length <= fadeIndex) {
                    triggerGhostOver();
                    return;
                }
                popTyped();
                syncInputBox();
                updateDisplay();
                updateStats();
                scrollToCurrent();
            }
        }

        // Prevent Tab from leaving
        if (e.key === 'Tab') {
            e.preventDefault();
        }
    }

    // ===== Update Display =====
    // Render INCREMENTAL: solo se revisan las letras que pudieron cambiar desde el
    // último pintado (la zona entre el cursor anterior y el nuevo). El costo por
    // tecla ya no depende del largo del texto.
    // La racha (verde) NO se aplica letra por letra: la maneja la clase `on-fire`
    // del contenedor (ver activateFire/deactivateFire) y el CSS.
    function updateDisplay() {
        const total = characters.length;
        if (total === 0) return;

        const typedLen = typedChars.length;
        const from = Math.min(renderedLen, typedLen, dirtyFrom);
        const to = Math.min(Math.max(renderedLen, typedLen), total - 1);

        for (let i = from; i <= to; i++) {
            const expectedChar = characters[i];
            let state, shown;

            if (i < typedLen) {
                const typed = typedChars[i];
                if (typed === expectedChar) {
                    state = ST_CORRECT;
                    shown = expectedChar;
                } else {
                    // Wrong character — show what the user actually typed
                    state = ST_ERROR;
                    shown = typed === ' ' ? '·' : typed; // '·' = espacio incorrecto visible
                }
            } else if (i === typedLen) {
                state = ST_CURRENT; // Cursor position
                shown = expectedChar;
            } else {
                state = ST_PENDING; // Not yet reached
                shown = expectedChar;
            }

            // La letra puede no estar montada (fuera de la ventana, p. ej. al pegar
            // mucho texto de golpe): el estado igual se registra y se pinta al montarla.
            const span = charSpans[i];
            const prevState = charState[i];
            if (prevState !== state) {
                if (span) {
                    span.classList.remove(STATE_CLASSES[prevState]);
                    span.classList.add(STATE_CLASSES[state]);
                }
                charState[i] = state;
                if (state === ST_ERROR) errorCount++;
                else if (prevState === ST_ERROR) errorCount--;
            }

            // Actualiza el texto en el mismo nodo, solo si cambió
            if (span) {
                const node = span.firstChild;
                if (node && node.data !== shown) node.data = shown;
            }
        }

        renderedLen = typedLen;
        dirtyFrom = Infinity;

        // Montar/desmontar chunks según dónde quedó el cursor
        syncWindow(typedLen);

        // Input border glow changes when there are errors
        typingInput.classList.toggle('has-error', errorCount > 0);
    }

    // ===== Get Consecutive Correct Count =====
    // Counts correct characters from the beginning until the first error
    // O(1): `consecCorrect` se mantiene en pushTyped/popTyped.
    function getConsecutiveCorrect() {
        return consecCorrect;
    }

    // ===== Scroll to Current Character =====
    function scrollToCurrent() {
        const cursorIndex = typedChars.length;
        if (cursorIndex >= characters.length) return;

        const currentEl = charSpans[cursorIndex];
        if (!currentEl) return;

        const container = textDisplay;
        // Posición de la letra DENTRO del contenido scrolleable. Antes se usaba
        // `offsetTop`, pero el offsetParent es la tarjeta (no el contenedor del texto),
        // así que salía desfasado ~30px y al borrar hacia arriba el cursor quedaba fuera de vista.
        const scrollTop = container.scrollTop;
        const elTop = currentEl.getBoundingClientRect().top - container.getBoundingClientRect().top + scrollTop;
        const containerHeight = container.clientHeight;

        if (elTop > scrollTop + containerHeight - 60) {
            container.scrollTo({
                top: elTop - containerHeight / 2,
                behavior: 'smooth'
            });
        } else if (elTop < scrollTop + 20) {
            container.scrollTo({
                top: Math.max(0, elTop - 20),
                behavior: 'smooth'
            });
        }
    }

    // ===== Update Stats =====
    function updateStats() {
        const elapsed = getElapsedSeconds();
        const minutes = elapsed / 60;
        const consecutiveCorrect = getConsecutiveCorrect();

        // WPM: only consecutive correct characters count
        let wpm = 0;
        if (minutes > 0) {
            wpm = Math.round((consecutiveCorrect / 5) / minutes);
        }

        // Accuracy: correct keystrokes / total keystrokes
        let accuracy = 100;
        if (totalKeystrokes > 0) {
            accuracy = Math.round((correctKeystrokes / totalKeystrokes) * 100);
        }

        // Progress: based on consecutive correct (must reach 100%)
        const progress = characters.length > 0
            ? Math.round((consecutiveCorrect / characters.length) * 100)
            : 0;

        // Update DOM (solo lo que cambió: esto corre cada tecla y cada 100 ms)
        if (wpm !== lastStats.wpm) {
            lastStats.wpm = wpm;
            wpmDisplay.textContent = wpm;
        }
        if (accuracy !== lastStats.accuracy) {
            lastStats.accuracy = accuracy;
            accuracyDisplay.innerHTML = accuracy + '<small>%</small>';
        }
        if (totalErrors !== lastStats.errors) {
            lastStats.errors = totalErrors;
            errorsDisplay.textContent = totalErrors;
        }

        if (progress !== lastStats.progress) {
            lastStats.progress = progress;
            progressBar.style.width = progress + '%';
            progressText.textContent = progress + '%';

            // Color progress based on completion
            if (progress >= 100) {
                progressText.style.color = 'var(--accent-secondary)';
            } else if (progress >= 75) {
                progressText.style.color = 'var(--accent-primary)';
            } else {
                progressText.style.color = '';
            }
        }
    }

    // ===== Update Timer =====
    function updateTimer() {
        const elapsed = getElapsedSeconds();
        const mins = Math.floor(elapsed / 60);
        const secs = Math.floor(elapsed % 60);
        const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
        if (timeStr !== lastStats.time) {
            lastStats.time = timeStr;
            timeDisplay.textContent = timeStr;
        }

        // Also update WPM in real-time
        updateStats();
    }

    // ===== Get Elapsed Seconds =====
    function getElapsedSeconds() {
        if (!startTime) return 0;
        return (Date.now() - startTime) / 1000;
    }

    // ===== Format Time =====
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // ===== Check Completion =====
    function checkCompletion() {
        // Test is complete when ALL characters are typed correctly
        const consecutiveCorrect = getConsecutiveCorrect();
        if (consecutiveCorrect === characters.length && typedChars.length === characters.length) {
            finishTest();
        }
    }

    // ===== Fade Mode: Loop Engine =====
    function startFadeLoop() {
        fadeIndex = 0;
        fadeAccumulator = 0;
        fadePrevTimestamp = null;

        function fadeTick(timestamp) {
            if (isFinished || isGameOver) return;

            if (fadePrevTimestamp === null) fadePrevTimestamp = timestamp;
            const deltaMs = timestamp - fadePrevTimestamp;
            fadePrevTimestamp = timestamp;

            // chars per second = (WPM * 5) / 60
            const charsPerSec = (fadeWpm * 5) / 60;
            const charsPerMs = charsPerSec / 1000;

            fadeAccumulator += deltaMs * charsPerMs;

            // Advance fadeIndex by however many whole chars have accumulated
            while (fadeAccumulator >= 1 && fadeIndex < characters.length) {
                fadeAccumulator -= 1;

                // Remove ghost-front from previous leading edge
                if (fadeIndex > 0 && charSpans[fadeIndex - 1]) {
                    charSpans[fadeIndex - 1].classList.remove('char-ghost-front');
                }

                // Fade the current char
                const span = charSpans[fadeIndex];
                if (span) {
                    span.classList.add('char-faded');
                }

                fadeIndex++;

                // Mark the new leading edge with ghost glow
                if (fadeIndex < characters.length && charSpans[fadeIndex]) {
                    charSpans[fadeIndex].classList.add('char-ghost-front');
                }

                // === COLLISION CHECK ===
                const consecutiveCorrect = getConsecutiveCorrect();
                if (fadeIndex > consecutiveCorrect) {
                    triggerGhostOver();
                    return; // Stop the loop
                }
            }

            fadeRafId = requestAnimationFrame(fadeTick);
        }

        fadeRafId = requestAnimationFrame(fadeTick);
    }

    function stopFadeLoop() {
        if (fadeRafId !== null) {
            cancelAnimationFrame(fadeRafId);
            fadeRafId = null;
        }
        fadePrevTimestamp = null;
    }

    // ===== STREAK COMBO HELPERS =====
    function updateComboUI() {
        if (!comboCountDisplay) return;
        comboCountDisplay.textContent = currentCombo;
        const T = window.ImmersiveThemes;
        if (T && T.active) T.emit('combo', currentCombo, isOnFire);
    }

    // ===== Temas inmersivos (themes/immersive.js) =====
    // Avisa al tema activo de la última tecla procesada. Si no hay tema activo, no hace nada.
    function fxKey() {
        const T = window.ImmersiveThemes;
        if (!T || !T.active) return;
        const idx = typedChars.length - 1;
        if (idx < 0) return;
        T.emit('key', {
            ok: typedChars[idx] === characters[idx],
            el: charSpans[idx],
            char: characters[idx]
        });
    }

    function fxEnd(kind) {
        const T = window.ImmersiveThemes;
        if (T && T.active) T.emit('end', kind);
    }

    function activateFire() {
        isOnFire = true;
        textDisplay.classList.add('on-fire');
        typingInput.classList.add('on-fire-border');
        if (comboLabelDisplay) {
            comboLabelDisplay.textContent = tr('combo.fire');
            comboLabelDisplay.style.color = '#22c55e';
        }
    }

    function deactivateFire() {
        isOnFire = false;
        textDisplay.classList.remove('on-fire');
        typingInput.classList.remove('on-fire-border');
        if (comboLabelDisplay) {
            comboLabelDisplay.textContent = tr('ui.combo-label');
            comboLabelDisplay.style.color = '';
        }
    }

    // ===== STORM MODE HELPERS =====
    function startStormLoop() {
        clearStorm();

        // Leer configuración directamente del botón activo del DOM (a prueba de fallos)
        const activeStormBtn = document.querySelector('.btn-storm-diff.active');
        if (activeStormBtn) {
            stormIntervalMs = parseInt(activeStormBtn.dataset.interval, 10) || 4000;
            stormCharCount = parseInt(activeStormBtn.dataset.count, 10) || 2;
        }

        stormInterval = setInterval(scrambleRandomChars, stormIntervalMs);
    }

    function scrambleRandomChars() {
        if (isFinished || isGameOver) return;

        // Solo buscar caracteres adelante del cursor (typedChars.length + 1)
        // que no hayan sido transformados antes y que no sean espacios
        const availableIndices = [];
        for (let i = typedChars.length + 1; i < characters.length; i++) {
            if (characters[i] !== ' ' && !scrambledPositions.has(i)) {
                availableIndices.push(i);
            }
        }

        if (availableIndices.length === 0) return;

        // Elegir la cantidad de letras configurada según la dificultad (1, 2, 3 o 4)
        const count = Math.min(stormCharCount, availableIndices.length);
        const symbols = ['@', '#', '$', '*', '&', '!', '?', '%'];

        for (let i = 0; i < count; i++) {
            const slot = Math.floor(Math.random() * availableIndices.length);
            const targetIndex = availableIndices.splice(slot, 1)[0];
            const sym = symbols[Math.floor(Math.random() * symbols.length)];

            // Se queda transformado permanentemente
            characters[targetIndex] = sym;
            if (charSpans[targetIndex]) {
                charSpans[targetIndex].textContent = sym;
                charSpans[targetIndex].classList.add('char-scrambled');
            }

            scrambledPositions.add(targetIndex);
        }
    }

    function clearStorm() {
        if (stormInterval) {
            clearInterval(stormInterval);
            stormInterval = null;
        }
        scrambledPositions.clear();
    }

    // ===== DEAD ZONE HELPERS =====
    function normalizeLetter(c) {
        if (!c) return '';
        return c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    function isDeadKeyChar(c) {
        if (!isDeadzoneMode || deadKeys.length === 0 || !c) return false;
        const norm = normalizeLetter(c);
        return deadKeys.some(k => normalizeLetter(k) === norm);
    }

    function pickDeadKeys() {
        deadKeys = [];

        // Leer configuración directamente del botón activo del DOM (a prueba de fallos)
        const activeDeadzoneBtn = document.querySelector('.btn-deadzone-diff.active');
        if (activeDeadzoneBtn) {
            deadKeysCount = parseInt(activeDeadzoneBtn.dataset.keys, 10) || 3;
        }
        const countNeeded = deadKeysCount || 3;
        
        // Extraer letras alfabéticas únicas del texto actual
        const lettersInText = Array.from(new Set(
            characters
                .map(c => normalizeLetter(c))
                .filter(c => /^[a-zñ]$/i.test(c))
        ));

        // Rellenar con letras comunes del español si el texto tuviera menos letras únicas
        const fallbackLetters = ['a', 'e', 'o', 's', 'r', 'n', 'i', 'l', 'c', 't', 'd', 'u'];
        for (const fb of fallbackLetters) {
            if (!lettersInText.includes(fb)) {
                lettersInText.push(fb);
            }
        }

        const shuffled = lettersInText.sort(() => 0.5 - Math.random());
        deadKeys = shuffled.slice(0, countNeeded);

        if (deadzoneKeysDisplay) {
            deadzoneKeysDisplay.innerHTML = deadKeys
                .map(k => `<span class="deadzone-key-pill">[${k.toLowerCase()}]</span>`)
                .join(', ');
        }
    }

    function clearDeadzone() {
        deadKeys = [];
        if (deadzoneBanner) deadzoneBanner.classList.add('hidden');
    }

    // ===== ACHIEVEMENTS DEFINITION & DATA =====
    // Escalones (umbral → id) usados tanto para desbloquear como para migrar progreso antiguo
    const LADDER_RACHAS = [[10, 'racha-10'], [30, 'racha-bronce'], [60, 'racha-60'], [90, 'racha-plata'], [150, 'racha-150'],
                           [200, 'racha-oro'], [300, 'racha-300'], [500, 'racha-platino'], [750, 'racha-750'], [1000, 'racha-divina']];
    const LADDER_WPM = [[30, 'wpm-30'], [40, 'wpm-40'], [50, 'wpm-50'], [60, 'wpm-60'], [80, 'wpm-80'], [100, 'wpm-100']];
    const WPM_ULTRA = 110; // "Ultra Instinto": se desbloquea al SUPERAR este valor
    const LADDER_PRECISION = [[25, 'acc-25'], [50, 'acc-50'], [100, 'acc-100'], [150, 'acc-150']]; // palabras mínimas con 100%
    const LADDER_TESTS = [[1, 'tests-1'], [10, 'tests-10'], [25, 'tests-25'], [50, 'tests-50'], [100, 'tests-100'],
                          [250, 'tests-250'], [500, 'tests-500'], [1000, 'tests-1000']];
    const LADDER_DIAS = [[3, 'dias-3'], [7, 'dias-7'], [14, 'dias-14'], [30, 'dias-30']];
    const ID_VIDAS = { 10: 'survivor-easy', 5: 'survivor-med', 3: 'survivor-hard', 1: 'survivor-exp' };
    const ID_FADE = { 20: 'fade-20', 40: 'fade-40', 60: 'fade-60', 80: 'fade-80' };
    const ID_STORM = { 5000: 'storm-facil', 4000: 'storm-medio', 2500: 'storm-pro', 1500: 'storm-hardcore' };
    const ID_DEAD = { 2: 'dead-2', 3: 'dead-3', 4: 'dead-4', 5: 'dead-5' };

    // Logros de versiones anteriores que ahora se representan con otro id
    const LEGACY_ACH_ALIASES = { 'wpm-120': 'wpm-110', 'wpm-160': 'wpm-110' };

    function ach(id, titulo, descripcion, categoria, icono) {
        return { id, titulo, descripcion, categoria, icono, completado: false, fecha: null };
    }

    // Textos de logros: el español vive aquí (datos) y el inglés en i18n/en.js (claves ach.<id>.t / .d)
    function achTitle(a) { return window.I18N.lang === 'en' ? window.I18N.t('ach.' + a.id + '.t') : a.titulo; }
    function achDesc(a) { return window.I18N.lang === 'en' ? window.I18N.t('ach.' + a.id + '.d') : a.descripcion; }

    const ACHIEVEMENTS_LIST = [
        // 1. Rachas de palabras correctas seguidas (sin cometer errores)
        ach('racha-10', 'Calentando Motores', 'Conseguir una racha de 10 palabras seguidas sin cometer errores.', 'rachas', '🔥'),
        ach('racha-bronce', 'Racha Bronce', 'Conseguir una racha de 30 palabras seguidas sin cometer errores.', 'rachas', '🥉'),
        ach('racha-60', 'Ritmo Perfecto', 'Conseguir una racha de 60 palabras seguidas sin cometer errores.', 'rachas', '🎶'),
        ach('racha-plata', 'Racha Plata', 'Conseguir una racha de 90 palabras seguidas sin cometer errores.', 'rachas', '🥈'),
        ach('racha-150', 'Racha Esmeralda', 'Conseguir una racha de 150 palabras seguidas sin cometer errores.', 'rachas', '💚'),
        ach('racha-oro', 'Racha Oro', 'Conseguir una racha de 200 palabras seguidas sin cometer errores.', 'rachas', '🥇'),
        ach('racha-300', 'Racha Zafiro', 'Conseguir una racha de 300 palabras seguidas sin cometer errores.', 'rachas', '🔷'),
        ach('racha-platino', 'Racha Platino', 'Conseguir una racha de 500 palabras seguidas sin cometer errores.', 'rachas', '💎'),
        ach('racha-750', 'Racha Mítica', 'Conseguir una racha de 750 palabras seguidas sin cometer errores.', 'rachas', '🐉'),
        ach('racha-divina', 'Racha Divina', 'Conseguir una racha de 1000 palabras seguidas (dificultad extrema).', 'rachas', '👑'),

        // 2. Velocidad pura (WPM) — escalones graduales hasta Ultra Instinto
        ach('wpm-30', 'Primeros Pasos', 'Alcanzar 30 WPM en una prueba completada.', 'velocidad', '🐢'),
        ach('wpm-40', 'Velocidad Crucero', 'Alcanzar 40 WPM en una prueba completada.', 'velocidad', '🚗'),
        ach('wpm-50', 'Ritmo Constante', 'Alcanzar 50 WPM en una prueba completada.', 'velocidad', '🏃'),
        ach('wpm-60', 'Mecanógrafo Veloz', 'Alcanzar 60 WPM en una prueba completada.', 'velocidad', '⚡'),
        ach('wpm-80', 'Rompiendo la Barrera', 'Alcanzar 80 WPM en una prueba completada.', 'velocidad', '🚀'),
        ach('wpm-100', 'Modo Dios', 'Alcanzar 100 WPM en una prueba completada.', 'velocidad', '🔮'),
        ach('wpm-110', 'Ultra Instinto', 'Superar los 110 WPM en una prueba completada.', 'velocidad', '🌌'),

        // 3. Precisión perfecta (100% de acierto según la longitud del texto)
        ach('acc-25', 'Pulso Firme', 'Terminar un texto de al menos 25 palabras con 100% de precisión.', 'precision', '🧘'),
        ach('acc-50', 'Cirujano del Teclado', 'Terminar un texto de al menos 50 palabras con 100% de precisión.', 'precision', '🎯'),
        ach('acc-100', 'Mano de Relojero', 'Terminar un texto de al menos 100 palabras con 100% de precisión.', 'precision', '🔬'),
        ach('acc-150', 'Mente Fría', 'Terminar un texto de al menos 150 palabras con 100% de precisión.', 'precision', '❄️'),

        // 4. Modo Vidas (supervivencia) — todas las dificultades
        ach('survivor-easy', 'Aprendiz de Supervivencia', 'Completar un texto en dificultad "Fácil" (10 vidas) sin morir.', 'vidas', '🌱'),
        ach('survivor-med', 'Sobreviviente', 'Completar un texto en dificultad "Medio" (5 vidas) sin morir.', 'vidas', '🛡️'),
        ach('survivor-hard', 'Cuerpo de Acero', 'Completar un texto en dificultad "Difícil" (3 vidas) sin morir.', 'vidas', '⚔️'),
        ach('survivor-exp', 'Inmortal', 'Completar un texto en dificultad "Hardcore" (1 vida) con éxito.', 'vidas', '💀'),
        ach('survivor-flawless', 'Intocable', 'Completar un texto en dificultad "Medio" o superior sin perder ni una sola vida.', 'vidas', '✨'),
        ach('survivor-last', 'Por los Pelos', 'Completar un texto en "Fácil", "Medio" o "Difícil" con exactamente 1 vida restante.', 'vidas', '😅'),

        // 5. Modos especiales — cada dificultad de cada modo
        ach('fade-20', 'Eco Tenue', 'Completar un texto en Modo Desvanecimiento a velocidad "Lento" (20 WPM).', 'modos', '🌫️'),
        ach('fade-40', 'Sombra Persistente', 'Completar un texto en Modo Desvanecimiento a velocidad "Medio" (40 WPM).', 'modos', '👻'),
        ach('fade-60', 'Cazador de Sombras', 'Completar un texto en Modo Desvanecimiento a velocidad "Rápido" (60 WPM).', 'modos', '🕯️'),
        ach('fade-80', 'Dueño de la Sombra', 'Completar un texto en Modo Desvanecimiento a velocidad "Pro" (80 WPM).', 'modos', '🌑'),
        ach('asedio-3', 'Muralla Firme', 'Superar 3 oleadas en el Modo Asedio.', 'modos', '🛡️'),
        ach('asedio-6', 'Defensor del Núcleo', 'Superar 6 oleadas en el Modo Asedio.', 'modos', '🏰'),
        ach('asedio-10', 'Inquebrantable', 'Superar 10 oleadas en el Modo Asedio.', 'modos', '⚔️'),
        ach('asedio-15', 'Leyenda del Asedio', 'Superar 15 oleadas en el Modo Asedio.', 'modos', '🐲'),
        ach('asedio-combo-25', 'Lluvia de Palabras', 'Destruir 25 palabras seguidas en el Modo Asedio sin fallar ni perder vidas.', 'modos', '☄️'),
        ach('storm-facil', 'Llovizna', 'Completar un texto en Tormenta Eléctrica con intensidad "Fácil".', 'modos', '🌦️'),
        ach('storm-medio', 'Aguacero', 'Completar un texto en Tormenta Eléctrica con intensidad "Medio".', 'modos', '🌧️'),
        ach('storm-pro', 'Tempestad', 'Completar un texto en Tormenta Eléctrica con intensidad "Pro".', 'modos', '⛈️'),
        ach('storm-hardcore', 'Ojo del Huracán', 'Completar un texto en Tormenta Eléctrica con intensidad "Hardcore".', 'modos', '🌪️'),
        ach('dead-2', 'Dedos Ágiles', 'Completar un texto en Punto Muerto con 2 teclas rotas.', 'modos', '🔓'),
        ach('dead-3', 'Esquivando Teclas', 'Completar un texto en Punto Muerto con 3 teclas rotas.', 'modos', '🔒'),
        ach('dead-4', 'Maestro del Salto', 'Completar un texto en Punto Muerto con 4 teclas rotas.', 'modos', '🧩'),
        ach('dead-5', 'Teclado Fantasma', 'Completar un texto en Punto Muerto con 5 teclas rotas.', 'modos', '🕳️'),
        ach('todoterreno', 'Todoterreno', 'Completar al menos una prueba en cada modo especial: Vidas, Desvanecimiento, Tormenta y Punto Muerto.', 'modos', '🧭'),

        // 6. Persistencia (constancia en pruebas y en días)
        ach('tests-1', 'Primer Paso', 'Completar tu primera prueba.', 'persistencia', '👣'),
        ach('tests-10', 'Adicto al Click', 'Completar 10 pruebas en total.', 'persistencia', '⌨️'),
        ach('tests-25', 'Tomando Ritmo', 'Completar 25 pruebas en total.', 'persistencia', '🥁'),
        ach('tests-50', 'Medio Centenar', 'Completar 50 pruebas en total.', 'persistencia', '🎖️'),
        ach('tests-100', 'Leyenda Local', 'Completar 100 pruebas en total.', 'persistencia', '🏆'),
        ach('tests-250', 'Veterano del Teclado', 'Completar 250 pruebas en total.', 'persistencia', '🏅'),
        ach('tests-500', 'Gran Maestro', 'Completar 500 pruebas en total.', 'persistencia', '🌟'),
        ach('tests-1000', 'Leyenda Inmortal', 'Completar 1000 pruebas en total.', 'persistencia', '🗿'),
        ach('dias-3', 'Hábito en Marcha', 'Jugar 3 días seguidos.', 'persistencia', '📆'),
        ach('dias-7', 'Semana Completa', 'Jugar 7 días seguidos.', 'persistencia', '🗓️'),
        ach('dias-14', 'Quincena Imparable', 'Jugar 14 días seguidos.', 'persistencia', '🌓'),
        ach('dias-30', 'Mes Imparable', 'Jugar 30 días seguidos.', 'persistencia', '🌕'),
        ach('tutor-master', 'Graduado del Teclado', 'Completar con éxito los 6 niveles del Modo Aprendizaje desde Cero.', 'persistencia', '🎓')
    ];

    // El panel de Estadísticas muestra el progreso de logros por categoría
    if (window.SpeedStats) window.SpeedStats.setAchievementsProvider(() => ACHIEVEMENTS_LIST);

    // ===== ACHIEVEMENTS HELPERS & STORAGE =====
    // Integridad: los logros y las estadísticas de usuario se guardan con una firma. Si alguien edita
    // localStorage a mano (consola, extensión...) la firma deja de coincidir y se reinicia el progreso.
    // OJO: es una barrera, no un candado — el código es público y quien lo lea puede recalcular la firma.
    const ACH_KEY = 'speedtype-achievements-data';
    const ACH_SIG_KEY = 'speedtype-achievements-sig';
    const USER_STATS_KEY = 'speedtype-user-stats';
    const ACH_SALT = 'ispeedtype/logros/v2';
    // Datos sin firma + historial vacío: false = se aceptan los logros que no se pueden comprobar (no se
    // pierde progreso de quien reinició su historial); true = se revocan (cierra el truco de borrar la
    // firma y vaciar el historial, pero borra logros legítimos de quien reinició el historial).
    const ACH_STRICT_LEGACY = false;

    // Hash síncrono de 53 bits (cyrb53)
    function achHash(str) {
        let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
        for (let i = 0; i < str.length; i++) {
            const ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
    }

    function currentAchSignature() {
        return achHash(ACH_SALT + '|' + (localStorage.getItem(ACH_KEY) || '') + '|' + (localStorage.getItem(USER_STATS_KEY) || ''));
    }

    function writeAchSignature() {
        localStorage.setItem(ACH_SIG_KEY, currentAchSignature());
    }

    // true = firma válida · false = datos manipulados · null = sin firma (datos antiguos o primera visita)
    function checkAchSignature() {
        try {
            const sig = localStorage.getItem(ACH_SIG_KEY);
            if (sig === null) return null;
            return sig === currentAchSignature();
        } catch (e) {
            return null;
        }
    }

    // Escritura directa (sin comprobar la firma antes); siempre deja la firma al día
    function persistAchievements() {
        const data = {};
        ACHIEVEMENTS_LIST.forEach(a => {
            if (a.completado) data[a.id] = { completado: true, fecha: a.fecha };
        });
        localStorage.setItem(ACH_KEY, JSON.stringify(data));
        writeAchSignature();
    }

    function persistUserStats() {
        localStorage.setItem(USER_STATS_KEY, JSON.stringify(userStats));
        writeAchSignature();
    }

    // Deja todos los logros y el progreso asociado (pruebas completadas, mejor racha, modos) en cero
    function wipeAchievements() {
        ACHIEVEMENTS_LIST.forEach(a => { a.completado = false; a.fecha = null; });
        userStats = { testsCompleted: 0, maxWordStreak: 0, modesDone: {} };
        try {
            persistAchievements();
            persistUserStats();
        } catch (e) {
            console.warn('Error resetting achievements:', e);
        }
        try {
            updateAchievementsBadge();
            renderAchievementsGrid();
        } catch (e) { /* la interfaz aún puede no estar lista */ }
    }

    function resetAchievements() {
        if (!window.confirm(tr('ach.confirmReset'))) return;
        wipeAchievements();
    }

    // Antes de cada guardado: si alguien tocó los datos mientras la página estaba abierta, se reinicia
    function guardAchievementIntegrity() {
        if (checkAchSignature() === false) {
            console.warn('Logros: datos modificados fuera del juego; se reinicia el progreso.');
            wipeAchievements();
            return false;
        }
        return true;
    }

    // Para datos antiguos SIN firma: ¿los respaldan las estadísticas y el historial guardados?
    // Se usa una sola vez (luego los datos quedan firmados) y solo revoca lo que es imposible.
    function isAchievementBacked(id) {
        const total = userStats.testsCompleted || 0;
        const rung = (ladder) => ladder.find(r => r[1] === id);
        let r;
        if ((r = rung(LADDER_RACHAS))) return userStats.maxWordStreak >= r[0];
        if ((r = rung(LADDER_TESTS))) return total >= r[0];
        if (total < 1) return false; // sin ninguna prueba completada no puede haber logros

        const h = window.SpeedStats ? window.SpeedStats.getHistory() : [];
        if (h.length >= 1000) return true;                // historial recortado: la evidencia antigua ya no está
        if (!h.length) return !ACH_STRICT_LEGACY;         // historial vacío (¿lo reinició el jugador?): no se puede comprobar
        const ok = h.filter(e => e.result === 'ok');
        const some = (fn) => ok.some(fn);

        if ((r = rung(LADDER_WPM))) return some(e => e.wpm >= r[0]);
        if (id === 'wpm-110') return some(e => e.wpm > WPM_ULTRA);
        if ((r = rung(LADDER_PRECISION))) return some(e => e.acc === 100 && e.words >= r[0]);
        if ((r = rung(LADDER_DIAS))) return !window.SpeedStats || window.SpeedStats.dayStreaks().best >= r[0];
        if (id.indexOf('survivor-') === 0) return some(e => e.mode === 'vidas');
        if (id.indexOf('fade-') === 0) return some(e => e.mode === 'desvanecer');
        if (id.indexOf('storm-') === 0) return some(e => e.mode === 'tormenta');
        if (id.indexOf('dead-') === 0) return some(e => e.mode === 'punto-muerto');
        if (id === 'todoterreno') {
            const d = userStats.modesDone || {};
            return !!(d.vidas && d.desvanecer && d.tormenta && d.punto);
        }
        return true; // p. ej. 'tutor-master': sin evidencia en el historial
    }

    function loadAchievementsFromStorage() {
        try {
            const sigState = checkAchSignature();
            if (sigState === false) {
                console.warn('Logros: datos modificados fuera del juego; se reinicia el progreso.');
                wipeAchievements();
                return;
            }

            const stored = localStorage.getItem(ACH_KEY);
            let revoked = false;
            if (stored) {
                const data = JSON.parse(stored);
                Object.keys(data).forEach(savedId => {
                    if (!data[savedId] || !data[savedId].completado) return;
                    const id = LEGACY_ACH_ALIASES[savedId] || savedId;
                    const target = ACHIEVEMENTS_LIST.find(a => a.id === id);
                    if (!target || target.completado) return;
                    if (sigState === null && !isAchievementBacked(id)) { revoked = true; return; }
                    target.completado = true;
                    target.fecha = data[savedId].fecha || null;
                });
            }
            migrateAchievementProgress();
            if (sigState === null || revoked) saveAchievementsToStorage(); // firma lo ya validado
        } catch (e) {
            console.warn('Error loading achievements from storage:', e);
        }
    }

    // Rellena los escalones inferiores de cada escalera y concede los logros que tus
    // estadísticas guardadas ya cumplen (así nadie pierde progreso al añadir niveles).
    function migrateAchievementProgress() {
        const byId = id => ACHIEVEMENTS_LIST.find(a => a.id === id);
        const hoy = new Date().toLocaleDateString(window.I18N.locale, { day: '2-digit', month: 'short', year: 'numeric' });
        let changed = false;

        const marcar = (id, fecha) => {
            const a = byId(id);
            if (a && !a.completado) { a.completado = true; a.fecha = fecha || hoy; changed = true; }
        };

        // Si el escalón más alto ya está ganado, todos los de abajo también
        const rellenar = (ids) => {
            let top = -1;
            ids.forEach((id, i) => { const a = byId(id); if (a && a.completado) top = i; });
            for (let i = 0; i < top; i++) marcar(ids[i], byId(ids[top]).fecha);
        };
        rellenar(LADDER_WPM.map(r => r[1]).concat('wpm-110'));
        rellenar(LADDER_PRECISION.map(r => r[1]));
        rellenar(LADDER_RACHAS.map(r => r[1]));
        rellenar(LADDER_TESTS.map(r => r[1]));
        rellenar(LADDER_DIAS.map(r => r[1]));

        // Escalones que tus estadísticas guardadas ya cumplen
        LADDER_RACHAS.forEach(([n, id]) => { if (userStats.maxWordStreak >= n) marcar(id); });
        LADDER_TESTS.forEach(([n, id]) => { if (userStats.testsCompleted >= n) marcar(id); });

        if (changed) saveAchievementsToStorage();
    }

    function saveAchievementsToStorage() {
        try {
            if (!guardAchievementIntegrity()) return;
            persistAchievements();
        } catch (e) {
            console.warn('Error saving achievements to storage:', e);
        }
    }

    function saveUserStats() {
        try {
            if (!guardAchievementIntegrity()) return;
            persistUserStats();
        } catch (e) {
            console.warn('Error saving user stats:', e);
        }
    }

    function updateAchievementsBadge() {
        const completedCount = ACHIEVEMENTS_LIST.filter(a => a.completado).length;
        const totalCount = ACHIEVEMENTS_LIST.length;
        const pct = Math.round((completedCount / totalCount) * 100);

        if (achievementsBadgeCount) {
            achievementsBadgeCount.textContent = `${completedCount}/${totalCount}`;
        }
        if (achievementsProgressScore) {
            achievementsProgressScore.textContent = `${completedCount} / ${totalCount} (${pct}%)`;
        }
        if (achievementsBarFill) {
            achievementsBarFill.style.width = `${pct}%`;
        }
    }

    function renderAchievementsGrid() {
        if (!achievementsGrid) return;
        achievementsGrid.innerHTML = '';

        const list = selectedAchievementCat === 'all'
            ? ACHIEVEMENTS_LIST
            : ACHIEVEMENTS_LIST.filter(a => a.categoria === selectedAchievementCat);

        list.forEach(ach => {
            const card = document.createElement('div');
            card.className = `ach-card ${ach.completado ? 'ach-unlocked' : 'ach-locked'}`;
            card.innerHTML = `
                <div class="ach-card-top">
                    <span class="ach-card-icon">${ach.icono}</span>
                    <span class="ach-status-badge">
                        ${ach.completado ? tr('ach.unlocked') : tr('ach.locked')}
                    </span>
                </div>
                <div class="ach-card-title">${achTitle(ach)}</div>
                <div class="ach-card-desc">${achDesc(ach)}</div>
                ${ach.completado && ach.fecha ? `
                    <div class="ach-card-date">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        ${tr('ach.unlockedOn')} ${ach.fecha}
                    </div>
                ` : ''}
            `;
            achievementsGrid.appendChild(card);
        });
    }

    // ===== PREVENCIÓN OBLIGATORIA DEL BUG DE DUPLICACIÓN =====
    function unlockAchievement(id) {
        // 0. Verificación Anti-Cheat: Si el texto no es elegible para logros (Modo Práctica), abortar
        if (!isEligibleForAchievements) {
            return;
        }

        const ach = ACHIEVEMENTS_LIST.find(a => a.id === id);
        if (!ach) return;

        // 1. Verificación obligatoria: si el campo completado ya es true, ignorar inmediatamente
        if (ach.completado === true) {
            return;
        }

        // Doble verificación contra localStorage (otra pestaña pudo desbloquearlo ya),
        // pero solo si los datos guardados tienen la firma válida
        try {
            const raw = checkAchSignature() === true ? localStorage.getItem(ACH_KEY) : null;
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed[id] && parsed[id].completado === true) {
                    ach.completado = true;
                    ach.fecha = parsed[id].fecha || null;
                    return;
                }
            }
        } catch (e) {}

        // 2. Cambiar inmediatamente el estado a true
        ach.completado = true;
        const now = new Date();
        const formattedDate = now.toLocaleDateString(window.I18N.locale, {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
        ach.fecha = formattedDate;

        // 3. Sincronizar inmediatamente con localStorage ANTES de cualquier animación o renderizado
        saveAchievementsToStorage();

        // 4-5. UI y notificación: un fallo visual nunca debe interrumpir la partida
        try {
            // 4. Actualizar la UI del contador y del modal si está visible
            updateAchievementsBadge();
            renderAchievementsGrid();

            // 5. Disparar notificación toast visual
            showAchievementToast(ach.icono, achTitle(ach), achDesc(ach));
        } catch (err) {
            console.error('Error al mostrar el logro:', err);
        }
    }

    function checkStreakAchievements() {
        LADDER_RACHAS.forEach(([n, id]) => {
            if (currentWordStreak >= n) unlockAchievement(id);
        });
    }

    function checkAllAchievements(stats) {
        if (stats.isGameOver || stats.isGhostOver) return;

        const totalWordsInText = originalText.trim().split(/\s+/).filter(Boolean).length;

        // --- Velocidad pura ---
        LADDER_WPM.forEach(([min, id]) => { if (stats.wpm >= min) unlockAchievement(id); });
        if (stats.wpm > WPM_ULTRA) unlockAchievement('wpm-110');

        // --- Precisión perfecta ---
        if (stats.accuracy === 100) {
            LADDER_PRECISION.forEach(([minWords, id]) => {
                if (totalWordsInText >= minWords) unlockAchievement(id);
            });
        }

        // --- Modo Vidas: un logro por dificultad + logros de estilo ---
        if (isLivesMode) {
            unlockAchievement(ID_VIDAS[maxLives]);
            if (maxLives <= 5 && currentLives === maxLives) unlockAchievement('survivor-flawless');
            if (maxLives >= 3 && currentLives === 1) unlockAchievement('survivor-last');
        }

        // --- Modos especiales: un logro por dificultad ---
        if (isFadeMode) unlockAchievement(ID_FADE[fadeWpm]);
        if (isStormMode) unlockAchievement(ID_STORM[stormIntervalMs]);
        if (isDeadzoneMode) unlockAchievement(ID_DEAD[deadKeysCount]);

        // --- Todoterreno: al menos una prueba completada en cada modo especial ---
        if (isEligibleForAchievements) {
            userStats.modesDone = userStats.modesDone || {};
            if (isLivesMode) userStats.modesDone.vidas = true;
            if (isFadeMode) userStats.modesDone.desvanecer = true;
            if (isStormMode) userStats.modesDone.tormenta = true;
            if (isDeadzoneMode) userStats.modesDone.punto = true;
            saveUserStats();
            const d = userStats.modesDone;
            if (d.vidas && d.desvanecer && d.tormenta && d.punto) unlockAchievement('todoterreno');
        }

        // --- Persistencia: pruebas totales y días seguidos ---
        LADDER_TESTS.forEach(([n, id]) => { if (userStats.testsCompleted >= n) unlockAchievement(id); });
        if (window.SpeedStats) {
            const racha = window.SpeedStats.dayStreaks().current;
            LADDER_DIAS.forEach(([n, id]) => { if (racha >= n) unlockAchievement(id); });
        }
    }

    function showAchievementToast(icon, title, desc) {
        if (!achievementContainer) return;

        const toast = document.createElement('div');
        toast.className = 'achievement-toast';
        toast.innerHTML = `
            <div class="achievement-icon">${icon}</div>
            <div class="achievement-text">
                <span class="achievement-badge">${tr('ach.toast')}</span>
                <span class="achievement-title">${title}</span>
                <span class="achievement-desc">${desc}</span>
            </div>
        `;

        achievementContainer.appendChild(toast);

        // Desaparece a los 4 segundos con transición suave
        setTimeout(() => {
            toast.classList.add('toast-hiding');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 400);
        }, 4000);
    }

    // ===== Historial de partidas (alimenta el panel de Estadísticas) =====
    // Título y subtítulo de resultados según cómo terminó la partida (se re-traducen al cambiar de idioma)
    let resultsKind = 'ok';
    function setResultsTexts(kind) {
        resultsKind = kind;
        const k = kind === 'ghost' ? ['res.ghostTitle', 'res.ghostSub']
            : kind === 'gameover' ? ['res.gameover', 'res.gameoverSub']
            : ['ui.results-title', 'ui.results-subtitle'];
        resultsTitle.textContent = tr(k[0]);
        resultsSubtitle.textContent = tr(k[1]);
    }

    function difficultyLabel() {
        if (isLivesMode) return maxLives + (maxLives === 1 ? ' vida' : ' vidas');
        if (isFadeMode) return fadeWpm + ' WPM';
        if (isStormMode) return stormCharCount + (stormCharCount === 1 ? ' letra' : ' letras') + ' / ' + (stormIntervalMs / 1000) + 's';
        if (isDeadzoneMode) return deadKeysCount + ' teclas';
        return '';
    }

    const MAX_HUMAN_WPM = 300;   // por encima de esto se considera trampa/error y no cuenta

    function registrarPartida(result, wpm, accuracy, elapsed) {
        if (!window.SpeedStats || !isEligibleForAchievements) return;
        if (wpm > MAX_HUMAN_WPM) return; // marca imposible: no se registra
        try {
            window.SpeedStats.record({
                result,
                wpm,
                acc: accuracy,
                secs: elapsed,
                errors: totalErrors,
                chars: result === 'ok' ? characters.length : typedChars.length,
                words: originalText.trim().split(/\s+/).filter(Boolean).length,
                mode: nombreModoActual(),
                dif: difficultyLabel(),
                keys: sessionKeys
            });
        } catch (err) {
            console.warn('No se pudo registrar la partida:', err);
        }
    }

    // ===== Game Over by Ghost Collision (Fade Mode) =====
    function triggerGhostOver() {
        stopFadeLoop();
        clearStorm();
        deactivateFire();
        currentWordStreak = 0;
        currentWordHadError = true;
        isGameOver = true;
        isFinished = true;
        clearInterval(timerInterval);

        fxEnd('gameover');

        // Block input immediately
        typingInput.disabled = true;
        typingInput.value = tr('res.faded');

        const elapsed = getElapsedSeconds();
        const minutes = elapsed / 60;
        const consecutiveCorrect = getConsecutiveCorrect();
        const wpm = minutes > 0 ? Math.round((consecutiveCorrect / 5) / minutes) : 0;
        const accuracy = totalKeystrokes > 0 ? Math.round((correctKeystrokes / totalKeystrokes) * 100) : 0;

        resultWpm.textContent = wpm;
        resultAccuracy.textContent = accuracy + '%';
        resultTime.textContent = formatTime(elapsed);
        resultErrors.textContent = totalErrors;

        // Cyan ghost-over style
        resultsCard.classList.remove('game-over-state');
        resultsCard.classList.add('ghost-over-state');
        registrarPartida('ghost', wpm, accuracy, elapsed);
        setResultsTexts('ghost');

        setTimeout(() => {
            showSection('results');
        }, 450);
    }

    // ===== Finish Test =====
    function finishTest() {
        stopFadeLoop();
        clearStorm();
        deactivateFire();
        isFinished = true;
        clearInterval(timerInterval);
        fxEnd('finish');
        if (onlineHook) { const h = onlineHook; onlineHook = null; h.finish(); }

        // Si la última palabra no tuvo errores, contarla en la racha
        if (!currentWordHadError) {
            currentWordStreak++;
            userStats.maxWordStreak = Math.max(userStats.maxWordStreak, currentWordStreak);
            checkStreakAchievements();
            currentWordHadError = false;
        }

        // Incrementar y persistir pruebas completadas
        userStats.testsCompleted = (userStats.testsCompleted || 0) + 1;
        saveUserStats();

        const elapsed = getElapsedSeconds();
        const minutes = elapsed / 60;
        const wpm = minutes > 0 ? Math.round((characters.length / 5) / minutes) : 0;
        const accuracy = totalKeystrokes > 0 ? Math.round((correctKeystrokes / totalKeystrokes) * 100) : 100;

        // Reset results card to normal state
        resultsCard.classList.remove('game-over-state', 'ghost-over-state');
        setResultsTexts('ok');

        // Fill results
        resultWpm.textContent = wpm;
        resultAccuracy.textContent = accuracy + '%';
        resultTime.textContent = formatTime(elapsed);
        resultErrors.textContent = totalErrors;

        // Guardar la partida en el historial ANTES de evaluar logros (los de días seguidos lo usan)
        if (wpm > MAX_HUMAN_WPM) isEligibleForAchievements = false; // marca imposible: ni historial ni logros
        registrarPartida('ok', wpm, accuracy, elapsed);

        // Evaluar logros de fin de prueba
        checkAllAchievements({
            wpm: wpm,
            accuracy: accuracy,
            isGameOver: false,
            isGhostOver: false
        });

        // Show results after a short delay for polish
        setTimeout(() => {
            showSection('results');
        }, 600);
    }

    // ===== Game Over (Lives Mode) =====
    function triggerGameOver() {
        stopFadeLoop();
        clearStorm();
        deactivateFire();
        currentWordStreak = 0;
        currentWordHadError = true;
        isGameOver = true;
        isFinished = true;
        clearInterval(timerInterval);

        fxEnd('gameover');

        // Block input immediately
        typingInput.disabled = true;
        typingInput.value = tr('res.gameover');

        const elapsed = getElapsedSeconds();
        const minutes = elapsed / 60;
        const consecutiveCorrect = getConsecutiveCorrect();
        const wpm = minutes > 0 ? Math.round((consecutiveCorrect / 5) / minutes) : 0;
        const accuracy = totalKeystrokes > 0 ? Math.round((correctKeystrokes / totalKeystrokes) * 100) : 0;

        // Fill results with stats up to the moment of death
        resultWpm.textContent = wpm;
        resultAccuracy.textContent = accuracy + '%';
        resultTime.textContent = formatTime(elapsed);
        resultErrors.textContent = totalErrors;

        registrarPartida('gameover', wpm, accuracy, elapsed);

        // Style results card as Game Over
        resultsCard.classList.add('game-over-state');
        setResultsTexts('gameover');

        // Show results after a short delay
        setTimeout(() => {
            showSection('results');
        }, 450);
    }

    // ===== Restart Test =====
    function restartTest() {
        cancelOnline();
        stopFadeLoop();
        clearStorm();
        deactivateFire();
        clearInterval(timerInterval);
        clearCountdown();
        startTest();
    }

    // ===== Go to Setup =====
    function goToSetup() {
        leaveExternalMode();
        cancelOnline();
        stopFadeLoop();
        clearStorm();
        deactivateFire();
        clearDeadzone();
        clearInterval(timerInterval);
        clearCountdown();
        document.body.classList.remove('survival-active', 'fade-active', 'storm-active', 'deadzone-active', 'practice-active');
        if (practiceModeBanner) practiceModeBanner.classList.add('hidden');
        hideAntiCheatWarning();
        resultsCard.classList.remove('game-over-state', 'ghost-over-state');
        textInput.value = '';
        showSection('setup');
    }

    // ===================================================
    // 7. MÓDULO: MOTOR DEL MODO APRENDIZAJE (TOUCH TYPING TUTOR)
    // ===================================================

    // Las lecciones (título y texto) viven en los diccionarios: tutor.l<n>.title / tutor.l<n>.text
    const TUTOR_LESSONS = [1, 2, 3, 4, 5, 6].map(level => ({
        level,
        get title() { return tr('tutor.l' + level + '.title'); },
        get text() { return tr('tutor.l' + level + '.text'); }
    }));

    const CHAR_TO_FINGER_MAP = {
        // Meñique Izquierdo (1, Q, A, Z)
        '1': 'finger-left-pinky', 'q': 'finger-left-pinky', 'Q': 'finger-left-pinky',
        'a': 'finger-left-pinky', 'A': 'finger-left-pinky', 'z': 'finger-left-pinky', 'Z': 'finger-left-pinky',

        // Anular Izquierdo (2, W, S, X)
        '2': 'finger-left-ring', 'w': 'finger-left-ring', 'W': 'finger-left-ring',
        's': 'finger-left-ring', 'S': 'finger-left-ring', 'x': 'finger-left-ring', 'X': 'finger-left-ring',

        // Medio Izquierdo (3, E, D, C)
        '3': 'finger-left-middle', 'e': 'finger-left-middle', 'E': 'finger-left-middle',
        'd': 'finger-left-middle', 'D': 'finger-left-middle', 'c': 'finger-left-middle', 'C': 'finger-left-middle',

        // Índice Izquierdo (4, 5, R, T, F, G, V, B)
        '4': 'finger-left-index', '5': 'finger-left-index',
        'r': 'finger-left-index', 'R': 'finger-left-index', 't': 'finger-left-index', 'T': 'finger-left-index',
        'f': 'finger-left-index', 'F': 'finger-left-index', 'g': 'finger-left-index', 'G': 'finger-left-index',
        'v': 'finger-left-index', 'V': 'finger-left-index', 'b': 'finger-left-index', 'B': 'finger-left-index',

        // Pulgares (Espacio)
        ' ': 'finger-thumb',

        // Índice Derecho (6, 7, Y, U, H, J, N, M)
        '6': 'finger-right-index', '7': 'finger-right-index',
        'y': 'finger-right-index', 'Y': 'finger-right-index', 'u': 'finger-right-index', 'U': 'finger-right-index',
        'h': 'finger-right-index', 'H': 'finger-right-index', 'j': 'finger-right-index', 'J': 'finger-right-index',
        'n': 'finger-right-index', 'N': 'finger-right-index', 'm': 'finger-right-index', 'M': 'finger-right-index',

        // Medio Derecho (8, I, K, coma)
        '8': 'finger-right-middle', 'i': 'finger-right-middle', 'I': 'finger-right-middle',
        'k': 'finger-right-middle', 'K': 'finger-right-middle', ',': 'finger-right-middle',

        // Anular Derecho (9, O, L, punto)
        '9': 'finger-right-ring', 'o': 'finger-right-ring', 'O': 'finger-right-ring',
        'l': 'finger-right-ring', 'L': 'finger-right-ring', '.': 'finger-right-ring',

        // Meñique Derecho (0, P, Ñ, guión, etc.)
        '0': 'finger-right-pinky', 'p': 'finger-right-pinky', 'P': 'finger-right-pinky',
        'ñ': 'finger-right-pinky', 'Ñ': 'finger-right-pinky', ';': 'finger-right-pinky', '-': 'finger-right-pinky'
    };

    function updateTutorActiveKey() {
        tutorKeys.forEach(k => k.classList.remove('key-active'));
        tutorFingers.forEach(f => f.classList.remove('finger-active'));

        if (tutorCursor >= tutorText.length) return;

        const expectedChar = tutorText[tutorCursor];
        const isUpper = (expectedChar >= 'A' && expectedChar <= 'Z') || expectedChar === 'Ñ';
        const baseKey = expectedChar.toLowerCase();

        // 1. Resaltar tecla(s) correspondiente(s)
        tutorKeys.forEach(k => {
            const dKey = k.getAttribute('data-key');
            if (dKey === baseKey || (expectedChar === ' ' && dKey === ' ')) {
                k.classList.add('key-active');
            }
            if (isUpper && dKey === 'Shift') {
                k.classList.add('key-active');
            }
        });

        // 2. Resaltar dedo correspondiente en las manos
        const fingerClass = CHAR_TO_FINGER_MAP[expectedChar] || CHAR_TO_FINGER_MAP[baseKey];
        if (fingerClass) {
            if (fingerClass === 'finger-thumb') {
                tutorFingers.forEach(f => {
                    if (f.classList.contains('finger-left-thumb') || f.classList.contains('finger-right-thumb')) {
                        f.classList.add('finger-active');
                    }
                });
            } else {
                tutorFingers.forEach(f => {
                    if (f.classList.contains(fingerClass)) {
                        f.classList.add('finger-active');
                    }
                });
            }
        }
    }

    function renderTutorText() {
        if (!tutorTextDisplay) return;
        tutorTextDisplay.innerHTML = '';
        tutorCharSpans = [];

        const chars = tutorText.split('');
        chars.forEach((char, i) => {
            const span = document.createElement('span');
            span.className = 'tutor-char';
            span.textContent = char;

            if (i === 0) {
                span.classList.add('char-current');
                if (char === ' ') span.classList.add('char-space');
            } else {
                span.classList.add('char-pending');
            }

            tutorTextDisplay.appendChild(span);
            tutorCharSpans.push(span);
        });

        updateTutorProgress();
        updateTutorActiveKey();
    }

    function updateTutorProgress() {
        const pct = tutorText.length > 0 ? Math.round((tutorCursor / tutorText.length) * 100) : 0;
        if (tutorProgressBar) tutorProgressBar.style.width = pct + '%';
        if (tutorProgressText) tutorProgressText.textContent = pct + '%';
    }

    function handleTutorKeydown(e) {
        if (!isTutorMode) return;

        // Ignorar modificadores solitarios y teclas de sistema
        if (['Alt', 'Control', 'Meta', 'CapsLock', 'Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            return;
        }

        if (e.key === 'Shift') return;

        if (tutorCursor >= tutorText.length) return;

        const expectedChar = tutorText[tutorCursor];

        // Prevenir scroll de la página con Espacio
        if (e.key === ' ' || e.key === 'Backspace') {
            e.preventDefault();
        }

        if (e.key === expectedChar) {
            // === ACIERTO ===
            if (tutorCharSpans[tutorCursor]) {
                tutorCharSpans[tutorCursor].classList.remove('char-current', 'char-space');
                tutorCharSpans[tutorCursor].classList.add('char-correct');
            }

            const pressedKeyLower = e.key.toLowerCase();
            tutorKeys.forEach(k => {
                const dKey = k.getAttribute('data-key');
                if (dKey === pressedKeyLower || (e.key === ' ' && dKey === ' ')) {
                    k.classList.remove('key-error');
                    k.classList.add('key-pressed');
                    setTimeout(() => k.classList.remove('key-pressed'), 140);
                }
            });

            tutorCursor++;
            updateTutorProgress();

            if (tutorCursor < tutorText.length) {
                if (tutorCharSpans[tutorCursor]) {
                    tutorCharSpans[tutorCursor].classList.remove('char-pending');
                    tutorCharSpans[tutorCursor].classList.add('char-current');
                    if (tutorText[tutorCursor] === ' ') {
                        tutorCharSpans[tutorCursor].classList.add('char-space');
                    }
                }
                updateTutorActiveKey();
            } else {
                // === 100% COMPLETADO ===
                tutorKeys.forEach(k => k.classList.remove('key-active'));
                tutorFingers.forEach(f => f.classList.remove('finger-active'));

                // Desbloqueo estricto del siguiente nivel
                if (tutorCurrentLevel === tutorUnlockedLevel && tutorUnlockedLevel < TUTOR_LESSONS.length) {
                    tutorUnlockedLevel = tutorCurrentLevel + 1;
                    try {
                        localStorage.setItem('speedtype-tutor-unlocked', tutorUnlockedLevel);
                    } catch (e) {
                        console.warn('Error saving tutor progress:', e);
                    }
                }

                updateTutorLevelButtons();

                // Si completó el nivel 6 (todos los niveles del tutor) -> Otorgar logro
                if (tutorCurrentLevel === TUTOR_LESSONS.length) {
                    unlockAchievement('tutor-master');
                }

                if (tutorNextBtn) {
                    if (tutorCurrentLevel < TUTOR_LESSONS.length) {
                        tutorNextDynamic = true;
                        tutorNextBtn.textContent = tr('tutor.nextLevel', { n: tutorCurrentLevel + 1 });
                        tutorNextBtn.classList.remove('hidden');
                    } else {
                        tutorNextDynamic = true;
                        tutorNextBtn.textContent = tr('tutor.allDone');
                        tutorNextBtn.classList.remove('hidden');
                    }
                }
            }
        } else {
            // === ERROR: BLOQUEO ESTRICTO ===
            // NO se avanza el texto.
            const wrongKeyLower = e.key.toLowerCase();
            tutorKeys.forEach(k => {
                const dKey = k.getAttribute('data-key');
                if (dKey === wrongKeyLower || (e.key === ' ' && dKey === ' ')) {
                    k.classList.remove('key-active', 'key-pressed');
                    k.classList.add('key-error');
                    setTimeout(() => {
                        k.classList.remove('key-error');
                        updateTutorActiveKey();
                    }, 300);
                }
            });

            // Reforzar la tecla esperada que parpadea
            const expectedBase = expectedChar.toLowerCase();
            tutorKeys.forEach(k => {
                const dKey = k.getAttribute('data-key');
                if (dKey === expectedBase || (expectedChar === ' ' && dKey === ' ')) {
                    k.classList.remove('key-active');
                    void k.offsetWidth;
                    k.classList.add('key-active');
                }
            });
        }
    }

    // true cuando el botón "siguiente" muestra un texto dinámico (para re-traducirlo al cambiar de idioma)
    let tutorNextDynamic = false;

    function updateTutorLevelButtons() {
        tutorLevelBtns.forEach(btn => {
            const lvl = parseInt(btn.dataset.level, 10);
            btn.classList.toggle('active', lvl === tutorCurrentLevel);
            btn.classList.toggle('completed', lvl < tutorUnlockedLevel);
            btn.classList.toggle('locked', lvl > tutorUnlockedLevel);
            btn.title = lvl > tutorUnlockedLevel
                ? tr('tutor.levelLocked', { n: lvl, prev: lvl - 1 })
                : tr('tutor.levelN', { n: lvl });
        });
    }

    function loadTutorLevel(level) {
        const targetLevel = Math.max(1, Math.min(level, TUTOR_LESSONS.length));

        // Bloqueo estricto: rechazar niveles no desbloqueados
        if (targetLevel > tutorUnlockedLevel) {
            const lockedBtn = document.querySelector(`.tutor-level-btn[data-level="${targetLevel}"]`);
            if (lockedBtn) {
                lockedBtn.classList.remove('shake-error');
                void lockedBtn.offsetWidth;
                lockedBtn.classList.add('shake-error');
                setTimeout(() => lockedBtn.classList.remove('shake-error'), 450);
            }
            showAchievementToast('🔒', tr('tutor.lockedTitle'), tr('tutor.lockedDesc', { n: tutorUnlockedLevel }));
            return;
        }

        tutorCurrentLevel = targetLevel;
        const lesson = TUTOR_LESSONS[tutorCurrentLevel - 1];

        tutorText = lesson.text;
        tutorCursor = 0;

        if (tutorLevelLabel) {
            tutorLevelLabel.textContent = lesson.title;
        }

        updateTutorLevelButtons();

        if (tutorNextBtn) {
            tutorNextBtn.classList.add('hidden');
            tutorNextDynamic = false;
            tutorNextBtn.textContent = tr('ui.tutor-next-btn');
        }

        renderTutorText();
    }

    function enterTutorMode() {
        isTutorMode = true;

        // Desactivación estricta de todos los modos gamificados y bucles
        stopFadeLoop();
        clearStorm();
        clearDeadzone();
        clearCountdown();
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        document.body.classList.remove('survival-active', 'fade-active', 'storm-active', 'deadzone-active', 'practice-active');
        if (practiceModeBanner) practiceModeBanner.classList.add('hidden');
        hideAntiCheatWarning();

        showSection('tutor');
        loadTutorLevel(tutorUnlockedLevel || 1);
    }

    function exitTutorMode() {
        isTutorMode = false;
        tutorKeys.forEach(k => k.classList.remove('key-active', 'key-pressed', 'key-error'));
        tutorFingers.forEach(f => f.classList.remove('finger-active'));
        goToSetup();
    }

    // ===== Zoom dinámico y pantalla estática (solo en modo juego) =====
    const JUEGO_ANCHO_BASE = 860;   // ancho de diseño del contenedor (igual que .app-container en CSS)
    const JUEGO_ESCALA_MIN = 0.4;   // límite para que nunca quede ilegible
    const JUEGO_ESCALA_MAX = 1.5;   // límite para pantallas muy grandes
    let modoJuegoActivo = false;
    let zoomFrame = 0;
    let zoomObserver = null;

    function aplicarZoomJuego() {
        if (!modoJuegoActivo) return;
        const contenedor = document.querySelector('.app-container');
        if (!contenedor) return;

        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Tamaño base del contenedor (sin transformar): ancho de diseño y alto natural del contenido
        const baseAncho = Math.min(JUEGO_ANCHO_BASE, vw);
        contenedor.style.width = baseAncho + 'px';
        const baseAlto = contenedor.offsetHeight; // offsetHeight ignora transform

        // Escala que hace caber el contenedor completo en la ventana
        const escala = Math.max(
            JUEGO_ESCALA_MIN,
            Math.min(JUEGO_ESCALA_MAX, vw / baseAncho, vh / baseAlto)
        );
        contenedor.style.transform = `translate(-50%, -50%) scale(${escala})`;
    }

    // Agrupa varios eventos de resize en un solo cálculo por frame
    function programarZoomJuego() {
        if (zoomFrame) return;
        zoomFrame = requestAnimationFrame(() => {
            zoomFrame = 0;
            aplicarZoomJuego();
        });
    }

    // Nombre de la "pestaña" (ruta) del modo actual: #lobby/<modo>
    function nombreModoActual() {
        if (externalMode) return externalMode;
        if (isTutorMode) return 'aprendizaje';
        if (isLivesMode) return 'vidas';
        if (isFadeMode) return 'desvanecer';
        if (isStormMode) return 'tormenta';
        if (isDeadzoneMode) return 'punto-muerto';
        return 'clasico';
    }

    function activarModoJuego(estado, nombreModo) {
        estado = !!estado;
        const contenedor = document.querySelector('.app-container');

        if (estado) {
            if (!modoJuegoActivo) {
                modoJuegoActivo = true;
                // Cada modo es una "pestaña" del historial: #lobby/<modo>. "Atrás" vuelve a #lobby
                const modo = nombreModo || nombreModoActual();
                try { history.pushState({ enJuego: true, modo }, '', '#lobby/' + modo); } catch (e) { /* historial no disponible */ }
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                document.documentElement.classList.add('modo-juego');
                document.body.classList.add('modo-juego');
                document.documentElement.style.overflow = 'hidden';
                document.body.style.overflow = 'hidden';
                window.addEventListener('resize', programarZoomJuego);
                // El alto del juego cambia durante la partida (banners, vidas, combo...)
                if (contenedor && 'ResizeObserver' in window) {
                    zoomObserver = new ResizeObserver(programarZoomJuego);
                    zoomObserver.observe(contenedor);
                }
            }
            aplicarZoomJuego();
        } else {
            if (!modoJuegoActivo) return;
            modoJuegoActivo = false;
            window.removeEventListener('resize', programarZoomJuego);
            if (zoomObserver) { zoomObserver.disconnect(); zoomObserver = null; }
            if (zoomFrame) { cancelAnimationFrame(zoomFrame); zoomFrame = 0; }
            if (contenedor) {
                contenedor.style.transform = '';   // escala vuelve a 1
                contenedor.style.width = '';
            }
            document.documentElement.classList.remove('modo-juego');
            document.body.classList.remove('modo-juego');
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
        }
    }
    window.activarModoJuego = activarModoJuego;

    // ===== Navegación con History API (botón "Atrás" del navegador / mouse) =====
    // Regresa al lobby usando el historial para que todo quede sincronizado.
    // Si por algún motivo no hay entrada de juego en el historial, vuelve directo.
    function volverAlLobby() {
        if (modoJuegoActivo && history.state && history.state.enJuego) {
            history.back(); // dispara popstate -> transición al lobby
        } else {
            salirDelJuego();
        }
    }

    // Transición real al lobby (limpia el tutor si estaba activo)
    function salirDelJuego() {
        if (isTutorMode) exitTutorMode();
        else goToSetup();
    }

    window.addEventListener('popstate', (e) => {
        if (modoJuegoActivo) {
            // "Atrás" durante el juego: no se sale de la web, se vuelve al lobby
            salirDelJuego();
        } else if (e.state && e.state.enJuego) {
            // "Adelante" hacia una entrada de juego ya cerrada: no hay partida que restaurar
            history.back();
        }
    });

    // ===== Show Section =====
    function showSection(name) {
        setupSection.classList.add('hidden');
        typingSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
        if (tutorSection) tutorSection.classList.add('hidden');
        if (asedioSection) asedioSection.classList.add('hidden');
        // Los extras de resultados (p. ej. oleada y puntos del Asedio) solo viven en la pantalla de resultados
        if (name !== 'results') clearResultExtras();

        const target = name === 'setup' ? setupSection :
                       name === 'typing' ? typingSection :
                       name === 'results' ? resultsSection :
                       name === 'asedio' ? asedioSection :
                       name === 'tutor' ? tutorSection : null;

        if (target) {
            target.style.animation = 'none';
            void target.offsetWidth; // force reflow
            target.style.animation = '';
            target.classList.remove('hidden');
        }

        // Lobby (setup) = scroll normal. Cualquier otra pantalla = modo juego.
        activarModoJuego(name !== 'setup', nombreModoActual());

        // Temas inmersivos: avisan de qué pantalla se muestra ('setup' | 'typing' | 'results' | 'tutor').
        const T = window.ImmersiveThemes;
        if (T && T.active) T.emit('section', name);
    }

    // ===== Cambio de idioma: re-traducir lo que se genera desde JS =====
    function refreshDynamicLanguage() {
        // Logros
        updateAchievementsBadge();
        renderAchievementsGrid();
        // Botón de combo
        if (comboLabelDisplay) comboLabelDisplay.textContent = isOnFire ? tr('combo.fire') : tr('ui.combo-label');
        // Resultados
        if (resultsKind) setResultsTexts(resultsKind);
        // Teclado del tutor: en inglés la tecla de la derecha del home row es ";"
        const ntilde = document.getElementById('kb-key-ntilde');
        if (ntilde) {
            const isEn = window.I18N.lang === 'en';
            ntilde.setAttribute('data-key', isEn ? ';' : 'ñ');
            ntilde.textContent = isEn ? ';' : 'Ñ';
        }
        if (isTutorMode) {
            loadTutorLevel(tutorCurrentLevel);   // recarga lección, título y teclas
        } else {
            updateTutorLevelButtons();
        }
        // Pista del cuadro de escritura
        if (typeof syncInputBox === 'function' && !typingSection.classList.contains('hidden') && !typingInput.disabled) syncInputBox();
        // Aviso anti-trampas visible: el motivo ya no es válido en el nuevo idioma
        hideAntiCheatWarning();
        // Panel de Estadísticas
        if (window.SpeedStats && window.SpeedStats.refreshLanguage) window.SpeedStats.refreshLanguage();
    }
    window.I18N.onChange(refreshDynamicLanguage);

    // ===== Modos externos (Modo Asedio, asedio.js) =====
    // Un modo externo trae su propia pantalla (#<modo>-section) y usa la pantalla de resultados,
    // el historial de estadísticas y el Salón de Logros del sitio a través de ISpeedTypeBridge.
    let externalMode = null;
    let externalHandlers = null;

    function clearResultExtras() {
        document.querySelectorAll('.results-grid .result-extra').forEach((n) => n.remove());
    }

    function leaveExternalMode() {
        if (!externalMode) return;
        const h = externalHandlers;
        externalMode = null;
        externalHandlers = null;
        clearResultExtras();
        if (h && h.exit) { try { h.exit(); } catch (e) { console.warn(e); } }
    }

    window.ISpeedTypeBridge = {
        // Entra en un modo externo: oculta el resto de pantallas y muestra #<modo>-section.
        // handlers: { restart(): reinicia la partida, exit(): limpia al volver al lobby }
        enterMode(name, handlers) {
            cancelOnline();
            if (isTutorMode) exitTutorMode();
            hideAntiCheatWarning();
            isEligibleForAchievements = true;
            externalMode = name;
            externalHandlers = handlers || null;
            resultsCard.classList.remove('game-over-state', 'ghost-over-state');
            showSection(name);
        },
        showSection(name) { showSection(name); },
        exitToLobby() { volverAlLobby(); },
        // Salón de Logros (respeta el interruptor anti-trampas)
        unlockAchievement(id) { unlockAchievement(id); },
        // Muestra la pantalla de resultados del sitio y registra la partida en las estadísticas.
        // o: { kind:'gameover'|'ok', wpm, accuracy, seconds, errors, chars, words, keys, dif, subtitle, extras:[{label,value}] }
        showResults(o) {
            const wpm = Math.round(o.wpm || 0);
            const accuracy = Math.round(o.accuracy == null ? 100 : o.accuracy);
            const secs = Math.round(o.seconds || 0);
            resultWpm.textContent = wpm;
            resultAccuracy.textContent = accuracy + '%';
            resultTime.textContent = formatTime(secs);
            resultErrors.textContent = o.errors || 0;

            resultsCard.classList.remove('ghost-over-state');
            resultsCard.classList.toggle('game-over-state', o.kind === 'gameover');
            setResultsTexts(o.kind === 'gameover' ? 'gameover' : 'ok');
            if (o.subtitle) resultsSubtitle.textContent = o.subtitle;

            clearResultExtras();
            const grid = document.querySelector('.results-grid');
            (o.extras || []).forEach((x) => {
                const item = document.createElement('div');
                item.className = 'result-item result-extra';
                const num = document.createElement('span');
                num.className = 'result-number';
                num.textContent = x.value;
                const lab = document.createElement('span');
                lab.className = 'result-label';
                lab.textContent = x.label;
                item.appendChild(num);
                item.appendChild(lab);
                grid.appendChild(item);
            });

            // Estadísticas (historial, precisión, teclas): mismas reglas anti-trampas que el resto de modos
            if (window.SpeedStats && isEligibleForAchievements && wpm <= MAX_HUMAN_WPM) {
                try {
                    window.SpeedStats.record({
                        result: o.kind === 'gameover' ? 'gameover' : 'ok',
                        wpm, acc: accuracy, secs, errors: o.errors || 0,
                        chars: o.chars || 0, words: o.words || 0,
                        mode: externalMode || 'clasico', dif: o.dif || '', keys: o.keys
                    });
                } catch (err) { console.warn('No se pudo registrar la partida:', err); }
            }
            setTimeout(() => { if (externalMode) showSection('results'); }, 450);
        }
    };

    // ===== API para el modo online (online.js) =====
    // El texto lo elige el servidor; aquí solo se arranca la prueba normal con él,
    // sin modos especiales, y se engancha el registro de pulsaciones.
    function cancelOnline() {
        if (onlineHook) { const h = onlineHook; onlineHook = null; h.cancel(); }
    }
    window.ISpeedTypeOnline = {
        start(text, hook) {
            cancelOnline();
            isLivesMode = isFadeMode = isStormMode = isDeadzoneMode = false;
            [livesModeSwitch, fadeModeSwitch, stormModeSwitch, deadzoneModeSwitch].forEach((sw) => { if (sw) sw.checked = false; });
            [difficultyWrapper, fadeSpeedWrapper, stormDiffWrapper, deadzoneDiffWrapper].forEach((w) => { if (w) w.classList.add('hidden'); });
            if (isTutorMode) exitTutorMode();
            hideAntiCheatWarning();
            textInput.value = text;
            isEligibleForAchievements = true;
            startTest();
            onlineHook = hook;   // después de startTest: el reinicio interno no lo cancela
        },
        // Sale de la partida en curso sin avisar al hook (lo usa online.js al terminar un 1v1)
        stop() {
            onlineHook = null;
            if (!setupSection.classList.contains('hidden')) return;
            volverAlLobby();
        },
        isTyping() { return !typingSection.classList.contains('hidden') && !isFinished; }
    };

    // ===== Start App =====
    init();
    refreshDynamicLanguage();
})();
