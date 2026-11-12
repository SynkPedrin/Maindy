// MAINDY glyph set, drawn on a 24-unit grid.
// One style for everything: 2-unit rounded strokes, round caps/joins,
// 3.5-unit corner radii, a translucent "glass" fill (alpha) behind the
// outline and a solid accent dot (echo of the brand's terminal dot).
// Each glyph is a function (c = ink colour, a = glass-fill alpha) -> SVG markup.
import { rr, arc as arcD, pt } from './common.mjs';

const P = (cx, cy, r, d) => pt(cx, cy, r, d).map((v) => +v.toFixed(2));

const SW = 2;
const st = (c, w = SW) => `fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

export const NAV = {
  // House with soft roof, glass body and brand dot in place of a door.
  home: (c, a) => `
<path d="M5.2 10.4V17.6A2.6 2.6 0 0 0 7.8 20.2H16.2A2.6 2.6 0 0 0 18.8 17.6V10.4L12 4.9Z" fill="${c}" fill-opacity="${a}"/>
<path d="M3.4 11.6L10.4 5.6A2.5 2.5 0 0 1 13.6 5.6L20.6 11.6" ${st(c)}/>
<path d="M5.2 10.4V17.6A2.6 2.6 0 0 0 7.8 20.2H16.2A2.6 2.6 0 0 0 18.8 17.6V10.4" ${st(c)}/>
<circle cx="12" cy="14.6" r="2.1" fill="${c}"/>`,

  // Memory: two glass hemispheres (top view) bridged by a linked chain of
  // memory nodes - a "memory network" motif rather than an anatomical brain.
  memories: (c, a) => `
<path d="M10.8 4.4C7.2 3.6 3.8 6 3.9 9.4C2.7 10.8 2.8 13.6 4.2 15C4.4 18.2 7.4 20.2 10.8 19.4Z" fill="${c}" fill-opacity="${a}" stroke="${c}" stroke-width="${SW}" stroke-linejoin="round"/>
<path d="M13.2 4.4C16.8 3.6 20.2 6 20.1 9.4C21.3 10.8 21.2 13.6 19.8 15C19.6 18.2 16.6 20.2 13.2 19.4Z" fill="${c}" fill-opacity="${a}" stroke="${c}" stroke-width="${SW}" stroke-linejoin="round"/>
<path d="M7.6 9.8L12 12L16.4 14.2" ${st(c, 1.6)}/>
<circle cx="7.6" cy="9.8" r="2" fill="${c}"/>
<circle cx="12" cy="12" r="1.5" fill="${c}"/>
<circle cx="16.4" cy="14.2" r="2" fill="${c}"/>`,

  // Calendar card: glass header band, binder posts, one highlighted day.
  calendar: (c, a) => `
<path d="${rr(3.6, 5.2, 16.8, 15.2, 3.5)}" ${st(c)}/>
<path d="M3.6 8.7A3.5 3.5 0 0 1 7.1 5.2H16.9A3.5 3.5 0 0 1 20.4 8.7V10.2H3.6Z" fill="${c}" fill-opacity="${a * 1.6}"/>
<path d="M3.6 10.2H20.4M8.2 3.2V6.8M15.8 3.2V6.8" ${st(c)}/>
<circle cx="15.2" cy="15.4" r="2.2" fill="${c}"/>`,

  // Two task rows: a completed (filled, checked) and an open one.
  // (the check is a true cut-out via mask, so the icon stays single-ink for tintColor)
  tasks: (c, a, id = 'tk') => `
<mask id="${id}-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><path d="M5.5 7.7L6.7 8.9L9 6.4" fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></mask>
<circle cx="7.2" cy="7.6" r="3.6" fill="${c}" mask="url(#${id}-cut)"/>
<path d="M13.4 7.6H20.4" ${st(c)}/>
<circle cx="7.2" cy="16.4" r="3.4" fill="${c}" fill-opacity="${a}" stroke="${c}" stroke-width="${SW}"/>
<path d="M13.4 16.4H20.4" ${st(c)} stroke-opacity="0.6"/>`,

  // Focus: the orb outline with the three brand sparks shining at its
  // top-right, a glass core and a single bright point.
  focus: (c, a) => `
<circle cx="11" cy="13.4" r="8" ${st(c)}/>
<circle cx="11" cy="13.4" r="4.5" fill="${c}" fill-opacity="${a * 1.4}"/>
<circle cx="11" cy="13.4" r="2.2" fill="${c}"/>
${[-78, -48, -18].map((d) => { const [x0, y0] = P(11, 13.4, 9.7, d); const [x1, y1] = P(11, 13.4, 11.7, d); return `<path d="M${x0} ${y0}L${x1} ${y1}" ${st(c, 1.7)}/>`; }).join('')}`,

  // Settings as three tuning sliders with knobs (calmer than a gear).
  settings: (c, a) => `
