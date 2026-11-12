# MAINDY asset generator

Builds the PNG asset library in `apps/mobile/assets/` from vector sources in
`design/asset-src/`. This folder is a standalone npm package and is **not**
part of the pnpm workspace.

## Commands (run from the repo root)

```sh
npm install --prefix tools/asset-gen        # once: @resvg/resvg-js, sharp, opentype.js (~25 MB)
node tools/asset-gen/generate.mjs           # author SVGs from lib/ and render every PNG
node tools/asset-gen/generate.mjs --render-only   # only re-render PNGs from the SVGs as they are
```

The full build overwrites `design/asset-src/**/*.svg`. If you hand-edit an SVG,
use `--render-only` so your edit is kept (or move the change into `lib/`).

## Pipeline

1. `author.mjs` + `lib/*.mjs` write the SVG sources to `design/asset-src/`.
   - `lib/orb.mjs`: the glass orb and its six assistant states (`ORB_STATES`).
   - `lib/type.mjs`: the wordmark. Poppins Bold (OFL, `fonts/`) is converted to
     outlines, with a dotless `ı`, a yellow dot and a purple terminal dot.
   - `lib/glyphs.mjs`: navigation and category glyphs on a 24-unit grid
     (2-unit round strokes, 3.5 corner radius, translucent glass fill, solid
     accent dot).
   - `lib/common.mjs`: the brand palette and SVG helpers.
2. `generate.mjs` renders each SVG with resvg. Small sizes are rendered
   straight from the vector, not downscaled. sharp then encodes each PNG:
   lossless when it fits the size budget, otherwise palette-quantised with
   dithering. The budgets are 400 KB for large images and 40 KB for small
   icons. `app-icon.png` is always lossless and opaque.

## Outputs

| Source (`design/asset-src/`) | Output |
| --- | --- |
| `brand/*.svg` | `apps/mobile/assets/brand/*.png` (native size) |
| `app-icons/*.svg` | `apps/mobile/assets/app-icons/*.png` (1024; `app-icon` is opaque RGB) |
| `assistant/orb-*.svg` | `apps/mobile/assets/assistant/orb-*.png` (1024) |
| `navigation/*.svg` | `apps/mobile/assets/navigation/<name>.png` 32, `@2x` 64, `@3x` 96, plus `design/asset-src/png-1024/navigation/<name>.png` |
| `categories/*.svg` | `apps/mobile/assets/categories/<name>.png` 256, plus `design/asset-src/png-1024/categories/<name>.png` |
| `onboarding/*.svg` | `apps/mobile/assets/onboarding/*.png` (1024) |

Navigation icons are pure white (#FFFFFF) with alpha only. Tint them with
`tintColor`. The glass parts are lower-alpha white, so they tint to a lighter
shade of the same colour.

For the Android adaptive icon, set the background colour to `#05082B`. The orb
in `adaptive-icon.png` sits inside the central 66% safe zone. For the Expo
splash, use `splash-icon.png` on `#05082B`.
