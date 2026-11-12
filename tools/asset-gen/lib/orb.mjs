// The MAINDY glass orb, parametric, with the six assistant states.
// Returns { defs, body } so the orb can be embedded in other compositions.
import { C, f, pt, arc, stops } from './common.mjs';
import { glyphFit } from './type.mjs';

const BASE = {
  glow: 0.9, // purple halo strength
  glowSpread: 0.11, // halo blur as fraction of r
  yellow: 0.9, // warm top-right glow strength
  magenta: 0.45,
  rim: 1, // rim-light strength
  sparks: 'color', // 'color' | 'mono' | 'none'
  mono: false,
  core: 0, // inner purple core (thinking)
  swirl: false,
  rings: 0, // concentric sound rings (listening)
  bars: false, // audio bars (speaking)
  focusRing: false,
  cool: false,
  bodyLift: 0, // brighten the sphere body
};

export const ORB_STATES = {
  idle: {},
  listening: { glow: 1.05, glowSpread: 0.13, yellow: 1, rim: 1.25, rings: 3, bodyLift: 0.12 },
  thinking: { glow: 1, yellow: 0.4, magenta: 0.7, core: 1, swirl: true, sparks: 'none' },
  speaking: { glow: 0.95, yellow: 1.35, rim: 1.15, bars: true, bodyLift: 0.05 },
  focus: { glow: 0.65, glowSpread: 0.045, yellow: 0, magenta: 0, cool: true, sparks: 'none', focusRing: true, rim: 0.85 },
  offline: { mono: true, glow: 0, yellow: 0, magenta: 0, sparks: 'mono', rim: 0.35 },
};

/**
 * @param {number} cx centre x
 * @param {number} cy centre y
 * @param {number} r sphere radius
 * @param {string|object} state state name or param overrides
 * @param {string} p id prefix (unique per document)
 */
