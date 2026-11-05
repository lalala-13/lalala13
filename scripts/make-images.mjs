#!/usr/bin/env node
// Renders the brand image set (logo, inverse logo, favicon, hero, one image per collection, one placeholder image
// per product category) into brand/images/ from hand-made SVG, using the brand palette and the Fredoka/Nunito
// web fonts. Needs Playwright with Chromium (pre-installed in the Claude cloud environment; elsewhere:
// `npx playwright install chromium`). Re-run after changing colours or collections, then `node scripts/push-images.mjs`.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(path.join(ROOT, "store/theme-settings.json"), "utf8"));
const collectionsDef = JSON.parse(readFileSync(path.join(ROOT, "store/collections.json"), "utf8"));
const c = cfg.colors;
const C = { ocean: c.button, bubble: c.secondary_background, foam: c.background, coral: c.accent, sand: c.highlight, deep: c.text, white: "#FFFFFF" };
const OUT = path.join(ROOT, "brand/images/");
const FONTS = path.join(ROOT, ".backup/fonts/");
mkdirSync(OUT, { recursive: true });
mkdirSync(FONTS, { recursive: true });

// Google Fonts CSS + woff2 files, cached under .backup/fonts (ignored by git).
async function fontCss() {
  const cssPath = path.join(FONTS, "fonts.css");
  if (!existsSync(cssPath)) {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
    const css = await fetch("https://fonts.googleapis.com/css2?family=Fredoka:wght@700&family=Nunito:wght@400;800&display=swap", { headers: { "User-Agent": ua } }).then((r) => r.text()).catch(() => "");
    writeFileSync(cssPath, css);
    for (const url of new Set(css.match(/https:\/\/fonts\.gstatic\.com[^)]*/g) || [])) {
      const buf = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()));
      writeFileSync(path.join(FONTS, path.basename(url)), buf);
    }
  }
  let css = readFileSync(cssPath, "utf8");
  for (const f of readdirSync(FONTS)) if (f.endsWith(".woff2")) {
    const b64 = readFileSync(path.join(FONTS, f)).toString("base64");
    css = css.replace(new RegExp(`https://fonts\\.gstatic\\.com[^)]*${f.replace(/\./g, "\\.")}`, "g"), `data:font/woff2;base64,${b64}`);
  }
  return css;
}
const HEAD = `<style>${await fontCss()} html,body{margin:0;padding:0} .h{font-family:Fredoka,"Arial Rounded MT Bold",Arial,sans-serif;font-weight:700} .b{font-family:Nunito,Arial,sans-serif}</style>`;

