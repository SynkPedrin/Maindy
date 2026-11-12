#!/usr/bin/env node
// MAINDY asset generator.
//   node tools/asset-gen/generate.mjs              # author SVGs from lib/ + render all PNGs
//   node tools/asset-gen/generate.mjs --render-only # render PNGs from existing design/asset-src SVGs
// Stage 1 (author.mjs) writes design/asset-src/**/*.svg.
// Stage 2 (this file) rasterises them with resvg and optimises with sharp.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { author } from './author.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const SRC = path.join(ROOT, 'design', 'asset-src');
const PNG1024 = path.join(SRC, 'png-1024');
const APP = path.join(ROOT, 'apps', 'mobile', 'assets');

const renderOnly = process.argv.includes('--render-only');

function listSvgs(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'png-1024') out.push(...listSvgs(p, base)); }
    else if (e.name.endsWith('.svg')) out.push(path.relative(base, p).replace(/\.svg$/, ''));
  }
  return out.sort();
}

// Which PNGs each source produces. width only; height follows the SVG aspect.
function targets(name) {
  const [group, file] = name.split('/');
  switch (group) {
    case 'navigation':
      return [
        { out: path.join(PNG1024, group, file + '.png'), width: 1024 },
        { out: path.join(APP, group, file + '.png'), width: 32, small: true },
        { out: path.join(APP, group, file + '@2x.png'), width: 64, small: true },
        { out: path.join(APP, group, file + '@3x.png'), width: 96, small: true },
      ];
    case 'categories':
      return [
        { out: path.join(PNG1024, group, file + '.png'), width: 1024 },
        { out: path.join(APP, group, file + '.png'), width: 256, small: true },
      ];
    case 'app-icons':
      return [{ out: path.join(APP, group, file + '.png'), width: 1024, opaque: file === 'app-icon', lossless: file === 'app-icon' }];
    default:
      return [{ out: path.join(APP, group, file + '.png'), width: null }];
  }
}

const BUDGET_LARGE = 400 * 1024;
const BUDGET_SMALL = 40 * 1024;

async function encode(rgba, t) {
  let img = sharp(rgba);
  if (t.opaque) img = img.flatten({ background: '#05082B' }).removeAlpha();
  const full = await img.clone().png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer();
  const budget = t.small ? BUDGET_SMALL : BUDGET_LARGE;
  if (t.lossless || full.length <= budget * 0.6) return { buf: full, mode: 'rgba' };
  // palette quantisation (libimagequant) with dithering keeps glass gradients smooth
  const pal = await img.clone().png({ palette: true, quality: 95, effort: 10, dither: 1.0, compressionLevel: 9 }).toBuffer();
  if (pal.length < full.length) return { buf: pal, mode: 'palette' };
  return { buf: full, mode: 'rgba' };
}

async function main() {
  if (!renderOnly) {
    const n = author(SRC);
    console.log(`authored ${n.length} SVG sources in ${path.relative(ROOT, SRC)}`);
  }
  const names = listSvgs(SRC);
  const rows = [];
  for (const name of names) {
    const svg = fs.readFileSync(path.join(SRC, name + '.svg'), 'utf8');
    for (const t of targets(name)) {
      const opts = { shapeRendering: 2, textRendering: 2, imageRendering: 0, font: { loadSystemFonts: false } };
      if (t.width) opts.fitTo = { mode: 'width', value: t.width };
      const rendered = new Resvg(svg, opts).render();
      const png = rendered.asPng();
      const { buf, mode } = await encode(png, t);
      fs.mkdirSync(path.dirname(t.out), { recursive: true });
      fs.writeFileSync(t.out, buf);
      const meta = await sharp(buf).metadata();
      rows.push([path.relative(ROOT, t.out), `${meta.width}x${meta.height}`, meta.hasAlpha ? 'alpha' : 'opaque', mode, (buf.length / 1024).toFixed(1) + ' KB']);
    }
  }
  const w = [0, 0, 0, 0, 0];
  rows.forEach((r) => r.forEach((c, i) => (w[i] = Math.max(w[i], c.length))));
  rows.forEach((r) => console.log(r.map((c, i) => c.padEnd(w[i])).join('  ')));
  console.log(`\n${rows.length} PNGs written.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
