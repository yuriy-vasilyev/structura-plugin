import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest config for the WordPress-embedded React client.
 *
 * Distinct from `vite.config.js` (which builds the asset bundle and rewires
 * imports of `react`, `@wordpress/element` etc. to `window.wp.*` globals).
 * Tests run against the *real* React from node_modules so component output
 * is independent of the WP runtime.
 *
 * `@vitejs/plugin-react` is required so JSX uses the standard React runtime
 * (`react/jsx-runtime`) instead of the `window.wp.element.createElement`
 * factory configured for production builds.
 *
 * Tests live in `__tests__/` folders next to the code they cover so
 * features stay self-contained (mirrors the functions/ convention).
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
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
