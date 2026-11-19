"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { detectCapabilities, type Capabilities } from "./quality";
import { SCENES } from "./storyboard";
import { clamp01, emitFilmChange, film } from "./store";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
  // Mobile URL-bar show/hide must not re-measure the film (prevents jumps mid-scene).
  ScrollTrigger.config({ ignoreMobileResize: true });
}

type FrameFn = (s: number, sTarget: number) => void;
const frameFns = new Set<FrameFn>();

/** Run a callback every animation frame while the film is mounted (reads the damped coordinate). */
export function useFilmFrame(fn: FrameFn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const f: FrameFn = (s, t) => ref.current(s, t);
    frameFns.add(f);
    return () => {
      frameFns.delete(f);
    };
  }, []);
}

export type FilmMode = "pending" | "film" | "flow";
type Ctx = { caps: Capabilities | null; mode: FilmMode };
const FilmContext = createContext<Ctx>({ caps: null, mode: "pending" });
export const useFilm = () => useContext(FilmContext);

const INTRO_KEY = "maindy-lp-intro-seen";

/**
 * Centralised scroll engine. One ScrollTrigger measures the film; the global coordinate
 * `s = sceneIndex + localProgress` is derived from scrollY (deterministic, bidirectional) and damped
 * in a single rAF loop that also feeds per-frame subscribers. WebGL reads `film.s` from the same store.
 * Reduced motion → "flow" mode: plain document layout, no pinning, no scrubbing.
 */
export function CinematicScrollController({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [ctx, setCtx] = useState<Ctx>({ caps: null, mode: "pending" });

  useIsoLayoutEffect(() => {
    const caps = detectCapabilities();
    film.quality = caps.quality;
    film.reducedMotion = caps.reducedMotion;
    film.viewport = { w: window.innerWidth, h: window.innerHeight, mobile: caps.mobile };
    const mode: FilmMode = caps.reducedMotion ? "flow" : "film";
    root.current?.setAttribute("data-mode", mode);
    if (mode === "flow") root.current?.removeAttribute("data-intro");
    document.documentElement.classList.remove("mk-smooth"); // ScrollTrigger needs native, non-smooth scroll
    setCtx({ caps, mode });
    emitFilmChange();
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el || ctx.mode !== "film") return;
    const sections = Array.from(el.querySelectorAll<HTMLElement>("[data-scene]"));
    let tops: number[] = [];
    let heights: number[] = [];
    film.local = sections.map(() => 0);

    const measure = () => {
      const y = window.scrollY;
      tops = sections.map((s) => s.getBoundingClientRect().top + y);
      heights = sections.map((s) => s.offsetHeight);
      film.viewport = { w: window.innerWidth, h: window.innerHeight, mobile: film.viewport.mobile };
    };

    let lastActive = -2;
    const compute = () => {
      const y = window.scrollY;
      let i = 0;
      for (let k = 0; k < tops.length; k++) if (y >= tops[k]! - 0.5) i = k;
      const span = i === sections.length - 1 ? heights[i]! - window.innerHeight : heights[i]!;
      const local = clamp01((y - tops[i]!) / Math.max(1, span));
      for (let k = 0; k < sections.length; k++) film.local[k] = k < i ? 1 : k > i ? 0 : local;
      film.sTarget = Math.min(SCENES.length, i + local);
      // Each scene fades its own copy out before it ends, so only the current stage needs to be visible.
      // past the last scene (epilogue covers the screen) nothing is pinned
      const last = sections.length - 1;
      const act = i === last && y >= tops[last]! + heights[last]! - 1 ? -1 : i;
      if (act !== lastActive) {
        lastActive = act;
        sections.forEach((s, k) => s.toggleAttribute("data-active", k === act));
      }
    };

    measure();
    compute();
    film.s = film.sTarget;
    el.setAttribute("data-ready", "");

    const st = ScrollTrigger.create({
      trigger: el,
      start: "top top",
      end: "bottom bottom",
      onRefresh: () => {
        measure();
        compute();
      },
      onUpdate: compute,
    });

    // Intro: a light point blooms into the orb (time-based, once per session, never blocks scrolling).
    let introStart = -1;
    let seen = false;
    try {
      seen = sessionStorage.getItem(INTRO_KEY) === "1";
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {}
    film.intro = seen || window.scrollY > 40 ? 1 : 0;
    el.toggleAttribute("data-intro", film.intro < 1);

    const onPointer = (e: PointerEvent) => {
      film.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      film.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
      if (e.pointerType === "mouse") film.pointer.active = true;
      else film.pointer.touchAt = performance.now();
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    // gyroscope parallax (Android fires without permission; iOS after the "Movimento" button grants it)
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      const portrait = window.innerHeight >= window.innerWidth;
      const gx = portrait ? e.gamma : e.beta;
      const gy = portrait ? e.beta - 45 : (e.gamma ?? 0);
      film.tilt.x = Math.max(-1, Math.min(1, gx / 28));
      film.tilt.y = Math.max(-1, Math.min(1, -gy / 28));
      film.tilt.active = true;
    };
    window.addEventListener("deviceorientation", onOrient, { passive: true });
    window.addEventListener("scroll", compute, { passive: true });

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // frame-rate independent damping; large jumps (anchor links) settle quickly but visibly
      const k = 1 - Math.exp(-dt * 14);
      const prevS = film.s;
      film.s += (film.sTarget - film.s) * k;
      const v = dt > 0 ? (film.s - prevS) / dt : 0;
      film.velocity += (v - film.velocity) * (1 - Math.exp(-dt * 8));
      // free-look spring: inertia while released, then glide back to the directed shot
      const L = film.look;
      if (!L.dragging) {
        L.yaw += L.vy * dt;
        L.pitch += L.vp * dt;
        L.vy *= Math.exp(-dt * 3.2);
        L.vp *= Math.exp(-dt * 3.2);
        const spring = 1 - Math.exp(-dt * 1.6);
        L.yaw -= L.yaw * spring;
        L.pitch -= L.pitch * spring;
      }
      if (Math.abs(film.sTarget - film.s) < 1e-4) film.s = film.sTarget;
      const pk = 1 - Math.exp(-dt * 4);
      film.pointer.sx += (film.pointer.x - film.pointer.sx) * pk;
      film.pointer.sy += (film.pointer.y - film.pointer.sy) * pk;
      film.tilt.sx += (film.tilt.x - film.tilt.sx) * pk;
      film.tilt.sy += (film.tilt.y - film.tilt.sy) * pk;
      if (film.intro < 1) {
        if (introStart < 0) introStart = now;
        const t = (now - introStart) / 2200;
        film.intro = window.scrollY > 40 ? Math.min(1, film.intro + dt * 2.5) : Math.min(1, t);
        if (film.intro >= 1) el.removeAttribute("data-intro");
      }
      for (const f of frameFns) f(film.s, film.sTarget);
    };
    raf = requestAnimationFrame(loop);

    const onRestart = () => {
      introStart = -1;
      el.setAttribute("data-intro", "");
    };
    window.addEventListener("maindy:intro-restart", onRestart);
    const onSkip = () => {
      film.intro = 1;
      el.removeAttribute("data-intro");
    };
    window.addEventListener("maindy:skip-intro", onSkip);

    // fonts/images can shift layout after first measure
    const ro = new ResizeObserver(() => ScrollTrigger.refresh());
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      st.kill();
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("scroll", compute);
      window.removeEventListener("maindy:skip-intro", onSkip);
      window.removeEventListener("maindy:intro-restart", onRestart);
    };
  }, [ctx.mode]);

  return (
    <FilmContext.Provider value={ctx}>
      <div ref={root} className="film" data-mode="film" data-intro="">
        {children}
      </div>
    </FilmContext.Provider>
  );
}

