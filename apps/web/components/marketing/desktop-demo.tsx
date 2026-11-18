"use client";

import * as Tabs from "@radix-ui/react-tabs";
import Image from "next/image";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import {
  Activity,
  BarChart3,
  FileText,
  Gauge,
  LayoutDashboard,
  Layers,
  Pause,
  Play,
  Plug,
  Receipt,
  Settings,
  ShieldCheck,
  Bot,
  Orbit as OrbitIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { DemoBadge, ProvenanceBadge } from "./ui";

const EASE = [0.16, 1, 0.3, 1] as const;
const PREVIEW_LABEL = "Pré-visualização da interface — dados simulados";

/* ---------------- Shared Quick Panel ---------------- */

export function QuickPanel({ paused, onTogglePause, compact = false }: { paused: boolean; onTogglePause: () => void; compact?: boolean }) {
  return (
    <div className={cn("text-left", compact ? "p-4" : "p-5")}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Image src="/brand/orb-96.webp" alt="" width={26} height={26} className={cn("transition-[filter,opacity] duration-300", paused && "opacity-60 grayscale")} />
          <div>
            <p className="text-[13px] font-medium text-fg">ORBIT · Equilibrado</p>
            <p className={cn("flex items-center gap-1.5 text-[11px]", paused ? "text-warning" : "text-success")}>
              <span className={cn("size-1.5 rounded-full", paused ? "bg-warning" : "bg-success")} />
              {paused ? "Pausado — requisições seguem sem otimização" : "Otimização ativa"}
            </p>
          </div>
        </div>
        <span className="font-mono text-[10px] text-subtle">hoje</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { v: "284 mil", l: "tokens", s: "locally_measured" as const },
          { v: "US$ 3,12", l: "custo", s: "provider_reported" as const },
          { v: "US$ 1,46", l: "economia líq.", s: "experimentally_estimated" as const },
        ].map((m) => (
          <div key={m.l} className="rounded-[12px] border border-white/[0.06] bg-white/[0.03] p-2.5">
            <p className="mk-num whitespace-nowrap text-[15px] text-fg sm:text-[17px]">{m.v}</p>
            <p className="mt-1 text-[10.5px] text-muted">{m.l}</p>
            <span
              className={cn(
                "mt-1.5 block size-1.5 rounded-full",
                m.s === "locally_measured" ? "bg-success" : m.s === "provider_reported" ? "bg-purple" : "bg-warning",
              )}
              title={m.s}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-[12px] border border-white/[0.06] bg-white/[0.03] p-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted">Claude Code · janela de 5 h</span>
          <span className="font-mono text-fg">38%</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-[38%] rounded-full bg-gradient-to-r from-violet to-purple" />
        </div>
        <p className="mt-1.5 text-[10px] text-subtle">fonte: status line oficial · só aparece quando disponível</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="h-9 rounded-[10px] bg-fg text-[12px] font-medium text-bg">
          Abrir dashboard
        </button>
        <button
          type="button"
          onClick={onTogglePause}
          aria-pressed={paused}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-white/10 text-[12px] text-fg transition-colors hover:bg-white/[0.06]"
        >
          {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
          {paused ? "Retomar ORBIT" : "Pausar ORBIT"}
        </button>
        <button type="button" className="h-9 rounded-[10px] border border-white/10 text-[12px] text-muted hover:bg-white/[0.06]">
          Conexões
        </button>
        <button type="button" className="h-9 rounded-[10px] border border-white/10 text-[12px] text-muted hover:bg-white/[0.06]">
          Configurações
        </button>
      </div>
    </div>
  );
}

function Wallpaper() {
  return (
    <div aria-hidden className="absolute inset-0">
      <div className="absolute inset-0 bg-[linear-gradient(160deg,#0E0A35_0%,#080623_55%,#120830_100%)]" />
      <div className="absolute -bottom-1/3 -left-1/4 size-[80%] rounded-full bg-[radial-gradient(closest-side,rgba(143,32,255,.35),transparent)]" />
      <div className="absolute -right-1/4 -top-1/3 size-[70%] rounded-full bg-[radial-gradient(closest-side,rgba(255,178,31,.16),transparent)]" />
    </div>
  );
}

/* ---------------- Mac (notch) ---------------- */

export function MacScene() {
  const [open, setOpen] = useState(true);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();
  return (
    <div className="relative h-[560px] overflow-hidden rounded-[18px] sm:h-[600px]">
      <Wallpaper />
      {/* Menu bar */}
      <div className="absolute inset-x-0 top-0 flex h-8 items-center justify-between bg-black/30 px-4 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <span className="size-3 rounded-full bg-white/70" />
          <span className="hidden h-2 w-10 rounded-full bg-white/40 sm:block" />
          <span className="hidden h-2 w-8 rounded-full bg-white/25 sm:block" />
          <span className="hidden h-2 w-12 rounded-full bg-white/25 md:block" />
        </div>
        <div className="flex items-center gap-3">
          <span className="h-2 w-6 rounded-full bg-white/25" />
          <span className="font-mono text-[11px] text-white/80">14:32</span>
        </div>
      </div>

      {/* Notch + MAINDY island */}
      <div
        className="absolute left-1/2 top-0 z-10 -translate-x-1/2"
        onMouseEnter={() => setOpen(true)}
      >
        <motion.div
          layout
          transition={{ duration: reduce ? 0 : 0.35, ease: EASE }}
          className="overflow-hidden bg-black shadow-[0_20px_60px_-10px_rgba(0,0,0,.8),0_0_0_1px_rgba(255,255,255,.04)]"
          style={{ borderRadius: open ? "0 0 28px 28px" : "0 0 16px 16px", width: open ? "min(380px, calc(100vw - 72px))" : 260 }}
        >
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? "Recolher ilha maindy." : "Expandir ilha maindy."}
            className="flex h-8 w-full items-center justify-between px-3"
          >
            <Image src="/brand/orb-96.webp" alt="" width={20} height={20} className={cn(paused ? "opacity-50 grayscale" : "mk-breathe")} />
            {/* camera housing stays clear */}
            <span aria-hidden className="h-full w-[110px]" />
            <span className={cn("font-mono text-[11px]", paused ? "text-warning" : "text-success")}>{paused ? "pausa" : "−41%"}</span>
          </button>
          <AnimatePresence initial={false}>
            {open ? (
              <motion.div
                key="panel"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <QuickPanel paused={paused} onTogglePause={() => setPaused((p) => !p)} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </div>

      {!open ? (
        <p className="absolute left-1/2 top-16 -translate-x-1/2 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          ↑ toque na ilha para expandir
        </p>
      ) : null}

      {/* Generic app window in the background */}
      <div className="absolute bottom-8 left-[6%] right-[6%] top-[46%] rounded-[14px] border border-white/[0.06] bg-white/[0.025] sm:left-[10%] sm:right-[30%]">
        <div className="flex h-8 items-center gap-1.5 border-b border-white/[0.05] px-3">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="ml-3 font-mono text-[10.5px] text-subtle">terminal — agente em execução</span>
        </div>
        <div className="space-y-2 p-4 font-mono text-[11px] text-muted">
          <p>
            <span className="text-purple">›</span> base_url = http://127.0.0.1:8787/v1
          </p>
          <p>
            <span className="text-success">✓</span> cache_hit · contexto repetido evitado
          </p>
          <p>
            <span className="text-success">✓</span> tool_output comprimido · fallback pronto
          </p>
          <p className="text-subtle">
            <span className="text-warning">!</span> loop_guard · chamada idêntica bloqueada
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Windows (compact launcher) ---------------- */

export function WindowsScene() {
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const scene = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [side, setSide] = useState<"right" | "left">("right");
  const dragged = useRef(false);

  function snap() {
    const s = scene.current?.getBoundingClientRect();
    const p = pill.current?.getBoundingClientRect();
    if (!s || !p) return;
    const center = p.left + p.width / 2 - s.left;
    const goLeft = center < s.width / 2;
    // pill anchored at right: 16px. Translate so it sits at the nearest edge.
    const targetX = goLeft ? -(s.width - p.width - 32) : 0;
    setSide(goLeft ? "left" : "right");
    animate(x, targetX, { type: "spring", stiffness: 380, damping: 32 });
    const maxY = s.height - p.height - 88;
    const curY = y.get();
    animate(y, Math.max(0, Math.min(maxY, curY)), { type: "spring", stiffness: 380, damping: 32 });
  }

  return (
    <div ref={scene} className="relative h-[560px] overflow-hidden rounded-[18px] sm:h-[600px]">
      <Wallpaper />
      <div className="absolute left-[6%] right-[6%] top-[12%] bottom-[16%] rounded-[10px] border border-white/[0.06] bg-white/[0.025] sm:right-[34%]">
        <div className="flex h-8 items-center justify-end gap-3 border-b border-white/[0.05] px-3">
          <span className="h-px w-2.5 bg-white/30" />
          <span className="size-2.5 border border-white/30" />
          <span className="text-[11px] text-white/30">✕</span>
        </div>
        <div className="space-y-2 p-4 font-mono text-[11px] text-muted">
          <p>PS&gt; $env:OPENAI_BASE_URL = &quot;http://127.0.0.1:8787/v1&quot;</p>
          <p>
            <span className="text-success">✓</span> agente-faturas · 112 chamadas · 18 em cache
          </p>
        </div>
      </div>

      {/* Draggable pill */}
      <motion.div
        ref={pill}
        drag
        dragMomentum={false}
        dragConstraints={scene}
        dragElastic={0.08}
        style={{ x, y }}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={() => {
          snap();
          window.setTimeout(() => (dragged.current = false), 50);
        }}
        className="absolute right-4 top-4 z-10 cursor-grab touch-none active:cursor-grabbing"
      >
        <button
          type="button"
          onClick={() => !dragged.current && setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Launcher compacto maindy. — arraste para mover, clique para abrir"
          className="flex h-10 items-center gap-2.5 rounded-full border border-white/10 bg-black/85 pl-1.5 pr-4 shadow-[0_14px_40px_-10px_rgba(0,0,0,.8)] backdrop-blur"
        >
          <Image src="/brand/orb-96.webp" alt="" width={28} height={28} draggable={false} className={cn(paused && "opacity-50 grayscale")} />
          <span className="text-[12px] font-medium text-fg">{paused ? "ORBIT pausado" : "ORBIT ativo"}</span>
          <span className={cn("font-mono text-[11px]", paused ? "text-warning" : "text-success")}>{paused ? "—" : "−38%"}</span>
        </button>
        <AnimatePresence>
          {open ? (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.22, ease: EASE }}
              className={cn(
                "absolute top-12 w-[min(340px,calc(100vw-80px))] overflow-hidden rounded-[18px] border border-white/10 bg-black/90 shadow-[0_30px_80px_-20px_rgba(0,0,0,.9)] backdrop-blur-xl",
                side === "right" ? "right-0" : "left-0",
              )}
              onPointerDownCapture={(e) => e.stopPropagation()}
            >
              <QuickPanel compact paused={paused} onTogglePause={() => setPaused((p) => !p)} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>

      {!open ? (
        <p className="absolute bottom-16 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          arraste a pílula · ela encaixa na borda
        </p>
      ) : null}

      {/* Taskbar */}
      <div className="absolute inset-x-0 bottom-0 flex h-11 items-center justify-between border-t border-white/[0.06] bg-[#0b0a1d]/90 px-3 backdrop-blur">
        <span className="w-16" />
        <div className="flex items-center gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={cn("size-6 rounded-[6px]", i === 0 ? "bg-white/25" : "bg-white/10")} />
          ))}
        </div>
        <div className="flex items-center gap-2.5">
          <Image src="/brand/orb-96.webp" alt="" width={16} height={16} />
          <span className="font-mono text-[10.5px] text-white/70">14:32</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */

const sidebar = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Economia", icon: BarChart3 },
  { label: "Integrações", icon: Plug },
  { label: "Agentes & Projetos", icon: Bot },
  { label: "Limites & Sessões", icon: Gauge },
  { label: "ORBIT Engine", icon: OrbitIcon },
  { label: "Qualidade", icon: ShieldCheck },
  { label: "Relatórios", icon: FileText },
  { label: "Faturamento", icon: Receipt },
  { label: "Configurações", icon: Settings },
];

type Period = "24h" | "7d" | "30d";
const periodData: Record<
  Period,
  { net: string; avoided: string; cost: string; quality: string; base: number[]; opt: number[] }
> = {
  "24h": {
    net: "US$ 4,82",
    avoided: "412 mil",
    cost: "US$ 9,37",
    quality: "99,1%",
    base: [22, 28, 24, 34, 40, 36, 44, 52, 48, 56, 50, 58],
    opt: [20, 22, 18, 22, 25, 22, 26, 30, 27, 31, 28, 32],
  },
  "7d": {
    net: "US$ 31,40",
    avoided: "2,9 mi",
    cost: "US$ 58,12",
    quality: "98,7%",
    base: [30, 34, 46, 40, 52, 58, 50, 62, 66, 60, 70, 74],
    opt: [28, 26, 30, 27, 32, 35, 31, 36, 38, 35, 39, 41],
  },
  "30d": {
    net: "US$ 167,40",
    avoided: "12,8 mi",
    cost: "US$ 244,68",
    quality: "98,6%",
    base: [26, 32, 38, 44, 42, 50, 56, 54, 62, 68, 72, 78],
    opt: [25, 27, 28, 30, 29, 32, 34, 33, 36, 38, 40, 42],
  },
};

function toPath(values: number[], w: number, h: number, close = false) {
  const max = 90;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - (v / max) * h] as const);
  let d = `M ${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    const cx = (x0 + x1) / 2;
    d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  if (close) d += ` L ${w} ${h} L 0 ${h} Z`;
  return d;
}

export function DashboardScene() {
  const [period, setPeriod] = useState<Period>("7d");
  const d = periodData[period];
  const W = 640;
  const H = 180;
  return (
    <div className="relative flex min-h-[560px] overflow-hidden rounded-[18px] bg-[#0A0820] sm:min-h-[600px]">
      <aside className="hidden w-56 shrink-0 border-r border-white/[0.06] p-4 md:block">
        <div className="flex items-center gap-2 px-2 pb-5">
          <Image src="/brand/orb-96.webp" alt="" width={22} height={22} />
          <Image src="/brand/wordmark-white-640.webp" alt="maindy." width={66} height={19} />
        </div>
        <ul className="space-y-0.5">
          {sidebar.map((s, i) => (
            <li
              key={s.label}
              className={cn(
                "flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[12.5px]",
                i === 0 ? "bg-white/[0.06] text-fg" : "text-muted",
              )}
            >
              <s.icon className="size-3.5" aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      </aside>

      <div className="min-w-0 flex-1 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[12px] text-muted">Boa tarde</p>
            <p className="text-[18px] font-medium tracking-[-0.02em] text-fg">Overview</p>
          </div>
          <div role="radiogroup" aria-label="Período" className="flex rounded-full border border-white/10 p-0.5">
            {(Object.keys(periodData) as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={period === p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "h-7 rounded-full px-3 font-mono text-[11px] transition-colors duration-200",
                  period === p ? "bg-fg text-bg" : "text-muted hover:text-fg",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          {[
            { l: "Economia líquida", v: d.net, s: "experimentally_estimated" as const, icon: Activity },
            { l: "Tokens evitados", v: d.avoided, s: "locally_measured" as const, icon: Layers },
            { l: "Custo real", v: d.cost, s: "provider_reported" as const, icon: Receipt },
            { l: "Qualidade aprovada", v: d.quality, s: "locally_measured" as const, icon: ShieldCheck },
          ].map((k) => (
            <div key={k.l} className="rounded-[14px] border border-white/[0.06] bg-white/[0.025] p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[11.5px] text-muted">{k.l}</p>
                <k.icon className="size-3.5 text-subtle" aria-hidden />
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={k.v}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="mk-num mt-2.5 text-[22px] text-fg sm:text-[26px]"
                >
                  {k.v}
                </motion.p>
              </AnimatePresence>
              <ProvenanceBadge source={k.s} className="mt-2.5 max-w-full overflow-hidden text-[8.5px]" />
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-[14px] border border-white/[0.06] bg-white/[0.025] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] text-fg">Baseline vs. otimizado</p>
            <div className="flex items-center gap-4 text-[11px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-px w-4 border-t border-dashed border-muted" />
                baseline
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-purple" />
                custo otimizado
              </span>
            </div>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-[150px] w-full" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id="dash-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#C724FF" stopOpacity=".35" />
                <stop offset="1" stopColor="#C724FF" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="rgba(255,255,255,.05)" />
            ))}
            <motion.path
              animate={{ d: toPath(d.opt, W, H, true) }}
              transition={{ duration: 0.5, ease: EASE }}
              fill="url(#dash-area)"
            />
            <motion.path
              animate={{ d: toPath(d.base, W, H) }}
              transition={{ duration: 0.5, ease: EASE }}
              fill="none"
              stroke="rgba(190,183,214,.6)"
              strokeDasharray="5 5"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
            <motion.path
              animate={{ d: toPath(d.opt, W, H) }}
              transition={{ duration: 0.5, ease: EASE }}
              fill="none"
              stroke="#C724FF"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        <div className="mt-3 rounded-[14px] border border-white/[0.06] bg-white/[0.025]">
          <p className="border-b border-white/[0.05] px-4 py-2.5 text-[12.5px] text-fg">Últimas operações</p>
          <ul className="divide-y divide-white/[0.05] font-mono text-[11px]">
            {[
              { t: "cache_hit", m: "claude-sonnet-5-5", v: "−100%", s: "Medido localmente" },
              { t: "tool_output_compression", m: "gpt-6.1-terra", v: "−62% entrada", s: "Medido localmente" },
              { t: "loop_guard", m: "agente-faturas", v: "bloqueado", s: "Medido localmente" },
            ].map((r) => (
              <li key={r.t} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="truncate text-fg">{r.t}</span>
                <span className="hidden truncate text-muted sm:block">{r.m}</span>
                <span className="text-success">{r.v}</span>
                <span className="hidden text-subtle lg:block">{r.s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Tabs shell ---------------- */

const tabs = [
  { value: "mac", label: "Mac (notch)", short: "Mac", Scene: MacScene },
  { value: "win", label: "Windows (launcher compacto)", short: "Windows", Scene: WindowsScene },
  { value: "dash", label: "Dashboard", short: "Dashboard", Scene: DashboardScene },
] as const;

export function DesktopDemo() {
  return (
    <Tabs.Root defaultValue="mac" className="w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs.List aria-label="Pré-visualizações do aplicativo" className="mk-rail -mx-1 flex overflow-x-auto px-1">
          <div className="flex rounded-full border border-line bg-surface-1/60 p-1">
            {tabs.map((t) => (
              <Tabs.Trigger
                key={t.value}
                value={t.value}
                className="h-9 whitespace-nowrap rounded-full px-4 text-[13.5px] text-muted transition-colors duration-200 hover:text-fg data-[state=active]:bg-fg data-[state=active]:text-bg"
              >
                <span className="sm:hidden">{t.short}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </Tabs.Trigger>
            ))}
          </div>
        </Tabs.List>
        <DemoBadge label={PREVIEW_LABEL} />
      </div>
      <div className="mt-6 rounded-[24px] border border-line bg-surface-1/50 p-2 shadow-[0_60px_140px_-50px_rgba(143,32,255,.55)] sm:p-3">
        {tabs.map((t) => (
          <Tabs.Content key={t.value} value={t.value} className="outline-none focus-visible:outline-2">
            <t.Scene />
          </Tabs.Content>
        ))}
      </div>
    </Tabs.Root>
  );
}
