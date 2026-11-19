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

type Gpu = { webgl: boolean; webgl2: boolean; maxTexture: number; software: boolean };

/** Probe the real GPU instead of guessing from CPU cores (Safari on iPhone under-reports cores). */
function probeGpu(): Gpu {
  try {
    const c = document.createElement("canvas");
    const gl2 = c.getContext("webgl2") as WebGL2RenderingContext | null;
    const gl = (gl2 ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return { webgl: false, webgl2: false, maxTexture: 0, software: false };
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
    const software = /swiftshader|llvmpipe|software|basic render/.test(renderer);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { webgl: true, webgl2: !!gl2, maxTexture, software };
  } catch {
    return { webgl: false, webgl2: false, maxTexture: 0, software: false };
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
  const gpu = probeGpu();
  const webgl = gpu.webgl;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const cores = nav.hardwareConcurrency ?? 8;
  const mem = nav.deviceMemory ?? 8; // Safari does not expose it
  const saveData = !!nav.connection?.saveData;

  // GPU-first heuristic. Modern phones (WebGL2, ≥ 8K textures) get the full film, bloom included;
  // the runtime governor then trades resolution for frame rate if a device struggles.
  let quality: Quality;
  if (!webgl || gpu.software || saveData || mem <= 2 || !gpu.webgl2) quality = "low";
  else if (mobile) quality = gpu.maxTexture >= 8192 && mem >= 4 ? "high" : "medium";
  else quality = cores >= 6 && mem >= 4 ? "high" : "medium";

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
  const particles = quality === "high" ? (mobile ? 2200 : 4200) : mobile ? 1400 : 2200;
  return { quality, webgl, mobile, reducedMotion, dpr, particles, postfx: quality === "high" };
}
