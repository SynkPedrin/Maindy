"use client";

import { useEffect, useRef } from "react";
import { useFilmFrame } from "../CinematicScrollController";
import { film, range, smooth } from "../store";
import { SCENE_INDEX } from "../storyboard";
import { PLATE, plateDir, plateLayout } from "../world/plate";

const FINAL = SCENE_INDEX.final;

/**
 * Layer B: the official brand animation (wordmark ⇄ orb), pre-rendered to a 40-frame sequence and
 * scrubbed by scroll — played in reverse here: the live orb becomes the filmed orb, which resolves
 * into the `maindy.` signature. Frames preload one scene ahead; the canvas idles when hidden.
 */
export function FinalPlate() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const imgs = useRef<(ImageBitmap | HTMLImageElement | null)[] | null>(null);
  const state = useRef({ frame: -1, w: 0, h: 0, shift: -1, loaded: 0 });

  function load() {
    if (imgs.current) return;
    const dir = plateDir(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1, film.quality === "low");
    const list: (ImageBitmap | HTMLImageElement | null)[] = new Array(PLATE.frames).fill(null);
    imgs.current = list;
    // decode off the main thread (createImageBitmap) so 4K frames never stall a scroll frame;
    // the hand-off frame (the orb, last) first, then the rest
    const order = [PLATE.frames - 1, ...Array.from({ length: PLATE.frames - 1 }, (_, i) => PLATE.frames - 2 - i)];
    let i = 0;
    const next = async () => {
      const k = order[i++];
      if (k === undefined) return;
      const url = `${dir}/${String(k).padStart(2, "0")}.webp`;
      try {
        if ("createImageBitmap" in window) {
          const blob = await (await fetch(url)).blob();
          list[k] = await createImageBitmap(blob);
        } else {
          const im = new Image();
          im.src = url;
          await im.decode();
          list[k] = im;
        }
        state.current.frame = -1;
      } catch {}
      void next();
    };
    // a few parallel lanes
    for (let lane = 0; lane < 4; lane++) void next();
  }

  useEffect(() => {
    const onResize = () => {
      state.current.frame = -1;
      state.current.w = 0;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useFilmFrame((s) => {
    if (s > FINAL - 1.6) load();
    const c = canvas.current;
    if (!c) return;
    const local = range(s, FINAL, FINAL + 1);
    const opacity = s < FINAL ? 0 : smooth(range(local, 0.04, 0.12));
    c.style.opacity = String(opacity);
    film.covered = opacity >= 0.999 && s < FINAL + 0.995;
    if (opacity <= 0 || !imgs.current) return;
    // frames: orb (last) → wordmark (first)
    const t = smooth(range(local, 0.13, 0.5));
    const frame = Math.round((1 - t) * (PLATE.frames - 1));
    // after the signature resolves, the plate rises to make room for the final copy
    const shift = smooth(range(local, 0.48, 0.64));
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const st = state.current;
    if (st.w !== vw || st.h !== vh) {
      c.width = Math.round(vw * dpr);
      c.height = Math.round(vh * dpr);
      st.w = vw;
      st.h = vh;
      st.frame = -1;
    }
    if (frame === st.frame && Math.abs(shift - st.shift) < 0.001) return;
    const img = nearestLoaded(imgs.current, frame);
    if (!img) return;
    st.frame = frame;
    st.shift = shift;
    const g = c.getContext("2d", { alpha: false })!;
    g.imageSmoothingQuality = "high";
    const L = plateLayout(vw, vh);
    const lift = shift * vh * (L.portrait ? 0.2 : 0.19);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#04042c";
    g.fillRect(0, 0, vw, vh);
    g.drawImage(img, L.x, L.y - lift, L.w, L.h);
    if (L.portrait) {
      // feather the band into the background
      const top = L.y - lift;
      const fadeH = L.h * 0.22;
      let gr = g.createLinearGradient(0, top, 0, top + fadeH);
      gr.addColorStop(0, "#04042c");
      gr.addColorStop(1, "rgba(4,4,44,0)");
      g.fillStyle = gr;
      g.fillRect(0, top - 1, vw, fadeH);
      gr = g.createLinearGradient(0, top + L.h - fadeH, 0, top + L.h);
      gr.addColorStop(0, "rgba(4,4,44,0)");
      gr.addColorStop(1, "#04042c");
      g.fillStyle = gr;
      g.fillRect(0, top + L.h - fadeH, vw, fadeH + 1);
    }
  });

  return <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 size-full" style={{ opacity: 0 }} />;
}

function nearestLoaded(list: (ImageBitmap | HTMLImageElement | null)[], i: number): ImageBitmap | HTMLImageElement | null {
  for (let d = 0; d < list.length; d++) {
    const a = list[i + d];
    if (a) return a;
    const b = list[i - d];
    if (b) return b;
  }
  return null;
}
