"use client";

import { useFrame } from "@react-three/fiber";
import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { BlendFunction, type ChromaticAberrationEffect } from "postprocessing";
import { useMemo, useRef } from "react";
import { Vector2 } from "three";
import { film } from "../store";

/**
 * High profile: tight bloom (only the hottest rims and highlights glow — the rest stays razor sharp),
 * velocity-driven chromatic shift (motion feel without blurring the frame), vignette and a whisper of grain.
 * Copy stays in HTML, so it is never touched by any of this.
 */
export default function Effects({ msaa }: { msaa: boolean }) {
  const ca = useRef<ChromaticAberrationEffect>(null);
  const offset = useMemo(() => new Vector2(0, 0), []);
  useFrame(() => {
    const v = film.reducedMotion ? 0 : Math.min(1, Math.abs(film.velocity) * 0.9);
    const target = 0.00025 + v * 0.0032;
    offset.x += (target - offset.x) * 0.15;
    offset.y = offset.x * 0.6;
    if (ca.current) ca.current.offset.copy(offset);
  });
  return (
    <EffectComposer multisampling={msaa ? 4 : 0} enableNormalPass={false}>
      <Bloom mipmapBlur levels={7} intensity={0.85} luminanceThreshold={0.68} luminanceSmoothing={0.22} radius={0.55} />
      <ChromaticAberration ref={ca} offset={offset} radialModulation modulationOffset={0.35} />
      <Vignette darkness={0.58} offset={0.24} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.06} />
    </EffectComposer>
  );
}
