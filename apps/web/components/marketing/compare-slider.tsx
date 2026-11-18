"use client";

import { useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { DemoBadge } from "./ui";

/**
 * Before/after comparison of a hypothetical agent session (illustrative only).
 * Each row = one call; segments = token blocks by kind. Widths are in % of the row.
 */
type Kind = "sys" | "ctx" | "dup" | "log" | "msg" | "out" | "loop" | "cache" | "zip" | "guard";
type Seg = [Kind, number];

const BEFORE: Seg[][] = [
  [["sys", 14], ["ctx", 30], ["msg", 6], ["out", 12]],
  [["dup", 14], ["dup", 30], ["log", 34], ["msg", 5], ["out", 10]],
  [["dup", 14], ["dup", 30], ["log", 22], ["msg", 6], ["out", 14]],
  [["dup", 14], ["dup", 30], ["msg", 6], ["out", 12]],
  [["loop", 14], ["loop", 30], ["loop", 6], ["loop", 12]],
  [["dup", 14], ["ctx", 24], ["log", 40], ["msg", 5], ["out", 9]],
];
const AFTER: Seg[][] = [
  [["sys", 14], ["ctx", 30], ["msg", 6], ["out", 12]],
  [["cache", 4], ["cache", 6], ["zip", 9], ["msg", 5], ["out", 10]],
  [["cache", 4], ["cache", 6], ["zip", 7], ["msg", 6], ["out", 14]],
  [["cache", 4], ["cache", 6], ["msg", 6], ["out", 12]],
  [["guard", 9]],
  [["cache", 4], ["ctx", 24], ["zip", 10], ["msg", 5], ["out", 9]],
];

const kindStyle: Record<Kind, string> = {
  sys: "bg-surface-3",
  ctx: "bg-[#2E2556]",
  msg: "bg-muted/70",
  out: "bg-violet/70",
  dup: "bg-error/25 ring-1 ring-inset ring-error/50",
  log: "bg-error/15 ring-1 ring-inset ring-error/35 [background-image:repeating-linear-gradient(90deg,transparent_0_6px,rgba(255,122,107,.25)_6px_7px)]",
  loop: "border border-dashed border-error/60 bg-error/[0.06]",
  cache: "bg-gold/80",
  zip: "bg-purple/60",
  guard: "bg-success/25 ring-1 ring-inset ring-success/50",
};

const legend: { kind: Kind; label: string }[] = [
  { kind: "dup", label: "Contexto repetido" },
  { kind: "log", label: "Saída verbosa" },
  { kind: "loop", label: "Chamada em loop" },
  { kind: "cache", label: "Cache / dedup" },
  { kind: "zip", label: "Compressão segura" },
  { kind: "guard", label: "Loop guard" },
];

function Rows({ data }: { data: Seg[][] }) {
  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      {data.map((row, r) => (
        <div key={r} className="flex items-center gap-3">
          <span className="w-10 shrink-0 font-mono text-[10px] tracking-[0.12em] text-subtle">#{String(r + 1).padStart(2, "0")}</span>
          <div className="flex h-5 flex-1 gap-[3px] sm:h-6">
            {row.map(([k, w], i) => (
              <span key={i} className={cn("h-full rounded-[5px]", kindStyle[k])} style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CompareSlider() {
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const touched = useRef(false);
  const reduce = useReducedMotion();
  // Scroll-scrubbed reveal until the visitor takes control (drag or keyboard).
  const { scrollYProgress } = useScroll({ target: box, offset: ["start end", "end start"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (touched.current || reduce) return;
    setPos(Math.max(28, Math.min(94, 94 - ((v - 0.22) / 0.4) * 66)));
  });

  function fromClient(x: number) {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100)));
  }
  function onKey(e: React.KeyboardEvent) {
    touched.current = true;
    const step = e.shiftKey ? 10 : 4;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") setPos((p) => Math.max(0, p - step));
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") setPos((p) => Math.min(100, p + step));
    else if (e.key === "Home") setPos(0);
    else if (e.key === "End") setPos(100);
    else return;
    e.preventDefault();
  }

  return (
    <figure className="relative">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <DemoBadge />
        <p className="m-label">Sessão hipotética de agente · 6 chamadas</p>
      </div>

      <div
        ref={box}
        className="relative cursor-ew-resize touch-pan-y select-none overflow-hidden rounded-[24px] border border-line bg-surface-1/60 shadow-[0_40px_120px_-40px_rgba(143,32,255,.45)]"
        onPointerDown={(e) => {
          dragging.current = true;
          touched.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          fromClient(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && fromClient(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        {/* BEFORE (full) */}
        <div className="p-5 sm:p-8 lg:p-10">
          <Header side="before" />
          <div className="mt-7 sm:mt-9">
            <Rows data={BEFORE} />
          </div>
        </div>

        {/* AFTER (revealed from the handle to the right) */}
        <div
          aria-hidden={pos > 98}
          className="absolute inset-0 bg-[#0D0A26] p-5 sm:p-8 lg:p-10"
          style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
        >
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_80%_at_100%_0%,rgba(143,32,255,.18),transparent_70%)]" />
          <div className="relative">
            <Header side="after" />
            <div className="mt-7 sm:mt-9">
              <Rows data={AFTER} />
            </div>
          </div>
        </div>

        {/* Handle */}
        <div className="pointer-events-none absolute inset-0 will-change-transform" style={{ transform: `translateX(${pos}%)` }}>
          <div className="absolute inset-y-0 -left-px w-[2px] bg-gradient-to-b from-transparent via-fg/80 to-transparent" />
          <div
            role="slider"
            tabIndex={0}
            aria-label="Comparar antes e depois"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pos)}
            aria-valuetext={`${Math.round(100 - pos)}% da área mostra o resultado com ORBIT`}
            onKeyDown={onKey}
            className="pointer-events-auto absolute top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-fg/40 bg-bg/80 shadow-[0_0_0_6px_rgba(8,6,35,.5),0_0_30px_rgba(199,36,255,.6)] backdrop-blur"
          >
            <svg viewBox="0 0 24 24" className="size-4 text-fg" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M9 6l-5 6 5 6M15 6l5 6-5 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      <figcaption className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <ul className="flex flex-wrap gap-x-5 gap-y-2.5">
          {legend.map((l) => (
            <li key={l.kind} className="flex items-center gap-2 text-[12.5px] text-muted">
              <span aria-hidden className={cn("h-2.5 w-4 rounded-[3px]", kindStyle[l.kind])} />
              {l.label}
            </li>
          ))}
        </ul>
        <p className="max-w-md text-[12.5px] leading-relaxed text-subtle lg:text-right">
          Valores ilustrativos de uma sessão hipotética. Não representam medição real nem resultado garantido. Arraste a alça ou use as setas do teclado.
        </p>
      </figcaption>
    </figure>
  );
}

function Header({ side }: { side: "before" | "after" }) {
  const before = side === "before";
  return (
    <div className={cn("flex", before ? "justify-start" : "justify-end text-right")}>
      <div>
        <p className="m-label text-[10px] sm:text-[11px]">
          {before ? "Sem otimização" : "Com ORBIT"}
          {!before ? <span className="hidden sm:inline"> · modo equilibrado</span> : null}
        </p>
        <p className="mk-num mt-3 text-[clamp(1.6rem,4.4vw,3.4rem)] text-fg">{before ? "186.400" : "102.900"}</p>
        <p className="mt-2 text-[12px] leading-snug text-muted sm:text-[12.5px]">
          tokens de entrada
          <span className="block sm:inline">
            <span className="hidden sm:inline"> · </span>
            {before ? "US$ 0,93" : "US$ 0,51"}
            {!before ? <span className="ml-2 font-mono text-[11px] text-success">−45% simulado</span> : null}
          </span>
        </p>
      </div>
    </div>
  );
}
