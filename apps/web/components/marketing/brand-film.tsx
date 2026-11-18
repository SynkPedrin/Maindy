"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * The official 6.5 s wordmark → orb transition. Loaded only when near the viewport
 * (preload="none", src attached lazily), muted, plays once, never blocks LCP.
 */
export function BrandFilm() {
  const ref = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setSrc((s) => s ?? "/brand/wordmark-to-orb-4k.mp4");
            el.play().catch(() => {});
          }
        }
      },
      { rootMargin: "200px 0px", threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  useEffect(() => {
    if (src) ref.current?.play().catch(() => {});
  }, [src]);

  return (
    <video
      ref={ref}
      src={src ?? undefined}
      poster="/brand/wordmark-on-navy-1600.webp"
      muted
      playsInline
      preload="none"
      aria-label="Transição oficial da marca: a wordmark maindy. se transforma no ícone m."
      className="absolute inset-0 size-full object-cover"
    />
  );
}
