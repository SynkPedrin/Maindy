"use client";

import { createContext, useContext, useRef } from "react";
import { cn } from "@/lib/cn";
import { useFilmFrame, useSceneTimeline } from "./CinematicScrollController";
import { film } from "./store";

const SceneIndex = createContext(0);
import { SCENES, type SceneId } from "./storyboard";

/**
 * One shot of the film: a tall scroll spacer (semantic <section>, anchor target) whose stage is
 * pinned to the viewport while its scene is current. In "flow" mode (reduced motion / no JS) the
 * stage is a normal block and everything is visible.
 */
export function Scene({
  id,
  children,
  className,
  stageClassName,
  labelledBy,
}: {
  id: SceneId;
  children: React.ReactNode;
  className?: string;
  stageClassName?: string;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useSceneTimeline(ref, id === SCENES[SCENES.length - 1]!.id);
  const def = SCENES.find((s) => s.id === id)!;
  return (
    <section
      ref={ref}
      id={def.anchor}
      data-scene={id}
      aria-labelledby={labelledBy}
      className={cn("film-section", className)}
      style={{ ["--len-d" as string]: def.len.d, ["--len-m" as string]: def.len.m }}
    >
      <div className={cn("film-stage", stageClassName)}>
        <SceneIndex.Provider value={SCENES.findIndex((x) => x.id === id)}>{children}</SceneIndex.Provider>
      </div>
    </section>
  );
}

/**
 * Word-masked headline. Words rise from their own masks (scrubbed by the scene timeline).
 * `\n` forces a line break; words listed in `accent` get the editorial serif + violet ink.
 */
export function Words({
  text,
  as = "h2",
  className,
  id,
  a,
  b,
  d,
  accent = [],
}: {
  text: string;
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
  id?: string;
  a?: number;
  b?: number;
  d?: number;
  accent?: string[];
}) {
  const Tag = as;
  const lines = text.split("\n");
  return (
    <Tag id={id} className={className} data-r="words" data-a={a} data-b={b} data-d={d} aria-label={text.replace(/\n/g, " ")}>
      {lines.map((line, li) => {
        const words = line.split(" ");
        return (
          <span key={li} className={lines.length > 1 ? "block" : undefined}>
            {words.map((w, i) => (
              <span key={i} aria-hidden className="film-wmask">
                <span data-w className={cn("inline-block will-change-transform", accent.includes(w) && "film-serif mk-ink-violet pr-[0.06em]")}>
                  {w}
                </span>
                {i < words.length - 1 ? "\u00A0" : null}
              </span>
            ))}
            {li < lines.length - 1 ? " " : null}
          </span>
        );
      })}
    </Tag>
  );
}

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%/<>·";

/** Small mono label used as a scene slate: `03 — A VIRADA`. Decodes from noise when its scene arrives. */
export function Slate({ n, children, className, a, b }: { n: string; children: string; className?: string; a?: number; b?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const sceneIdx = useContext(SceneIndex);
  const done = useRef(false);
  useFilmFrame((s) => {
    const el = ref.current;
    if (!el) return;
    const local = s - sceneIdx;
    if (local < (a ?? 0) - 0.02 || local > 1) {
      if (done.current && (local < (a ?? 0) - 0.05 || local > 1)) {
        done.current = false;
        el.textContent = children;
      }
      return;
    }
    if (done.current || film.reducedMotion) return;
    done.current = true;
    const t0 = performance.now();
    const run = () => {
      const t = (performance.now() - t0) / 700;
      const reveal = Math.floor(t * children.length);
      el.textContent = children
        .split("")
        .map((ch, i) => (i < reveal || ch === " " ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
        .join("");
      if (t < 1) requestAnimationFrame(run);
      else el.textContent = children;
    };
    run();
  });
  return (
    <p className={cn("m-label flex items-center gap-3", className)} data-r="fade" data-a={a} data-b={b} data-d={0.08}>
      <span className="text-muted">{n}</span>
      <span aria-hidden className="h-px w-8 bg-line-strong" />
      <span ref={ref} aria-label={children}>
        {children}
      </span>
    </p>
  );
}
