"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { QuickPanel } from "@/components/marketing/desktop-demo";
import { track } from "@/lib/lp/analytics";
import { firePulse } from "../store";

/**
 * Production port of the official floating widget demo (demo_interativo.html):
 * breathing + hover float, drag with snap-to-edge (confined to its stage so it never covers the
 * page or fights the scroll), tap ripple + haptic, expandable panel, Escape/close, full keyboard.
 * The panel shows the desktop app's quick panel (simulated data, labelled).
 */
export function MaindyOrbAssistant({ className }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const [pos, setPos] = useState({ x: 0, y: 0, ready: false });
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [ripple, setRipple] = useState(0);
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const SIZE = useRef(112);

  const clampPos = useCallback((x: number, y: number) => {
    const b = box.current;
    if (!b) return { x, y };
    const s = SIZE.current;
    return { x: Math.min(Math.max(x, 6), b.clientWidth - s - 6), y: Math.min(Math.max(y, 6), b.clientHeight - s - 6) };
  }, []);

  // initial resting place: lower right of the stage
  useLayoutEffect(() => {
    const b = box.current;
    if (!b) return;
    const place = () => {
      SIZE.current = window.innerWidth < 600 ? 96 : 112;
      setPos((p) => {
        const s = SIZE.current;
        const base = p.ready ? clampPos(p.x, p.y) : clampPos(b.clientWidth - s - 18, b.clientHeight - s - 18);
        return { ...base, ready: true };
      });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(b);
    return () => ro.disconnect();
  }, [clampPos]);

  const toggle = useCallback(
    (v?: boolean) => {
      setOpen((o) => {
        const next = v ?? !o;
        if (next) {
          firePulse();
          track("assistant_open");
        }
        return next;
      });
      setRipple((r) => r + 1);
      try {
        navigator.vibrate?.(13);
      } catch {}
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    setPressed(true);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 7) {
      d.moved = true;
      setDragging(true);
      setPressed(false);
    }
    if (d.moved) setPos((p) => ({ ...p, ...clampPos(d.ox + dx, d.oy + dy) }));
  }
  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setPressed(false);
    if (d.moved) {
      setDragging(false);
      // snap to the nearest side edge
      const b = box.current!;
      const s = SIZE.current;
      setPos((p) => ({ ...p, ...clampPos(p.x + s / 2 < b.clientWidth / 2 ? 10 : b.clientWidth - s - 10, p.y) }));
    } else {
      toggle();
    }
  }

  // panel placement: above the orb if room, else below; horizontally centred and clamped
  const b = box.current;
  const pw = Math.min(360, (b?.clientWidth ?? 360) - 16);
  const s = SIZE.current;
  const panelLeft = b ? Math.min(Math.max(pos.x + s / 2 - pw / 2, 8), b.clientWidth - pw - 8) : 0;
  const above = pos.y > 330;
  const panelTop = above ? undefined : pos.y + s + 6;
  const panelBottom = above && b ? b.clientHeight - pos.y + 6 : undefined;

  return (
    <div ref={box} className={cn("relative", className)} data-interactive>
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Fechar painel da maindy." : "Abrir painel da maindy."}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => {
          // keyboard activation only (pointer taps are handled on pointerup)
          if (e.detail === 0) toggle();
        }}
        className={cn(
          "absolute z-10 touch-none select-none rounded-full outline-offset-4",
          dragging ? "cursor-grabbing" : "cursor-grab transition-[left,top] duration-500 ease-out-expo",
          !pos.ready && "opacity-0",
        )}
        style={{ left: pos.x, top: pos.y, width: s, height: s }}
      >
        <span aria-hidden className="absolute inset-[12%] rounded-full opacity-40 blur-xl [background:conic-gradient(from_0deg,#a200ff80,transparent_28%,#ffb80066,transparent_75%,#a200ff80)] mk-spin" style={{ ["--dur" as string]: "9s" }} />
        <span
          aria-hidden
          className={cn(
            "relative block size-full transition-transform duration-300",
            pressed ? "scale-[.91] -rotate-6" : dragging ? "rotate-3 scale-[1.06]" : "film-orb-float",
          )}
        >
          <Image
            src="/brand/orb-320.webp"
            alt=""
            width={160}
            height={160}
            draggable={false}
            className={cn(
              "pointer-events-none absolute left-[-19%] top-[-19%] size-[138%] max-w-none object-contain transition-[filter] duration-300",
              pressed ? "drop-shadow-[0_0_30px_rgba(203,100,255,.75)]" : open ? "drop-shadow-[0_0_20px_rgba(199,90,255,.55)]" : "drop-shadow-[0_0_12px_rgba(151,39,255,.24)]",
              !pressed && !dragging && "mk-breathe",
            )}
          />
        </span>
        {ripple > 0 ? <span key={ripple} aria-hidden className="mk-ripple pointer-events-none absolute inset-[15%] rounded-full border-2 border-[rgba(193,101,255,.78)]" /> : null}
      </button>

      <section
        id={panelId}
        role="dialog"
        aria-label="Painel rápido da maindy."
        aria-hidden={!open}
        className={cn(
          "absolute z-20 overflow-hidden rounded-[22px] border border-[rgba(191,130,255,.22)] bg-[linear-gradient(140deg,rgba(26,23,67,.97),rgba(5,6,29,.98)_72%)] text-fg shadow-[0_30px_90px_-20px_rgba(0,0,0,.8),0_0_60px_-20px_rgba(164,36,255,.6)] transition-[opacity,transform,visibility] duration-300 ease-out-expo",
          open ? "visible translate-y-0 scale-100 opacity-100" : "invisible translate-y-2 scale-[.97] opacity-0",
        )}
        style={{ width: pw, left: panelLeft, top: panelTop, bottom: panelBottom }}
      >
        <div className="flex items-center gap-2.5 border-b border-white/[0.08] bg-[linear-gradient(90deg,rgba(141,30,255,.18),rgba(255,180,4,.05))] px-4 py-3">
          <Image src="/brand/orb-96.webp" alt="" width={34} height={34} />
          <div className="leading-tight">
            <p className="text-[14px] font-semibold tracking-[-0.02em]">maindy.</p>
            <p className="text-[11px] text-muted">Painel rápido · demonstração</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              btn.current?.focus({ preventScroll: true });
            }}
            className="ml-auto inline-flex size-8 items-center justify-center rounded-[10px] border border-white/15 bg-white/[0.045] text-fg/90 hover:bg-white/[0.12]"
            aria-label="Fechar painel"
            tabIndex={open ? 0 : -1}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div inert={!open ? true : undefined}>
          <QuickPanel paused={paused} onTogglePause={() => setPaused((p) => !p)} compact />
        </div>
      </section>
    </div>
  );
}
