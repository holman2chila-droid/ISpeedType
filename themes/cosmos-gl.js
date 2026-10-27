/* ===================================================
   ISpeedType — Tema inmersivo: VIAJE ESTELAR
   Motor gráfico WebGL (themes/cosmos-gl.js). Sin librerías externas.

   Dibuja en UN solo <canvas> fijo, en tres pasadas:
     1. Nebulosa:   un shader a pantalla completa (ruido fractal con distorsión
                    de dominio), polvo, estrellas lejanas y el brillo del sol.
     2. Planeta:    una esfera iluminada por shader (bandas, océanos, lava,
                    nubes, atmósfera, anillos) que se acerca mientras escribes.
     3. Estrellas:  ~1500 estrellas en un túnel 3D. Cada una es un quad que se
                    estira según la velocidad (de puntos a líneas de "warp").

   Rendimiento:
     - Todo el cálculo pesado va en la GPU; la CPU solo sube ~30 uniformes por frame.
     - La resolución interna es ajustable (CosmosGL.resize(w, h, scale)), así que
       el tema puede bajarla solo si el equipo va justo.
     - Sin texturas, sin archivos, sin asignaciones por frame.

   API:  const g = CosmosGL.create(canvas);   // null si no hay WebGL
         g.resize(cssW, cssH, scale);  g.render(state);  g.destroy();
   =================================================== */
