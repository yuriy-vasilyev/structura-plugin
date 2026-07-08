import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Vitest config for `@structura/ui`.
 *
 * Distinct from `vite.config.ts` (which builds the library bundle and, in
 * WP mode, rewires JSX to `window.wp.element`). Tests run against the real
 * React from node_modules so component output is independent of any
 * consumer's runtime — mirrors `client/vitest.config.ts`.
 *
 * Tests live in `__tests__/` folders next to the components they cover
 * (same convention as `client/` and `functions/`).
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    css: false,
  },
});
