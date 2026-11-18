// Bundles the gateway into a single ESM file for the desktop sidecar: dist/maindy-gateway.mjs
import { build } from "esbuild";
import { chmodSync } from "node:fs";
await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/maindy-gateway.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  legalComments: "none",
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __maindyCreateRequire } from 'node:module';\nconst require = __maindyCreateRequire(import.meta.url);",
  },
  logLevel: "info",
});
chmodSync("dist/maindy-gateway.mjs", 0o755);
