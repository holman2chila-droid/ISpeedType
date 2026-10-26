// Genera src/texts.js a partir de los textos del frontend (texts.js / texts-en.js),
// para que el servidor elija el texto de cada partida online.
// Uso: npm run build:texts  (volver a correrlo si se cambian los textos del sitio)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const CATEGORIES = ['short', 'noaccent', 'sayings']; // largo moderado: bueno para 1v1 y ranking

function load(file, varName) {
    const ctx = {};
    vm.runInNewContext(readFileSync(join(root, file), 'utf8') + `\n;this.__out = ${varName};`, ctx);
    return ctx.__out;
}

const out = {};
for (const [lang, file, v] of [['es', 'texts.js', 'typingTexts'], ['en', 'texts-en.js', 'typingTextsEn']]) {
    const bank = load(file, v);
    out[lang] = CATEGORIES.flatMap((c) => bank[c] || []).map((s) => s.trimEnd());
}

writeFileSync(
    join(here, '..', 'src', 'texts.js'),
    '// GENERADO por scripts/build-texts.mjs — no editar a mano\n' +
    `export const TEXTS = ${JSON.stringify(out, null, 1)};\n`
);
console.log('texts.js:', Object.entries(out).map(([k, v]) => `${k}=${v.length}`).join(' '));
