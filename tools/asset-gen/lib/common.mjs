// Shared palette + small SVG helpers for the MAINDY asset generator.
// Palette values are the brand palette, used verbatim.
export const C = {
  navy: '#05082B',
  navySoft: '#0B1040',
  navyLight: '#151A50',
  purple: '#7600FF',
  purpleLight: '#A020F0',
  magenta: '#D000E8',
  yellow: '#FFC400',
  yellowSoft: '#FFE36E',
  white: '#FFFFFF',
  textPrimary: '#F8F8FF',
  textSecondary: '#A8AAC6',
  surface: '#101438',
  surfaceLight: '#1B2050',
};

export const f = (n) => Number(n.toFixed(2));

export function svgDoc(w, h, defs, body, extra = '') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${extra}>
<defs>
${defs}
</defs>
${body}
</svg>
`;
}

export const blur = (id, sd) =>
  `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${f(sd)}"/></filter>`;

export const stops = (arr) =>
  arr.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('');

export const lin = (id, x1, y1, x2, y2, arr, units = 'objectBoundingBox') =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="${units}">${stops(arr)}</linearGradient>`;

export const rad = (id, cx, cy, r, arr, fx = cx, fy = cy) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" fx="${fx}" fy="${fy}">${stops(arr)}</radialGradient>`;

// point on circle; angle in degrees, 0 = right, positive = clockwise (screen space)
export const pt = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

export function arc(cx, cy, r, a0, a1) {
  const [x0, y0] = pt(cx, cy, r, a0);
  const [x1, y1] = pt(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${f(x0)} ${f(y0)} A${f(r)} ${f(r)} 0 ${large} ${sweep} ${f(x1)} ${f(y1)}`;
}

export const rr = (x, y, w, h, r) =>
  `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)}H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z`;
