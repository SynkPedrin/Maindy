"use client";

import { useEffect } from "react";

/**
 * Global cursor-reactive layer for the marketing site (no scroll hijacking):
 * - any element with [data-spot] gets --mx/--my CSS vars for a radial spotlight that follows the pointer;
 * - smooth anchor scrolling (native), disabled under prefers-reduced-motion.
 */
export function Ambient() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    if (!reduce) root.classList.add("mk-smooth");
    let raf = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      raf = 0;
      const e = last;
      if (!e) return;
      const el = (e.target as Element | null)?.closest?.("[data-spot]") as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      last = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
      root.classList.remove("mk-smooth");
    };
  }, []);
  return null;
}
