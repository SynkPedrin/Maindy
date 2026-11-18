import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port in dev and a relative build.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  base: "./",
  server: { port: 1420, strictPort: true, host: "127.0.0.1" },
  preview: { port: 1421, strictPort: true, host: "127.0.0.1" },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: ["safari15", "chrome105"],
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
