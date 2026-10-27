/* ===================================================
   ISpeedType — Tema inmersivo: ESPACIO PROFUNDO (Viaje estelar)
   Depende de themes/immersive.js (motor) y themes/space.css (estilos).

   Es el primer tema con GRÁFICOS REALES en la GPU (WebGL propio, sin librerías):
     - una nebulosa procedural (ruido fractal con "domain warping") en un canvas
       de baja resolución: es suave por naturaleza, así que cuesta muy poco;
     - un planeta gaseoso con anillos, dibujado con matemáticas en un shader,
       que se acerca y crece según tu progreso en el texto (la meta del viaje);
     - 1 600 estrellas con perspectiva real que vuelan hacia ti. Cada acierto
       acelera la nave; con la racha entras en velocidad warp (las estrellas se
       estiran en rayas); un error apaga los motores y sacude la cámara;
     - HUD de nave con velocímetro, distancia al destino, IA de a bordo (NOVA)
       y avisos; sonido sintetizado (zumbido de motores, bips, warp, alarmas).

   Optimización:
     - Dos canvas: nebulosa a ~50 % de resolución, planeta + estrellas a pantalla
       completa. Todo el dibujo ocurre en la GPU: el hilo principal solo actualiza
       unos pocos uniformes por fotograma.
     - Máx. 60 fps, pausa total con la pestaña oculta, y baja la resolución de la
       nebulosa si el equipo va justo.
     - El texto de la prueba NO se toca: ninguna animación por letra, ningún
       backdrop-filter (se recalcularía cada fotograma sobre el canvas).
     - Con "reducir movimiento": velocidad baja y constante, sin warp ni sacudidas.
     - Sin WebGL: queda un fondo de degradado estático (clase space-nogl).
   =================================================== */
