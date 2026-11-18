"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useFilm, useFilmFrame } from "../CinematicScrollController";
import { SCENES } from "../storyboard";

/** Jump to a scene, landing just after its opening beat (where the copy is readable). */
export function goToScene(i: number, behavior: ScrollBehavior = "smooth") {
  const el = document.querySelector<HTMLElement>(`[data-scene="${SCENES[i]!.id}"]`);
  if (!el) return;
  const last = i === SCENES.length - 1;
  // the final act lands on the download action; other chapters just after their opening beat
  const offset = i === 0 ? 0 : last ? (el.offsetHeight - window.innerHeight) * 0.82 : el.offsetHeight * 0.16;
  const top = el.getBoundingClientRect().top + window.scrollY + offset;
  window.scrollTo({ top, behavior });
}

/** Minimal scene rail (desktop) + hairline progress (mobile). Doubles as chapter navigation. */
export function SceneProgress() {
  const { mode } = useFilm();
  // deep links (/#baixar, /#orbit…) and same-page anchor clicks land on the readable beat of the chapter
  useEffect(() => {
    if (mode !== "film") return;
    const go = () => {
      const i = SCENES.findIndex((s) => `#${s.anchor}` === window.location.hash);
      if (i > 0) requestAnimationFrame(() => goToScene(i, "instant"));
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, [mode]);
  const [cur, setCur] = useState(0);
  const curRef = useRef(0);
  const bar = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLElement>(null);
  useFilmFrame((s) => {
    const i = Math.min(SCENES.length - 1, Math.floor(s));
    if (i !== curRef.current) {
      curRef.current = i;
      setCur(i);
    }
    if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, s / SCENES.length)})`;
    if (rail.current) {
      const hide = s > SCENES.length - 0.15 || s < 0.06;
      rail.current.toggleAttribute("data-hidden", hide);
    }
  });
  if (mode !== "film") return null;
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-16 z-40 h-px bg-white/[0.06] lg:hidden">
        <div ref={bar} className="h-full origin-left bg-gradient-to-r from-violet via-purple to-gold" style={{ transform: "scaleX(0)" }} />
      </div>
      <nav
        ref={rail}
        aria-label="Capítulos"
        className="film-rail fixed right-5 top-1/2 z-40 hidden -translate-y-1/2 transition-opacity duration-500 data-[hidden]:pointer-events-none data-[hidden]:opacity-0 focus-within:!pointer-events-auto focus-within:!opacity-100 lg:block xl:right-8"
        data-hidden=""
      >
        <ol className="flex flex-col items-end gap-2.5">
          {SCENES.map((sc, i) => (
            <li key={sc.id}>
              <a
                href={`#${sc.anchor}`}
                aria-current={cur === i ? "step" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  const keyboard = e.detail === 0;
                  goToScene(i, keyboard ? "instant" : "smooth");
                  if (keyboard) {
                    // move focus into the chapter so the next Tab lands on its controls
                    requestAnimationFrame(() => {
                      const sec = document.querySelector<HTMLElement>(`[data-scene="${sc.id}"]`);
                      if (!sec) return;
                      sec.tabIndex = -1;
                      sec.focus({ preventScroll: true });
                    });
                  }
                }}
                className="group flex items-center gap-3 py-0.5"
              >
                <span className="film-rail-label translate-x-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:opacity-100">
                  {sc.label}
                </span>
                <span className={cn("film-rail-dot block size-1.5 rounded-full bg-white/30 transition-[background-color,transform,box-shadow] duration-300 group-hover:bg-white/70")} />
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
