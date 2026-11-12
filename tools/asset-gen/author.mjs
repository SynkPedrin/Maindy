// Stage 1: author the editable SVG sources in design/asset-src/ from the
// parametric builders in ./lib, and return the render manifest.
// Hand edits to an SVG are kept if you run `node generate.mjs --render-only`.
import fs from 'node:fs';
import path from 'node:path';
import { C, f, svgDoc, stops, rr, pt, arc } from './lib/common.mjs';
import { orb, ORB_STATES } from './lib/orb.mjs';
import { NAV, CAT } from './lib/glyphs.mjs';
import { wordmarkLayout, wordmarkSvg } from './lib/type.mjs';

const U = 'gradientUnits="userSpaceOnUse"';

// ---------------------------------------------------------------- helpers
// Glyph from the 24-grid placed at centre (cx, cy) with given size in px.
const placeGlyph = (fn, cx, cy, size, c, a, id) =>
  `<g transform="translate(${f(cx - size / 2)} ${f(cy - size / 2)}) scale(${f(size / 24)})">${fn(c, a, id)}</g>`;

// Rounded glass tile with tinted body, top-left sheen and warm top-right rim.
function glassTile(x, y, w, h, rad, accent, accent2, p, { shadow = true, tint = 0.55 } = {}) {
  const defs = [];
  const body = [];
  const sd = Math.max(w, h);
  // yellow over navy turns olive when used as a body tint: warm tiles get a
  // violet body with a small warm corner bloom; yellow lives in rim + glyph glow.
  const warm = accent === C.yellow || accent === C.yellowSoft;
  defs.push(`<filter id="${p}-b1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(sd * 0.06)}"/></filter>`);
  defs.push(`<filter id="${p}-b2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(sd * 0.02)}"/></filter>`);
  defs.push(`<clipPath id="${p}-clip"><path d="${rr(x, y, w, h, rad)}"/></clipPath>`);
  defs.push(`<linearGradient id="${p}-body" x1="${f(x)}" y1="${f(y)}" x2="${f(x + w)}" y2="${f(y + h)}" ${U}>${stops([[0, C.surfaceLight], [0.45, C.surface], [1, C.navy]])}</linearGradient>`);
  defs.push(`<filter id="${p}-b3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(sd * 0.14)}"/></filter>`);
  defs.push(`<linearGradient id="${p}-rim" x1="${f(x + w)}" y1="${f(y)}" x2="${f(x)}" y2="${f(y + h)}" ${U}>${stops([[0, C.yellowSoft, 0.95], [0.25, accent2, 0.9], [0.6, accent, 0.55], [1, C.purple, 0.5]])}</linearGradient>`);
  defs.push(`<linearGradient id="${p}-hl" x1="${f(x)}" y1="${f(y)}" x2="${f(x + w * 0.6)}" y2="${f(y + h * 0.6)}" ${U}>${stops([[0, C.white, 0.7], [1, C.white, 0]])}</linearGradient>`);
  if (shadow) body.push(`<path d="${rr(x + w * 0.06, y + h * 0.1, w * 0.88, h * 0.92, rad)}" fill="${warm ? C.purpleLight : accent}" opacity="0.5" filter="url(#${p}-b1)"/>`);
  body.push(`<path d="${rr(x, y, w, h, rad)}" fill="url(#${p}-body)"/>`);
  body.push(`<g clip-path="url(#${p}-clip)">
${warm
    ? `<circle cx="${f(x + w * 0.85)}" cy="${f(y + h * 0.95)}" r="${f(sd * 0.55)}" fill="${C.purple}" opacity="0.5" filter="url(#${p}-b3)"/>
<circle cx="${f(x + w * 0.95)}" cy="${f(y + h * 1.0)}" r="${f(sd * 0.3)}" fill="${C.yellow}" opacity="0.5" filter="url(#${p}-b3)"/>`
    : `<circle cx="${f(x + w * 0.85)}" cy="${f(y + h * 0.95)}" r="${f(sd * 0.55)}" fill="${accent}" opacity="${tint}" filter="url(#${p}-b3)"/>`}
<ellipse cx="${f(x + w * 0.3)}" cy="${f(y + h * 0.12)}" rx="${f(w * 0.45)}" ry="${f(h * 0.2)}" fill="${C.white}" opacity="0.14" filter="url(#${p}-b1)"/>
<path d="${rr(x, y, w, h, rad)}" fill="none" stroke="${accent2}" stroke-width="${f(sd * 0.05)}" opacity="0.45" filter="url(#${p}-b2)"/>
</g>`);
  body.push(`<path d="${rr(x + sd * 0.004, y + sd * 0.004, w - sd * 0.008, h - sd * 0.008, rad)}" fill="none" stroke="url(#${p}-rim)" stroke-width="${f(sd * 0.008)}"/>`);
  body.push(`<path d="${rr(x + sd * 0.004, y + sd * 0.004, w - sd * 0.008, h - sd * 0.008, rad)}" fill="none" stroke="url(#${p}-hl)" stroke-width="${f(sd * 0.008)}"/>`);
  return { defs: defs.join('\n'), body: body.join('\n') };
}