// ---------- reusable shapes ----------
const shark = (x, y, s, { body = C.ocean, belly = C.bubble, eye = C.foam, pupil = C.deep } = {}) => `
<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M78 96 L18 56 L36 100 L18 144 Z" fill="${body}"/>
  <path d="M70 100 C70 60 130 40 200 44 C260 48 320 70 352 100 C320 130 260 152 200 156 C130 160 70 140 70 100 Z" fill="${body}"/>
  <path d="M110 118 C150 142 260 146 338 108 C300 134 250 150 200 152 C160 154 130 140 110 118 Z" fill="${belly}"/>
  <path d="M180 48 C196 10 232 6 250 20 C236 28 226 40 222 50 Z" fill="${body}"/>
  <path d="M190 118 C180 140 190 152 212 158 C220 142 214 128 206 118 Z" fill="${C.deep}" opacity="0.35"/>
  <circle cx="292" cy="92" r="14" fill="${eye}"/><circle cx="296" cy="94" r="7" fill="${pupil}"/><circle cx="299" cy="91" r="2.5" fill="${eye}"/>
  <path d="M300 118 C316 122 330 116 340 106" stroke="${pupil}" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M236 86 C240 98 240 110 236 120 M250 84 C254 98 254 110 250 122" stroke="${pupil}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.5"/>
</g>`;
const bubbles = (x, y, s, color = C.bubble, w = 4) => `
<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${color}" stroke-width="${w}">
  <circle cx="0" cy="0" r="9"/><circle cx="20" cy="-26" r="13"/><circle cx="52" cy="-56" r="18"/><circle cx="58" cy="-62" r="4" fill="${C.foam}" stroke="none"/>
</g>`;
const svg = (w, h, inner, bg = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ""}${inner}</svg>`;
const txt = (x, y, size, s, { fill = C.deep, cls = "h", anchor = "middle", extra = "" } = {}) => `<text x="${x}" y="${y}" class="${cls}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" ${extra}>${s}</text>`;
const roundBg = (w, h, color, r = 0) => `<rect width="${w}" height="${h}" rx="${r}" fill="${color}"/>`;

// ---------- category icons (each drawn in a 600x600 box) ----------
const icons = {
  bath: () => `<rect x="60" y="300" width="480" height="200" rx="80" fill="${C.ocean}"/><rect x="40" y="290" width="520" height="50" rx="25" fill="${C.deep}"/>
    <path d="M110 290 L110 180 C110 120 190 120 190 180" stroke="${C.deep}" stroke-width="22" fill="none" stroke-linecap="round"/>
    ${shark(190, 150, 0.6)}${bubbles(420, 250, 1.6)}`,
  outdoor: () => `${[...Array(12)].map((_, i) => `<line x1="300" y1="230" x2="${300 + 190 * Math.cos(i * Math.PI / 6)}" y2="${230 + 190 * Math.sin(i * Math.PI / 6)}" stroke="${C.sand}" stroke-width="22" stroke-linecap="round"/>`).join("")}
    <circle cx="300" cy="230" r="120" fill="${C.sand}"/>
    <path d="M40 470 Q120 410 200 470 T360 470 T520 470 T680 470" stroke="${C.ocean}" stroke-width="34" fill="none" stroke-linecap="round"/>
    <path d="M40 540 Q120 480 200 540 T360 540 T520 540 T680 540" stroke="${C.bubble}" stroke-width="34" fill="none" stroke-linecap="round"/>`,
  stem: () => `<rect x="90" y="340" width="150" height="150" rx="18" fill="${C.coral}"/><rect x="250" y="340" width="150" height="150" rx="18" fill="${C.sand}"/><rect x="170" y="190" width="150" height="150" rx="18" fill="${C.ocean}"/>
    <g transform="translate(460 240)">${[...Array(8)].map((_, i) => `<rect x="-16" y="-96" width="32" height="40" rx="8" fill="${C.deep}" transform="rotate(${i * 45})"/>`).join("")}<circle r="70" fill="${C.deep}"/><circle r="28" fill="${C.foam}"/></g>`,
  plush: () => `${shark(60, 190, 1.1, { body: C.bubble, belly: C.foam, eye: C.white })}<path d="M470 150 c-30-50-110-30-110 25 0 60 110 120 110 120 s110-60 110-120 c0-55-80-75-110-25z" fill="${C.coral}"/>`,
  sensory: () => `<rect x="80" y="80" width="440" height="440" rx="90" fill="${C.ocean}"/>${[0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((col) => `<circle cx="${155 + col * 97}" cy="${155 + r * 97}" r="36" fill="${(r + col) % 3 === 0 ? C.coral : (r + col) % 3 === 1 ? C.sand : C.bubble}"/>`)).join("")}`,
  games: () => `<path d="M120 170 h120 c0-70 110-70 110 0 h120 v120 c70 0 70 110 0 110 v120 h-120 c0 70-110 70-110 0 h-120 v-120 c-70 0-70-110 0-110 z" fill="${C.sand}" stroke="${C.deep}" stroke-width="12" stroke-linejoin="round"/>
    <g transform="translate(400 380)"><rect x="0" y="0" width="150" height="150" rx="28" fill="${C.coral}"/><circle cx="40" cy="40" r="14" fill="${C.foam}"/><circle cx="110" cy="40" r="14" fill="${C.foam}"/><circle cx="75" cy="75" r="14" fill="${C.foam}"/><circle cx="40" cy="110" r="14" fill="${C.foam}"/><circle cx="110" cy="110" r="14" fill="${C.foam}"/></g>`,
  tag: (label) => `<path d="M120 120 h240 l180 180 -240 240 -180 -180 z" fill="${C.coral}" stroke="${C.deep}" stroke-width="12" stroke-linejoin="round"/><circle cx="200" cy="200" r="30" fill="${C.foam}"/>${txt(330, 365, 110, label, { fill: C.white, extra: 'transform="rotate(-45 330 330)"' })}`,
  age: (label) => `<circle cx="300" cy="300" r="240" fill="${C.ocean}"/><circle cx="300" cy="300" r="200" fill="${C.bubble}"/>${txt(300, 345, 150, label, { fill: C.deep })}${bubbles(500, 130, 1.2, C.ocean)}`,
  star: (label) => `<path d="${[...Array(10)].map((_, i) => { const r = i % 2 ? 110 : 250; const a = -Math.PI / 2 + i * Math.PI / 5; return `${i ? "L" : "M"}${300 + r * Math.cos(a)} ${300 + r * Math.sin(a)}`; }).join(" ")} Z" fill="${C.sand}" stroke="${C.deep}" stroke-width="12" stroke-linejoin="round"/>${txt(300, 335, 96, label, { fill: C.deep })}`,
  rosette: (label) => `<circle cx="300" cy="260" r="190" fill="${C.coral}"/><circle cx="300" cy="260" r="140" fill="${C.foam}"/>${txt(300, 300, 120, label, { fill: C.coral })}<path d="M220 420 l-50 150 60-30 50 60 40-140z" fill="${C.ocean}"/><path d="M380 420 l50 150 -60-30 -50 60 -40-140z" fill="${C.ocean}"/>`,
};
// Which icon each collection gets: by its tag (type collections), or a special drawing for the price/age/new/best ones.
const BY_TAG = { bath: icons.bath, outdoor: icons.outdoor, stem: icons.stem, plush: icons.plush, sensory: icons.sensory, games: icons.games };
const SPECIAL = { "under-15": () => icons.tag("$15"), "ages-3-5": () => icons.age("3–5"), "ages-6-8": () => icons.age("6–8"), "ages-9-12": () => icons.age("9–12"), "new-arrivals": () => icons.star("NEW"), "best-sellers": () => icons.rosette("★") };

const jobs = {};
jobs["logo"] = { w: 2000, h: 420, transparent: true, svg: svg(2000, 420, `${shark(40, 40, 1.05)}${bubbles(460, 130, 1.4)}${txt(1230, 300, 170, "Bubble Sharks", { fill: C.deep })}`) };
jobs["logo-inverse"] = { w: 2000, h: 420, transparent: true, svg: svg(2000, 420, `${shark(40, 40, 1.05, { body: C.white, belly: C.bubble, eye: C.deep, pupil: C.white })}${bubbles(460, 130, 1.4, C.bubble)}${txt(1230, 300, 170, "Bubble Sharks", { fill: C.white })}`) };
jobs["favicon"] = { w: 512, h: 512, svg: svg(512, 512, `${roundBg(512, 512, C.ocean, 110)}${shark(-40, 110, 1.3, { body: C.bubble, belly: C.foam, eye: C.white })}`) };
jobs["hero"] = { w: 2000, h: 1000, svg: svg(2000, 1000, `${roundBg(2000, 1000, C.ocean)}
  <circle cx="1700" cy="180" r="260" fill="${C.bubble}" opacity="0.18"/><circle cx="300" cy="900" r="320" fill="${C.bubble}" opacity="0.12"/>
  ${bubbles(1180, 400, 2.2, C.bubble, 5)}${shark(1150, 330, 1.9, { body: C.bubble, belly: C.foam, eye: C.white })}
  <path d="M0 880 Q250 800 500 880 T1000 880 T1500 880 T2000 880 V1000 H0 Z" fill="${C.bubble}" opacity="0.35"/>
  <path d="M0 930 Q250 860 500 930 T1000 930 T1500 930 T2000 930 V1000 H0 Z" fill="${C.foam}" opacity="0.5"/>`) };
for (const col of collectionsDef) {
  const icon = SPECIAL[col.handle] || BY_TAG[col.tag];
  if (!icon) continue;
  jobs[`collection-${col.handle}`] = { w: 1200, h: 1200, svg: svg(1200, 1200, `${roundBg(1200, 1200, C.foam)}<circle cx="1050" cy="150" r="130" fill="${C.bubble}" opacity="0.5"/><circle cx="150" cy="1050" r="170" fill="${C.bubble}" opacity="0.35"/><g transform="translate(300 300)">${icon()}</g>`) };
}
for (const [cat, icon] of Object.entries(BY_TAG))
  jobs[`placeholder-${cat}`] = { w: 1200, h: 1200, svg: svg(1200, 1200, `${roundBg(1200, 1200, C.foam)}<g transform="translate(300 180)" opacity="0.9">${icon()}</g>${txt(600, 930, 56, "Photo coming soon", { fill: C.deep })}${txt(600, 1010, 38, "bubblesharks.com", { fill: C.ocean, cls: "b" })}`) };

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, j] of Object.entries(jobs)) {
  await page.setViewportSize({ width: j.w, height: j.h });
  await page.setContent(`<!doctype html><html><head>${HEAD}</head><body style="background:${j.transparent ? "transparent" : "white"}">${j.svg}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), omitBackground: !!j.transparent, clip: { x: 0, y: 0, width: j.w, height: j.h } });
  console.log("rendered", name, `${j.w}x${j.h}`);
}
await browser.close();
console.log(`\n${Object.keys(jobs).length} images in brand/images/. Next: node scripts/push-images.mjs`);
