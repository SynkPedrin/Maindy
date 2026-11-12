// Font -> SVG path helpers (Poppins Bold, OFL, bundled in ../fonts).
import opentype from 'opentype.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { C, f } from './common.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const font = opentype.loadSync(path.join(here, '..', 'fonts', 'Poppins-Bold.ttf'));
const UPM = font.unitsPerEm;
export const X_HEIGHT = font.tables.os2.sxHeight / UPM; // 0.558 em

// Path for a single glyph fitted so that its bbox centre sits at (cx, cy) and its width = w.
export function glyphFit(ch, cx, cy, w) {
  const g = font.charToGlyph(ch);
  const bb = g.getBoundingBox();
  const s = w / (bb.x2 - bb.x1);
  const size = s * UPM;
  const gw = (bb.x2 - bb.x1) * s;
  const gh = (bb.y2 - bb.y1) * s;
  const x = cx - gw / 2 - bb.x1 * s;
  const baseline = cy + gh / 2 + bb.y1 * s;
  return { d: g.getPath(x, baseline, size).toPathData(2), w: gw, h: gh, baseline };
}

// Lay out "maindy" with dotless i; returns paths plus the two brand dots.
// x, baseline in px; size = font size (em) in px; tracking in em.
export function wordmarkLayout(x, baseline, size, tracking = 0.005) {
  const s = size / UPM;
  const chars = ['m', 'a', 'ı', 'n', 'd', 'y'];
  const glyphs = chars.map((c) => font.charToGlyph(c));
  let pen = x;
  const parts = [];
  glyphs.forEach((g, i) => {
    const bb = g.getBoundingBox();
    parts.push({ ch: chars[i], d: g.getPath(pen, baseline, size).toPathData(2), x1: pen + bb.x1 * s, x2: pen + bb.x2 * s, top: baseline - bb.y2 * s });
    let adv = g.advanceWidth * s + tracking * size;
    if (i < glyphs.length - 1) adv += font.getKerningValue(g, glyphs[i + 1]) * s;
    pen += adv;
  });
  const xh = X_HEIGHT * size;
  const iPart = parts[2];
  const yPart = parts[5];
  const yellowDot = { cx: (iPart.x1 + iPart.x2) / 2, cy: baseline - xh - 0.25 * xh, r: 0.2 * xh };
  const purpleDot = { cx: yPart.x2 + 0.02 * xh, cy: baseline - 0.17 * xh, r: 0.19 * xh };
  const left = parts[0].x1;
  const right = purpleDot.cx + purpleDot.r;
  return { parts, yellowDot, purpleDot, xh, left, right, width: right - left, top: yellowDot.cy - yellowDot.r, bottom: baseline + 0.265 * size };
}

// Render the wordmark as SVG markup. textColor for letters.
export function wordmarkSvg(L, { textColor = C.white, idp = 'wm', glow = false } = {}) {
  const letters = L.parts.map((p) => p.d).join(' ');
  const defs = `
<linearGradient id="${idp}-yd" x1="0.2" y1="0.1" x2="0.8" y2="0.95"><stop offset="0" stop-color="${C.yellowSoft}"/><stop offset="0.45" stop-color="${C.yellow}"/><stop offset="1" stop-color="${C.yellow}"/></linearGradient>
<linearGradient id="${idp}-pd" x1="0.2" y1="0.1" x2="0.8" y2="0.95"><stop offset="0" stop-color="${C.purpleLight}"/><stop offset="1" stop-color="${C.purple}"/></linearGradient>
<filter id="${idp}-glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="${f(L.xh * 0.12)}"/></filter>`;
  const body = `
${glow ? `<path d="${letters}" fill="${C.purpleLight}" opacity="0.35" filter="url(#${idp}-glow)"/>` : ''}
<path d="${letters}" fill="${textColor}" stroke="${textColor}" stroke-width="${f(L.xh * 0.02)}" stroke-linejoin="round"/>
<circle cx="${f(L.yellowDot.cx)}" cy="${f(L.yellowDot.cy)}" r="${f(L.yellowDot.r)}" fill="url(#${idp}-yd)"/>
<circle cx="${f(L.purpleDot.cx)}" cy="${f(L.purpleDot.cy)}" r="${f(L.purpleDot.r)}" fill="url(#${idp}-pd)"/>`;
  return { defs, body };
}
