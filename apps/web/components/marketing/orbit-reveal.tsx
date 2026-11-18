"use client";

import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { Check } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { orbitDetail } from "./content";
import { DemoBadge, Eyebrow } from "./ui";

const EASE = [0.16, 1, 0.3, 1] as const;

/* ---------------- Token field: the mini "processing" visualization ---------------- */

const REMOVED = new Set([9, 10, 11, 17, 18, 19, 25, 26, 27, 33, 34, 35]); // repeated context / duplicates
const COMPRESSED = new Set([5, 13, 21, 29, 37]); // verbose tool output
const ROUTED = new Set([0, 2, 7, 15, 23, 30, 39, 36]); // eligible for a cheaper route
const LEARNED = new Set([8, 24, 32]); // cache patterns learned per project
const REVERTED = 14; // technique rolled back by Quality Guard

function cellState(i: number, stage: number) {
  const removed = stage >= 1 && REMOVED.has(i);
  if (removed) return { opacity: 0.08, scale: 0.35, background: "rgba(255,122,107,.6)", borderColor: "rgba(255,122,107,0)" };
  let background = "rgba(190,183,214,.16)";
  let borderColor = "rgba(190,183,214,.18)";
  let scale = 1;
  if (stage === 0) {
    background = REMOVED.has(i) ? "rgba(255,122,107,.22)" : COMPRESSED.has(i) ? "rgba(255,122,107,.14)" : "rgba(190,183,214,.16)";
    borderColor = REMOVED.has(i) || COMPRESSED.has(i) ? "rgba(255,122,107,.45)" : "rgba(190,183,214,.18)";
  }
  if (stage >= 1 && COMPRESSED.has(i)) {
    background = "rgba(199,36,255,.55)";
    borderColor = "rgba(199,36,255,.8)";
    scale = 0.62;
  }
  if (stage >= 2 && !COMPRESSED.has(i)) {
    background = ROUTED.has(i) ? "rgba(250,248,255,.55)" : "rgba(143,32,255,.55)";
    borderColor = ROUTED.has(i) ? "rgba(250,248,255,.7)" : "rgba(164,36,255,.75)";
  }
  if (stage >= 3 && LEARNED.has(i)) {
    background = "rgba(255,210,31,.85)";
    borderColor = "rgba(255,210,31,1)";
  }
  if (stage >= 4 && i === REVERTED) {
    background = "rgba(255,122,107,.85)";
    borderColor = "rgba(255,122,107,1)";
  }
  return { opacity: 1, scale, background, borderColor };
}

export function TokenField({ stage, className }: { stage: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={cn("relative", className)}>
      <div className="grid grid-cols-8 gap-[6px]">
        {Array.from({ length: 40 }, (_, i) => (
          <motion.span
            key={i}
            className="relative aspect-square rounded-[5px] border"
            initial={false}
            animate={cellState(i, stage)}
            transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE, delay: (i % 8) * 0.018 + Math.floor(i / 8) * 0.03 }}
          >
            {stage >= 4 && i !== REVERTED && !REMOVED.has(i) ? (
              <Check aria-hidden className="absolute inset-0 m-auto size-[60%] text-bg/80" strokeWidth={3} />
            ) : null}
            {stage >= 4 && i === REVERTED ? (
              <span aria-hidden className="absolute inset-0 m-auto flex items-center justify-center text-[10px] font-bold text-bg">↺</span>
            ) : null}
          </motion.span>
        ))}
      </div>
      {stage === 0 && !reduce ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-[-6%] top-0 h-[10%] bg-gradient-to-b from-transparent via-purple/40 to-transparent"
          style={{ animation: "mk-scan 2.6s linear infinite" }}
        />
      ) : null}
    </div>
  );
}

const legendByStage: string[][] = [
  ["Blocos de contexto por chamada", "Repetição e verbosidade marcadas"],
  ["Repetidos removidos (cache/dedup)", "Saídas verbosas comprimidas"],
  ["Modelo principal", "Rota econômica elegível"],
  ["Padrão de cache aprendido no projeto"],
  ["Aprovado pelo Quality Guard", "Técnica revertida → original"],
];

/* ---------------- Ring ---------------- */

