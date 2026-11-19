"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { DashboardScene, MacScene, WindowsScene } from "@/components/marketing/desktop-demo";
import { DemoBadge } from "@/components/marketing/ui";
import { useFilmFrame } from "../CinematicScrollController";
import { film, range, smooth } from "../store";
import { SCENE_INDEX } from "../storyboard";

const P = SCENE_INDEX.product;

const MOMENTS = [
  { key: "mac", label: "No Mac", caption: "O notch mostra o ORBIT em ação. Um toque abre o painel rápido.", Scene: MacScene },
  { key: "win", label: "No Windows", caption: "Launcher compacto no canto da tela. Versão para Windows em preparação.", Scene: WindowsScene },
  { key: "dash", label: "No painel", caption: "Baseline, custo real e economia líquida, cada número com a sua origem.", Scene: DashboardScene },
] as const;

/**
 * Layer C product shot: the real app's interface (HTML mockups built from the desktop app design)
 * on a floating device. Scroll moves through three moments; tabs let people jump and interact.
 * The device is laid out at a fixed design width and scaled to fit, so it never reflows mid-shot.
 */
export function ProductDevice() {
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  const manual = useRef<{ at: number; band: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const fit = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [design, setDesign] = useState({ w: 1120, h: 640 });

  useLayoutEffect(() => {
    const el = fit.current;
    if (!el) return;
    const measure = () => {
      const mobile = window.innerWidth < 768;
      const d = mobile ? { w: 620, h: 600 } : { w: 1120, h: 640 };
      setDesign(d);
      setScale(Math.min(1, el.clientWidth / d.w, el.clientHeight / d.h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useFilmFrame((s) => {
    const local = range(s, P, P + 1);
    const band = local < 0.42 ? 0 : local < 0.68 ? 1 : 2;
    // scroll drives the moment unless the visitor picked one inside the current band
    if (!manual.current || manual.current.band !== band) {
      manual.current = null;
      if (idxRef.current !== band) {
        idxRef.current = band;
        setIdx(band);
      }
    }
    const el = frame.current;
    if (!el || film.reducedMotion) return;
    const enter = smooth(range(local, 0.02, 0.3));
    const exit = smooth(range(local, 0.86, 1));
    el.style.transform = `perspective(1800px) translate3d(0, ${(1 - enter) * 14 - exit * 8}vh, 0) rotateX(${(1 - enter) * 22 + exit * -8}deg) rotateY(${(1 - enter) * -8}deg) scale(${0.86 + enter * 0.14 - exit * 0.06})`;
    el.style.opacity = String(Math.min(enter * 1.4, 1 - exit));
  });

  useEffect(() => {
    if (film.reducedMotion && frame.current) frame.current.style.opacity = "1";
  }, []);

  const M = MOMENTS[idx]!;
  return (
    <div className="flex h-full w-full flex-col items-center">
      <div className="flex w-full flex-wrap items-center justify-center gap-3">
        <div role="tablist" aria-label="Momentos do app" className="flex rounded-full border border-line bg-[rgba(12,10,36,.92)] p-1">
          {MOMENTS.map((m, i) => (
            <button
              key={m.key}
              role="tab"
              type="button"
              aria-selected={idx === i}
              onClick={() => {
                const local = range(film.sTarget, P, P + 1);
                manual.current = { at: performance.now(), band: local < 0.42 ? 0 : local < 0.68 ? 1 : 2 };
                idxRef.current = i;
                setIdx(i);
              }}
              className={cn(
                "h-8 whitespace-nowrap rounded-full px-3.5 text-[13px] transition-colors duration-200 sm:h-9 sm:px-4",
                idx === i ? "bg-fg text-bg" : "text-muted hover:text-fg",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <DemoBadge label="Interface do app · dados simulados" className="hidden sm:inline-flex" />
      </div>
      <p className="film-optional mt-3 min-h-[2.6em] max-w-[34rem] px-4 text-center text-[13.5px] leading-snug text-muted" aria-live="polite">
        {M.caption}
      </p>
      <div ref={fit} className="relative mt-2 w-full flex-1">
        <div
          ref={frame}
          className="absolute left-1/2 top-0 origin-top will-change-transform"
          style={{ width: design.w, marginLeft: -design.w / 2, opacity: 0 }}
        >
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
            <div className="rounded-[26px] border border-white/[0.09] bg-[#0b0922]/90 p-2 shadow-[0_80px_160px_-40px_rgba(143,32,255,.6),0_0_0_1px_rgba(255,255,255,.03)_inset]">
              {/* all three stay mounted (no mount cost mid-scroll); only the active one is visible */}
              <div className="relative overflow-hidden rounded-[19px]" style={{ height: design.h - 16 }}>
                {MOMENTS.map((m, i) => (
                  <div
                    key={m.key}
                    aria-hidden={i !== idx}
                    inert={i !== idx ? true : undefined}
                    className={cn("absolute inset-0 transition-[opacity,transform] duration-500 ease-out-expo", i === idx ? "visible translate-y-0 opacity-100" : "invisible translate-y-2 opacity-0")}
                  >
                    <m.Scene />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