(function () {
    'use strict';

    const STAR_COUNT = 1500;

    // ---------- Shaders ----------
    const VS_QUAD = `
attribute vec2 aQ;
void main(){ gl_Position = vec4(aQ, 0.0, 1.0); }`;

    // Nebulosa + fondo
    const FS_NEBULA = `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uTravel, uWarp, uFlash, uAlert;
uniform vec3 uC1, uC2, uC3;
uniform vec2 uSun;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 5; i++){ v += a * noise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
    return v;
}

void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    vec2 c = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float r = length(c);
    float t = uTime * 0.03;

    vec2 p = c * 1.6 + vec2(uTravel * 0.0045, -uTravel * 0.0016);
    vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t * 0.8));
    float n = fbm(p + 2.6 * q + vec2(0.0, t * 0.5));
    float dust = fbm(p * 2.2 - q * 1.5 + 7.0);

    vec3 col = mix(uC1, uC2, smoothstep(0.2, 0.8, n));
    col = mix(col, uC3, smoothstep(0.45, 0.95, q.x * q.y * 2.2 + n * 0.3));
    float inten = pow(n, 2.4) * 1.9;
    inten *= 1.0 - smoothstep(0.35, 0.75, dust) * 0.55;
    col *= inten;
    col += uC1 * 0.03;

    // estrellas lejanas (fijas, parpadean)
    vec2 g = c * 95.0;
    vec2 gi = floor(g);
    float h = hash(gi);
    float star = step(0.982, h) * smoothstep(0.38, 0.0, length(fract(g) - 0.5));
    star *= 0.55 + 0.45 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
    col += mix(vec3(0.7, 0.85, 1.0), vec3(1.0, 0.85, 0.7), fract(h * 91.0)) * star * 0.9;

    // sol lejano: núcleo, halo y destello anamórfico horizontal
    vec2 sd = c - uSun;
    float d = length(sd);
    float core = 0.0035 / (d * d + 0.0035);
    float halo = 0.06 / (d + 0.22);
    float streak = exp(-abs(sd.y) * 42.0) * exp(-abs(sd.x) * 2.0) * 0.4;
    col += vec3(1.0, 0.93, 0.8) * (core * 0.55 + halo * 0.35 + streak);

    // calor del warp en el centro
    col += mix(uC2, vec3(0.6, 0.8, 1.0), 0.5) * uWarp * exp(-r * 2.2) * 0.55;

    col *= 1.0 - smoothstep(0.55, 1.25, r) * 0.55;               // viñeta
    col = mix(col, col * vec3(1.7, 0.25, 0.3) + vec3(0.1, 0.0, 0.0), uAlert * 0.85); // alarma
    col += uFlash * vec3(0.9, 0.95, 1.0) * exp(-r * 1.5);        // destello de salto

    col = 1.0 - exp(-col * 1.45);                                // tonemap suave
    col += (hash(gl_FragCoord.xy + uTime) - 0.5) / 255.0;        // dither anti-banding
    gl_FragColor = vec4(col, 1.0);
}`;

    // Planeta
    const VS_PLANET = `
attribute vec2 aQ;
uniform vec2 uRes;
uniform vec4 uP;            // cx, cy (ndc), R (en alturas de pantalla/2), alpha
varying vec2 vP;
void main(){
    float aspect = uRes.x / uRes.y;
    float ext = 2.6;
    vP = aQ * ext;
    vec2 pos = uP.xy + aQ * ext * uP.z * vec2(1.0 / aspect, 1.0);
    gl_Position = vec4(pos, 0.0, 1.0);
}`;

    const FS_PLANET = `
precision highp float;
uniform vec2 uRes;
uniform vec4 uP;
uniform float uType, uSpin, uSeed, uTime, uRing;
uniform vec3 uL, uA1, uA2, uA3, uAtmo;
varying vec2 vP;

float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float f3(vec3 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++){ v += a * n3(p); p = p * 2.1 + 3.1; a *= 0.5; }
    return v;
}
vec4 over(vec4 s, vec4 d){ return s + d * (1.0 - s.a); }

void main(){
    vec2 p = vP;
    float r = length(p);
    float px = 1.0 / max(uP.z * uRes.y * 0.5, 1.0);    // tamaño de un píxel en radios
    vec4 acc = vec4(0.0);

    // brillo exterior (atmósfera vista de lado), más fuerte hacia el sol
    float lightSide = smoothstep(-0.5, 0.7, dot(normalize(vec3(p, 0.001)), uL));
    float gl = exp(-(r - 1.0) * 10.0) * step(1.0, r) * (0.12 + 0.88 * lightSide);
    acc = vec4(uAtmo * gl * 0.9, gl * 0.55);

    // anillo
    vec4 ringCol = vec4(0.0);
    float ringFront = 0.0;
    if (uRing > 0.5){
        float ca = cos(0.38), sa = sin(0.38);
        vec2 q = vec2(ca * p.x + sa * p.y, -sa * p.x + ca * p.y);
        q.y /= 0.27;
        float rr = length(q);
        if (rr > 1.32 && rr < 2.45){
            float bands = 0.5 + 0.5 * sin(rr * 46.0 + n3(vec3(rr * 11.0, uSeed, 0.0)) * 7.0);
            float fine = n3(vec3(rr * 90.0, uSeed, 1.0));
            float gap = smoothstep(0.0, 0.03, abs(rr - 1.98) - 0.05);
            float edge = smoothstep(1.32, 1.42, rr) * smoothstep(2.45, 2.3, rr);
            float a = edge * gap * (0.35 + 0.55 * bands) * (0.8 + 0.2 * fine);
            vec3 rc = mix(uA1, uA2, bands) * (0.55 + 0.6 * max(uL.y, 0.2));
            ringCol = vec4(rc * a, a);
            ringFront = step(0.0, q.y);
        }
    }
    if (ringFront < 0.5) acc = over(ringCol, acc);

    // esfera
    if (r < 1.0 + px * 2.0){
        float rc = min(r, 0.9999);
        float z = sqrt(1.0 - rc * rc);
        vec3 n = vec3(p / max(r, 1e-4) * rc, z);
        float cs = cos(uSpin), sn = sin(uSpin);
        vec3 s = vec3(cs * n.x + sn * n.z, n.y, -sn * n.x + cs * n.z) + vec3(uSeed);

        vec3 surf;
        vec3 emit = vec3(0.0);
        float spec = 0.0;

        if (uType < 0.5){                       // gigante gaseoso
            float w = f3(vec3(s.x * 2.0, s.y * 7.0, s.z * 2.0)) * 0.4;
            float band = sin((s.y - uSeed + w) * 15.0) * 0.5 + 0.5;
            surf = mix(uA1, uA2, band);
            surf = mix(surf, uA3, smoothstep(0.55, 0.85, f3(s * 4.0)) * 0.55);
        } else if (uType < 1.5){                // mundo de hielo
            float nn = f3(s * 3.0);
            surf = mix(uA1, uA2, smoothstep(0.3, 0.7, nn));
            float crack = smoothstep(0.03, 0.0, abs(f3(s * 6.0) - 0.5));
            surf = mix(surf, uA3, crack * 0.8);
            spec = 0.25;
        } else if (uType < 2.5){                // volcánico
            float nn = f3(s * 3.5);
            surf = mix(uA1, uA2, nn);
            float lava = smoothstep(0.045, 0.0, abs(f3(s * 4.2 + 9.0) - 0.5));
            emit = uA3 * lava * 1.8;
        } else if (uType < 3.5){                // gigante con anillos
            float w = f3(vec3(s.x * 1.5, s.y * 6.0, s.z * 1.5)) * 0.3;
            float band = sin((s.y - uSeed + w) * 11.0) * 0.5 + 0.5;
            surf = mix(uA1, uA2, band);
            surf = mix(surf, uA3, smoothstep(0.6, 0.9, f3(s * 3.0)) * 0.35);
        } else {                                // mundo oceánico con nubes
            float hgt = f3(s * 2.6);
            float land = smoothstep(0.52, 0.56, hgt);
            vec3 ocean = mix(uA1 * 0.55, uA1, smoothstep(0.3, 0.52, hgt));
            vec3 ground = mix(uA2, uA3, smoothstep(0.58, 0.8, hgt));
            surf = mix(ocean, ground, land);
            float ice = smoothstep(0.78, 0.9, abs(s.y - uSeed) + hgt * 0.25);
            surf = mix(surf, vec3(0.93, 0.96, 1.0), ice);
            float cl = f3(s * 4.2 + vec3(uTime * 0.02, 0.0, 0.0));
            surf = mix(surf, vec3(1.0), smoothstep(0.52, 0.78, cl) * 0.85);
            spec = (1.0 - land) * 0.5;
        }

        float dif = dot(n, uL);
        float lit = smoothstep(-0.1, 0.4, dif);
        vec3 col = surf * (0.04 + lit * 1.05);
        // brillo especular del mar / hielo
        vec3 rf = reflect(-uL, n);
        col += vec3(1.0, 0.95, 0.85) * pow(max(rf.z, 0.0), 36.0) * spec * lit;
        col += emit;
        // atmósfera en el borde
        float rim = pow(1.0 - z, 3.2);
        col += uAtmo * rim * (0.25 + max(dif, 0.0) * 1.4);

        float cov = clamp((1.0 - r) / px + 0.5, 0.0, 1.0);
        acc = over(vec4(col * cov, cov), acc);
    }

    if (ringFront > 0.5) acc = over(ringCol, acc);
    acc *= uP.w;
    gl_FragColor = acc;
}`;

    // Estrellas (quads orientados en la dirección del movimiento)
    const VS_STARS = `
attribute vec4 aS;      // x, y, z0, semilla
attribute vec2 aC;      // along (0 cabeza / 1 cola), side (-1..1)
uniform float uTravel, uSpeed, uWarp, uPunch, uDpr, uTint;
uniform vec2 uRes;
varying vec2 vC;
varying vec3 vCol;
varying float vA;
void main(){
    float aspect = uRes.x / uRes.y;
    float z = fract(aS.z - uTravel * 0.05);
    float depth = 0.04 + z * 0.96;
    float f = 0.34;
    float seed = aS.w;
    float len = (0.012 + uSpeed * 0.05 + uWarp * 0.38 + uPunch * 0.45) * (0.5 + seed);

    vec2 h = aS.xy / depth * f;
    vec2 t = aS.xy / (depth + len) * f;
    vec2 hPx = vec2(h.x / aspect, h.y) * uRes * 0.5;
    vec2 tPx = vec2(t.x / aspect, t.y) * uRes * 0.5;

    vec2 dir = hPx - tPx;
    float l = length(dir);
    vec2 dn = l > 0.001 ? dir / l : normalize(hPx + vec2(0.0001));
    vec2 pr = vec2(-dn.y, dn.x);
    float w = (0.8 + 2.4 * (1.0 - z) * (1.0 - z)) * (0.6 + seed * 0.8) * uDpr;
    float lenPx = max(l, w * 1.2);

    vec2 px = hPx - dn * lenPx * aC.x + pr * aC.y * w;
    gl_Position = vec4(px / (uRes * 0.5), 0.0, 1.0);

    vC = aC;
    vA = smoothstep(0.0, 0.05, z) * smoothstep(1.0, 0.82, z);
    vec3 base = mix(vec3(0.78, 0.9, 1.0), vec3(1.0, 0.86, 0.66), fract(seed * 7.13));
    base = mix(base, vec3(0.62, 0.82, 1.0), uWarp * 0.65);
    base = mix(base, vec3(1.0, 0.3, 0.3), uTint);
    vCol = base * (0.55 + (1.0 - z) * 1.3);
}`;

    const FS_STARS = `
precision mediump float;
varying vec2 vC;
varying vec3 vCol;
varying float vA;
void main(){
    float a = exp(-vC.y * vC.y * 2.6) * (1.0 - vC.x * 0.88) * vA;
    gl_FragColor = vec4(vCol * a, a);
}`;

    // ---------- Utilidades WebGL ----------
    function compile(gl, type, src) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            const msg = gl.getShaderInfoLog(sh);
            gl.deleteShader(sh);
            throw new Error('shader: ' + msg);
        }
        return sh;
    }

    function program(gl, vs, fs) {
        const p = gl.createProgram();
        gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
        gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
        const u = {};
        const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) {
            const info = gl.getActiveUniform(p, i);
            u[info.name] = gl.getUniformLocation(p, info.name);
        }
        return { p, u };
    }

    function create(canvas) {
        let gl = null;
        try {
            gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false })
                || canvas.getContext('experimental-webgl');
        } catch (e) { gl = null; }
        if (!gl) return null;

        let progN, progP, progS;
        try {
            progN = program(gl, VS_QUAD, FS_NEBULA);
            progP = program(gl, VS_PLANET, FS_PLANET);
            progS = program(gl, VS_STARS, FS_STARS);
        } catch (e) {
            if (window.console) console.warn('[cosmos] ' + e.message);
            return null;
        }

        // Quad de pantalla completa / planeta (comparten buffer: esquinas -1..1)
        const quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

        // Estrellas: 6 vértices por estrella, intercalado [x y z w along side]
        const corners = [[0, -1], [0, 1], [1, -1], [1, -1], [0, 1], [1, 1]];
        const data = new Float32Array(STAR_COUNT * 6 * 6);
        let o = 0;
        for (let i = 0; i < STAR_COUNT; i++) {
            const ang = Math.random() * Math.PI * 2;
            const rad = 0.1 + 1.75 * Math.pow(Math.random(), 0.85);
            const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
            const z = Math.random(), w = Math.random();
            for (let k = 0; k < 6; k++) {
                data[o++] = x; data[o++] = y; data[o++] = z; data[o++] = w;
                data[o++] = corners[k][0]; data[o++] = corners[k][1];
            }
        }
        const starBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

        let W = 2, H = 2, dpr = 1;
        const LIGHT = [-0.55, 0.45, 0.7];
        const ll = Math.hypot(LIGHT[0], LIGHT[1], LIGHT[2]);
        const L = [LIGHT[0] / ll, LIGHT[1] / ll, LIGHT[2] / ll];
        const SUN = [-0.78, 0.62]; // posición del sol en coordenadas de pantalla (ver shader)

        function resize(cssW, cssH, scale) {
            dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            const k = dpr * (scale || 1);
            W = Math.max(2, Math.round(cssW * k));
            H = Math.max(2, Math.round(cssH * k));
            if (canvas.width !== W) canvas.width = W;
            if (canvas.height !== H) canvas.height = H;
            gl.viewport(0, 0, W, H);
        }

        function bindQuad(prog) {
            const loc = gl.getAttribLocation(prog.p, 'aQ');
            gl.bindBuffer(gl.ARRAY_BUFFER, quad);
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
            return loc;
        }

        function render(s) {
            // 1) Nebulosa
            gl.disable(gl.BLEND);
            gl.useProgram(progN.p);
            const locN = bindQuad(progN);
            const un = progN.u;
            gl.uniform2f(un.uRes, W, H);
            gl.uniform1f(un.uTime, s.time);
            gl.uniform1f(un.uTravel, s.travel);
            gl.uniform1f(un.uWarp, s.warp);
            gl.uniform1f(un.uFlash, s.flash);
            gl.uniform1f(un.uAlert, s.alert);
            gl.uniform3fv(un.uC1, s.c1);
            gl.uniform3fv(un.uC2, s.c2);
            gl.uniform3fv(un.uC3, s.c3);
            gl.uniform2f(un.uSun, SUN[0], SUN[1]);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            gl.disableVertexAttribArray(locN);

            // 2) Planeta
            const pl = s.planet;
            if (pl && pl.alpha > 0.001) {
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                gl.useProgram(progP.p);
                const locP = bindQuad(progP);
                const up = progP.u;
                gl.uniform2f(up.uRes, W, H);
                gl.uniform4f(up.uP, pl.cx, pl.cy, pl.R, pl.alpha);
                gl.uniform1f(up.uType, pl.type);
                gl.uniform1f(up.uSpin, pl.spin);
                gl.uniform1f(up.uSeed, pl.seed);
                gl.uniform1f(up.uTime, s.time);
                gl.uniform1f(up.uRing, pl.ring ? 1 : 0);
                gl.uniform3f(up.uL, L[0], L[1], L[2]);
                gl.uniform3fv(up.uA1, pl.a1);
                gl.uniform3fv(up.uA2, pl.a2);
                gl.uniform3fv(up.uA3, pl.a3);
                gl.uniform3fv(up.uAtmo, pl.atmo);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                gl.disableVertexAttribArray(locP);
            }

            // 3) Estrellas (suma de luz)
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.useProgram(progS.p);
            gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
            const aS = gl.getAttribLocation(progS.p, 'aS');
            const aC = gl.getAttribLocation(progS.p, 'aC');
            gl.enableVertexAttribArray(aS);
            gl.enableVertexAttribArray(aC);
            gl.vertexAttribPointer(aS, 4, gl.FLOAT, false, 24, 0);
            gl.vertexAttribPointer(aC, 2, gl.FLOAT, false, 24, 16);
            const us = progS.u;
            gl.uniform2f(us.uRes, W, H);
            gl.uniform1f(us.uTravel, s.travel);
            gl.uniform1f(us.uSpeed, s.speed);
            gl.uniform1f(us.uWarp, s.warp);
            gl.uniform1f(us.uPunch, s.punch);
            gl.uniform1f(us.uDpr, dpr * (W / Math.max(1, canvas.clientWidth * dpr)));
            gl.uniform1f(us.uTint, s.alert);
            gl.drawArrays(gl.TRIANGLES, 0, STAR_COUNT * 6);
            gl.disableVertexAttribArray(aS);
            gl.disableVertexAttribArray(aC);
        }

        function destroy() {
            try {
                const ext = gl.getExtension('WEBGL_lose_context');
                gl.deleteBuffer(quad);
                gl.deleteBuffer(starBuf);
                gl.deleteProgram(progN.p);
                gl.deleteProgram(progP.p);
                gl.deleteProgram(progS.p);
                if (ext) ext.loseContext();
            } catch (e) { /* nada */ }
        }

        return { resize, render, destroy };
    }

    window.CosmosGL = { create };
})();
