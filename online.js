// ===== ISpeedType — Modo online (ranking global y 1v1) =====
// Habla con el backend (Cloudflare Worker, carpeta /server). El servidor elige el
// texto, recibe las pulsaciones y decide el resultado: aquí solo se muestra.
(function () {
    'use strict';

    // URL del backend. Tras `npm run deploy` en /server, Wrangler imprime la URL real:
    // reemplazar TU-SUBDOMINIO por el que aparezca (https://ispeedtype-api.<algo>.workers.dev)
    const PROD_API = 'https://ispeedtype-api.jpgongora721.workers.dev';
    const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
    const API = window.ISPEEDTYPE_API || (isLocal ? 'http://127.0.0.1:8787' : PROD_API);
    const WS = API.replace(/^http/, 'ws');
    const COUNTDOWN_LOCAL_MS = 3500;  // 3, 2, 1 + "¡ya!" de app.js antes de habilitar la escritura
    const STORE_KEY = 'speedtype-online-player';

    // ---------- Textos (ES/EN) ----------
    const STR = {
        es: {
            title: 'Online', subtitle: 'Ranking global y partidas 1v1 — validadas por el servidor',
            nick: 'Tu nick', save: 'Guardar', ranked: 'Carrera clasificatoria', quick: '1v1 rápido',
            create: 'Crear sala', join: 'Unirse', code: 'Código', ranking: 'Ranking',
            searching: 'Buscando rival…', cancel: 'Cancelar', waitingRoom: 'Sala {code} — esperando rival',
            copy: 'Copiar código', copied: '¡Copiado!', validating: 'Validando con el servidor…',
            waitingEnd: 'Esperando el resultado…', starting: 'Rival encontrado: {nick}. ¡Prepárate!',
            rival: 'Rival', you: 'Tú', win: '¡Ganaste!', lose: 'Perdiste', draw: 'Empate',
            accepted: 'Resultado aceptado', rejected: 'Resultado rechazado', rank: 'Puesto global',
            best: 'Tu mejor marca', wpm: 'WPM', acc: 'Precisión', elo: 'ELO', wl: 'G / P',
            boardWpm: 'Velocidad', boardElo: '1v1 (ELO)', empty: 'Todavía no hay nadie aquí. ¡Sé el primero!',
            close: 'Cerrar', unranked: 'Sala privada: no cuenta para el ELO', offline: 'No se pudo conectar con el servidor',
            needNick: 'Escribe un nick (2-16 letras o números)', badCode: 'El código tiene 6 caracteres',
            reasons: {
                'finished': 'Terminó primero', 'timeout': 'Se acabó el tiempo',
                'left': 'abandonó la partida', 'early-start': 'empezó antes de tiempo',
                'robotic-timing': 'ritmo de tecleo no humano', 'burst-timing': 'ráfagas imposibles de teclas',
                'too-fast': 'velocidad imposible', 'clock-mismatch': 'los tiempos no cuadran con el reloj del servidor',
                'incomplete': 'el texto no quedó completo', 'race-used': 'esa carrera ya se usó',
                'race-expired': 'la carrera caducó', 'rate-limited': 'demasiadas peticiones, espera un momento',
                'bad-nick': 'nick inválido', 'nick-taken': 'ese nick ya está en uso',
                'finished-win': 'Terminaste primero', 'finished-lose': 'Tu rival terminó primero', 'unauthorized': 'sesión online inválida', 'room-full': 'la sala está llena',
                'room-busy': 'la partida en esa sala ya empezó', 'no-opponent': 'nadie se unió a la sala'
            }
        },
        en: {
            title: 'Online', subtitle: 'Global leaderboard and 1v1 races — validated by the server',
            nick: 'Your nickname', save: 'Save', ranked: 'Ranked race', quick: 'Quick 1v1',
            create: 'Create room', join: 'Join', code: 'Code', ranking: 'Leaderboard',
            searching: 'Looking for an opponent…', cancel: 'Cancel', waitingRoom: 'Room {code} — waiting for opponent',
            copy: 'Copy code', copied: 'Copied!', validating: 'Validating with the server…',
            waitingEnd: 'Waiting for the result…', starting: 'Opponent found: {nick}. Get ready!',
            rival: 'Opponent', you: 'You', win: 'You won!', lose: 'You lost', draw: 'Draw',
            accepted: 'Result accepted', rejected: 'Result rejected', rank: 'Global rank',
            best: 'Your best', wpm: 'WPM', acc: 'Accuracy', elo: 'ELO', wl: 'W / L',
            boardWpm: 'Speed', boardElo: '1v1 (ELO)', empty: 'Nobody here yet. Be the first!',
            close: 'Close', unranked: 'Private room: does not count for ELO', offline: 'Could not reach the server',
            needNick: 'Type a nickname (2-16 letters or numbers)', badCode: 'The code has 6 characters',
            reasons: {
                'finished': 'Finished first', 'timeout': 'Time ran out',
                'left': 'left the race', 'early-start': 'started too early',
                'robotic-timing': 'non-human typing rhythm', 'burst-timing': 'impossible key bursts',
                'too-fast': 'impossible speed', 'clock-mismatch': "timings don't match the server clock",
                'incomplete': 'text was not completed', 'race-used': 'that race was already used',
                'race-expired': 'the race expired', 'rate-limited': 'too many requests, wait a moment',
                'bad-nick': 'invalid nickname', 'nick-taken': 'that nickname is already taken',
                'finished-win': 'You finished first', 'finished-lose': 'Your opponent finished first', 'unauthorized': 'invalid online session', 'room-full': 'the room is full',
                'room-busy': 'the race in that room already started', 'no-opponent': 'nobody joined the room'
            }
        }
    };
    const lang = () => (window.I18N && window.I18N.lang === 'en' ? 'en' : 'es');
    const t = (k, vars) => {
        let s = STR[lang()][k] ?? k;
        if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace('{' + a + '}', b);
        return s;
    };
    const reason = (code) => {
        const key = String(code || '').replace(/^disqualified:/, '');
        return STR[lang()].reasons[key] || key;
    };

    // ---------- Utilidades DOM ----------
    function el(tag, attrs = {}, ...children) {
        const e = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === 'class') e.className = v;
            else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
            else e.setAttribute(k, v);
        }
        for (const c of children) if (c != null) e.append(c);
        return e;
    }

    // ---------- Identidad (anónima: id + secreto guardados en este navegador) ----------
    let me = null;
    try { me = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { me = null; }
    function saveMe() { try { localStorage.setItem(STORE_KEY, JSON.stringify(me)); } catch { /* sin storage */ } }

    async function api(path, body) {
        let res;
        try {
            res = await fetch(API + path, {
                method: body ? 'POST' : 'GET',
                headers: body ? { 'Content-Type': 'application/json' } : {},
                body: body ? JSON.stringify(body) : undefined
            });
        } catch {
            throw new Error(t('offline'));
        }
        const data = await res.json().catch(() => ({}));
        if (data && data.error && data.error !== 'rejected') throw new Error(reason(data.error));
        return data;
    }

    async function ensurePlayer() {
        const nick = ui.nick.value.trim();
        if (me) {
            if (nick && nick !== me.nick) {
                const r = await api('/api/player/nick', { id: me.id, secret: me.secret, nick });
                me.nick = r.nick; saveMe();
            }
            return me;
        }
        if (nick.length < 2) { ui.nick.focus(); throw new Error(t('needNick')); }
        const r = await api('/api/player', { nick });
        me = { id: r.id, secret: r.secret, nick: r.nick };
        saveMe();
        return me;
    }

    // ---------- UI ----------
    const ui = {};
    function buildUI() {
        const anchor = document.querySelector('.tutor-entry-card');
        if (!anchor) return false;

        ui.nick = el('input', { class: 'online-nick', type: 'text', maxlength: '16', autocomplete: 'off', spellcheck: 'false' });
        ui.code = el('input', { class: 'online-code', type: 'text', maxlength: '6', autocomplete: 'off', spellcheck: 'false' });
        ui.code.addEventListener('input', () => { ui.code.value = ui.code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
        ui.code.addEventListener('keydown', (e) => { if (e.key === 'Enter') onJoin(); });
        ui.nick.addEventListener('keydown', (e) => { if (e.key === 'Enter') onSaveNick(); });

        ui.btnSave = el('button', { class: 'btn online-btn ghost', type: 'button', onclick: onSaveNick });
        ui.btnRanked = el('button', { class: 'btn online-btn primary', type: 'button', onclick: onRanked });
        ui.btnQuick = el('button', { class: 'btn online-btn primary', type: 'button', onclick: onQuick });
        ui.btnCreate = el('button', { class: 'btn online-btn', type: 'button', onclick: onCreate });
        ui.btnJoin = el('button', { class: 'btn online-btn', type: 'button', onclick: onJoin });
        ui.btnBoard = el('button', { class: 'btn online-btn ghost', type: 'button', onclick: () => showBoard('wpm') });
        ui.title = el('span', { class: 'online-title' });
        ui.subtitle = el('span', { class: 'online-subtitle' });
        ui.msg = el('div', { class: 'online-msg', role: 'status', 'aria-live': 'polite' });

        ui.card = el('div', { class: 'online-card', id: 'online-card' },
            el('div', { class: 'online-head' }, ui.title, ui.subtitle),
            el('div', { class: 'online-row' }, ui.nick, ui.btnSave),
            el('div', { class: 'online-row' }, ui.btnRanked, ui.btnQuick),
            el('div', { class: 'online-row' }, ui.btnCreate, ui.code, ui.btnJoin, ui.btnBoard),
            ui.msg
        );
        anchor.insertAdjacentElement('afterend', ui.card);

        // Barra flotante de estado (buscando, esperando, validando…)
        ui.statusText = el('span');
        ui.statusAction = el('button', { class: 'btn online-btn ghost small', type: 'button' });
        ui.status = el('div', { class: 'online-status hidden', role: 'status' }, ui.statusText, ui.statusAction);
        document.body.append(ui.status);

        // Barra del rival dentro de la pantalla de escritura
        ui.rivalName = el('span', { class: 'online-rival-name' });
        ui.rivalFill = el('div', { class: 'online-rival-fill' });
        ui.rivalInfo = el('span', { class: 'online-rival-info' });
        ui.rival = el('div', { class: 'online-rival hidden' },
            ui.rivalName, el('div', { class: 'online-rival-track' }, ui.rivalFill), ui.rivalInfo);
        const typing = document.getElementById('typing-section');
        if (typing) typing.prepend(ui.rival);

        // Modal (ranking y resultados): reutiliza el estilo del modal de logros
        ui.modalTitle = el('h2', { class: 'achievements-title' });
        ui.modalBody = el('div', { class: 'online-modal-body' });
        ui.modalClose = el('button', { class: 'achievements-close-btn', type: 'button', 'aria-label': 'close', onclick: closeModal }, '✕');
        ui.modal = el('div', { class: 'achievements-modal-overlay hidden', id: 'online-modal' },
            el('div', { class: 'achievements-panel glass-card online-panel' },
                el('div', { class: 'achievements-header' },
                    el('div', { class: 'achievements-title-group' }, el('div', { class: 'achievements-icon-main' }, '🌐'), ui.modalTitle),
                    ui.modalClose),
                ui.modalBody));
        ui.modal.addEventListener('click', (e) => { if (e.target === ui.modal) closeModal(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ui.modal.classList.contains('hidden')) closeModal(); });
        document.body.append(ui.modal);

        applyTexts();
        if (window.I18N && window.I18N.onChange) window.I18N.onChange(applyTexts);
        return true;
    }

    function applyTexts() {
        ui.title.textContent = '🌐 ' + t('title');
        ui.subtitle.textContent = t('subtitle');
        ui.nick.placeholder = t('nick');
        ui.code.placeholder = t('code');
        ui.btnSave.textContent = t('save');
        ui.btnRanked.textContent = t('ranked');
        ui.btnQuick.textContent = t('quick');
        ui.btnCreate.textContent = t('create');
        ui.btnJoin.textContent = t('join');
        ui.btnBoard.textContent = '🏆 ' + t('ranking');
        if (me && !ui.nick.value) ui.nick.value = me.nick;
    }

    function say(text, isError) {
        ui.msg.textContent = text || '';
        ui.msg.classList.toggle('error', !!isError);
    }
    function setBusy(b) {
        for (const k of ['btnRanked', 'btnQuick', 'btnCreate', 'btnJoin', 'btnSave']) ui[k].disabled = b;
    }
    function showStatus(text, actionLabel, action) {
        ui.statusText.textContent = text;
        ui.statusAction.textContent = actionLabel || '';
        ui.statusAction.classList.toggle('hidden', !actionLabel);
        ui.statusAction.onclick = action || null;
        ui.status.classList.remove('hidden');
    }
    function hideStatus() { ui.status.classList.add('hidden'); }

    function openModal(title, body) {
        ui.modalTitle.textContent = title;
        ui.modalBody.replaceChildren(...body);
        ui.modal.classList.remove('hidden');
    }
    function closeModal() { ui.modal.classList.add('hidden'); }

    function statGrid(pairs) {
        return el('div', { class: 'online-stats' }, ...pairs.map(([k, v]) =>
            el('div', { class: 'online-stat' }, el('span', { class: 'online-stat-value' }, String(v)), el('span', { class: 'online-stat-label' }, k))));
    }

    async function run(fn) {
        say('');
        setBusy(true);
        try { await fn(); } catch (e) { say(e.message, true); hideStatus(); } finally { setBusy(false); }
    }

    // ---------- Nick ----------
    function onSaveNick() {
        run(async () => { await ensurePlayer(); say('✓ ' + me.nick); });
    }

    // ---------- Carrera clasificatoria (ranking de WPM) ----------
    function onRanked() {
        run(async () => {
            const p = await ensurePlayer();
            const race = await api('/api/race/start', { id: p.id, secret: p.secret, lang: lang() });
            const events = [];
            let t0 = null, last = 0;
            const stamp = () => {
                if (t0 === null) { t0 = performance.now(); return 0; }
                last = Math.max(last, Math.round(performance.now() - t0));
                return last;
            };
            window.ISpeedTypeOnline.start(race.text, {
                push: (ch) => events.push([ch, stamp()]),
                pop: () => events.push(['\b', stamp()]),
                cancel: () => {},
                finish: () => submitRace(p, race.raceId, events)
            });
        });
    }

    async function submitRace(p, raceId, events) {
        showStatus(t('validating'));
        try {
            const r = await api('/api/race/submit', { id: p.id, secret: p.secret, raceId, events });
            hideStatus();
            if (r.error === 'rejected') {
                openModal(t('rejected'), [el('p', { class: 'online-note error' }, reason(r.reason))]);
                return;
            }
            openModal(t('accepted'), [
                statGrid([[t('wpm'), r.wpm], [t('acc'), r.accuracy + '%'], [t('best'), r.best], [t('rank'), '#' + r.rank]]),
                el('button', { class: 'btn online-btn primary', type: 'button', onclick: () => showBoard('wpm') }, '🏆 ' + t('ranking'))
            ]);
        } catch (e) {
            hideStatus();
            openModal(t('rejected'), [el('p', { class: 'online-note error' }, e.message)]);
        }
    }

    // ---------- 1v1 ----------
    let mmSocket = null;
    let room = null;   // { ws, code, ranked, players, startTimer }

    function onQuick() {
        run(async () => {
            const p = await ensurePlayer();
            leaveRoom();
            const ws = new WebSocket(WS + '/api/matchmake');
            mmSocket = ws;
            showStatus(t('searching'), t('cancel'), cancelSearch);
            ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', id: p.id, secret: p.secret, lang: lang() }));
            ws.onmessage = (e) => {
                const m = JSON.parse(e.data);
                if (m.type === 'matched') { mmSocket = null; joinRoom(m.room); }
                else if (m.type === 'error') { say(reason(m.error), true); hideStatus(); }
            };
            ws.onerror = () => { if (mmSocket === ws) { say(t('offline'), true); hideStatus(); mmSocket = null; } };
            ws.onclose = () => { if (mmSocket === ws) { mmSocket = null; hideStatus(); } };
        });
    }
    function cancelSearch() {
        const ws = mmSocket; mmSocket = null;
        if (ws) ws.close();
        hideStatus();
    }

    function onCreate() {
        run(async () => {
            await ensurePlayer();
            const { code } = await api('/api/room/new', {});
            joinRoom(code);
        });
    }

    function onJoin() {
        const code = ui.code.value.trim().toUpperCase();
        if (!/^[A-Z2-9]{6}$/.test(code)) { say(t('badCode'), true); return; }
        run(async () => { await ensurePlayer(); joinRoom(code); });
    }

    function joinRoom(code) {
        leaveRoom();
        const ws = new WebSocket(WS + '/api/room/' + code);
        const r = room = { ws, code, ranked: false, players: [], startTimer: null, ended: false };
        const isPrivate = !code.startsWith('mm-');

        ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', id: me.id, secret: me.secret, lang: lang() }));
        ws.onmessage = (e) => {
            if (room !== r) return;
            const m = JSON.parse(e.data);
            if (m.type === 'waiting') {
                if (isPrivate) {
                    showStatus(t('waitingRoom', { code }), t('copy'), () => {
                        navigator.clipboard && navigator.clipboard.writeText(code).then(() => { ui.statusAction.textContent = t('copied'); });
                    });
                } else {
                    showStatus(t('searching'), t('cancel'), leaveRoom);
                }
            } else if (m.type === 'start') {
                onStart(r, m);
            } else if (m.type === 'p') {
                if (m.id !== me.id) updateRival(m.pos, m.len, m.wpm);
            } else if (m.type === 'end') {
                onEnd(r, m);
            } else if (m.type === 'error') {
                hideStatus();
                say(reason(m.error), true);
            }
        };
        ws.onerror = () => { if (room === r && !r.ended) { say(t('offline'), true); hideStatus(); } };
        ws.onclose = () => { if (room === r && !r.ended) { room = null; hideStatus(); hideRival(); } };
    }

    function onStart(r, m) {
        r.ranked = m.ranked;
        r.players = m.players;
        const rival = m.players.find((p) => p.id !== me.id);
        showStatus(t('starting', { nick: rival ? rival.nick : '?' }));
        ui.rivalName.textContent = t('rival') + ': ' + (rival ? rival.nick : '?') + (rival && r.ranked ? ` (${rival.elo})` : '');
        updateRival(0, m.text.length, 0);
        // El servidor habilita la escritura en goIn ms; la cuenta local dura ~3,5 s.
        // Se arranca un poco tarde a propósito: nunca antes que el servidor.
        const delay = Math.max(0, m.goIn - COUNTDOWN_LOCAL_MS + 300);
        r.startTimer = setTimeout(() => {
            if (room !== r || r.ended) return;
            hideStatus();
            ui.rival.classList.remove('hidden');
            let t0 = null;
            const tt = () => (t0 === null ? (t0 = performance.now(), 0) : Math.round(performance.now() - t0));
            const send = (k) => { try { r.ws.send(JSON.stringify({ type: 'k', k, t: tt() })); } catch { /* socket cerrado */ } };
            window.ISpeedTypeOnline.start(m.text, {
                push: (ch) => send(ch),
                pop: () => send('\b'),
                finish: () => { if (!r.ended) showStatus(t('waitingEnd')); },
                cancel: () => leaveRoom()   // salir/reiniciar en plena carrera = abandono
            });
        }, delay);
    }

    function onEnd(r, m) {
        r.ended = true;
        clearTimeout(r.startTimer);
        hideStatus();
        hideRival();
        if (window.ISpeedTypeOnline.isTyping()) window.ISpeedTypeOnline.stop();
        room = null;
        try { r.ws.close(); } catch { /* ok */ }

        const title = !m.winner ? t('draw') : m.winner === me.id ? t('win') : t('lose');
        const mine = m.results.find((x) => x.id === me.id) || {};
        const other = m.results.find((x) => x.id !== me.id) || {};
        const why = m.reason.startsWith('disqualified:')
            ? (m.winner === me.id ? other.nick : t('you')) + ': ' + reason(m.reason)
            : m.reason === 'finished' ? reason(m.winner === me.id ? 'finished-win' : 'finished-lose')
            : reason(m.reason);
        const row = (x, label) => el('tr', {},
            el('td', {}, label), el('td', {}, x.finished ? String(x.wpm) : '—'),
            el('td', {}, (x.len ? Math.round((x.pos / x.len) * 100) : 0) + '%'), el('td', {}, (x.accuracy ?? 100) + '%'));
        const body = [
            el('p', { class: 'online-note' }, why),
            el('table', { class: 'online-table' },
                el('thead', {}, el('tr', {}, el('th', {}, ''), el('th', {}, t('wpm')), el('th', {}, '%'), el('th', {}, t('acc')))),
                el('tbody', {}, row(mine, t('you') + ' (' + (mine.nick || '') + ')'), row(other, other.nick || t('rival'))))
        ];
        if (m.ranked && m.elo) {
            const d = m.winner === me.id ? '+' + m.elo.delta : '−' + m.elo.delta;
            body.push(el('p', { class: 'online-note' }, `${t('elo')}: ${d}`));
        } else if (!m.ranked) {
            body.push(el('p', { class: 'online-note muted' }, t('unranked')));
        }
        openModal(title, body);
    }

    function updateRival(pos, len, wpm) {
        const pct = len ? Math.round((pos / len) * 100) : 0;
        ui.rivalFill.style.width = pct + '%';
        ui.rivalInfo.textContent = `${pct}% · ${wpm} ${t('wpm')}`;
    }
    function hideRival() { ui.rival.classList.add('hidden'); }

    function leaveRoom() {
        const r = room; room = null;
        if (!r) return;
        clearTimeout(r.startTimer);
        r.ended = true;
        try { r.ws.close(); } catch { /* ok */ }
        hideStatus();
        hideRival();
    }

    // ---------- Ranking ----------
    async function showBoard(board) {
        const tabs = el('div', { class: 'online-tabs' },
            ...[['wpm', t('boardWpm')], ['elo', t('boardElo')]].map(([b, label]) =>
                el('button', { class: 'online-tab' + (b === board ? ' active' : ''), type: 'button', onclick: () => showBoard(b) }, label)));
        const holder = el('div', { class: 'online-board' }, '…');
        openModal(t('ranking'), [tabs, holder]);
        try {
            const rows = await api(`/api/leaderboard?lang=${lang()}&board=${board}&limit=50`);
            if (!rows.length) { holder.replaceChildren(el('p', { class: 'online-note muted' }, t('empty'))); return; }
            const head = board === 'elo' ? ['#', 'Nick', t('elo'), t('wl')] : ['#', 'Nick', t('wpm'), t('acc')];
            const body = rows.map((r, i) => el('tr', { class: me && r.nick === me.nick ? 'me' : '' },
                el('td', {}, String(i + 1)), el('td', {}, r.nick),
                ...(board === 'elo'
                    ? [el('td', {}, String(r.elo)), el('td', {}, `${r.wins} / ${r.losses}`)]
                    : [el('td', {}, String(r.wpm)), el('td', {}, r.acc + '%')])));
            holder.replaceChildren(el('table', { class: 'online-table' },
                el('thead', {}, el('tr', {}, ...head.map((h) => el('th', {}, h)))), el('tbody', {}, ...body)));
        } catch (e) {
            holder.replaceChildren(el('p', { class: 'online-note error' }, e.message));
        }
    }

    // ---------- Arranque ----------
    if (!window.ISpeedTypeOnline) { console.warn('online.js: falta la API de app.js'); return; }
    if (!buildUI()) console.warn('online.js: no se encontró dónde montar el panel');
})();
