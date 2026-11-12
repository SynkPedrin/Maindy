import React from 'react';
import { AbsoluteFill, random } from 'remotion';
import { COLORS, FINAL_SCALE, FINAL_Y, HEIGHT, ORB, WIDTH } from './framing';

/**
 * Enquadra o conteúdo da marca. progress 0 = quadro original; 1 = enquadramento final da hero
 * (recuado, deslocado para cima, bordas dissolvidas no navy).
 */
export const BrandFrame: React.FC<{ progress: number; children: React.ReactNode }> = ({ progress, children }) => {
  const scale = 1 + (FINAL_SCALE - 1) * progress;
  const y = FINAL_Y * HEIGHT * progress;
  // bordas do vídeo ficam transparentes (máscara) e revelam o navy: sem retângulo visível
  const fx = 22 * progress;
  const fy = 20 * progress;
  const mask = `linear-gradient(90deg, transparent 0%, #000 ${fx}%, #000 ${100 - fx}%, transparent 100%), linear-gradient(180deg, transparent 0%, #000 ${fy}%, #000 ${100 - fy}%, transparent 100%)`;
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.navy }}>
      <AbsoluteFill
        style={{
          transform: `translateY(${y}px) scale(${scale})`,
          transformOrigin: '50% 50%',
          WebkitMaskImage: mask,
          maskImage: mask,
          WebkitMaskComposite: 'source-in',
          maskComposite: 'intersect',
        }}
      >
        {children}
      </AbsoluteFill>
      {/* base da tela em navy, onde a hero coloca o texto */}
      <AbsoluteFill
        style={{
          opacity: progress,
          background: `linear-gradient(180deg, transparent 0%, transparent 56%, ${COLORS.navy}cc 72%, ${COLORS.navy} 86%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Centro e raio da esfera em pixels no quadro original. */
export const orbPx = () => ({ x: ORB.cx * WIDTH, y: ORB.cy * HEIGHT, r: ORB.r * HEIGHT });

export const Dot: React.FC<{ x: number; y: number; size: number; color: string; opacity: number }> = ({ x, y, size, color, opacity }) => (
  <div
    style={{
      position: 'absolute',
      left: x - size / 2,
      top: y - size / 2,
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
      opacity,
      boxShadow: `0 0 ${size * 3}px ${color}`,
    }}
  />
);

export type Particle = { angle: number; dist: number; size: number; color: string; speed: number; phase: number };

export function makeParticles(seed: string, count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const roll = random(`${seed}-c-${i}`);
    return {
      angle: random(`${seed}-a-${i}`) * Math.PI * 2,
      dist: 0.55 + random(`${seed}-d-${i}`) * 0.45,
      size: 2 + random(`${seed}-s-${i}`) * 4,
      color: roll > 0.88 ? COLORS.yellow : roll > 0.4 ? '#C58BFF' : COLORS.white,
      speed: 0.7 + random(`${seed}-v-${i}`) * 0.6,
      phase: random(`${seed}-p-${i}`),
    };
  });
}
