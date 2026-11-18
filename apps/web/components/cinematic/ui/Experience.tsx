"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useFilm, useFilmFrame } from "../CinematicScrollController";
import { emitFilmChange, film, type Quality } from "../store";
import { SCENES } from "../storyboard";

const QUALITY_KEY = "maindy-lp-quality";
const SOUND_KEY = "maindy-lp-sound";
const SEEN_KEY = "maindy-lp-loaded";

const fine = () => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;

/** Stored quality preference (read by detectCapabilities). */
export function storedQuality(): "auto" | Quality {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    if (v === "high" || v === "medium" || v === "low") return v;
  } catch {}
  return "auto";
}

/* ───────────────────────── Preloader ─────────────────────────
   Real progress (fonts, hero textures, WebGL first frame), never longer than ~3 s, once per session.
   On exit the orb "awakens" (intro restarts) and the hero copy plays. */
function Preloader() {
  const { mode } = useFilm();
  const [shown, setShown] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [pct, setPct] = useState(0);
  const target = useRef(0.08);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {}
    const root = document.documentElement;
    if (seen || mode === "flow") {
      setShown(false);
      root.classList.remove("mk-loading");
      return;
    }
    if (mode === "pending") return;
    const parts = { fonts: 0, glyph: 0, gl: 0 };
    const sync = () => (target.current = 0.1 + parts.fonts * 0.2 + parts.glyph * 0.2 + parts.gl * 0.5);
    document.fonts?.ready.then(() => ((parts.fonts = 1), sync()));
    const im = new Image();
    im.onload = im.onerror = () => ((parts.glyph = 1), sync());
    im.src = "/lp/glyph-2048.webp";
    const onGl = () => ((parts.gl = 1), sync());
    window.addEventListener("maindy:gl-ready", onGl);
    // no WebGL path (low profile): nothing to wait for
    if (film.quality === "low") parts.gl = 1;
    sync();
    const cap = window.setTimeout(() => (target.current = 1), 3200);
    let raf = 0;
    let shownPct = 0;
    const tick = () => {
      shownPct += (target.current - shownPct) * 0.09 + 0.002;
      shownPct = Math.min(shownPct, target.current >= 1 ? 1 : Math.min(0.99, target.current));
      setPct(shownPct);
      if (shownPct >= 0.999) {
        setLeaving(true);
        try {
          sessionStorage.setItem(SEEN_KEY, "1");
        } catch {}
        // the awakening plays now, in view
        film.intro = 0;
        window.dispatchEvent(new Event("maindy:intro-restart"));
        root.classList.remove("mk-loading");
        window.setTimeout(() => setShown(false), 1100);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(cap);
      window.removeEventListener("maindy:gl-ready", onGl);
    };
  }, [mode]);

  if (!shown) return null;
  const C = 2 * Math.PI * 46;
  return (
    <div
      role="progressbar"
      aria-label="Carregando a experiência"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
      className={cn("film-loader fixed inset-0 z-[95] flex items-center justify-center bg-[#04031a]", leaving && "is-leaving")}
    >
      <div className="relative flex flex-col items-center">
        <svg viewBox="0 0 100 100" className="size-[120px] -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" />
          <circle cx="50" cy="50" r="46" fill="none" stroke="url(#ld)" strokeWidth="1.4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
          <defs>
            <linearGradient id="ld" x1="0" x2="1">
              <stop offset="0" stopColor="#9524FF" />
              <stop offset="1" stopColor="#FFCE20" />
            </linearGradient>
          </defs>
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/orb-160.webp" alt="" width={56} height={56} className="film-loader-orb absolute top-[32px] size-14" />
        <p className="mt-6 font-mono text-[11px] tracking-[0.3em] text-muted tabular-nums">{String(Math.round(pct * 100)).padStart(3, "0")}</p>
      </div>
    </div>
  );
}

/* ───────────────────────── Cursor + free-look ─────────────────────────
   Dot + lagging ring; magnetic, labelled states on anything interactive ([data-cursor] sets the label).
   Dragging on empty space orbits the camera around the subject (with inertia, springs back). */