(function () {
    'use strict';

    const T = window.ImmersiveThemes;
    if (!T) return;

    const A = T.audio;
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = (arr) => arr[(Math.random() * arr.length) | 0];
    const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const isEN = () => (document.documentElement.lang || '').toLowerCase().indexOf('en') === 0;

    const STAR_COUNT = 1600;
    const NEBULA_SCALE = 0.5;       // resolución de la nebulosa respecto a los píxeles CSS
    const MAX_DPR = 1.5;

    // ---------------------------------------------------
    // Shaders
    // ---------------------------------------------------
    const FS_PRECISION =
        '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';

    const VS_QUAD = 'attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';

    const NOISE_GLSL = `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
}`;

    // Nebulosa + rayas de warp + destellos (canvas de baja resolución)
    const FS_NEBULA = FS_PRECISION + NOISE_GLSL + `
uniform vec2 uRes;
uniform float uTime, uTravel, uWarp, uFire, uErr, uPower, uFlash;
uniform vec2 uShake;
void main(){
    vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y + uShake;
    float r = length(p);
    float t = uTime * 0.025 + uTravel * 0.06;

    vec2 q = vec2(fbm(p * 1.5 + t), fbm(p * 1.5 + vec2(5.2, 1.3) - t));
    float f = fbm(p * 1.7 + 2.2 * q + vec2(t * 0.6, -t * 0.3));

    vec3 navy    = vec3(0.012, 0.018, 0.06);
    vec3 violet  = mix(vec3(0.30, 0.10, 0.58), vec3(0.78, 0.36, 0.10), uFire);
    vec3 magenta = mix(vec3(0.82, 0.16, 0.52), vec3(1.00, 0.30, 0.18), uFire);
    vec3 cyan    = mix(vec3(0.08, 0.62, 0.90), vec3(1.00, 0.82, 0.35), uFire);

    vec3 col = navy;
    col = mix(col, violet,  smoothstep(0.25, 0.75, f));
    col = mix(col, magenta, smoothstep(0.55, 1.05, q.x * f * 1.7));
    col += cyan * pow(clamp(f * q.y * 1.6, 0.0, 1.0), 3.0) * 0.9;
    col *= 0.9 * (1.0 - 0.45 * smoothstep(0.2, 1.3, r));            // viñeta

    // Rayas radiales de velocidad warp
    float ang = atan(p.y, p.x);
    float s1 = vnoise(vec2(ang * 22.0, uTravel * 2.0 + 3.0));
    float s2 = vnoise(vec2(ang * 61.0, uTravel * 4.0));
    float streak = pow(s1 * s2, 1.6) * 2.6 * smoothstep(0.08, 0.9, r);
    vec3 warpCol = mix(vec3(0.55, 0.78, 1.0), vec3(1.0, 0.85, 0.5), uFire);
    col += warpCol * streak * uWarp * 0.55;
    col += warpCol * uWarp * 0.3 * exp(-r * 2.6);                    // brillo central

    col += vec3(0.55, 0.0, 0.06) * uErr * 0.5 * smoothstep(0.1, 1.1, r); // alarma roja en los bordes
    col = mix(col, vec3(1.0), uFlash);
    col *= mix(0.12, 1.0, uPower);
    gl_FragColor = vec4(col, 1.0);
}`;

    // Planeta gaseoso con anillos (canvas a resolución completa; sale premultiplicado)
    const FS_PLANET = FS_PRECISION + NOISE_GLSL + `
uniform vec2 uRes;
uniform float uTime, uProg, uPower, uFire, uFlash;
uniform vec2 uShake;
void main(){
    vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y + uShake;
    float R = mix(0.075, 0.36, uProg);
    vec2 C = mix(vec2(0.62, 0.20), vec2(0.40, 0.07), uProg);
    vec2 d = p - C;
    if (length(d) > R * 2.5) { gl_FragColor = vec4(0.0); return; }

    // Ejes del anillo: inclinado unos -20 grados
    float ca = cos(-0.35), sa = sin(-0.35);
    vec2 dr = vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y);
    float rr = length(vec2(dr.x, dr.y / 0.26)) / R;

    // Anillo: bandas finas + hueco de Cassini
    float ring = smoothstep(1.32, 1.38, rr) * (1.0 - smoothstep(2.05, 2.12, rr));
    ring *= 0.55 + 0.45 * sin(rr * 70.0 + vnoise(vec2(rr * 14.0, 1.0)) * 5.0);
    ring *= 1.0 - 0.85 * smoothstep(1.78, 1.80, rr) * (1.0 - smoothstep(1.84, 1.86, rr));
    vec3 ringCol = mix(vec3(0.83, 0.74, 0.62), vec3(0.55, 0.62, 0.78), smoothstep(1.3, 2.1, rr));

    // Esfera
    float pr = length(d) / R;
    float pa = 1.0 - smoothstep(0.985, 1.0, pr);
    vec3 n = vec3(d / R, sqrt(max(0.0, 1.0 - pr * pr)));
    vec3 L = normalize(vec3(-0.65, 0.45, 0.6));
    float diff = clamp(dot(n, L), 0.0, 1.0);
    float lat = n.y + 0.07 * vnoise(vec2(n.x * 4.0, n.y * 9.0 + uTime * 0.02));
    float band = 0.5 + 0.5 * sin(lat * 17.0 + 2.2 * vnoise(vec2(n.x * 3.0 + uTime * 0.01, lat * 7.0)));
    vec3 cA = mix(vec3(0.20, 0.52, 0.78), vec3(0.85, 0.40, 0.22), uFire);
    vec3 cB = vec3(0.93, 0.80, 0.62);
    vec3 cC = vec3(0.30, 0.20, 0.52);
    vec3 base = mix(mix(cA, cB, band), cC, smoothstep(0.55, 1.0, abs(n.y)) * 0.6);
    vec3 pcol = base * (0.035 + pow(diff, 0.85) * 1.15);
    float fres = pow(1.0 - n.z, 3.0);
    pcol += vec3(0.25, 0.6, 1.0) * fres * (0.25 + 1.2 * diff);       // atmósfera
    // Sombra del planeta sobre el anillo (lado opuesto a la luz)
    float ringShade = mix(0.35, 1.0, smoothstep(-0.2, 0.4, dot(normalize(d + 1e-4), L.xy) + 0.3));

    // El anillo pasa por delante en la mitad de abajo (dr.y < 0) y por detrás arriba
    float front = step(dr.y, 0.0);
    vec3 col = vec3(0.0);
    float a = 0.0;
    // detrás
    col = ringCol * ring * ringShade * (1.0 - front);
    a = ring * (1.0 - front);
    // planeta
    col = mix(col, pcol, pa);
    a = max(a, pa);
    // delante
    float fa = ring * front;
    col = mix(col, ringCol * ringShade, fa);
    a = max(a, fa);

    // Halo atmosférico exterior
    float halo = exp(-(pr - 1.0) * 14.0) * step(1.0, pr) * 0.35 * (0.3 + diff);
    col += vec3(0.3, 0.6, 1.0) * halo;
    a = max(a, halo * 0.6);

    col *= mix(0.12, 1.0, uPower);
    col = mix(col, vec3(1.0), uFlash * a);
    gl_FragColor = vec4(col, a);
}`;

    const VS_STARS = `
attribute vec3 aPos;
attribute vec2 aRnd;        // x: azar de la estrella, y: 0 = cabeza, 1 = cola
uniform float uTravel, uStreak, uAspect, uPx, uMode;
uniform vec2 uShake;
varying float vAlpha;
varying vec3 vCol;
void main(){
    float z = fract(aPos.z - uTravel);
    float zz = min(z + aRnd.y * uStreak, 1.3);
    vec2 xy = aPos.xy * 0.95 / (zz * 1.3 + 0.05) + uShake * (1.0 - z * 0.7);
    gl_Position = vec4(xy.x / uAspect, xy.y, 0.0, 1.0);
    float size = (1.0 + (1.0 - z) * 2.6) * (0.55 + 0.9 * aRnd.x) * uPx;
    gl_PointSize = (uMode < 0.5 && aRnd.y < 0.5) ? size : 0.0;
    vAlpha = smoothstep(1.0, 0.82, z) * smoothstep(0.0, 0.05, z) * (0.3 + 0.7 * aRnd.x) * (1.0 - aRnd.y * 0.95);
    vCol = mix(vec3(0.72, 0.85, 1.0), vec3(1.0, 0.86, 0.68), fract(aRnd.x * 7.31));
}`;

    const FS_STARS = FS_PRECISION + `
uniform float uMode;
uniform vec3 uTint;
varying float vAlpha;
varying vec3 vCol;
void main(){
    float a = vAlpha;
    if (uMode < 0.5) { float d = length(gl_PointCoord - 0.5); a *= smoothstep(0.5, 0.0, d); }
    gl_FragColor = vec4(vCol * uTint * a, a);
}`;

    // ---------------------------------------------------
    // Estado de la escena
    // ---------------------------------------------------
    let canvasN = null, canvasP = null, glN = null, glP = null;
    let progN = null, progP = null, progS = null;     // programas
    let uN = {}, uP = {}, uS = {};
    let starBuf = null;
    let running = false, rafId = 0, lastT = 0, accT = 0;
    let slowFrames = 0, scaleN = NEBULA_SCALE, starDraw = STAR_COUNT;

    const S = {                  // estado dinámico del viaje
        time: 0, travel: 0, speed: 0.1, impulse: 0, combo: 0, fire: 0, fireT: 0,
        err: 0, shake: 0, power: 1, powerT: 1, prog: 0, flash: 0,
        jump: -1, dead: false, warpOn: false
    };

    function compile(gl, type, src, label) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.warn('[space] shader ' + label + ':', gl.getShaderInfoLog(sh));
            return null;
        }
        return sh;
    }

    function program(gl, vs, fs, label) {
        const v = compile(gl, gl.VERTEX_SHADER, vs, label + '.vs');
        const f = compile(gl, gl.FRAGMENT_SHADER, fs, label + '.fs');
        if (!v || !f) return null;
        const p = gl.createProgram();
        gl.attachShader(p, v); gl.attachShader(p, f);
        gl.bindAttribLocation(p, 0, 'aPos');
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.warn('[space] link ' + label + ':', gl.getProgramInfoLog(p));
            return null;
        }
        return p;
    }

    function uniforms(gl, p, names) {
        const o = {};
        names.forEach(n => { o[n] = gl.getUniformLocation(p, n); });
        return o;
    }

    function makeCanvas(z) {
        const c = document.createElement('canvas');
        c.className = 'sp-canvas sp-canvas-' + z;
        c.setAttribute('aria-hidden', 'true');
        return c;
    }

    function setupGL() {
        canvasN = makeCanvas('nebula');
        canvasP = makeCanvas('stars');
        const opts = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false };
        glN = canvasN.getContext('webgl', opts);
        glP = canvasP.getContext('webgl', Object.assign({}, opts, { alpha: true, premultipliedAlpha: true }));
        if (!glN || !glP) return false;

        // Cuadrado a pantalla completa (compartido por nebulosa y planeta)
        const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        [glN, glP].forEach(gl => {
            const b = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, b);
            gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
        });

        progN = program(glN, VS_QUAD, FS_NEBULA, 'nebula');
        progP = program(glP, VS_QUAD, FS_PLANET, 'planet');
        progS = program(glP, VS_STARS, FS_STARS, 'stars');
        if (!progN || !progP || !progS) return false;
        uN = uniforms(glN, progN, ['uRes', 'uTime', 'uTravel', 'uWarp', 'uFire', 'uErr', 'uPower', 'uFlash', 'uShake']);
        uP = uniforms(glP, progP, ['uRes', 'uTime', 'uProg', 'uPower', 'uFire', 'uFlash', 'uShake']);
        uS = uniforms(glP, progS, ['uTravel', 'uStreak', 'uAspect', 'uPx', 'uMode', 'uShake', 'uTint']);

        // Estrellas: dos vértices por estrella (cabeza y cola), 5 floats cada uno
        const data = new Float32Array(STAR_COUNT * 2 * 5);
        for (let i = 0; i < STAR_COUNT; i++) {
            const ang = Math.random() * Math.PI * 2;
            const rad = 0.04 + Math.sqrt(Math.random()) * 1.55;   // evita el centro exacto
            const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
            const z = Math.random(), rn = Math.random();
            for (let s = 0; s < 2; s++) {
                const o = (i * 2 + s) * 5;
                data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = rn; data[o + 4] = s;
            }
        }
        starBuf = glP.createBuffer();
        glP.bindBuffer(glP.ARRAY_BUFFER, starBuf);
        glP.bufferData(glP.ARRAY_BUFFER, data, glP.STATIC_DRAW);
        return true;
    }

    function resize() {
        if (!canvasN) return;
        const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        canvasN.width = Math.max(2, Math.round(w * scaleN));
        canvasN.height = Math.max(2, Math.round(h * scaleN));
        canvasP.width = Math.round(w * dpr);
        canvasP.height = Math.round(h * dpr);
    }

    let resizeTimer = 0;
    function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); }

    // ---------------------------------------------------
    // Bucle de dibujo
    // ---------------------------------------------------
    function drawNebula() {
        const gl = glN;
        gl.viewport(0, 0, canvasN.width, canvasN.height);
        gl.useProgram(progN);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.getParameter(gl.ARRAY_BUFFER_BINDING));
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(uN.uRes, canvasN.width, canvasN.height);
        gl.uniform1f(uN.uTime, S.time);
        gl.uniform1f(uN.uTravel, S.travel);
        gl.uniform1f(uN.uWarp, S.warp);
        gl.uniform1f(uN.uFire, S.fire);
        gl.uniform1f(uN.uErr, S.err);
        gl.uniform1f(uN.uPower, S.power);
        gl.uniform1f(uN.uFlash, S.flash);
        gl.uniform2f(uN.uShake, S.sx, S.sy);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function drawSky() {
        const gl = glP;
        gl.viewport(0, 0, canvasP.width, canvasP.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // 1) planeta (fondo)
        gl.disable(gl.BLEND);
        gl.useProgram(progP);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBufP());
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(uP.uRes, canvasP.width, canvasP.height);
        gl.uniform1f(uP.uTime, S.time);
        gl.uniform1f(uP.uProg, S.prog);
        gl.uniform1f(uP.uPower, S.power);
        gl.uniform1f(uP.uFire, S.fire);
        gl.uniform1f(uP.uFlash, S.flash);
        gl.uniform2f(uP.uShake, S.sx, S.sy);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // 2) estrellas (suma de luz)
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(progS);
        gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
        const loc = gl.getAttribLocation(progS, 'aRnd');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 20, 12);
        const dpr = canvasP.width / Math.max(1, window.innerWidth);
        gl.uniform1f(uS.uTravel, S.travel);
        gl.uniform1f(uS.uStreak, S.streak);
        gl.uniform1f(uS.uAspect, canvasP.width / canvasP.height);
        gl.uniform1f(uS.uPx, 1.6 * dpr);
        gl.uniform2f(uS.uShake, S.sx, S.sy);
        gl.uniform3f(uS.uTint, S.tr, S.tg, S.tb);
        const n = starDraw * 2;
        gl.uniform1f(uS.uMode, 0);
        gl.drawArrays(gl.POINTS, 0, n);
        if (S.streak > 0.004) {
            gl.uniform1f(uS.uMode, 1);
            gl.drawArrays(gl.LINES, 0, n);
        }
    }

    let quadP = null;
    function quadBufP() {
        if (!quadP) {
            quadP = glP.createBuffer();
            glP.bindBuffer(glP.ARRAY_BUFFER, quadP);
            glP.bufferData(glP.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), glP.STATIC_DRAW);
        }
        return quadP;
    }

    // Avance del estado (dt en segundos)
    function step(dt) {
        const rm = T.reducedMotion;
        S.time += dt;

        // Salto a hiperespacio al terminar
        let jumpSpeed = 0;
        if (S.jump >= 0) {
            S.jump += dt / 2.4;
            const j = S.jump;
            S.flash = rm ? 0 : smooth(0.0, 0.22, j) * (1 - smooth(0.22, 0.75, j)) * 0.95;
            jumpSpeed = rm ? 0 : (1 - smooth(0.0, 0.7, j));
            if (j >= 1) { S.jump = -1; S.flash = 0; }
        }

        // Velocidad objetivo según racha
        const comboK = clamp(S.combo / 60, 0, 1);
        let target = 0.10 + comboK * 0.55 + S.fireT * 0.22 + S.impulse;
        target = Math.max(target, jumpSpeed);
        if (S.dead) target = 0;
        if (rm) target = Math.min(target, 0.14);
        S.speed += (target - S.speed) * Math.min(1, dt * (S.dead ? 1.4 : 3.2));
        S.impulse *= Math.exp(-dt * 3.2);
        S.err *= Math.exp(-dt * 2.2);
        S.shake *= Math.exp(-dt * 5.0);
        S.fire += (S.fireT - S.fire) * Math.min(1, dt * 2.2);
        S.power += (S.powerT - S.power) * Math.min(1, dt * (S.dead ? 1.6 : 4));

        S.travel += S.speed * dt * 0.42;
        S.warp = rm ? 0 : smooth(0.52, 0.95, S.speed);
        S.streak = rm ? 0 : S.warp * 0.30 + S.speed * 0.05;

        // Sacudida de cámara
        if (!rm && S.shake > 0.002) {
            const k = S.shake * 0.02;
            S.sx = Math.sin(S.time * 91.0) * k;
            S.sy = Math.cos(S.time * 77.0) * k;
        } else { S.sx = 0; S.sy = 0; }

        // Tinte de estrellas: oro con fuego, rojo con error
        S.tr = lerp(lerp(1.0, 1.0, S.fire), 1.0, S.err);
        S.tg = lerp(lerp(1.0, 0.82, S.fire), 0.35, S.err);
        S.tb = lerp(lerp(1.0, 0.5, S.fire), 0.4, S.err);

        // Aviso de warp (una vez al cruzar el umbral)
        // (con histéresis para que no parpadee, y mudo durante el salto final o con la nave apagada)
        if (S.jump < 0 && !S.dead) {
            const warpNow = S.warpOn ? S.speed > 0.5 : S.speed > 0.64;
            if (warpNow !== S.warpOn) {
                S.warpOn = warpNow;
                onWarp(warpNow);
            }
        } else if (S.warpOn && S.dead) {
            S.warpOn = false;
        }
    }

    let frameCount = 0;
    function frame(ts) {
        rafId = 0;
        if (!running) return;
        rafId = requestAnimationFrame(frame);
        const dtMs = ts - lastT;
        if (dtMs < 14) return;                       // tope ≈ 60 fps
        lastT = ts;
        const dt = Math.min(dtMs, 100) / 1000;

        // Calidad adaptable: si va lento de forma sostenida, bajamos la resolución de la nebulosa
        if (dtMs > 30) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
        if (slowFrames > 45 && scaleN > 0.3) { scaleN = 0.32; starDraw = 1000; slowFrames = 0; resize(); }

        step(dt);
        if ((frameCount++ & 7) === 0) { readProgress(); updateHud(); }
        S.prog += (S.progT - S.prog) * Math.min(1, dt * 2.5);
        try { drawNebula(); drawSky(); } catch (e) { stop(); }
    }

    function start() {
        if (running) return;
        running = true;
        lastT = performance.now();
        rafId = requestAnimationFrame(frame);
    }

    function stop() {
        running = false;
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    }

    function onVisibility() {
        if (document.hidden) stop(); else if (canvasN) start();
    }

    // Progreso del texto: lo leemos de la barra de la propia app
    S.progT = 0;
    let fillEl = null;
    function readProgress() {
        if (!fillEl || !fillEl.isConnected) fillEl = document.querySelector('.progress-bar-fill');
        if (!fillEl) { S.progT = 0; return; }
        const w = parseFloat(fillEl.style.width);
        S.progT = isNaN(w) ? 0 : clamp(w / 100, 0, 1);
    }

    // ---------------------------------------------------
    // HUD de la nave
    // ---------------------------------------------------
    let hud = null, gauge = null, gaugeNum = null, distEl = null, sectorEl = null, comm = null, commMsg = null, bannerEl = null;
    let commTimer = 0, lastHud = '', lastSay = 0;

    const SECTORS = {
        es: ['Cinturón de Kuiper', 'Nebulosa Cabeza de Caballo', 'Cúmulo de las Pléyades', 'Anillos de Kepler-442'],
        en: ['Kuiper Belt', 'Horsehead Nebula', 'Pleiades Cluster', 'Rings of Kepler-442']
    };

    const VOICE = {
        es: {
            hello: 'NOVA en línea. Rumbo a Kepler-442. Escribe para propulsar la nave.',
            warp: 'Motores de curvatura activos. ¡Sigue así!',
            warpOff: 'Salimos de warp.',
            err: ['Impacto de micrometeorito. Motores al mínimo.', 'Fallo en el propulsor. Corrige el rumbo.', 'Interferencia en el timón. Recalibrando…'],
            fire: 'Núcleo sobrecargado: potencia máxima.',
            win: 'Salto completado. Destino alcanzado.',
            lose: 'Señal perdida. Sistemas apagados.',
            c10: 'Racha de 10: velocidad de crucero.', c25: 'Racha de 25: aproximando velocidad warp.', c50: 'Racha de 50: ¡motores al límite!'
        },
        en: {
            hello: 'NOVA online. Heading for Kepler-442. Type to power the ship.',
            warp: 'Warp drive engaged. Keep it up!',
            warpOff: 'Dropping out of warp.',
            err: ['Micrometeorite impact. Engines to minimum.', 'Thruster fault. Correct your heading.', 'Rudder interference. Recalibrating…'],
            fire: 'Core overcharged: maximum power.',
            win: 'Jump complete. Destination reached.',
            lose: 'Signal lost. Systems offline.',
            c10: 'Streak of 10: cruising speed.', c25: 'Streak of 25: approaching warp speed.', c50: 'Streak of 50: engines at the limit!'
        }
    };
    const voice = () => (isEN() ? VOICE.en : VOICE.es);

    function buildHud() {
        hud = document.createElement('div');
        hud.className = 'sp-hud';
        hud.setAttribute('aria-hidden', 'true');
        hud.innerHTML =
            '<div class="sp-comm"><div class="sp-comm-head"><i></i>NOVA <b>' + (isEN() ? 'ONBOARD AI' : 'IA DE A BORDO') + '</b></div><div class="sp-comm-msg"></div></div>' +
            '<div class="sp-gauge">' +
            '<svg viewBox="0 0 112 66" width="150" height="88">' +
            '<path class="sp-arc-bg" d="M8 58 A48 48 0 0 1 104 58" pathLength="100"/>' +
            '<path class="sp-arc" d="M8 58 A48 48 0 0 1 104 58" pathLength="100"/>' +
            '</svg>' +
            '<div class="sp-gauge-num"><b>0.10</b><span>c</span></div>' +
            '<div class="sp-gauge-label">' + (isEN() ? 'VELOCITY' : 'VELOCIDAD') + '</div>' +
            '<div class="sp-gauge-sector"></div>' +
            '<div class="sp-gauge-dist"></div>' +
            '</div>';
        document.body.appendChild(hud);
        comm = hud.querySelector('.sp-comm');
        commMsg = hud.querySelector('.sp-comm-msg');
        gauge = hud.querySelector('.sp-arc');
        gaugeNum = hud.querySelector('.sp-gauge-num b');
        sectorEl = hud.querySelector('.sp-gauge-sector');
        distEl = hud.querySelector('.sp-gauge-dist');

        bannerEl = document.createElement('div');
        bannerEl.className = 'sp-banner';
        bannerEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(bannerEl);
    }

    function say(text, ms) {
        if (!comm) return;
        commMsg.textContent = text;
        comm.classList.remove('is-on');
        void comm.offsetWidth;            // reinicia la animación de "tecleado"
        comm.classList.add('is-on');
        clearTimeout(commTimer);
        commTimer = setTimeout(() => { if (comm) comm.classList.remove('is-on'); }, ms || 3600);
        lastSay = performance.now();
    }

    function updateHud() {
        if (!hud) return;
        const c = (S.speed * 0.99).toFixed(2);
        const sec = SECTORS[isEN() ? 'en' : 'es'][Math.min(3, (S.progT * 4) | 0)];
        const dist = Math.round((1 - S.progT) * 100) + '%';
        const key = c + sec + dist;
        if (key === lastHud) return;
        lastHud = key;
        gauge.style.strokeDashoffset = String(100 - clamp(S.speed, 0, 1) * 100);
        gaugeNum.textContent = c;
        sectorEl.textContent = sec;
        distEl.textContent = (isEN() ? 'TO DESTINATION ' : 'AL DESTINO ') + dist;
        hud.classList.toggle('is-warp', S.warpOn);
    }

    function banner(text, cls) {
        if (!bannerEl) return;
        bannerEl.textContent = text;
        bannerEl.className = 'sp-banner ' + cls;
        if (!bannerEl.animate) return;
        const frames = T.reducedMotion
            ? [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
            : [
                { opacity: 0, transform: 'translate(-50%,-50%) scale(1.8)', letterSpacing: '1em' },
                { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', letterSpacing: '0.3em', offset: 0.18 },
                { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', letterSpacing: '0.34em', offset: 0.85 },
                { opacity: 0, transform: 'translate(-50%,-50%) scale(0.96)', letterSpacing: '0.36em' }
            ];
        bannerEl.animate(frames, { duration: 2200, easing: 'ease-out' });
    }

    // ---------------------------------------------------
    // Sonido (todo sintetizado)
    // ---------------------------------------------------
    let drone = null;

    function sound(fn) {
        if (!A.ready()) return;
        try { fn(A.ctx.currentTime + 0.002); } catch (e) { /* el audio nunca debe romper el juego */ }
    }

    // Zumbido grave y constante de los motores (se modula con la velocidad)
    function startDrone() {
        if (drone || !A.ready()) return;
        try {
            const ctx = A.ctx;
            const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
            o1.type = 'sawtooth'; o2.type = 'sawtooth';
            o1.frequency.value = 48; o2.frequency.value = 48.7;
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass'; lp.frequency.value = 160; lp.Q.value = 2;
            const g = ctx.createGain();
            g.gain.value = 0.0001;
            o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(A.out);
            o1.start(); o2.start();
            g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 1.5);
            drone = { o1, o2, lp, g };
        } catch (e) { drone = null; }
    }

    function stopDrone(fade) {
        if (!drone) return;
        const d = drone; drone = null;
        try {
            const t = A.ctx.currentTime;
            d.g.gain.cancelScheduledValues(t);
            d.g.gain.setValueAtTime(d.g.gain.value, t);
            d.g.gain.linearRampToValueAtTime(0.0001, t + (fade || 0.4));
            d.o1.stop(t + (fade || 0.4) + 0.05); d.o2.stop(t + (fade || 0.4) + 0.05);
        } catch (e) { /* ya parado */ }
    }

    function modulateDrone() {
        if (!drone || !A.ctx) return;
        const t = A.ctx.currentTime;
        const f = 44 + S.speed * 46;
        drone.o1.frequency.setTargetAtTime(f, t, 0.1);
        drone.o2.frequency.setTargetAtTime(f * 1.014, t, 0.1);
        drone.lp.frequency.setTargetAtTime(130 + S.speed * 520, t, 0.15);
        drone.g.gain.setTargetAtTime(S.dead ? 0.0001 : 0.045 + S.speed * 0.05, t, 0.2);
    }

    const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19];
    function blip(t0, tier, big) {
        const f = 392 * Math.pow(2, PENTA[tier % PENTA.length] / 12);
        A.tone(t0, { f0: f, f1: f * 1.02, dur: 0.07, gain: 0.05, type: 'sine' });
        A.tone(t0, { f0: f * 2, dur: 0.035, gain: 0.018, type: 'triangle' });
        A.noiseHit(t0, { type: 'highpass', freq: big ? 2500 : 4200, q: 0.7, dur: 0.012, gain: 0.04 });
    }

    function warpSound(t0) {
        A.noiseHit(t0, { type: 'bandpass', freq: 300, freq2: 5200, q: 1.1, attack: 0.25, dur: 1.3, gain: 0.2 });
        A.tone(t0, { f0: 110, f1: 880, dur: 1.0, gain: 0.07, type: 'sawtooth' });
    }

    function errorSound(t0) {
        A.tone(t0, { f0: 120, f1: 55, dur: 0.28, gain: 0.16, type: 'sawtooth' });
        A.noiseHit(t0, { type: 'bandpass', freq: 900, q: 0.8, dur: 0.18, gain: 0.14 });
        A.tone(t0 + 0.02, { f0: 880, f1: 440, dur: 0.1, gain: 0.04, type: 'square' });
    }

    function chime(t0, base) {
        [0, 4, 7, 12, 16].forEach((n, i) => A.tone(t0 + i * 0.09, { f0: base * Math.pow(2, n / 12), dur: 0.7, gain: 0.07, type: 'sine' }));
    }

    // ---------------------------------------------------
    // Eventos del juego
    // ---------------------------------------------------
    let okCount = 0, lastKeySound = 0, lastCombo = 0, wasFire = false, droneTimer = 0, introTimer = 0;

    function revive() {
        if (!S.dead) return;
        S.dead = false; S.powerT = 1;
        startDrone();
    }

    function onWarp(on) {
        if (on) {
            say(voice().warp, 2800);
            banner(isEN() ? 'WARP ENGAGED' : 'WARP ACTIVADO', 'is-good');
            sound(warpSound);
        } else {
            say(voice().warpOff, 2200);
        }
    }

    function onKey(e) {
        const now = performance.now();
        if (S.dead) revive();
        if (e.ok) {
            okCount++;
            S.impulse = Math.min(S.impulse + 0.075, 0.28);
            if (now - lastKeySound > 20) {
                lastKeySound = now;
                const tier = e.char === ' ' ? 0 : ((okCount * 3) % 7) + Math.min(2, (S.combo / 20) | 0);
                sound(t0 => blip(t0, tier, e.char === ' '));
            }
        } else {
            S.impulse = 0;
            S.speed *= 0.3;
            S.err = 1; S.shake = 1;
            if (now - lastKeySound > 20) { lastKeySound = now; sound(errorSound); }
            if (now - lastSay > 3200) say(pick(voice().err), 2800);
        }
    }

    function onCombo(count, onFire) {
        if (S.dead && count > 0) revive();
        if (count > lastCombo) {
            if (count === 10) say(voice().c10, 2600);
            else if (count === 25) say(voice().c25, 2600);
            else if (count === 50) say(voice().c50, 2800);
        }
        lastCombo = count;
        S.combo = count;
        const fire = !!onFire;
        if (fire !== wasFire) {
            wasFire = fire;
            S.fireT = fire ? 1 : 0;
            if (fire) { say(voice().fire, 2600); sound(t0 => chime(t0, 440)); }
        }
        hud && hud.classList.toggle('is-fire', fire);
    }

    function onEnd(kind) {
        if (kind === 'gameover') {
            S.dead = true; S.powerT = 0.0; S.combo = 0; S.fireT = 0; S.impulse = 0;
            say(voice().lose, 4000);
            banner(isEN() ? 'SIGNAL LOST' : 'SEÑAL PERDIDA', 'is-bad');
            sound(t0 => {
                A.tone(t0, { f0: 330, f1: 40, dur: 1.6, gain: 0.14, type: 'sawtooth' });
                A.noiseHit(t0, { type: 'lowpass', freq: 600, q: 0.7, dur: 1.2, gain: 0.12 });
            });
            stopDrone(1.4);
        } else {
            S.jump = 0;
            say(voice().win, 4000);
            banner(isEN() ? 'JUMP COMPLETE' : 'SALTO COMPLETADO', 'is-good');
            sound(t0 => { warpSound(t0); chime(t0 + 0.9, 392); });
        }
    }

    // ---------------------------------------------------
    // Activar / desactivar
    // ---------------------------------------------------
    function onActivate() {
        Object.assign(S, {
            time: 0, travel: Math.random() * 10, speed: 0.1, impulse: 0, combo: 0, fire: 0, fireT: 0,
            err: 0, shake: 0, power: 1, powerT: 1, prog: 0, progT: 0, flash: 0, jump: -1, dead: false, warpOn: false,
            warp: 0, streak: 0, sx: 0, sy: 0, tr: 1, tg: 1, tb: 1
        });
        okCount = 0; lastCombo = 0; wasFire = false; lastHud = '';
        scaleN = NEBULA_SCALE; starDraw = STAR_COUNT; slowFrames = 0;

        if (!setupGL()) {
            teardownGL();
            document.body.classList.add('space-nogl');
        } else {
            document.body.classList.remove('space-nogl');
            document.body.insertBefore(canvasN, document.body.firstChild);
            document.body.insertBefore(canvasP, canvasN.nextSibling);
            resize();
            canvasN.addEventListener('webglcontextlost', onContextLost, false);
        }
        buildHud();
        window.addEventListener('resize', onResize);
        document.addEventListener('visibilitychange', onVisibility);
        if (canvasN) start();
        startDrone();
        droneTimer = setInterval(modulateDrone, 150);
        introTimer = setTimeout(() => say(voice().hello, 4200), 500);
    }

    function onContextLost(ev) {
        ev.preventDefault();
        stop();
        document.body.classList.add('space-nogl');
    }

    function teardownGL() {
        [canvasN, canvasP].forEach(c => { if (c) c.remove(); });
        canvasN = canvasP = glN = glP = null;
        progN = progP = progS = null; starBuf = null; quadP = null;
    }

    function onDeactivate() {
        stop();
        clearInterval(droneTimer);
        clearTimeout(introTimer);
        clearTimeout(commTimer);
        clearTimeout(resizeTimer);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVisibility);
        stopDrone(0.3);
        if (glN) { const e = glN.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); }
        if (glP) { const e = glP.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); }
        teardownGL();
        [hud, bannerEl].forEach(n => { if (n) n.remove(); });
        hud = bannerEl = comm = commMsg = gauge = gaugeNum = sectorEl = distEl = null;
        fillEl = null;
        document.body.classList.remove('space-nogl');
    }

    T.register('space', {
        bodyClass: 'theme-space',
        fontHref: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Exo+2:wght@400;500;600;700&display=swap',
        on: {
            activate: onActivate,
            deactivate: onDeactivate,
            key: onKey,
            combo: onCombo,
            end: onEnd
        }
    });
})();
