/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the API is proxied, so the app always calls relative /api/v1 URLs.
// This also works unchanged in GitHub Codespaces and behind nginx in docker compose.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: process.env.VITE_API_PROXY ?? "http://localhost:8000", changeOrigin: true } },
  },
  test: {
    environment: "jsdom",
    globals: true,
    env: { VITE_MOCK_LATENCY_MS: "0" },
    // Tests must not leak into each other: undo spies, stubbed globals and stubbed env vars after every test.
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/api/schema.d.ts",
        "src/test/**",
        "src/main.tsx",
        "src/**/*.d.ts",
        "src/**/*.test.{ts,tsx}",
        "src/test-setup.ts",
      ],
      // Starting floor. Ratchet these up as the pages (T23–T28) land and add their own tests.
      thresholds: {
        "src/api/**": { lines: 70 },
        "src/components/**": { lines: 70 },
      },
    },
    setupFiles: ["./src/test-setup.ts"],
  },
});
