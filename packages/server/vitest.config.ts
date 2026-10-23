import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@server": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    env: {
      // Fake-timer suites freeze p-throttle's clock, so a real per-second cap deadlocks them.
      PASEO_GIT_MAX_PROCESSES_PER_SECOND: "10000",
      // The voice knows English only, whatever language files this machine's user keeps
      // (voice-language/setup-languages.ts).
      HIZURI_LANGUAGES_DIR: "",
    },
    testTimeout: 30000,
    hookTimeout: 60000,
    globals: true,
    environment: "node",
    setupFiles: [path.resolve(__dirname, "./src/test-utils/vitest-setup.ts")],
    pool: "forks",
    fileParallelism: false,
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**", "**/.dev/**"],
  },
});