function Cursor() {
  const { mode } = useFilm();
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (mode !== "film" || !fine() || film.reducedMotion) return;
    setOn(true);
    document.documentElement.classList.add("film-has-cursor");
    const pos = { x: -100, y: -100, rx: -100, ry: -100, s: 1, ts: 1 };
    let hoverEl: HTMLElement | null = null;
    let drag: { x: number; y: number; t: number } | null = null;
    let raf = 0;

    const interactive = (t: EventTarget | null) =>
      (t as Element | null)?.closest?.<HTMLElement>("a,button,[role=tab],[role=radio],[role=slider],[data-cursor],input,select,textarea,summary") ?? null;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      pos.x = e.clientX;
      pos.y = e.clientY;
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        const now = performance.now();
        const dt = Math.max(1, now - drag.t) / 1000;
        const L = film.look;
        const ny = Math.max(-0.9, Math.min(0.9, L.yaw - dx * 0.0042));
        const np = Math.max(-0.45, Math.min(0.45, L.pitch + dy * 0.003));
        L.vy = (ny - L.yaw) / dt;
        L.vp = (np - L.pitch) / dt;
        L.yaw = ny;
        L.pitch = np;
        drag.x = e.clientX;
        drag.y = e.clientY;
        drag.t = now;
      }
    };
    const onOver = (e: PointerEvent) => {
      hoverEl = interactive(e.target);
      const txt = hoverEl?.dataset.cursor ?? "";
      if (label.current) label.current.textContent = txt;
      ring.current?.classList.toggle("is-hover", !!hoverEl);
      ring.current?.classList.toggle("has-label", !!txt);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      ring.current?.classList.add("is-down");
      if (!interactive(e.target) && film.s < SCENES.length - 1.1) {
        drag = { x: e.clientX, y: e.clientY, t: performance.now() };
        film.look.dragging = true;
        ring.current?.classList.add("is-drag");
      }
    };
    const onUp = () => {
      ring.current?.classList.remove("is-down", "is-drag");
      if (drag) {
        drag = null;
        film.look.dragging = false;
      }
    };
    const onLeave = () => {
      pos.x = pos.y = -100;
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      // magnetic pull toward the hovered control's centre
      let tx = pos.x;
      let ty = pos.y;
      if (hoverEl) {
        const r = hoverEl.getBoundingClientRect();
        if (r.width < 420 && r.height < 140) {
          tx = pos.x + (r.left + r.width / 2 - pos.x) * 0.35;
          ty = pos.y + (r.top + r.height / 2 - pos.y) * 0.35;
        }
      }
      pos.rx += (tx - pos.rx) * 0.2;
      pos.ry += (ty - pos.ry) * 0.2;
      if (dot.current) dot.current.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      if (ring.current) ring.current.style.transform = `translate3d(${pos.rx}px, ${pos.ry}px, 0)`;
    };
    raf = requestAnimationFrame(loop);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerover", onOver, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      document.documentElement.classList.remove("film-has-cursor");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerover", onOver);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [mode]);

  // over the orb (hero / meet): invite to drag
  useFilmFrame((s) => {
    const r = ring.current;
    if (!r || !on) return;
    const hint = s < 0.4 || (s > 3.05 && s < 3.95);
    r.classList.toggle("is-orb", hint && !r.classList.contains("is-hover"));
  });

  if (!on) return null;
  return (
    <div aria-hidden className="film-cursor">
      <div ref={dot} className="film-cursor-dot" />
      <div ref={ring} className="film-cursor-ring">
        <span ref={label} className="film-cursor-label" />
      </div>
    </div>
  );
}

/* ───────────────────────── Sound (generative, opt-in) ─────────────────────────
   No audio files: a slow navy-and-violet pad (oscillators through a low-pass that opens toward the
   final act), a breath of filtered noise that follows scroll speed, and a soft chime per chapter. */
class Ambience {
  ctx: AudioContext;
  master: GainNode;
  filter: BiquadFilterNode;
  whoosh: GainNode;
  constructor() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.master.connect(c.destination);
    this.filter = c.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 420;
    this.filter.Q.value = 0.6;
    this.filter.connect(this.master);
    for (const [f, type, g] of [
      [55, "sine", 0.32],
      [82.41, "triangle", 0.12],
      [110.3, "sine", 0.1],
      [164.81, "sine", 0.05],
    ] as const) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.05 + f / 4000;
      const lg = c.createGain();
      lg.gain.value = 0.6;
      lfo.connect(lg);
      lg.connect(o.detune);
      const og = c.createGain();
      og.gain.value = g;
      o.connect(og);
      og.connect(this.filter);
      o.start();
      lfo.start();
    }
    // scroll "air"
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const n = c.createBufferSource();
    n.buffer = buf;
    n.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 0.7;
    this.whoosh = c.createGain();
    this.whoosh.gain.value = 0;
    n.connect(bp);
    bp.connect(this.whoosh);
    this.whoosh.connect(this.master);
    n.start();
  }
  set(on: boolean) {
    const t = this.ctx.currentTime;
    if (on) void this.ctx.resume();
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 0.16 : 0, t, on ? 0.8 : 0.25);
  }
  update(s: number, v: number) {
    const t = this.ctx.currentTime;
    this.filter.frequency.setTargetAtTime(380 + (s / SCENES.length) * 900, t, 0.5);
    this.whoosh.gain.setTargetAtTime(Math.min(0.12, Math.abs(v) * 0.09), t, 0.08);
  }
  chime(i: number) {
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = [523.25, 587.33, 659.25, 783.99, 880][i % 5]!;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 1.7);
  }
}