<path d="M3.6 6.4H11.2M17.6 6.4H20.4M3.6 12H5.4M11.8 12H20.4M3.6 17.6H12.6M19 17.6H20.4" ${st(c)}/>
<circle cx="14.4" cy="6.4" r="2.6" fill="${c}" fill-opacity="${a}" stroke="${c}" stroke-width="${SW}"/>
<circle cx="8.6" cy="12" r="2.6" fill="${c}" stroke="${c}" stroke-width="${SW}"/>
<circle cx="15.8" cy="17.6" r="2.6" fill="${c}" fill-opacity="${a}" stroke="${c}" stroke-width="${SW}"/>`,
};

// Category glyphs: same grid/stroke language, used on full-colour glass badges.
export const CAT = {
  people: (c, a) => `
<circle cx="16.2" cy="7.8" r="2.9" fill="${c}" fill-opacity="${a + 0.2}"/>
<path d="M13.4 12.6H17A4.6 4.6 0 0 1 21.6 17.2V18.8H15.6Z" fill="${c}" fill-opacity="${a + 0.2}"/>
<circle cx="9" cy="8.4" r="3.5" fill="${c}"/>
<path d="M2.4 19.4V18.6A5.4 5.4 0 0 1 7.8 13.2H10.2A5.4 5.4 0 0 1 15.6 18.6V19.4Z" fill="${c}" stroke="${c}" stroke-width="${SW}" stroke-linejoin="round"/>`,

  personal: (c, a) => `
<circle cx="12" cy="8" r="3.8" fill="${c}"/>
<path d="M5 20V19.4A6 6 0 0 1 11 13.4H13A6 6 0 0 1 19 19.4V20Z" fill="${c}" fill-opacity="${a}" stroke="${c}" stroke-width="${SW}" stroke-linejoin="round"/>
<path d="M18.2 3.4L18.8 2.2M20.4 5.6L21.6 5" ${st(c, 1.5)}/>`,

  work: (c, a) => `
<path d="${rr(3.2, 7.4, 17.6, 12.6, 3.4)}" fill="${c}" fill-opacity="${a}" stroke="${c}" stroke-width="${SW}"/>
<path d="M9 7.4V6A2 2 0 0 1 11 4H13A2 2 0 0 1 15 6V7.4" ${st(c)}/>
<path d="M3.4 12.6Q12 15.6 20.6 12.6" ${st(c)}/>
<circle cx="12" cy="14" r="1.6" fill="${c}"/>`,

  study: (c, a) => `
<path d="M12 6.6C9.8 5 6.6 4.6 3.4 5.2V18.2C6.6 17.6 9.8 18 12 19.6Z" fill="${c}" fill-opacity="${a}" stroke="${c}" stroke-width="${SW}" stroke-linejoin="round"/>
<path d="M12 6.6C14.2 5 17.4 4.6 20.6 5.2V18.2C17.4 17.6 14.2 18 12 19.6Z" fill="${c}" stroke="${c}" stroke-width="${SW}" stroke-linejoin="round"/>
<path d="M12 6.6V19.6" ${st(c)}/>`,

  health: (c, a) => `
<path d="M12 20.2C7 16.8 3 13.6 3 9.2A4.6 4.6 0 0 1 12 7.4A4.6 4.6 0 0 1 21 9.2C21 13.6 17 16.8 12 20.2Z" fill="${c}" fill-opacity="${a}" stroke="${c}" stroke-width="${SW}" stroke-linejoin="round"/>
<path d="M6 12.4H9L10.6 9.6L13 15L14.6 12.4H18" ${st(c)}/>`,

  finance: (c, a) => `
<path d="M4 8.2A3 3 0 0 1 7 5.2H17.4" ${st(c)}/>
<path d="${rr(3.2, 7.8, 17.6, 12.2, 3.4)}" fill="${c}" fill-opacity="${a}" stroke="${c}" stroke-width="${SW}"/>
<path d="M20.8 11.6H17A2.3 2.3 0 0 0 17 16.2H20.8Z" fill="${c}" stroke="${c}" stroke-width="${SW}" stroke-linejoin="round"/>`,

  routines: (c, a) => `
<circle cx="12" cy="12" r="5" fill="${c}" fill-opacity="${a}"/>
<path d="M19.4 9.4A8 8 0 1 0 20 13.6" ${st(c)}/>
<path d="M20.4 4.8V9.6H15.6" ${st(c)}/>
<path d="M12 9V12.2L14.2 13.6" ${st(c)}/>`,

  // helper glyph for illustrations (not exported as a category)
  reminder: (c, a) => `
<path d="M6.2 16.2V11.2A5.8 5.8 0 0 1 17.8 11.2V16.2L19.4 18H4.6Z" fill="${c}" fill-opacity="${a}" stroke="${c}" stroke-width="${SW}" stroke-linejoin="round"/>
<path d="M10 20.4A2.3 2.3 0 0 0 14 20.4" ${st(c)}/>
<circle cx="12" cy="4" r="1.3" fill="${c}"/>`,

  important: (c, a) => `
<path d="M12 3.2L14.5 8.6L20.3 9.3L16 13.3L17.1 19.1L12 16.2L6.9 19.1L8 13.3L3.7 9.3L9.5 8.6Z" fill="${c}" stroke="${c}" stroke-width="${SW}" stroke-linejoin="round"/>`,
};
