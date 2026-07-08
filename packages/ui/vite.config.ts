import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig(() => {
  const isWordPress = process.env.WP_BUILD === "true";

  return {
    plugins: [dts({ insertTypesEntry: true })],

    esbuild: isWordPress
      ? {
          jsx: "transform",
          jsxFactory: "window.wp.element.createElement",
          jsxFragment: "window.wp.element.Fragment",
        }
      : {},

    build: {
      lib: {
        // Multi-entry build: the main barrel plus the `pricing` sub-entry. Each
        // entry produces its own ES + CJS bundle plus a `.d.ts` so consumers
        // can import either via `@structura/ui` or `@structura/ui/pricing`
        // and get tree-shaking + correct types per surface.
        entry: {
          index: resolve(__dirname, "src/index.ts"),
          pricing: resolve(__dirname, "src/pricing/index.ts"),
        },
        formats: ["es", "cjs"],
        fileName: (format, entryName) =>
          `${entryName}.${format === "es" ? "js" : "cjs"}`,
      },
      rollupOptions: {
        // `lucide-react` is used by the pricing composites — externalised so
        // consumers' bundlers dedupe it against their own lucide-react copy
        // rather than each subentry shipping its own icon set.
        external: [
          "react",
          "react-dom",
          "react/jsx-runtime",
          "@headlessui/react",
          "lucide-react",
        ],
        output: {
          globals: isWordPress
            ? {
                react: "window.wp.element",
                "react-dom": "window.wp.element",
                "react/jsx-runtime": "window.wp.element",
              }
            : {
                react: "React",
                "react-dom": "ReactDOM",
              },
        },
      },
    },
  };
});