/**
 * Declarative, scrubbed copy choreography for one scene. Children marked with
 * `data-r` (words | fade | rise | scale) enter at local progress `data-a` and leave at `data-b`.
 * `data-a="-1"` = visible from the start (used by the hero, whose entry is time-based CSS).
 */
export function useSceneTimeline(section: React.RefObject<HTMLElement | null>, last = false) {
  const { mode } = useFilm();
  useEffect(() => {
    const el = section.current;
    if (!el || mode !== "film") return;
    const gctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: el, start: "top top", end: last ? "bottom bottom" : "bottom top", scrub: 0.25 },
      });
      tl.set({}, {}, 1); // normalise the timeline to 0..1 = scene local progress
      el.querySelectorAll<HTMLElement>("[data-r]").forEach((node) => {
        const kind = node.dataset.r;
        const a = parseFloat(node.dataset.a ?? "0");
        const b = node.dataset.b ? parseFloat(node.dataset.b) : null;
        const d = parseFloat(node.dataset.d ?? "0.1");
        const words = kind === "words" ? Array.from(node.querySelectorAll<HTMLElement>("[data-w]")) : null;
        const targets = words && words.length ? words : node;
        const from =
          kind === "words"
            ? { yPercent: 115, rotate: 4 }
            : kind === "scale"
              ? { autoAlpha: 0, scale: 0.92 }
              : kind === "rise"
                ? { autoAlpha: 0, y: 70 }
                : { autoAlpha: 0, y: 18, filter: "blur(6px)" };
        const to = kind === "words" ? { yPercent: 0, rotate: 0 } : kind === "fade" ? { autoAlpha: 1, y: 0, filter: "blur(0px)" } : { autoAlpha: 1, y: 0, scale: 1 };
        if (a >= 0) {
          tl.fromTo(
            targets,
            from,
            { ...to, duration: words ? d * 0.7 : d, ease: "power3.out", stagger: words ? { amount: d * 0.3 } : 0 },
            a,
          );
        } else {
          gsap.set(targets, to);
        }
        if (b !== null) {
          const out =
            kind === "words"
              ? { yPercent: -115, rotate: -2 }
              : kind === "fade"
                ? { autoAlpha: 0, y: -24, filter: "blur(6px)" }
                : { autoAlpha: 0, y: kind === "rise" ? -60 : -24 };
          tl.to(targets, { ...out, duration: words ? d * 0.7 : d, ease: "power2.in", stagger: words ? { amount: d * 0.3 } : 0, immediateRender: false }, b);
        }
      });
    }, el);
    return () => gctx.revert();
  }, [section, mode, last]);
}