export function orb(cx, cy, r, state = 'idle', p = 'orb') {
  const s = { ...BASE, ...(typeof state === 'string' ? ORB_STATES[state] : state) };
  const mono = s.mono;
  const col = (c, g) => (mono ? g : c);
  const U = 'gradientUnits="userSpaceOnUse"';
  const defs = [];
  const body = [];

  // ---- filters
  const fl = (id, sd) => defs.push(`<filter id="${p}-${id}" x="-60%" y="-60%" width="220%" height="220%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${f(sd)}"/></filter>`);
  fl('halo', r * s.glowSpread);
  fl('soft', r * 0.16);
  fl('mid', r * 0.05);
  fl('fine', r * 0.012);
  fl('core', r * 0.22);
  defs.push(`<clipPath id="${p}-clip"><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/></clipPath>`);

  // ---- outer glow (behind the sphere)
  if (s.glow > 0) {
    const haloCol = s.cool ? C.purple : C.purple;
    body.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 1.04)}" fill="${haloCol}" opacity="${f(Math.min(1, 0.85 * s.glow))}" filter="url(#${p}-halo)"/>`);
    if (!s.cool) {
      body.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 1.0)}" fill="none" stroke="${C.purpleLight}" stroke-width="${f(r * 0.08)}" opacity="${f(0.7 * s.glow)}" filter="url(#${p}-mid)"/>`);
    } else {
      body.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 1.0)}" fill="none" stroke="${C.purpleLight}" stroke-width="${f(r * 0.05)}" opacity="0.55" filter="url(#${p}-mid)"/>`);
    }
  }
  if (s.magenta > 0) {
    const [mx, my] = pt(cx, cy, r * 0.22, 150);
    body.push(`<circle cx="${f(mx)}" cy="${f(my)}" r="${f(r * 0.95)}" fill="${C.magenta}" opacity="${f(0.55 * s.magenta)}" filter="url(#${p}-halo)"/>`);
  }
  if (s.yellow > 0) {
    // warm haze hugging the top-right rim (as in the brand orb)
    const [yx, yy] = pt(cx, cy, r * 0.62, -42);
    defs.push(`<radialGradient id="${p}-ywarm" cx="${f(yx)}" cy="${f(yy)}" r="${f(r * 0.8)}" ${U}>${stops([[0, C.yellowSoft, 1], [0.4, C.yellow, 0.85], [1, C.yellow, 0]])}</radialGradient>`);
    body.push(`<circle cx="${f(yx)}" cy="${f(yy)}" r="${f(r * 0.8)}" fill="url(#${p}-ywarm)" opacity="${f(Math.min(1, 0.8 * s.yellow))}" filter="url(#${p}-mid)"/>`);
    body.push(`<path d="${arc(cx, cy, r * 1.04, -100, 12)}" fill="none" stroke="${C.yellow}" stroke-width="${f(r * 0.2)}" stroke-linecap="round" opacity="${f(Math.min(1, 0.6 * s.yellow))}" filter="url(#${p}-soft)"/>`);
  }

  // ---- listening rings (outside the sphere)
  for (let i = 0; i < s.rings; i++) {
    const rr = r * (1.16 + i * 0.12);
    const op = [0.85, 0.5, 0.25][i] ?? 0.2;
    defs.push(`<linearGradient id="${p}-ring${i}" x1="${f(cx + rr)}" y1="${f(cy - rr)}" x2="${f(cx - rr)}" y2="${f(cy + rr)}" ${U}>${stops([[0, C.yellowSoft], [0.25, C.magenta], [0.6, C.purpleLight], [1, C.purple]])}</linearGradient>`);
    body.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rr)}" fill="none" stroke="url(#${p}-ring${i})" stroke-width="${f(r * (0.035 - i * 0.007))}" opacity="${op}"/>`);
    body.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rr)}" fill="none" stroke="${C.purpleLight}" stroke-width="${f(r * 0.06)}" opacity="${f(op * 0.45)}" filter="url(#${p}-mid)"/>`);
  }

  // ---- sphere body
  const lift = s.bodyLift;
  const bodyStops = mono
    ? [[0, '#24263F'], [0.6, '#15172C'], [0.86, '#191B32'], [0.95, '#2C2E48'], [1, '#43455F']]
    : s.cool
      ? [[0, C.navySoft], [0.6, '#070A33'], [0.84, '#0A0D42'], [0.94, '#1C1678'], [1, '#4A2BD0']]
      : [[0, mixHex(C.navySoft, C.purple, lift)], [0.58, mixHex('#070A35', C.purple, lift * 0.6)], [0.82, '#0B0B40'], [0.93, '#2A1194'], [1, '#6A2AEE']];
  defs.push(`<radialGradient id="${p}-body" cx="${f(cx - r * 0.06)}" cy="${f(cy - r * 0.1)}" r="${f(r * 1.06)}" fx="${f(cx - r * 0.12)}" fy="${f(cy - r * 0.2)}" ${U}>${stops(bodyStops)}</radialGradient>`);
  body.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="url(#${p}-body)"/>`);

  const clipped = [];
  // inner rim light: warm top-right -> violet -> purple bottom-left
  defs.push(`<linearGradient id="${p}-irim" x1="${f(cx + r * 0.75)}" y1="${f(cy - r * 0.75)}" x2="${f(cx - r * 0.7)}" y2="${f(cy + r * 0.7)}" ${U}>${stops(
    mono
      ? [[0, '#8A8CA6'], [1, '#55576F']]
      : s.cool
        ? [[0, '#C9B8FF'], [0.5, C.purpleLight], [1, C.purple]]
        : [[0, s.yellow > 0 ? C.yellowSoft : C.purpleLight], [0.22, s.yellow > 0.5 ? '#FFB347' : C.magenta], [0.42, C.magenta], [0.7, C.purpleLight], [1, C.purple]],
  )}</linearGradient>`);
  clipped.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.985)}" fill="none" stroke="url(#${p}-irim)" stroke-width="${f(r * 0.07)}" opacity="${f(0.75 * s.rim)}" filter="url(#${p}-mid)"/>`);
  // bottom caustic
  if (!mono) clipped.push(`<ellipse cx="${f(cx - r * 0.05)}" cy="${f(cy + r * 0.82)}" rx="${f(r * 0.7)}" ry="${f(r * 0.28)}" fill="${s.cool ? '#5A3BFF' : C.purpleLight}" opacity="0.45" filter="url(#${p}-soft)"/>`);

  // thinking: purple core + swirl
  if (s.core) {
    defs.push(`<radialGradient id="${p}-core" cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.75)}" ${U}>${stops([[0, '#C060FF', 0.95], [0.35, C.purpleLight, 0.75], [0.7, C.purple, 0.35], [1, C.purple, 0]])}</radialGradient>`);
    clipped.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.75)}" fill="url(#${p}-core)" opacity="${f(0.9 * s.core)}"/>`);
    clipped.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.3)}" fill="${C.magenta}" opacity="0.35" filter="url(#${p}-core)"/>`);
  }
  if (s.swirl) {
    defs.push(`<linearGradient id="${p}-sw" x1="${f(cx - r)}" y1="${f(cy)}" x2="${f(cx + r)}" y2="${f(cy)}" ${U}>${stops([[0, C.purpleLight, 0], [0.4, C.magenta, 0.9], [1, C.yellowSoft, 0.9]])}</linearGradient>`);
    const sw = [
      [0.8, -150, 20, 0.03, 0.85],
      [0.66, 40, 205, 0.026, 0.7],
      [0.9, 70, 175, 0.016, 0.5],
      [0.53, -100, -10, 0.02, 0.6],
    ];
    for (const [k, a0, a1, w, op] of sw) {
      clipped.push(`<path d="${arc(cx, cy, r * k, a0, a1)}" fill="none" stroke="url(#${p}-sw)" stroke-width="${f(r * w)}" stroke-linecap="round" opacity="${op}"/>`);
      clipped.push(`<path d="${arc(cx, cy, r * k, a0, a1)}" fill="none" stroke="${C.purpleLight}" stroke-width="${f(r * w * 4)}" stroke-linecap="round" opacity="${f(op * 0.35)}" filter="url(#${p}-mid)"/>`);
    }
    // small orbiting particles
    for (const [k, a, rad, c] of [[0.78, 20, 0.03, C.yellowSoft], [0.64, 205, 0.025, C.magenta], [0.52, -10, 0.02, '#E6CCFF']]) {
      const [x, y] = pt(cx, cy, r * k, a);
      clipped.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * rad)}" fill="${c}"/>`);
    }
  }

  // speaking: audio bars in the lower part of the sphere
  if (s.bars) {
    defs.push(`<linearGradient id="${p}-bar" x1="${f(cx)}" y1="${f(cy + r * 0.38)}" x2="${f(cx)}" y2="${f(cy + r * 0.86)}" ${U}>${stops([[0, C.yellowSoft], [0.45, C.yellow], [1, C.magenta]])}</linearGradient>`);
    const hs = [0.08, 0.14, 0.22, 0.3, 0.2, 0.34, 0.24, 0.15, 0.09];
    const n = hs.length;
    const bw = r * 0.055;
    const gap = r * 0.05;
    const total = n * bw + (n - 1) * gap;
    const yc = cy + r * 0.6;
    const bars = hs.map((h, i) => {
      const x = cx - total / 2 + i * (bw + gap);
      const hh = r * h;
      return `<rect x="${f(x)}" y="${f(yc - hh / 2)}" width="${f(bw)}" height="${f(hh)}" rx="${f(bw / 2)}"/>`;
    }).join('');
    clipped.push(`<g fill="${C.yellow}" opacity="0.55" filter="url(#${p}-mid)">${bars}</g>`);
    clipped.push(`<g fill="url(#${p}-bar)">${bars}</g>`);
    // warm inner bloom
    clipped.push(`<ellipse cx="${f(cx)}" cy="${f(cy + r * 0.62)}" rx="${f(r * 0.5)}" ry="${f(r * 0.18)}" fill="${C.yellow}" opacity="0.22" filter="url(#${p}-soft)"/>`);
  }

  // specular highlight, top-left
  const [hx, hy] = pt(cx, cy, r * 0.5, -128);
  defs.push(`<radialGradient id="${p}-spec" cx="${f(hx)}" cy="${f(hy)}" r="${f(r * 0.55)}" ${U}>${stops([[0, C.white, mono ? 0.12 : 0.26], [0.5, C.white, mono ? 0.04 : 0.08], [1, C.white, 0]])}</radialGradient>`);
  clipped.push(`<ellipse cx="${f(hx)}" cy="${f(hy)}" rx="${f(r * 0.62)}" ry="${f(r * 0.34)}" transform="rotate(-38 ${f(hx)} ${f(hy)})" fill="url(#${p}-spec)"/>`);
  // glossy arc near the top-left rim
  clipped.push(`<path d="${arc(cx, cy, r * 0.9, -165, -105)}" fill="none" stroke="${C.white}" stroke-width="${f(r * 0.022)}" stroke-linecap="round" opacity="${mono ? 0.18 : 0.42}" filter="url(#${p}-fine)"/>`);

  body.push(`<g clip-path="url(#${p}-clip)">${clipped.join('\n')}</g>`);

  // rims: outer bright line + faint inner line (double-rim glass look)
  defs.push(`<linearGradient id="${p}-rim" x1="${f(cx - r * 0.7)}" y1="${f(cy - r * 0.8)}" x2="${f(cx + r * 0.5)}" y2="${f(cy + r * 0.9)}" ${U}>${stops(
    mono ? [[0, '#B4B6CC', 0.7], [1, '#5E6078', 0.6]] : [[0, '#F1E8FF'], [0.35, s.cool ? '#C9B8FF' : '#D9B8FF'], [0.7, C.purpleLight], [1, C.magenta]],
  )}</linearGradient>`);
  body.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.995)}" fill="none" stroke="url(#${p}-rim)" stroke-width="${f(r * 0.014)}" opacity="${f(Math.min(1, 0.9 * s.rim))}"/>`);
  body.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.94)}" fill="none" stroke="url(#${p}-rim)" stroke-width="${f(r * 0.006)}" opacity="${f(0.4 * s.rim)}"/>`);
  if (s.yellow > 0) {
    const [ax0, ay0] = pt(cx, cy, r, -100);
    const [ax1, ay1] = pt(cx, cy, r, 15);
    defs.push(`<linearGradient id="${p}-yrim" x1="${f(ax0)}" y1="${f(ay0)}" x2="${f(ax1)}" y2="${f(ay1)}" ${U}>${stops([[0, C.yellowSoft, 0], [0.35, C.yellowSoft, 1], [0.65, C.yellow, 0.9], [1, C.yellow, 0]])}</linearGradient>`);
    body.push(`<path d="${arc(cx, cy, r * 0.995, -100, 15)}" fill="none" stroke="url(#${p}-yrim)" stroke-width="${f(r * 0.016)}" opacity="${f(Math.min(1, 0.9 * s.yellow))}"/>`);
  }
  if (s.focusRing) {
    body.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 1.12)}" fill="none" stroke="#C9B8FF" stroke-width="${f(r * 0.01)}" opacity="0.45"/>`);
  }

  // ---- the "m" + terminal dot + sparks
  const m = glyphFit('m', cx - r * 0.11, cy, r * 0.95);
  defs.push(`<linearGradient id="${p}-m" x1="0" y1="${f(cy - r * 0.3)}" x2="0" y2="${f(cy + r * 0.3)}" ${U}>${stops(mono ? [[0, '#B9BBD0'], [1, '#9294AE']] : [[0, C.white], [0.6, C.textPrimary], [1, '#E4E1F6']])}</linearGradient>`);
  body.push(`<path d="${m.d}" fill="#000" opacity="${mono ? 0.2 : 0.3}" transform="translate(0 ${f(r * 0.025)})" filter="url(#${p}-fine)"/>`);
  if (!mono && s.core) body.push(`<path d="${m.d}" fill="${C.white}" opacity="0.4" filter="url(#${p}-mid)"/>`);
  // a hairline round-join stroke softens the font's sharp outer corners, like the brand "m"
  body.push(`<path d="${m.d}" fill="url(#${p}-m)" stroke="url(#${p}-m)" stroke-width="${f(r * 0.022)}" stroke-linejoin="round"/>`);

  const dx = cx + r * 0.56;
  const dy = cy + r * 0.18;
  defs.push(`<radialGradient id="${p}-dot" cx="${f(dx - r * 0.04)}" cy="${f(dy - r * 0.04)}" r="${f(r * 0.13)}" ${U}>${stops(mono ? [[0, '#8C8EA8'], [1, '#6B6D86']] : [[0, '#B04DFF'], [0.6, C.purpleLight], [1, C.purple]])}</radialGradient>`);
  if (!mono) body.push(`<circle cx="${f(dx)}" cy="${f(dy)}" r="${f(r * 0.13)}" fill="${C.purple}" opacity="0.5" filter="url(#${p}-mid)"/>`);
  body.push(`<circle cx="${f(dx)}" cy="${f(dy)}" r="${f(r * 0.11)}" fill="url(#${p}-dot)"/>`);

  if (s.sparks !== 'none') {
    const sp = [
      [[0.335, -0.42], [0.415, -0.59], C.yellow],
      [[0.46, -0.395], [0.59, -0.475], C.purpleLight],
      [[0.53, -0.21], [0.69, -0.27], C.magenta],
    ];
    for (const [[x0, y0], [x1, y1], c] of sp) {
      const stroke = s.sparks === 'mono' ? '#6E7090' : c;
      body.push(`<path d="M${f(cx + r * x0)} ${f(cy + r * y0)}L${f(cx + r * x1)} ${f(cy + r * y1)}" stroke="${stroke}" stroke-width="${f(r * 0.068)}" stroke-linecap="round" fill="none"/>`);
    }
  }

  return { defs: defs.join('\n'), body: body.join('\n') };
}

function mixHex(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
