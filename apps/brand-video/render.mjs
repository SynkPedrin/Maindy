// Renderiza as composições e copia para a LP (apps/web/public/assets/maindy/animations).
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';

const out = 'out';
const dest = '../web/public/assets/maindy/animations';
mkdirSync(out, { recursive: true });
const run = (args) => execFileSync('npx', ['remotion', ...args], { stdio: 'inherit' });
const common = ['--codec=h264', '--crf=23', '--pixel-format=yuv420p', '--muted', '--x264-preset=slow'];

run(['render', 'src/index.ts', 'MaindyIntro', `${out}/maindy-intro-1080.mp4`, ...common]);
run(['render', 'src/index.ts', 'OrbLoop', `${out}/orb-loop-1080.mp4`, ...common]);
run(['still', 'src/index.ts', 'OrbLoop', `${out}/hero-poster.jpeg`, '--frame=0', '--image-format=jpeg', '--jpeg-quality=82']);

for (const f of ['maindy-intro-1080.mp4', 'orb-loop-1080.mp4', 'hero-poster.jpeg']) {
  copyFileSync(`${out}/${f}`, `${dest}/${f}`);
}
console.log('ok: vídeos copiados para', dest);