// Glyph with a coloured bloom behind it (used on tiles/badges).
function glowGlyph(fn, cx, cy, size, accent, p, alpha = 0.38) {
  const warm = accent === C.yellow || accent === C.yellowSoft;
  if (warm) alpha = 0.7; // a translucent white over a yellow bloom reads khaki; keep warm glyphs creamy
  return {
    defs: `<filter id="${p}-gg" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(size * 0.06)}"/></filter>
<linearGradient id="${p}-ink" x1="0" y1="0" x2="0" y2="24" ${U}>${stops([[0, C.white], [1, '#EDE6FF']])}</linearGradient>`,
    body: `<g opacity="${warm ? 0.6 : 0.85}" filter="url(#${p}-gg)">${placeGlyph(fn, cx, cy, size, accent, 0.6, p + 'g0')}</g>
${placeGlyph(fn, cx, cy, size, `url(#${p}-ink)`, alpha, p + 'g1')}`,
  };
}

// small 4-point sparkle
const sparkle = (x, y, s, c, op = 1) =>
  `<path d="M${f(x)} ${f(y - s)}Q${f(x + s * 0.16)} ${f(y - s * 0.16)} ${f(x + s)} ${f(y)}Q${f(x + s * 0.16)} ${f(y + s * 0.16)} ${f(x)} ${f(y + s)}Q${f(x - s * 0.16)} ${f(y + s * 0.16)} ${f(x - s)} ${f(y)}Q${f(x - s * 0.16)} ${f(y - s * 0.16)} ${f(x)} ${f(y - s)}Z" fill="${c}" opacity="${op}"/>`;

const join = (...parts) => ({ defs: parts.map((x) => x.defs).join('\n'), body: parts.map((x) => x.body).join('\n') });
const raw = (body, defs = '') => ({ defs, body });

// ---------------------------------------------------------------- brand
function brand() {
  const out = {};
  // symbol / splash
  const sym = orb(512, 512, 330, 'idle', 'o');
  out['brand/maindy-symbol'] = { svg: svgDoc(1024, 1024, sym.defs, sym.body), w: 1024, h: 1024 };

  // wordmark only
  {
    const size = 320;
    const L0 = wordmarkLayout(0, 0, size);
    const pad = 56;
    const W = Math.ceil((L0.width + pad * 2) / 2) * 2;
    const H = Math.ceil((L0.bottom - L0.top + pad * 2) / 2) * 2;
    const L = wordmarkLayout(pad - L0.left, pad - L0.top, size);
    const wm = wordmarkSvg(L, { idp: 'wm' });
    out['brand/maindy-wordmark'] = { svg: svgDoc(W, H, wm.defs, wm.body), w: W, h: H };
  }

  // lockups (dark + light)
  for (const variant of ['dark', 'light']) {
    const size = 320;
    const L0 = wordmarkLayout(0, 0, size);
    const r = 0.58 * size; // sphere diameter ~ ascender-to-descender height
    const glowR = r * 1.36;
    const pad = 24;
    const textLeft = pad + glowR + r * 1.5; // orb centre at pad+glowR
    const W = Math.ceil((textLeft + L0.width + pad + 24) / 2) * 2;
    const H = Math.ceil((glowR * 2 + pad * 2) / 2) * 2;
    const cy = H / 2;
    const baseline = cy + L0.xh / 2; // optical centre = x-height centre
    const L = wordmarkLayout(textLeft - L0.left, baseline, size);
    const o = orb(pad + glowR, cy, r, variant === 'dark' ? 'idle' : { glow: 0.55, yellow: 0.6, magenta: 0.25 }, 'o');
    const wm = wordmarkSvg(L, { idp: 'wm', textColor: variant === 'dark' ? C.white : C.navy });
    out[variant === 'dark' ? 'brand/maindy-logo' : 'brand/maindy-logo-light'] = { svg: svgDoc(W, H, o.defs + wm.defs, o.body + wm.body), w: W, h: H };
  }
  return out;
}

// ---------------------------------------------------------------- app icons
function appIcons() {
  const out = {};
  const bgDefs = `
<radialGradient id="bg" cx="470" cy="430" r="760" ${U}>${stops([[0, C.navyLight], [0.45, C.navySoft], [1, C.navy]])}</radialGradient>
<linearGradient id="arcY" x1="1024" y1="0" x2="600" y2="420" ${U}>${stops([[0, C.yellow, 0.9], [1, C.yellow, 0]])}</linearGradient>
<linearGradient id="arcP" x1="0" y1="1024" x2="480" y2="640" ${U}>${stops([[0, C.purpleLight, 0.9], [1, C.purple, 0]])}</linearGradient>
<filter id="bgb" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>`;
  const bgBody = `<rect width="1024" height="1024" fill="${C.navy}"/>
<rect width="1024" height="1024" fill="url(#bg)"/>
<path d="M520 -40Q960 60 1080 520" fill="none" stroke="url(#arcY)" stroke-width="22" opacity="0.45" filter="url(#bgb)"/>
<path d="M520 -40Q960 60 1080 520" fill="none" stroke="url(#arcY)" stroke-width="3" opacity="0.8"/>
<path d="M-40 560Q80 960 520 1070" fill="none" stroke="url(#arcP)" stroke-width="22" opacity="0.45" filter="url(#bgb)"/>
<path d="M-40 560Q80 960 520 1070" fill="none" stroke="url(#arcP)" stroke-width="3" opacity="0.8"/>`;
  const o = orb(512, 512, 318, 'idle', 'o');
  out['app-icons/app-icon'] = { svg: svgDoc(1024, 1024, bgDefs + o.defs, bgBody + o.body), w: 1024, h: 1024, opaque: true };
  const a = orb(512, 512, 246, 'idle', 'o');
  out['app-icons/adaptive-icon'] = { svg: svgDoc(1024, 1024, a.defs, a.body), w: 1024, h: 1024 };
  const s = orb(512, 512, 330, 'idle', 'o');
  out['app-icons/splash-icon'] = { svg: svgDoc(1024, 1024, s.defs, s.body), w: 1024, h: 1024 };
  return out;
}

// ---------------------------------------------------------------- assistant
function assistant() {
  const out = {};
  for (const st of Object.keys(ORB_STATES)) {
    // listening needs room for the rings
    const r = st === 'listening' ? 290 : 330;
    const o = orb(512, 512, r, st, 'o');
    out[`assistant/orb-${st}`] = { svg: svgDoc(1024, 1024, o.defs, o.body), w: 1024, h: 1024 };
  }
  return out;
}

// ---------------------------------------------------------------- navigation
function navigation() {
  const out = {};
  for (const [name, fn] of Object.entries(NAV)) {
    // glyph drawn on 24-grid scaled to the 1024 canvas (1 unit = 42.67px)
    const body = `<g transform="scale(${f(1024 / 24)})">${fn(C.white, 0.32, 'n')}</g>`;
    out[`navigation/${name}`] = { svg: svgDoc(1024, 1024, '', body), w: 1024, h: 1024, kind: 'nav' };
  }
  return out;
}

// ---------------------------------------------------------------- categories
const CAT_STYLE = {
  people: [C.purpleLight, C.magenta],
  personal: [C.magenta, C.yellowSoft],
  work: [C.purple, C.purpleLight],
  study: [C.yellow, C.yellowSoft],
  health: [C.magenta, C.purpleLight],
  finance: [C.yellowSoft, C.yellow],
  routines: [C.purple, C.magenta],
  important: [C.yellow, C.magenta],
};
function categories() {
  const out = {};
  for (const [name, [accent, accent2]] of Object.entries(CAT_STYLE)) {
    const t = glassTile(132, 120, 760, 760, 210, accent, accent2, 't', { tint: 0.62 });
    const g = glowGlyph(CAT[name], 512, 500, 540, accent, 'c');
    const all = join(t, g);
    out[`categories/${name}`] = { svg: svgDoc(1024, 1024, all.defs, all.body), w: 1024, h: 1024, kind: 'cat' };
  }
  return out;
}

// ---------------------------------------------------------------- onboarding
function softLight(cx, cy, r, color, op, id) {
  return raw(
    `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="url(#${id})" opacity="${op}"/>`,
    `<radialGradient id="${id}" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" ${U}>${stops([[0, color, 0.55], [0.5, color, 0.18], [1, color, 0]])}</radialGradient>`,
  );
}
function floorGlow(cx, cy, rx, ry, id) {
  return raw(
    `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#${id})"/>`,
    `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">${stops([[0, C.purpleLight, 0.55], [0.6, C.purple, 0.18], [1, C.purple, 0]])}</radialGradient>`,
  );
}

function onboarding() {
  const out = {};

  // welcome: the orb greeting, wrapped in soft light, orbit trails and sparkles
  {
    const cx = 512, cy = 470, r = 230;
    const parts = [softLight(cx, cy, 470, C.purple, 0.9, 'w-l1'), softLight(cx + 170, cy - 170, 260, C.yellow, 0.5, 'w-l2'), floorGlow(cx, 860, 300, 46, 'w-fl')];
    parts.push(raw(
      `<path d="${arc(cx, cy, r * 1.42, 195, 330)}" fill="none" stroke="url(#w-tr1)" stroke-width="5" stroke-linecap="round"/>
<path d="${arc(cx, cy, r * 1.62, 15, 150)}" fill="none" stroke="url(#w-tr2)" stroke-width="4" stroke-linecap="round"/>`,
      `<linearGradient id="w-tr1" x1="${cx - r * 1.4}" y1="0" x2="${cx + r * 1.4}" y2="0" ${U}>${stops([[0, C.purpleLight, 0], [0.6, C.magenta, 0.8], [1, C.yellowSoft, 1]])}</linearGradient>
<linearGradient id="w-tr2" x1="${cx + r * 1.6}" y1="0" x2="${cx - r * 1.6}" y2="0" ${U}>${stops([[0, C.purpleLight, 0], [0.7, C.purpleLight, 0.75], [1, C.magenta, 0.9]])}</linearGradient>`,
    ));
    const [e1x, e1y] = pt(cx, cy, r * 1.42, 330);
    const [e2x, e2y] = pt(cx, cy, r * 1.62, 150);
    parts.push(raw(`<circle cx="${f(e1x)}" cy="${f(e1y)}" r="11" fill="${C.yellowSoft}"/><circle cx="${f(e2x)}" cy="${f(e2y)}" r="9" fill="${C.magenta}"/>`));
    parts.push(orb(cx, cy, r, { glow: 1, yellow: 1.1, bodyLift: 0.06 }, 'o'));
    parts.push(raw([
      sparkle(176, 300, 26, C.yellowSoft, 0.95), sparkle(860, 560, 20, C.white, 0.85), sparkle(830, 200, 14, C.magenta, 0.9),
      sparkle(220, 700, 16, C.purpleLight, 0.9), sparkle(700, 820, 12, C.yellowSoft, 0.7),
      `<circle cx="300" cy="180" r="6" fill="${C.white}" opacity="0.6"/><circle cx="900" cy="400" r="5" fill="${C.yellowSoft}" opacity="0.7"/><circle cx="140" cy="520" r="5" fill="${C.magenta}" opacity="0.7"/><circle cx="780" cy="900" r="4" fill="${C.white}" opacity="0.5"/>`,
    ].join('\n')));
    const all = join(...parts);
    out['onboarding/welcome'] = { svg: svgDoc(1024, 1024, all.defs, all.body), w: 1024, h: 1024 };
  }

  // memory: orb linked to floating memory cards
  {
    const cx = 512, cy = 520, r = 165;
    const cards = [
      { x: 70, y: 150, w: 290, h: 180, a: C.purpleLight, b: C.magenta, g: CAT.people, ax: 350, ay: 300 },
      { x: 660, y: 110, w: 290, h: 180, a: C.yellow, b: C.yellowSoft, g: CAT.study, ax: 680, ay: 270 },
      { x: 50, y: 690, w: 290, h: 180, a: C.magenta, b: C.purpleLight, g: CAT.health, ax: 330, ay: 710 },
      { x: 680, y: 720, w: 290, h: 180, a: C.purple, b: C.purpleLight, g: CAT.important, ax: 700, ay: 740 },
    ];
    const parts = [softLight(cx, cy, 460, C.purple, 0.8, 'm-l1'), floorGlow(cx, 960, 320, 36, 'm-fl')];
    // links (behind cards)
    const linkDefs = `<linearGradient id="m-link" x1="0" y1="0" x2="1024" y2="1024" ${U}>${stops([[0, C.purpleLight], [0.5, C.magenta], [1, C.yellowSoft]])}</linearGradient>`;
    let links = '';
    cards.forEach((k) => {
      const ang = (Math.atan2(k.ay - cy, k.ax - cx) * 180) / Math.PI;
      const [sx, sy] = pt(cx, cy, r * 1.12, ang);
      const mx = (sx + k.ax) / 2 + (k.ay - sy) * 0.18;
      const my = (sy + k.ay) / 2 - (k.ax - sx) * 0.18;
      links += `<path d="M${f(sx)} ${f(sy)}Q${f(mx)} ${f(my)} ${f(k.ax)} ${f(k.ay)}" fill="none" stroke="url(#m-link)" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 14" opacity="0.95"/>`;
      links += `<circle cx="${f(sx)}" cy="${f(sy)}" r="8" fill="${C.purpleLight}"/>`;
    });
    // cross links between cards (memory graph)
    links += `<path d="M215 330Q170 520 195 690" fill="none" stroke="${C.purpleLight}" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round" opacity="0.6"/>`;
    links += `<path d="M805 290Q880 510 825 720" fill="none" stroke="${C.yellowSoft}" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round" opacity="0.5"/>`;
    parts.push(raw(links, linkDefs));
    cards.forEach((k, i) => {
      const t = glassTile(k.x, k.y, k.w, k.h, 44, k.a, k.b, `mc${i}`, { tint: k.a === C.yellow ? 0.3 : 0.5 });
      const ic = 96;
      const icx = k.x + 34 + ic / 2, icy = k.y + k.h / 2;
      const g = raw(
        `<circle cx="${f(icx)}" cy="${f(icy)}" r="${ic / 2 + 6}" fill="${k.a === C.yellow ? C.purpleLight : k.a}" opacity="0.28"/>
<circle cx="${f(icx)}" cy="${f(icy)}" r="${ic / 2 + 6}" fill="none" stroke="${k.a}" stroke-width="3" opacity="0.6"/>
${placeGlyph(k.g, icx, icy, ic * 0.78, C.white, k.a === C.yellow ? 0.7 : 0.4, `mg${i}`)}
<rect x="${f(k.x + 160)}" y="${f(icy - 34)}" width="100" height="18" rx="9" fill="${C.textPrimary}" opacity="0.9"/>
<rect x="${f(k.x + 160)}" y="${f(icy + 2)}" width="76" height="14" rx="7" fill="${C.textSecondary}" opacity="0.7"/>
<rect x="${f(k.x + 160)}" y="${f(icy + 30)}" width="52" height="14" rx="7" fill="${k.a}" opacity="0.85"/>`,
      );
      parts.push(t, g);
      parts.push(raw(`<circle cx="${f(k.ax)}" cy="${f(k.ay)}" r="10" fill="${C.white}"/><circle cx="${f(k.ax)}" cy="${f(k.ay)}" r="18" fill="none" stroke="${C.white}" stroke-width="3" opacity="0.35"/>`));
    });
    parts.push(orb(cx, cy, r, { glow: 1, core: 0.45, yellow: 0.9 }, 'o'));
    parts.push(raw([sparkle(520, 120, 18, C.yellowSoft, 0.9), sparkle(490, 900, 14, C.purpleLight, 0.9), `<circle cx="600" cy="80" r="5" fill="${C.white}" opacity="0.6"/><circle cx="420" cy="930" r="5" fill="${C.magenta}" opacity="0.7"/>`].join('')));
    const all = join(...parts);
    out['onboarding/memory'] = { svg: svgDoc(1024, 1024, all.defs, all.body), w: 1024, h: 1024 };
  }

  // organization: calendar / task / reminder / routine tiles orbiting the orb
  {
    const cx = 512, cy = 512, r = 190, ex = 360, ey = 190, tilt = -12;
    const onOrbit = (deg) => {
      const a = (deg * Math.PI) / 180;
      const x = ex * Math.cos(a), y = ey * Math.sin(a);
      const t = (tilt * Math.PI) / 180;
      return [cx + x * Math.cos(t) - y * Math.sin(t), cy + x * Math.sin(t) + y * Math.cos(t)];
    };
    const parts = [softLight(cx, cy, 470, C.purple, 0.85, 'g-l1'), floorGlow(cx, 880, 320, 40, 'g-fl')];
    const orbitDefs = `<linearGradient id="g-orb" x1="${cx - ex}" y1="0" x2="${cx + ex}" y2="0" ${U}>${stops([[0, C.purpleLight, 0.85], [0.5, C.magenta, 0.5], [1, C.yellowSoft, 0.9]])}</linearGradient>`;
    const orbitPath = `<ellipse cx="${cx}" cy="${cy}" rx="${ex}" ry="${ey}" transform="rotate(${tilt} ${cx} ${cy})" fill="none" stroke="url(#g-orb)" stroke-width="4"/>`;
    const orbit2 = `<ellipse cx="${cx}" cy="${cy}" rx="${ex * 1.1}" ry="${ey * 1.1}" transform="rotate(${tilt} ${cx} ${cy})" fill="none" stroke="${C.purpleLight}" stroke-width="2" stroke-dasharray="3 14" stroke-linecap="round" opacity="0.5"/>`;
    const tiles = [
      { deg: 195, g: NAV.calendar, a: C.purpleLight, b: C.magenta, s: 210 },
      { deg: 285, g: CAT.reminder, a: C.yellow, b: C.yellowSoft, s: 180 },
      { deg: 20, g: NAV.tasks, a: C.magenta, b: C.purpleLight, s: 220 },
      { deg: 115, g: CAT.routines, a: C.purple, b: C.purpleLight, s: 190 },
    ];
    const back = tiles.filter((t) => Math.sin((t.deg * Math.PI) / 180) < 0);
    const front = tiles.filter((t) => Math.sin((t.deg * Math.PI) / 180) >= 0);
    const tileOf = (t, i) => {
      let [x, y] = onOrbit(t.deg);
      y -= t.s * 0.15;
      const tl = glassTile(x - t.s / 2, y - t.s / 2, t.s, t.s, t.s * 0.27, t.a, t.b, `gt${i}`, { tint: t.a === C.yellow ? 0.36 : 0.6 });
      const gl = glowGlyph(t.g, x, y, t.s * 0.62, t.a, `gg${i}`, 0.35);
      return join(tl, gl);
    };
    parts.push(raw(orbitPath + orbit2, orbitDefs));
    back.forEach((t) => parts.push(tileOf(t, tiles.indexOf(t))));
    parts.push(orb(cx, cy, r, { glow: 1, yellow: 1 }, 'o'));
    // front half of the orbit line passes in front of the orb
    parts.push(raw(`<path d="${(() => { let d = ''; for (let k = 0; k <= 60; k++) { const [x, y] = onOrbit(k * 3); d += (k ? 'L' : 'M') + f(x) + ' ' + f(y); } return d; })()}" fill="none" stroke="url(#g-orb)" stroke-width="4" stroke-linecap="round"/>`));
    front.forEach((t) => parts.push(tileOf(t, tiles.indexOf(t))));
    parts.push(raw([sparkle(860, 170, 18, C.yellowSoft, 0.9), sparkle(150, 230, 14, C.magenta, 0.85), `<circle cx="760" cy="90" r="5" fill="${C.white}" opacity="0.6"/><circle cx="250" cy="880" r="5" fill="${C.purpleLight}" opacity="0.8"/>`].join('')));
    const all = join(...parts);
    out['onboarding/organization'] = { svg: svgDoc(1024, 1024, all.defs, all.body), w: 1024, h: 1024 };
  }

  // voice: speaking orb with voice arcs and a waveform ribbon
  {
    const cx = 512, cy = 450, r = 210;
    const parts = [softLight(cx, cy, 470, C.purple, 0.85, 'v-l1'), softLight(cx, 820, 300, C.yellow, 0.35, 'v-l2')];
    let arcs = '';
    const arcDefs = `<linearGradient id="v-a" x1="0" y1="${cy - 300}" x2="0" y2="${cy + 300}" ${U}>${stops([[0, C.yellowSoft], [0.5, C.magenta], [1, C.purpleLight]])}</linearGradient>`;
    [1.3, 1.55, 1.8].forEach((k, i) => {
      const op = [0.95, 0.65, 0.35][i];
      const span = 34 - i * 4;
      arcs += `<path d="${arc(cx, cy, r * k, -span, span)}" fill="none" stroke="url(#v-a)" stroke-width="${16 - i * 4}" stroke-linecap="round" opacity="${op}"/>`;
      arcs += `<path d="${arc(cx, cy, r * k, 180 - span, 180 + span)}" fill="none" stroke="url(#v-a)" stroke-width="${16 - i * 4}" stroke-linecap="round" opacity="${op}"/>`;
    });
    parts.push(raw(arcs, arcDefs));
    // waveform ribbon
    const wave = (amp, phase, freq) => {
      let d = '';
      for (let i = 0; i <= 120; i++) {
        const x = 120 + (i / 120) * 784;
        const env = Math.sin((i / 120) * Math.PI) ** 1.6;
        const y = 830 + amp * env * Math.sin((i / 120) * Math.PI * freq + phase);
        d += (i ? 'L' : 'M') + f(x) + ' ' + f(y);
      }
      return d;
    };
    const waveDefs = `<linearGradient id="v-w" x1="120" y1="0" x2="904" y2="0" ${U}>${stops([[0, C.purple, 0], [0.25, C.purpleLight, 1], [0.5, C.yellow, 1], [0.75, C.magenta, 1], [1, C.purple, 0]])}</linearGradient>
<filter id="v-wb" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>`;
    parts.push(raw(`<path d="${wave(70, 0, 9)}" fill="none" stroke="url(#v-w)" stroke-width="18" opacity="0.5" filter="url(#v-wb)"/>
<path d="${wave(70, 0, 9)}" fill="none" stroke="url(#v-w)" stroke-width="7" stroke-linecap="round"/>
<path d="${wave(45, 1.6, 7)}" fill="none" stroke="url(#v-w)" stroke-width="4" stroke-linecap="round" opacity="0.6"/>
<path d="${wave(28, 3.1, 11)}" fill="none" stroke="url(#v-w)" stroke-width="3" stroke-linecap="round" opacity="0.45"/>`, waveDefs));
    parts.push(orb(cx, cy, r, 'speaking', 'o'));
    parts.push(raw([sparkle(170, 200, 16, C.yellowSoft, 0.9), sparkle(870, 690, 14, C.purpleLight, 0.9), `<circle cx="880" cy="160" r="5" fill="${C.white}" opacity="0.6"/><circle cx="130" cy="640" r="5" fill="${C.magenta}" opacity="0.7"/>`].join('')));
    const all = join(...parts);
    out['onboarding/voice'] = { svg: svgDoc(1024, 1024, all.defs, all.body), w: 1024, h: 1024 };
  }
  return out;
}

export function author(srcDir) {
  const all = { ...brand(), ...appIcons(), ...assistant(), ...navigation(), ...categories(), ...onboarding() };
  for (const [name, a] of Object.entries(all)) {
    const file = path.join(srcDir, name + '.svg');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, a.svg);
  }
  return Object.keys(all);
}
