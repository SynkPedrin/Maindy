// Gera derivados otimizados a partir de brand/original sem alterar os originais.
import sharp from "sharp";
import { mkdirSync, copyFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname;
const o = (f) => root + "brand/original/" + f;
const out = root + "brand/derived/";
mkdirSync(out, { recursive: true });
// orb on navy is square full-bleed: crop to the circle bounds for icons
const orbNavy = sharp(o("orb-on-navy.png"));
for (const s of [16, 32, 48, 64, 128, 180, 192, 256, 512, 1024]) {
  await orbNavy.clone().resize(s, s).png({ compressionLevel: 9 }).toFile(`${out}icon-${s}.png`);
}
// transparent orb (with glow) for UI usage
for (const s of [96, 160, 320, 640]) {
  await sharp(o("orb-transparent.png")).resize(s, s).webp({ quality: 88, alphaQuality: 90 }).toFile(`${out}orb-${s}.webp`);
  await sharp(o("orb-transparent.png")).resize(s, s).png({ compressionLevel: 9 }).toFile(`${out}orb-${s}.png`);
}
// wordmark: trim the transparent padding of the white wordmark
const wm = await sharp(o("wordmark-white.png")).trim({ threshold: 1 }).toBuffer();
await sharp(wm).png({ compressionLevel: 9 }).toFile(`${out}wordmark-white.png`);
await sharp(wm).resize({ width: 640 }).webp({ quality: 92, alphaQuality: 95 }).toFile(`${out}wordmark-white-640.webp`);
await sharp(o("wordmark-on-navy.png")).resize({ width: 1600 }).webp({ quality: 86 }).toFile(`${out}wordmark-on-navy-1600.webp`);
// OG image 1200x630 from the on-navy wordmark artwork (cover crop, no distortion)
await sharp(o("wordmark-on-navy.png")).resize(1200, 630, { fit: "cover" }).jpeg({ quality: 88, mozjpeg: true }).toFile(`${out}og-1200x630.jpg`);
copyFileSync(o("orb-animated.webp"), `${out}orb-animated.webp`);
const meta = await sharp(wm).metadata();
console.log("wordmark trimmed", meta.width, "x", meta.height);
