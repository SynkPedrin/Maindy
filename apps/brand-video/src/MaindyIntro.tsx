import React from 'react';
import { AbsoluteFill, Easing, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { BRAND_VIDEO_FRAMES, COLORS, HEIGHT, INTRO_FRAMES, SCENE6_START, WIDTH } from './framing';
import { BrandFrame, Dot, makeParticles, orbPx } from './layers';
import { OrbAmbience } from './OrbLoop';

const particles = makeParticles('intro', 110);
const ease = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * MAINDY_INTRO: vídeo original da marca (preservado) + camadas Remotion.
 * Cena 1: luz roxa lateral e uma pequena luz amarela.
 * Cena 2: partículas convergem para o centro.
 * Cenas 3-5: a esfera do vídeo original surge; um reflexo varre a esfera.
 * Cena 6: a composição recua e abre espaço para o texto da hero (encaixa no OrbLoop).
 */
export const MaindyIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const orb = orbPx();

  // Cena 1
  const sideLight = interpolate(frame, [0, 30, 120, 150], [0, 0.55, 0.4, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const yellowT = interpolate(frame, [6, 120], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const yellowOpacity = interpolate(frame, [6, 24, 100, 125], [0, 1, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Cena 4: reflexo varrendo a esfera
  const sweep = interpolate(frame, [138, 176], [-1.2, 1.2], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const sweepOpacity = interpolate(frame, [138, 148, 168, 178], [0, 0.55, 0.55, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Cena 6
  const progress = interpolate(frame, [SCENE6_START, INTRO_FRAMES - 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

  return (
    <BrandFrame progress={progress}>
      <OffthreadVideo src={staticFile('brand-original.mp4')} muted style={{ width: WIDTH, height: HEIGHT }} endAt={BRAND_VIDEO_FRAMES} />
      {/* depois que o vídeo acaba, segura o último quadro (idêntico) */}
      <Sequence from={BRAND_VIDEO_FRAMES - 1}>
        <Img src={staticFile('brand-last-frame.png')} style={{ width: WIDTH, height: HEIGHT }} />
      </Sequence>

      {/* Cena 1: luz roxa entrando pela lateral */}
      <AbsoluteFill style={{ opacity: sideLight, mixBlendMode: 'screen', background: `radial-gradient(60% 80% at -5% 60%, ${COLORS.electric}66, transparent 60%)` }} />
      <Dot x={WIDTH * (0.86 - 0.36 * yellowT)} y={HEIGHT * (0.18 + 0.32 * yellowT)} size={7} color={COLORS.yellow} opacity={yellowOpacity} />

      {/* Cena 2: partículas convergindo */}
      <AbsoluteFill style={{ mixBlendMode: 'screen' }}>
        {particles.map((p, i) => {
          const start = 8 + p.phase * 50;
          const t = interpolate(frame, [start, start + 70 / p.speed], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.quad) });
          const d = p.dist * (1 - t) * WIDTH * 0.5 + orb.r * 0.9 * t;
          const x = orb.x + Math.cos(p.angle + t * 0.8) * d;
          const y = orb.y + Math.sin(p.angle + t * 0.8) * d * 0.62;
          const o = interpolate(t, [0, 0.15, 0.85, 1], [0, 0.9, 0.7, 0]) * interpolate(frame, [120, 140], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return <Dot key={i} x={x} y={y} size={p.size} color={p.color} opacity={o} />;
        })}
      </AbsoluteFill>

      {/* Cena 6: as camadas vivas do loop surgem, então o último quadro = primeiro quadro do OrbLoop */}
      <OrbAmbience t={0} strength={progress} />

      {/* Cena 4: reflexo */}
      <div
        style={{
          position: 'absolute',
          left: orb.x - orb.r,
          top: orb.y - orb.r,
          width: orb.r * 2,
          height: orb.r * 2,
          borderRadius: '50%',
          overflow: 'hidden',
          opacity: sweepOpacity,
          mixBlendMode: 'screen',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '-20%',
            transform: `translateX(${sweep * 70}%) rotate(18deg)`,
            background: 'linear-gradient(90deg, transparent 38%, rgba(255,255,255,0.55) 50%, transparent 62%)',
            filter: 'blur(14px)',
          }}
        />
      </div>
    </BrandFrame>
  );
};
