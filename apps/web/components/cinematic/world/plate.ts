/**
 * Geometry of the official brand film plate (frames extracted from wordmark-to-orb-4k.mp4).
 * Shared by the 2D frame-sequence player and the WebGL director so the live orb hands off to the
 * filmed orb at exactly the same screen position and size. All sets share the 16:9 aspect.
 */
export const PLATE = {
  frames: 40,
  sets: [
    { minPx: 3000, dir: "/lp/seq/uhd" }, // 3840×2160 — 4K/5K screens
    { minPx: 1800, dir: "/lp/seq/hd" }, // 2560×1440
    { minPx: 1000, dir: "/lp/seq/d" }, // 1600×900
    { minPx: 0, dir: "/lp/seq/m" }, // 960×540
  ],
  /** orb (outer rim) diameter in the last frame, as a fraction of frame height */
  orbDiameterFrac: 536 / 900,
};

/** portrait screens: plate is scaled to width (×1.35) instead of covering, so the wordmark fits */
export function plateLayout(vw: number, vh: number) {
  const portrait = vw / vh < 1;
  const w = portrait ? vw * 1.35 : Math.max(vw, (vh * 16) / 9);
  const h = (w * 9) / 16;
  return { portrait, w, h, x: (vw - w) / 2, y: (vh - h) / 2, orbPx: PLATE.orbDiameterFrac * h };
}

/** sharpest set the screen can actually show (physical pixels of the drawn plate) */
export function plateDir(vw: number, vh: number, dpr: number, lowEnd: boolean) {
  const px = plateLayout(vw, vh).w * Math.min(dpr, 2);
  const set = PLATE.sets.find((s) => px >= s.minPx * (lowEnd ? 1.6 : 1)) ?? PLATE.sets[PLATE.sets.length - 1]!;
  return set.dir;
}
