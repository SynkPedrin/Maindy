"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFilm, useFilmFrame } from "./CinematicScrollController";
import { emitFilmChange, film, range, smooth, windowed } from "./store";
import { SCENE_INDEX } from "./storyboard";

const Canvas = dynamic(() => import("@react-three/fiber").then((m) => m.Canvas), { ssr: false });
const World = dynamic(() => import("./world/World"), { ssr: false });

const FINAL = SCENE_INDEX.final;

/**
 * Layer A (real-time WebGL) with graceful degradation:
 * high → bloom/vignette · medium → no post-processing, lower DPR, fewer particles ·
 * low / no WebGL / context lost → CSS orb layer driven by the same scroll coordinate.
 */
export function CinematicCanvas() {
  const { caps, mode } = useFilm();
  const [quality, setQuality] = useState<"high" | "medium" | "low" | null>(null);
  const [lost, setLost] = useState(false);
  const [ready, setReady] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [idle, setIdle] = useState(false);
  const idleRef = useRef(false);

  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!caps) return;
    setQuality(caps.quality);
    try {
      setLocked(localStorage.getItem("maindy-lp-quality") === "high");
    } catch {}
    // quality menu: switch profile live (Ultra locks native resolution)
    const onQ = (e: Event) => {
      const q = (e as CustomEvent<"auto" | "high" | "medium" | "low">).detail;
      const next = q === "auto" ? caps.quality : caps.webgl ? q : "low";
      film.quality = next;
      setLocked(q === "high");
      setLost(false);
      setReady(false);
      setQuality(next);
    };
    window.addEventListener("maindy:quality", onQ);
    return () => window.removeEventListener("maindy:quality", onQ);
  }, [caps]);

  useEffect(() => {
    let alive = true;
    // fragment cards are drawn with the page fonts; wait for them (bounded)
    Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]).then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const wrap = useRef<HTMLDivElement>(null);
  useFilmFrame((s) => {
    if (wrap.current) wrap.current.style.visibility = s >= FINAL + 0.999 ? "hidden" : "visible";
    const next = film.covered || s >= FINAL + 0.995;
    if (next !== idleRef.current) {
      idleRef.current = next;
      setIdle(next);
    }
  });

  const onSlow = useCallback(() => {
    setQuality((q) => {
      const next = q === "high" ? "medium" : q;
      film.quality = next ?? "medium";
      emitFilmChange();
      return next;
    });
  }, []);

  const useGL = mode === "film" && caps && caps.webgl && quality && quality !== "low" && !lost && fontsReady;
  const mobile = caps?.mobile ?? false;
  const dprRaw = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  // native resolution up to 2× (4K/Retina); the DynamicResolution governor trades pixels for frame rate
  const maxDpr = quality === "high" ? Math.min(dprRaw, 2) : Math.min(dprRaw, mobile ? 2 : 1.5);
  const particles = quality === "high" ? 4200 : mobile ? 1400 : 2200;

  if (mode === "flow") return null;

  return (
    <div ref={wrap} aria-hidden data-film-canvas className="pointer-events-none fixed inset-0 z-0" style={{ background: "#070520" }}>
      <Fallback hidden={!!(useGL && ready)} />
      {useGL ? (
        <div className="absolute inset-0 transition-opacity duration-700" style={{ opacity: ready ? 1 : 0 }}>
          <Canvas
            dpr={[1, maxDpr]}
            frameloop={idle ? "never" : "always"}
            gl={{ antialias: quality !== "high", alpha: false, powerPreference: "high-performance", stencil: false, depth: true }}
            camera={{ fov: 35, near: 0.1, far: 220, position: [0, 0, 6.6] }}
            style={{ pointerEvents: "none" }}
            onCreated={({ gl }) => {
              gl.setClearColor("#070520", 1);
              gl.domElement.addEventListener(
                "webglcontextlost",
                (e) => {
                  e.preventDefault();
                  setLost(true);
                },
                { once: true },
              );
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  setReady(true);
                }),
              );
            }}
          >
            <World key={quality ?? "q"} particles={particles} postfx={quality === "high"} hd={quality === "high" || (mobile && dprRaw >= 2.5)} maxDpr={maxDpr} locked={locked} onSlow={onSlow} />
          </Canvas>
        </div>
      ) : null}
    </div>
  );
}

/**
 * CSS-only stand-in: the official orb image, positioned per scene from the same scroll coordinate.
 * Used before WebGL is ready, on low-end devices, without WebGL, or after a lost context.
 */
function Fallback({ hidden }: { hidden: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFilmFrame((s) => {
    const el = ref.current;
    if (!el || hidden) return;
    const mobile = film.viewport.mobile;
    const vw = film.viewport.w;
    // opacity: visible except inside the overload corridor and once the final plate takes over
    const o = (1 - windowed(s, 0.82, 1.0, 2.2, 2.8)) * (1 - smooth(range(s, FINAL + 0.05, FINAL + 0.12))) * smooth(range(film.intro, 0.1, 0.8));
    let x = 0;
    let y = mobile ? -0.16 : -0.06;
    let sc = 1;
    if (s < 1) sc = 1 + smooth(range(s, 0.2, 0.95)) * 1.6;
    else if (s > 4 && s < 5.1) {
      const k = windowed(s, 4.0, 4.2, 4.85, 5.05);
      x = mobile ? 0 : k * 0.22;
      y = mobile ? -0.28 * k - 0.06 * (1 - k) : y;
      sc = 1 - k * 0.25;
    } else if (s >= 5 && s < 7) sc = 0.8;
    else if (s >= 7 && s < 9) sc = 0.55;
    else if (s >= 9 && s < FINAL) sc = 1.15;
    el.style.setProperty("--ox", `${(mobile ? x : -x) * vw}px`);
    el.style.setProperty("--oy", `${y * film.viewport.h}px`);
    el.style.setProperty("--os", `${sc}`);
    el.style.setProperty("--oo", `${o}`);
  });
  return (
    <div className="film-fallback transition-opacity duration-700" style={{ opacity: hidden ? 0 : 1 }}>
      <div ref={ref} className="film-fallback__orb">
        <div className="film-fallback__glow" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lp/orb-1254.webp" alt="" className="relative size-full object-contain" draggable={false} />
      </div>
    </div>
  );
}
