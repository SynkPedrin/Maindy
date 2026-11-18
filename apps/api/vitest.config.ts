import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    // all suites share the real maindy_test database
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: { NODE_ENV: "test" },
  },
});