function Ring({ progress, stage }: { progress: MotionValue<number>; stage: number }) {
  const pathLength = useTransform(progress, [0.02, 0.98], [0, 1], { clamp: true });
  const spin = useTransform(progress, [0, 1], [0, 140]);
  return (
    <svg viewBox="0 0 640 640" className="absolute inset-0 size-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="orbit-prog" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8F20FF" />
          <stop offset=".6" stopColor="#C724FF" />
          <stop offset="1" stopColor="#FFD21F" />
        </linearGradient>
      </defs>
      <motion.circle
        cx="320"
        cy="320"
        r="312"
        fill="none"
        stroke="rgba(190,183,214,.16)"
        strokeDasharray="2 8"
        style={{ rotate: spin, transformOrigin: "320px 320px", transformBox: "view-box" }}
      />
      <circle cx="320" cy="320" r="270" fill="none" stroke="rgba(190,183,214,.14)" />
      <motion.circle
        cx="320"
        cy="320"
        r="270"
        fill="none"
        stroke="url(#orbit-prog)"
        strokeWidth="2.5"
        strokeLinecap="round"
        transform="rotate(-90 320 320)"
        style={{ pathLength }}
      />
      {orbitDetail.map((s, i) => {
        const a = ((i * 72 - 90) * Math.PI) / 180;
        const x = 320 + 270 * Math.cos(a);
        const y = 320 + 270 * Math.sin(a);
        const active = i === stage;
        const passed = i < stage;
        return (
          <g key={s.key}>
            {active ? <circle cx={x} cy={y} r="22" fill="rgba(199,36,255,.18)" /> : null}
            <circle
              cx={x}
              cy={y}
              r={active ? 13 : 8}
              fill={active ? "#FAF8FF" : passed ? "#8F20FF" : "#080623"}
              stroke={active ? "#FAF8FF" : passed ? "#A424FF" : "rgba(190,183,214,.4)"}
              style={{ transition: "all .35s cubic-bezier(.16,1,.3,1)" }}
            />
            <text
              x={320 + 322 * Math.cos(a)}
              y={320 + 322 * Math.sin(a) + 4}
              textAnchor="middle"
              className="font-mono"
              fontSize="13"
              letterSpacing="1.5"
              fill={active ? "#FAF8FF" : "rgba(190,183,214,.55)"}
            >
              {s.key}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------- Section ---------------- */

export function OrbitReveal() {
  const track = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: track, offset: ["start start", "end end"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.4 });
  // Entry transition: the pinned stage settles in as the track reaches the top.
  const { scrollYProgress: enter } = useScroll({ target: track, offset: ["start end", "start start"] });
  const enterS = useSpring(enter, { stiffness: 110, damping: 28 });
  const stageScale = useTransform(enterS, [0, 1], [0.9, 1]);
  const stageOpacity = useTransform(enterS, [0, 0.6, 1], [0, 0.6, 1]);
  const [stage, setStage] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const s = Math.min(4, Math.max(0, Math.floor(p * 5 * 0.999)));
    setStage((prev) => (prev === s ? prev : s));
  });
  const current = orbitDetail[stage]!;

  function goTo(i: number) {
    const el = track.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const span = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + span * ((i + 0.5) / 5), behavior: "smooth" });
  }

  return (
    <section id="orbit" aria-labelledby="orbit-title" className="relative bg-bg-deep">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet/50 to-transparent" />

      {/* Desktop: pinned scroll-scrub */}
      <div ref={track} className="relative hidden h-[480vh] lg:block">
        <div className="sticky top-0 flex h-dvh flex-col overflow-hidden">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(50%_60%_at_68%_52%,rgba(143,32,255,.16),transparent_70%)]" />
          <div className="relative mx-auto grid w-full max-w-[1360px] flex-1 grid-cols-12 items-center gap-8 px-12 pt-16">
            <div className="col-span-5">
              <Eyebrow index="02">Powered by ORBIT Engine™</Eyebrow>
              <h2 id="orbit-title" className="mk-title mt-5 text-[clamp(2.2rem,3.6vw,3.6rem)] text-fg">
                Cinco etapas. Um ciclo que só mantém o que funciona.
              </h2>

              <div className="relative mt-10 min-h-[330px]">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={stage}
                    initial={{ opacity: 0, y: 22, filter: "blur(8px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -14, filter: "blur(6px)" }}
                    transition={{ duration: 0.34, ease: EASE }}
                  >
                    <div className="flex items-end gap-6">
                      <span
                        aria-hidden
                        className="mk-num text-[clamp(6rem,10vw,9.5rem)] text-transparent [-webkit-text-stroke:1.2px_rgba(199,36,255,.85)]"
                      >
                        {current.key}
                      </span>
                      <div className="pb-3">
                        <p className="m-label">Etapa 0{stage + 1} / 05</p>
                        <h3 className="mt-2 text-[28px] font-medium tracking-[-0.03em] text-fg">{current.name}</h3>
                      </div>
                    </div>
                    <p className="mt-5 max-w-md text-[16.5px] leading-relaxed text-muted">{current.summary}</p>
                    <ul className="mt-6 space-y-2.5">
                      {current.techniques.map((t) => (
                        <li key={t} className="flex items-center gap-3 text-[14.5px] text-fg/90">
                          <span aria-hidden className="h-px w-5 bg-purple" />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <div className="col-span-7 flex items-center justify-center">
              <motion.div className="relative aspect-square w-[min(64vh,600px)]" style={{ scale: stageScale, opacity: stageOpacity }}>
                <Ring progress={smooth} stage={stage} />
                <div className="absolute inset-[25%] flex flex-col justify-center">
                  <TokenField stage={stage} />
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg">{current.signal}</span>
                    <span className="m-label text-[10px]">ilustrativo</span>
                  </div>
                  <ul className="mt-3 space-y-1">
                    {legendByStage[stage]!.map((l) => (
                      <li key={l} className="text-[12px] text-muted">
                        {l}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            </div>
          </div>

          {/* Progress rail */}
          <div className="relative mx-auto w-full max-w-[1360px] px-12 pb-8">
            <div className="grid grid-cols-5 gap-3">
              {orbitDetail.map((s, i) => (
                <RailSegment key={s.key} i={i} progress={smooth} label={`${s.key} · ${s.name}`} active={i === stage} onClick={() => goTo(i)} />
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <DemoBadge label="Visualização ilustrativa — não é medição" />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile / tablet: stacked */}
      <div className="px-5 py-24 sm:px-8 sm:py-28 lg:hidden">
        <Eyebrow index="02">Powered by ORBIT Engine™</Eyebrow>
        <h2 className="mk-title mt-5 text-[clamp(2.2rem,7vw,3.4rem)] text-fg">Cinco etapas. Um ciclo que só mantém o que funciona.</h2>
        <ol className="mt-12 space-y-4">
          {orbitDetail.map((s, i) => (
            <MobileStage key={s.key} i={i} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function RailSegment({
  i,
  progress,
  label,
  active,
  onClick,
}: {
  i: number;
  progress: MotionValue<number>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const fill = useTransform(progress, (p) => Math.max(0, Math.min(1, p * 5 - i)));
  return (
    <button type="button" onClick={onClick} className="group text-left" aria-current={active ? "step" : undefined}>
      <span className="block h-[2px] overflow-hidden rounded-full bg-line">
        <motion.span className="block h-full origin-left bg-gradient-to-r from-violet to-purple" style={{ scaleX: fill }} />
      </span>
      <span className={cn("mt-3 block font-mono text-[11px] uppercase tracking-[0.12em] transition-colors", active ? "text-fg" : "text-subtle group-hover:text-muted")}>
        {label}
      </span>
    </button>
  );
}

function MobileStage({ i }: { i: number }) {
  const s = orbitDetail[i]!;
  return (
    <li className="rounded-[20px] border border-line bg-surface-1/50 p-6">
      <div className="flex items-center gap-4">
        <span className="mk-num text-[56px] text-transparent [-webkit-text-stroke:1px_rgba(199,36,255,.9)]">{s.key}</span>
        <div>
          <p className="m-label">Etapa 0{i + 1} / 05</p>
          <h3 className="mt-1 text-[22px] font-medium tracking-[-0.02em] text-fg">{s.name}</h3>
        </div>
      </div>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">{s.summary}</p>
      <ul className="mt-4 space-y-2">
        {s.techniques.map((t) => (
          <li key={t} className="flex items-center gap-3 text-[14px] text-fg/90">
            <span aria-hidden className="h-px w-4 bg-purple" />
            {t}
          </li>
        ))}
      </ul>
      {i === 1 ? (
        <div className="mt-6 rounded-[14px] border border-line bg-bg/60 p-4">
          <TokenField stage={1} />
          <p className="m-label mt-3 text-[10px]">Ilustrativo · repetidos removidos, verbosos comprimidos</p>
        </div>
      ) : null}
    </li>
  );
}
