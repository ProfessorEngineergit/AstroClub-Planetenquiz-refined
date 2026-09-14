#!/usr/bin/env node
'use strict';

// Baut aus den Quelldateien eine einzelne, komplett eigenstaendige HTML-Datei.
//
// Hintergrund: Ein Doppelklick auf index.html funktioniert nicht, weil unter
// file:// weder fetch('quizData.json') noch ES-Module geladen werden duerfen.
// Der Build loest beides auf, indem Daten, Styles, Skripte und Bilder direkt in
// die Seite wandern. Das Firebase-Scoreboard wird dabei durch den lokalen
// Score-Client ersetzt, weil Firebase Auth unter file:// keine Anmeldung zulaesst.
//
// Aufruf: node build-offline.js

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, 'Planetenquiz-Offline.html');
const FONT_DIR = path.join(ROOT, 'fonts');

const MIME = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff'
};

function read(file) {
    return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function dataUri(file) {
    const abs = path.join(ROOT, file);
    const ext = path.extname(abs).toLowerCase();
    const mime = MIME[ext];
    if (!mime) throw new Error(`Unbekannter Dateityp: ${file}`);
    return `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
}

// Verhindert, dass ein "</script>" im eingebetteten Inhalt den Block vorzeitig
// schliesst. In JavaScript und JSON ist "<\/" gleichbedeutend mit "</".
function escapeClosingTag(content) {
    return content.replace(/<\/(script)/gi, '<\\/$1');
}

function kb(bytes) {
    return `${(bytes / 1024).toFixed(0)} KB`;
}

// --- Schriften ---------------------------------------------------------------
// Die Online-Version laedt Inter, Space Grotesk und Nasalization per @import von
// Google Fonts bzw. cdnfonts. Offline ist das nicht erreichbar. Liegen passende
// WOFF2-Dateien in fonts/ (Schema: "Family.woff2" oder "Family-700.woff2"),
// werden sie eingebettet; sonst greifen die System-Fallbacks aus dem CSS.
// Beim Einbetten die Schriftlizenz pruefen: Inter und Space Grotesk stehen unter
// der SIL OFL, Nasalization ist kommerziell lizenziert.
function buildFontFaces() {
    if (!fs.existsSync(FONT_DIR)) return { css: '', count: 0 };

    const files = fs.readdirSync(FONT_DIR).filter(f => /\.(woff2?|otf|ttf)$/i.test(f));
    if (!files.length) return { css: '', count: 0 };

    const faces = files.map(file => {
        const base = path.basename(file, path.extname(file));
        const match = base.match(/^(.*?)-(\d{3})$/);
        const family = match ? match[1] : base;
        const weight = match ? match[2] : '400';
        const uri = dataUri(path.join('fonts', file));
        return [
            '@font-face {',
            `    font-family: '${family}';`,
            `    font-weight: ${weight};`,
            '    font-style: normal;',
            '    font-display: swap;',
            `    src: url(${uri});`,
            '}'
        ].join('\n');
    });

    return { css: faces.join('\n') + '\n', count: files.length };
}

// --- CSS ---------------------------------------------------------------------
function buildCss() {
    let css = read('Planetenquiz.css');

    const imports = css.match(/^@import\s+url\([^)]*\);?\s*$/gim) || [];
    css = css.replace(/^@import\s+url\([^)]*\);?\s*$/gim, '');

    // Relative Bildpfade in url(...) durch Data-URIs ersetzen; bereits
    // eingebettete data:-URIs bleiben unangetastet.
    const embedded = [];
    css = css.replace(/url\((['"]?)(?!data:|https?:)([^'")]+)\1\)/gi, (full, quote, file) => {
        const target = file.trim();
        if (!fs.existsSync(path.join(ROOT, target))) {
            console.warn(`  ! CSS verweist auf fehlende Datei: ${target}`);
            return full;
        }
        embedded.push(target);
        return `url(${dataUri(target)})`;
    });

    const fonts = buildFontFaces();
    return { css: fonts.css + css.trimStart(), imports, embedded, fontCount: fonts.count };
}

// --- Build -------------------------------------------------------------------
function build() {
    console.log('Planetenquiz Offline-Build\n');

    let html = read('index.html');
    const { css, imports, embedded, fontCount } = buildCss();

    // 1. Quizdaten einbetten (ersetzt das fetch() aus Planetenquiz.js)
    const quizJson = JSON.stringify(JSON.parse(read('quizData.json')));
    const dataBlock = `<script type="application/json" id="quizData">${escapeClosingTag(quizJson)}</script>`;

    // 2. Stylesheet inline
    html = html.replace(
        /[ \t]*<link rel="stylesheet" href="Planetenquiz\.css">\n?/,
        `    <style>\n${css}\n    </style>\n`
    );

    // 3. Quiz-Logik inline (defer entfaellt, inline-Skripte laufen sofort)
    html = html.replace(
        /[ \t]*<script src="Planetenquiz\.js" defer><\/script>\n?/,
        () => `\t${dataBlock}\n\t<script>\n${escapeClosingTag(read('Planetenquiz.js'))}\n\t</script>\n`
    );

    // 4. Firebase-Modul durch den lokalen Score-Client ersetzen
    html = html.replace(
        /[ \t]*<script src="firebase-score-client\.js" type="module"><\/script>\n?/,
        () => `\t<script>\n${escapeClosingTag(read('local-score-client.js'))}\n\t</script>\n`
    );

    // 5. Bilder aus dem Markup einbetten
    const images = [];
    html = html.replace(/src="(?!data:|https?:)([^"]+\.(?:jpe?g|png|gif|svg|webp))"/gi, (full, file) => {
        if (!fs.existsSync(path.join(ROOT, file))) {
            console.warn(`  ! HTML verweist auf fehlende Datei: ${file}`);
            return full;
        }
        images.push(file);
        return `src="${dataUri(file)}"`;
    });

    // Sicherstellen, dass nichts Externes uebrig bleibt
    const leftovers = [
        ...(html.match(/<script[^>]+src="(?!data:)[^"]*"/gi) || []),
        ...(html.match(/<link[^>]+rel="stylesheet"/gi) || [])
    ];
    if (leftovers.length) {
        throw new Error(`Nicht eingebettete Verweise gefunden:\n${leftovers.join('\n')}`);
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, html, 'utf8');

    console.log(`  Quizdaten     eingebettet (${kb(Buffer.byteLength(quizJson))})`);
    console.log(`  Bilder        ${[...new Set([...embedded, ...images])].join(', ') || 'keine'}`);
    console.log(`  Schriften     ${fontCount ? `${fontCount} Datei(en) aus fonts/ eingebettet` : 'System-Fallback (fonts/ fehlt oder ist leer)'}`);
    if (imports.length && !fontCount) {
        console.log(`                ${imports.length} Web-Font-Import(e) entfernt`);
    }
    console.log(`  Scoreboard    lokal (localStorage), Firebase entfernt`);
    console.log(`\n  -> ${path.relative(ROOT, OUT_FILE)}  (${kb(Buffer.byteLength(html))})\n`);
}

try {
    build();
} catch (error) {
    console.error(`\nBuild fehlgeschlagen: ${error.message}\n`);
    process.exit(1);
}
