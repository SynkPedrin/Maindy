import React from 'react';
import { Composition } from 'remotion';
import { FPS, HEIGHT, INTRO_FRAMES, LOOP_FRAMES, WIDTH } from './framing';
import { MaindyIntro } from './MaindyIntro';
import { OrbLoop } from './OrbLoop';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="MaindyIntro" component={MaindyIntro} durationInFrames={INTRO_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} />
    <Composition id="OrbLoop" component={OrbLoop} durationInFrames={LOOP_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} />
  </>
);
