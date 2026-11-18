import type { Quality } from "./store";

export type Capabilities = {
  quality: Quality;
  webgl: boolean;
  mobile: boolean;
  reducedMotion: boolean;
  dpr: number;
  particles: number;
  postfx: boolean;
};

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Adaptive quality profile. Heuristic first (cores, memory, pointer, save-data), then the render
 * loop may downgrade at runtime if the measured frame rate is poor (see FpsGovernor).
 * `?quality=high|medium|low` overrides for QA.
 */
export function detectCapabilities(): Capabilities {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
  const webgl = hasWebGL();
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 8;
  const saveData = !!nav.connection?.saveData;

  let quality: Quality;
  if (!webgl || saveData || mem <= 2 || (mobile && cores <= 4)) quality = "low";
  else if (!mobile && cores >= 8 && mem >= 8) quality = "high";
  else quality = "medium";

  // explicit choice wins: ?quality= (QA) then the visitor's saved preference from the quality menu
  let forced: string | null = new URLSearchParams(window.location.search).get("quality");
  if (!forced) {
    try {
      forced = localStorage.getItem("maindy-lp-quality");
    } catch {}
  }
  if (forced === "high" || forced === "medium" || forced === "low") quality = forced;
  if (!webgl) quality = "low";

  const dprRaw = window.devicePixelRatio || 1;
  const dpr = quality === "high" ? Math.min(dprRaw, 1.75) : mobile ? Math.min(dprRaw, 1.5) : Math.min(dprRaw, 1.25);
  const particles = quality === "high" ? 2600 : mobile ? 900 : 1500;
  return { quality, webgl, mobile, reducedMotion, dpr, particles, postfx: quality === "high" };
}
