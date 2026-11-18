"use client";

import { animate, motion, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Fade/rise on first entry into the viewport. Static under reduced motion. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  as = "div",
  spot = false,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: "div" | "li" | "section" | "article";
  spot?: boolean;
}) {
  const spotProps = spot ? { "data-spot": "" } : {};
  const reduce = useReducedMotion();
  const Tag = motion[as];
  if (reduce) {
    const Static = as;
    return (
      <Static className={className} {...spotProps}>
        {children}
      </Static>
    );
  }
  return (
    <Tag
      className={className}
      {...spotProps}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </Tag>
  );
}

/**
 * Line-by-line mask reveal for section titles: words are measured after layout and grouped into
 * their rendered lines, so each line rises from its own mask in sequence (responsive-safe).
 * Text stays in the DOM (aria-label) for SEO and screen readers.
 */
export function RevealText({
  text,
  as = "h2",
  className,
  delay = 0,
  id,
}: {
  text: string;
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
  delay?: number;
  id?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();
  const [lineOf, setLineOf] = useState<number[] | null>(null);
  const Tag = as;
  const words = text.split(" ");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const spans = Array.from(el.querySelectorAll<HTMLElement>("[data-w]"));
      const tops: number[] = [];
      setLineOf(
        spans.map((sp) => {
          const t = Math.round(sp.offsetTop);
          let i = tops.findIndex((x) => Math.abs(x - t) < 4);
          if (i === -1) i = tops.push(t) - 1;
          return i;
        }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  return (
    <Tag ref={ref} id={id} className={className} aria-label={text}>
      {words.map((w, i) => {
        const line = lineOf?.[i] ?? 0;
        return (
          <span key={i} data-w aria-hidden className="inline-block overflow-hidden pb-[0.1em] -mb-[0.1em] align-top">
            <motion.span
              className="inline-block will-change-transform"
              initial={reduce ? false : { y: "110%", rotate: 2 }}
              animate={reduce || (inView && lineOf) ? { y: 0, rotate: 0 } : { y: "110%", rotate: 2 }}
              transition={{ duration: 1.05, ease: EASE, delay: delay + line * 0.11 }}
            >
              {w}
            </motion.span>
            {i < words.length - 1 ? "\u00A0" : null}
          </span>
        );
      })}
    </Tag>
  );
}

/**
 * Section-to-section transition: the section opens from an inset rounded card to full bleed
 * as it scrolls into view (scrubbed, spring-smoothed). Static under reduced motion.
 */
export function ExpandOnEnter({ children, className, id, labelledBy }: { children: React.ReactNode; className?: string; id?: string; labelledBy?: string }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 15%"] });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  const inset = useTransform(p, (v) => `inset(0 ${(1 - v) * 4}% 0 ${(1 - v) * 4}% round ${(1 - v) * 40}px)`);
  const y = useTransform(p, (v) => (1 - v) * 40);
  return (
    <motion.section
      ref={ref}
      id={id}
      aria-labelledby={labelledBy}
      className={className}
      style={reduce ? undefined : { clipPath: inset, y }}
    >
      {children}
    </motion.section>
  );
}

/** Scroll-scrubbed hero exit: text drifts up faster than the orb (depth), both fade toward the next section. */
export function HeroScrollLayer({ children, className, depth = 1 }: { children: React.ReactNode; className?: string; depth?: number }) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const smooth = useSpring(scrollY, { stiffness: 140, damping: 30, mass: 0.3 });
  const y = useTransform(smooth, [0, 900], [0, -140 * depth]);
  const opacity = useTransform(smooth, [0, 700], [1, depth > 1 ? 0.15 : 0.35]);
  const scale = useTransform(smooth, [0, 900], [1, depth > 1 ? 0.96 : 1.06]);
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} style={{ y, opacity, scale }}>
      {children}
    </motion.div>
  );
}

/** Subtle magnetic pull for the primary CTA (fine pointers only). */
export function Magnetic({ children, className, strength = 0.22 }: { children: React.ReactNode; className?: string; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.4 });
  function onMove(e: React.PointerEvent) {
    if (reduce || e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  }
  function reset() {
    x.set(0);
    y.set(0);
  }
  return (
    <motion.div ref={ref} className={cn("inline-flex", className)} style={{ x, y }} onPointerMove={onMove} onPointerLeave={reset}>
      {children}
    </motion.div>
  );
}

/** Counts up once when visible. Formatting is caller-provided (pt-BR). */
export function Counter({
  value,
  format,
  className,
  duration = 1.4,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(() => format(value));
  useEffect(() => {
    if (!inView || reduce) {
      setDisplay(format(value));
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: EASE,
      onUpdate: (v) => setDisplay(format(v)),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce, value, duration]);
  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {display}
    </span>
  );
}