/* ───────────────────────── Dock: sound + quality ───────────────────────── */
function Dock() {
  const { mode } = useFilm();
  const [sound, setSound] = useState(false);
  const [menu, setMenu] = useState(false);
  const [pref, setPref] = useState<"auto" | Quality>("auto");
  const [res, setRes] = useState("");
  const amb = useRef<Ambience | null>(null);
  const lastScene = useRef(-1);

  useEffect(() => {
    setPref(storedQuality());
    try {
      if (localStorage.getItem(SOUND_KEY) === "1") setSound(false); // needs a gesture: offer, never autoplay
    } catch {}
  }, []);

  useFilmFrame((s) => {
    const a = amb.current;
    if (a && sound) {
      a.update(s, film.velocity);
      const i = Math.floor(s + 0.02);
      if (i !== lastScene.current) {
        if (lastScene.current >= 0) a.chime(i);
        lastScene.current = i;
      }
    }
  });

  useEffect(() => {
    if (!menu) return;
    const read = () => {
      const c = document.querySelector<HTMLCanvasElement>("[data-film-canvas] canvas");
      setRes(c ? `${c.width}×${c.height}` : "WebGL desligado");
    };
    read();
    const id = window.setInterval(read, 800);
    return () => clearInterval(id);
  }, [menu]);

  function toggleSound() {
    const next = !sound;
    if (!amb.current) {
      try {
        amb.current = new Ambience();
      } catch {
        return;
      }
    }
    amb.current.set(next);
    setSound(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? "1" : "0");
    } catch {}
  }

  function choose(q: "auto" | Quality) {
    setPref(q);
    film.preferred = q;
    try {
      if (q === "auto") localStorage.removeItem(QUALITY_KEY);
      else localStorage.setItem(QUALITY_KEY, q);
    } catch {}
    window.dispatchEvent(new CustomEvent("maindy:quality", { detail: q }));
    emitFilmChange();
  }

  if (mode !== "film") return null;
  const labels: Record<"auto" | Quality, string> = { auto: "Automática", high: "Ultra · 4K", medium: "Equilibrada", low: "Leve" };
  return (
    <div className="fixed bottom-5 left-5 z-[60] hidden items-end gap-2 md:flex">
      <button
        type="button"
        onClick={toggleSound}
        aria-pressed={sound}
        data-cursor={sound ? "Silenciar" : "Som"}
        className="film-dock-btn"
        aria-label={sound ? "Desligar som ambiente" : "Ligar som ambiente"}
      >
        <span className={cn("film-eq", sound && "is-on")} aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="hidden sm:inline">{sound ? "Som ligado" : "Som"}</span>
      </button>
      <div className="relative">
        <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} className="film-dock-btn" data-cursor="Qualidade">
          <span aria-hidden className="font-mono text-[10px] tracking-[0.12em]">HD</span>
          <span className="hidden sm:inline">{labels[pref]}</span>
        </button>
        {menu ? (
          <div role="menu" className="absolute bottom-[calc(100%+8px)] left-0 w-[230px] rounded-[16px] border border-white/10 bg-[rgba(8,6,28,.96)] p-1.5 text-left shadow-[0_20px_60px_-20px_rgba(0,0,0,.9)]">
            {(["auto", "high", "medium", "low"] as const).map((q) => (
              <button
                key={q}
                role="menuitemradio"
                aria-checked={pref === q}
                type="button"
                onClick={() => {
                  choose(q);
                  setMenu(false);
                }}
                className={cn("flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-[13px]", pref === q ? "bg-white/[0.08] text-fg" : "text-muted hover:bg-white/[0.05] hover:text-fg")}
              >
                {labels[q]}
                {pref === q ? <span className="size-1.5 rounded-full bg-purple" /> : null}
              </button>
            ))}
            <p className="px-3 pb-1.5 pt-2 font-mono text-[10px] leading-relaxed text-subtle">Renderizando em {res}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────────────────── Tilt ─────────────────────────
   Any [data-tilt] surface leans toward the pointer with a moving glare (fine pointers only). */
function Tilt() {
  const { mode } = useFilm();
  useEffect(() => {
    if (mode !== "film" || !fine() || film.reducedMotion) return;
    let cur: HTMLElement | null = null;
    let raf = 0;
    let ev: PointerEvent | null = null;
    const apply = () => {
      raf = 0;
      if (!ev) return;
      const el = (ev.target as Element | null)?.closest?.<HTMLElement>("[data-tilt]") ?? null;
      if (cur && cur !== el) {
        cur.style.setProperty("--rx", "0deg");
        cur.style.setProperty("--ry", "0deg");
        cur.style.setProperty("--ga", "0");
      }
      cur = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (ev.clientX - r.left) / r.width;
      const py = (ev.clientY - r.top) / r.height;
      const k = Number(el.dataset.tilt || 5);
      el.style.setProperty("--rx", `${(0.5 - py) * k}deg`);
      el.style.setProperty("--ry", `${(px - 0.5) * k}deg`);
      el.style.setProperty("--gx", `${px * 100}%`);
      el.style.setProperty("--gy", `${py * 100}%`);
      el.style.setProperty("--ga", "1");
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      ev = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [mode]);
  return null;
}

/** Immersion layer: preloader, inertial scroll, cursor + free-look, tilt, sound and quality controls. */
export function Experience() {
  return (
    <>
      <Preloader />
      <Tilt />
      <Cursor />
      <Dock />
    </>
  );
}
