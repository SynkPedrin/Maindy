"use client";

import Image from "next/image";
import { animate, motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { orbitStages } from "@maindy/design-system";

const STEP = 72; // 360 / 5 stages
const TICKS = Array.from({ length: 120 }, (_, i) => i);

/**
 * Interactive brand orb: pointer parallax depth, 3D orbital rings, an ORBIT dial you can drag
 * (snaps to the nearest stage, like the demo widget), breathing halo and a ripple on tap.
 * Keyboard: ←/→ move between stages. Reduced motion → static composition.
 */
export function HeroOrb() {
  const reduce = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap);

  // Pointer parallax
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 70, damping: 18, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 70, damping: 18, mass: 0.6 });
  const orbX = useTransform(sx, (v) => v * 14);
  const orbY = useTransform(sy, (v) => v * 14);
  const glowX = useTransform(sx, (v) => v * -26);
  const glowY = useTransform(sy, (v) => v * -26);
  const tiltX = useTransform(sy, (v) => v * -9);
  const tiltY = useTransform(sx, (v) => v * 11);

  // Dial rotation (degrees). Stage i sits at 12 o'clock when rot = -i * STEP.
  const rot = useMotionValue(0);
  const rotS = useSpring(rot, { stiffness: 60, damping: 15, mass: 0.9 });
  const counter = useTransform(rotS, (v) => -v);
  const [stage, setStage] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [ripples, setRipples] = useState<number[]>([]);
  const interacting = useRef(false);
  const drag = useRef<{ startAngle: number; startRot: number; moved: boolean } | null>(null);

  const snapTo = useCallback(
    (target: number) => {
      const snapped = Math.round(target / STEP) * STEP;
      rot.set(snapped);
      const idx = (((-snapped / STEP) % 5) + 5) % 5;
      setStage((prev) => {
        if (prev !== idx) setPulse((p) => p + 1);
        return idx;
      });
    },
    [rot],
  );

  useEffect(() => {
    if (reduce) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !wrap.current) return;
      const r = wrap.current.getBoundingClientRect();
      const nx = (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2);
      const ny = (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2);
      px.set(Math.max(-1, Math.min(1, nx)));
      py.set(Math.max(-1, Math.min(1, ny)));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce, px, py]);

  // Idle auto-advance through the five stages while visible.
  useEffect(() => {
    if (reduce || !inView) return;
    const id = window.setInterval(() => {
      if (!interacting.current) snapTo(rot.get() - STEP);
    }, 3600);
    return () => window.clearInterval(id);
  }, [reduce, inView, rot, snapTo]);

  function angleOf(e: React.PointerEvent) {
    const r = wrap.current!.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  }
  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    interacting.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startAngle: angleOf(e), startRot: rot.get(), moved: false };
  }
  function onDrag(e: React.PointerEvent) {
    if (!drag.current) return;
    let delta = angleOf(e) - drag.current.startAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    if (Math.abs(delta) > 3) drag.current.moved = true;
    rot.set(drag.current.startRot + delta);
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      // Tap: ripple + advance to next stage.
      setRipples((r) => [...r, Date.now()]);
      snapTo(rot.get() - STEP);
    } else {
      snapTo(rot.get());
    }
    window.setTimeout(() => (interacting.current = false), 2400);
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      interacting.current = true;
      snapTo(rot.get() - STEP);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      interacting.current = true;
      snapTo(rot.get() + STEP);
    } else if (e.key === "Home") {
      e.preventDefault();
      snapTo(Math.round(rot.get() / 360) * 360);
    }
  }

  useEffect(() => {
    if (ripples.length === 0) return;
    const t = window.setTimeout(() => setRipples((r) => r.slice(1)), 900);
    return () => window.clearTimeout(t);
  }, [ripples]);

  // Animate the stage readout's light when the dial snaps.
  const glowBoost = useMotionValue(0);
  useEffect(() => {
    if (reduce || pulse === 0) return;
    glowBoost.set(1);
    const c = animate(glowBoost, 0, { duration: 1.6, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [pulse, reduce, glowBoost]);
  const glowOpacity = useTransform(glowBoost, (v) => 0.55 + v * 0.45);
  const glowScale = useTransform(glowBoost, (v) => 1 + v * 0.08);

  const current = orbitStages[stage]!;

  return (
    <div className="relative mx-auto w-full max-w-[600px]">
      <div
        ref={wrap}
        role="slider"
        tabIndex={0}
        aria-label="Anel ORBIT interativo — arraste ou use as setas para percorrer as etapas"
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={stage + 1}
        aria-valuetext={`${current.key} — ${current.name}`}
        onPointerDown={onDown}
        onPointerMove={onDrag}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className="relative aspect-square w-full cursor-grab touch-pan-y select-none rounded-full outline-offset-8 active:cursor-grabbing"
        style={{ perspective: 1100 }}
      >
        {/* Halo — amber + violet, breathing, boosted on stage change ("economy activity") */}
        <motion.div aria-hidden className="absolute inset-[8%]" style={{ x: glowX, y: glowY, opacity: glowOpacity, scale: glowScale }}>
          <div
            className="mk-breathe absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(closest-side, rgba(164,36,255,.55), rgba(143,32,255,.18) 55%, transparent 72%), radial-gradient(circle at 72% 22%, rgba(255,178,31,.38), transparent 42%)",
              filter: "blur(28px)",
            }}
          />
        </motion.div>

        {/* Dial: ticks + stage letters. Rotates with drag; letters counter-rotate to stay upright. */}
        <motion.div aria-hidden className="absolute inset-0" style={{ rotate: rotS }}>
          <svg viewBox="0 0 600 600" className="absolute inset-0 size-full">
            <circle cx="300" cy="300" r="286" stroke="rgba(190,183,214,.14)" strokeWidth="1" fill="none" />
            {TICKS.map((i) => {
              const major = i % 24 === 0;
              const mid = i % 6 === 0;
              const len = major ? 16 : mid ? 9 : 5;
              return (
                <line
                  key={i}
                  x1="300"
                  y1={14}
                  x2="300"
                  y2={14 + len}
                  stroke={major ? "rgba(250,248,255,.7)" : "rgba(190,183,214,.28)"}
                  strokeWidth={major ? 1.5 : 1}
                  transform={`rotate(${i * 3} 300 300)`}
                />
              );
            })}
          </svg>
          {orbitStages.map((s, i) => {
            const a = ((i * STEP - 90) * Math.PI) / 180;
            const r = 41.5; // % of box
            return (
              <motion.span
                key={s.key}
                className="absolute flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-mono text-[12px] tracking-[0.08em] transition-colors duration-300"
                style={{ left: `${50 + r * Math.cos(a)}%`, top: `${50 + r * Math.sin(a)}%`, rotate: counter }}
              >
                <span
                  className={
                    i === stage
                      ? "flex size-9 items-center justify-center rounded-full bg-fg text-bg shadow-[0_0_24px_rgba(199,36,255,.8)]"
                      : "flex size-9 items-center justify-center rounded-full border border-line-strong bg-bg/60 text-muted"
                  }
                >
                  {s.key}
                </span>
              </motion.span>
            );
          })}
        </motion.div>

        {/* 3D orbital rings + orb share one preserve-3d context so rings pass behind the orb */}
        <motion.div
          aria-hidden
          className="absolute inset-[14%]"
          style={{ rotateX: tiltX, rotateY: tiltY, transformStyle: "preserve-3d" }}
        >
          <Ring tilt={72} spin={0} dur="26s" color="rgba(199,36,255,.55)" dot="#C724FF" />
          <Ring tilt={76} spin={58} dur="38s" color="rgba(143,32,255,.45)" dot="#FFD21F" reverse inset="-6%" />
          <Ring tilt={64} spin={-34} dur="52s" color="rgba(190,183,214,.22)" dot="#A424FF" inset="7%" />
          <motion.div className="absolute inset-[8%]" style={{ x: orbX, y: orbY }}>
            <Image
              src="/brand/orb-640.webp"
              alt=""
              fill
              sizes="(min-width: 1024px) 300px, 60vw"
              loading="eager"
              className="pointer-events-none select-none object-contain"
              draggable={false}
            />
          </motion.div>
        </motion.div>

        {ripples.map((id) => (
          <span key={id} aria-hidden className="mk-ripple pointer-events-none absolute inset-[24%] rounded-full border border-purple/70" />
        ))}
      </div>

      {/* Stage readout */}
      <div className="mt-2 flex items-start justify-center gap-4 text-center sm:mt-4" aria-live="polite">
        <div>
          <p className="m-label">
            ORBIT · <span className="text-muted">0{stage + 1}</span>/05
          </p>
          <p className="mt-2 text-[17px] font-medium tracking-[-0.01em] text-fg">
            {current.key} — {current.name}
          </p>
          <p className="mx-auto mt-1 max-w-[300px] text-[13.5px] leading-snug text-muted">{current.summary}</p>
        </div>
      </div>
    </div>
  );
}

function Ring({
  tilt,
  spin,
  dur,
  color,
  dot,
  reverse,
  inset = "0%",
}: {
  tilt: number;
  spin: number;
  dur: string;
  color: string;
  dot: string;
  reverse?: boolean;
  inset?: string;
}) {
  return (
    <div className="absolute" style={{ inset, transform: `rotateZ(${spin}deg) rotateX(${tilt}deg)`, transformStyle: "preserve-3d" }}>
      <div
        className={reverse ? "mk-spin-rev absolute inset-0 rounded-full" : "mk-spin absolute inset-0 rounded-full"}
        style={{ ["--dur" as string]: dur, border: `1px solid ${color}`, boxShadow: `0 0 18px ${color.replace(/[\d.]+\)$/, ".18)")}` }}
      >
        <span
          className="absolute left-1/2 top-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: dot, boxShadow: `0 0 14px ${dot}, 0 0 4px ${dot}` }}
        />
      </div>
    </div>
  );
}
