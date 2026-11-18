import { defineConfig } from "vitest/config";
// Tests spawn real node processes; generous timeouts keep them stable on loaded machines/CI.
export default defineConfig({ test: { testTimeout: 30_000 } });
