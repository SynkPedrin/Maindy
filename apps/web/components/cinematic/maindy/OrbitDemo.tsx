"use client";

import Image from "next/image";
import { Check, CornerDownRight, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { OrbitDemoData } from "@/lib/lp/orbit-demo";
import { track } from "@/lib/lp/analytics";
import { useFilmFrame } from "../CinematicScrollController";
import { film, firePulse } from "../store";
import { SCENE_INDEX } from "../storyboard";

const nf = new Intl.NumberFormat("pt-BR");
const DEMO = SCENE_INDEX.demo;

/**
 * "Você chama. A maindy. otimiza." — a request goes through the gateway and the real ORBIT Engine.
 * Results were computed server-side by @maindy/orbit-engine on fixed samples (no invented numbers).
 */
export function OrbitDemo({ data }: { data: OrbitDemoData }) {
  const [active, setActive] = useState(0);
  const [phase, setPhase] = useState(0); // 0 idle · 1 ask · 2..n steps · 9 result
  const [view, setView] = useState<"after" | "before">("after");
  const [shown, setShown] = useState(0);
  const started = useRef(false);
  const timers = useRef<number[]>([]);
  const run = data.runs[active]!;
  const pct = run.before > 0 ? Math.round(((run.before - run.after) / run.before) * 100) : 0;

  function play(i: number) {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setActive(i);
    setView("after");
    const reduce = film.reducedMotion;
    if (reduce) {
      setPhase(9);
      setShown(data.runs[i]!.after);
      return;
    }
    setPhase(1);
    setShown(data.runs[i]!.before);
    const steps = data.runs[i]!.steps.length;
    for (let k = 0; k < steps; k++) timers.current.push(window.setTimeout(() => setPhase(2 + k), 650 + k * 360));
    timers.current.push(
      window.setTimeout(() => {
        setPhase(9);
        firePulse();
        // count down from before → after
        const from = data.runs[i]!.before;
        const to = data.runs[i]!.after;
        const t0 = performance.now();
        const tick = () => {
          const t = Math.min(1, (performance.now() - t0) / 900);
          const e = 1 - Math.pow(1 - t, 3);
          setShown(Math.round(from + (to - from) * e));
          if (t < 1) timers.current.push(requestAnimationFrame(tick) as unknown as number);
        };
        tick();
      }, 750 + steps * 360),
    );
  }

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Auto-play once when the scene arrives (coordinated with the camera move).
  useFilmFrame((s) => {
    if (!started.current && s > DEMO + 0.16 && s < DEMO + 0.9) {
      started.current = true;
      play(0);
    }
  });

  const stepsShown = phase >= 9 ? run.steps.length : Math.max(0, phase - 1);

  return (
    <div data-tilt="4" className="film-tilt w-full rounded-[26px] border border-white/[0.08] bg-[rgba(12,9,38,.94)] p-1.5 shadow-[0_40px_120px_-40px_rgba(143,32,255,.55)]">
      <div className="rounded-[21px] border border-white/[0.05] bg-[rgba(8,6,30,.6)]">
        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Image src="/brand/orb-96.webp" alt="" width={26} height={26} className={cn(phase > 0 && phase < 9 && "mk-breathe")} />
            <div className="leading-tight">
              <p className="text-[13px] font-medium text-fg">Gateway local</p>
              <p className="font-mono text-[10.5px] text-subtle">127.0.0.1:8787 · ORBIT Engine v{data.engineVersion}</p>
            </div>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-success/25 bg-success/[0.06] px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-success sm:inline-flex">
            <span className="size-1.5 rounded-full bg-success" aria-hidden />
            Motor real · amostras fixas
          </span>
        </div>

        {/* presets */}
        <div className="px-4 pt-3.5">
          <p className="m-label text-[10px]">Experimente</p>
          <div role="radiogroup" aria-label="Exemplos de chamada" className="mt-2 flex flex-wrap gap-1.5">
            {data.runs.map((r, i) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={active === i}
                onClick={() => {
                  track("demo_run", { preset: r.id });
                  play(i);
                }}
                className={cn(
                  "h-8 rounded-full border px-3.5 text-[12.5px] transition-[background-color,color,border-color] duration-200",
                  active === i ? "border-transparent bg-fg text-bg" : "border-white/10 text-muted hover:border-white/25 hover:text-fg",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* conversation */}
        <div className="space-y-3 px-4 py-4" aria-live="polite">
          <div className={cn("ml-auto max-w-[88%] rounded-[16px] rounded-br-[6px] bg-white/[0.07] px-3.5 py-2.5 text-[13.5px] leading-snug text-fg transition-[opacity,transform] duration-500", phase >= 1 ? "opacity-100" : "translate-y-2 opacity-0")}>
            {run.ask}
          </div>

          <div className={cn("rounded-[16px] border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 transition-opacity duration-500", phase >= 2 ? "opacity-100" : "opacity-0")}>
            <p className="flex items-center gap-2 text-[12px] text-muted">
              <Sparkles className="size-3.5 text-purple" aria-hidden />
              {run.technique}
            </p>
            <ul className="mt-2 space-y-1.5">
              {run.steps.map((st, k) => (
                <li
                  key={st}
                  className={cn("flex items-start gap-2 text-[12.5px] text-fg/90 transition-[opacity,transform] duration-300", k < stepsShown ? "opacity-100" : "translate-x-1 opacity-0")}
                >
                  <Check className="mt-[2px] size-3.5 shrink-0 text-success" aria-hidden />
                  {st}
                </li>
              ))}
            </ul>
          </div>

          {/* result */}
          <div className={cn("transition-opacity duration-500", phase >= 9 ? "opacity-100" : "opacity-0")}>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="m-label text-[10px]">Tokens de entrada</p>
                <p className="mk-num mt-1 text-[34px] text-fg sm:text-[40px]">
                  {nf.format(shown)}
                  <span className="ml-2 text-[15px] tracking-normal text-subtle">de {nf.format(run.before)}</span>
                </p>
              </div>
              <p className="mk-num pb-1 text-[26px] text-success sm:text-[30px]">−{pct}%</p>
            </div>
            <div className="mt-3 space-y-1.5" aria-hidden>
              <div className="h-1.5 w-full rounded-full bg-white/[0.12]" />
              <div className="h-1.5 rounded-full bg-gradient-to-r from-purple to-neon transition-[width] duration-[900ms] ease-out-expo" style={{ width: `${Math.max(1.5, (run.after / Math.max(1, run.before)) * 100)}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div role="tablist" aria-label="Comparar conteúdo" className="flex rounded-full border border-white/10 p-0.5">
                {(["after", "before"] as const).map((v) => (
                  <button
                    key={v}
                    role="tab"
                    type="button"
                    aria-selected={view === v}
                    onClick={() => setView(v)}
                    className={cn("h-6 rounded-full px-2.5 font-mono text-[10.5px] transition-colors", view === v ? "bg-white/90 text-bg" : "text-muted hover:text-fg")}
                  >
                    {v === "after" ? "enviado" : "original"}
                  </button>
                ))}
              </div>
              <span className="font-mono text-[10px] text-subtle">{run.method}</span>
            </div>
            <pre className="mt-2 max-h-[132px] overflow-hidden rounded-[12px] border border-white/[0.06] bg-black/40 px-3 py-2.5 font-mono text-[10.5px] leading-[1.6] text-muted [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
              {(view === "after" ? run.afterPreview : run.beforePreview).map((l, i) => (
                <span key={i} className="block truncate">
                  {l.startsWith("[") || l.startsWith("…") ? <span className="text-purple">{l}</span> : l}
                </span>
              ))}
            </pre>
            <p className="mt-2.5 flex gap-1.5 text-[11.5px] leading-snug text-subtle">
              <CornerDownRight className="mt-[1px] size-3 shrink-0" aria-hidden />
              {run.note} Resultado desta amostra, não promessa para a sua carga.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
