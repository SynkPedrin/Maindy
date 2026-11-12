import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { COLORS, HEIGHT, LOOP_FRAMES, WIDTH } from './framing';
import { BrandFrame, Dot, makeParticles, orbPx } from './layers';

const particles = makeParticles('loop', 18);
const TAU = Math.PI * 2;

/** Camadas vivas da esfera (respiração, arco de luz, órbita). t: 0..1 no ciclo; strength: 0..1. */
export const OrbAmbience: React.FC<{ t: number; strength?: number }> = ({ t, strength = 1 }) => {
  const orb = orbPx();
  const breathe = 0.5 + 0.5 * Math.sin(t * TAU - Math.PI / 2); // 0..1..0
  return (
    <AbsoluteFill style={{ opacity: strength }}>
      {/* respiração luminosa */}
      <AbsoluteFill
        style={{
          mixBlendMode: 'screen',
          opacity: 0.22 + breathe * 0.3,
          background: `radial-gradient(circle at ${orb.x}px ${orb.y}px, ${COLORS.electric}88 0px, ${COLORS.purple}33 ${orb.r * 1.05}px, transparent ${orb.r * 1.75}px)`,
        }}
      />

      {/* arco de luz percorrendo a borda da esfera */}
      <div
        style={{
          position: 'absolute',
          left: orb.x - orb.r * 1.02,
          top: orb.y - orb.r * 1.02,
          width: orb.r * 2.04,
          height: orb.r * 2.04,
          borderRadius: '50%',
          mixBlendMode: 'screen',
          opacity: 0.55,
          transform: `rotate(${t * 360}deg)`,
          background: `conic-gradient(from 0deg, transparent 0deg, ${COLORS.yellow}cc 18deg, #ffffffaa 26deg, transparent 60deg, transparent 360deg)`,
          WebkitMask: `radial-gradient(circle, transparent ${orb.r * 0.95}px, #000 ${orb.r * 0.99}px, #000 ${orb.r * 1.02}px, transparent ${orb.r * 1.04}px)`,
          mask: `radial-gradient(circle, transparent ${orb.r * 0.95}px, #000 ${orb.r * 0.99}px, #000 ${orb.r * 1.02}px, transparent ${orb.r * 1.04}px)`,
          filter: 'blur(2px)',
        }}
      />

      {/* partículas em órbita (cada uma dá 1 ou 2 voltas por loop) */}
      <AbsoluteFill style={{ mixBlendMode: 'screen' }}>
        {particles.map((p, i) => {
          const turns = i % 3 === 0 ? 2 : 1;
          const a = p.angle + t * TAU * turns * (i % 2 ? 1 : -1);
          const rx = orb.r * (1.25 + p.dist * 0.5);
          const ry = rx * 0.42;
          const x = orb.x + Math.cos(a) * rx;
          const y = orb.y + Math.sin(a) * ry;
          const behind = Math.sin(a) < 0; // metade de trás da órbita fica mais apagada
          const o = (behind ? 0.25 : 0.85) * (0.6 + 0.4 * Math.sin(t * TAU * 2 + p.phase * TAU));
          return <Dot key={i} x={x} y={y} size={p.size * 0.8} color={p.color} opacity={o} />;
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * Loop sem emenda da esfera respirando, no mesmo enquadramento do fim da MaindyIntro.
 * Toda animação é periódica em LOOP_FRAMES (múltiplos inteiros de uma volta).
 */
export const OrbLoop: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <BrandFrame progress={1}>
      <Img src={staticFile('brand-last-frame.png')} style={{ width: WIDTH, height: HEIGHT }} />
      <OrbAmbience t={frame / LOOP_FRAMES} />
    </BrandFrame>
  );
};
