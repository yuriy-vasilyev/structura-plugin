import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import externalGlobals from "rollup-plugin-external-globals";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Maps external packages to their WordPress window globals during Vite dev serve.
 * In production, rollup-plugin-external-globals handles this, but it doesn't
 * run during `vite dev`. This plugin intercepts bare imports and returns a
 * virtual module that re-exports from the window global instead.
 */
const wpExternalsDevPlugin = () => {
  const globals = {
    react: "window.wp.element",
    "react-dom": "window.wp.element",
    "react/jsx-runtime": "window.wp.element",
    "react/jsx-dev-runtime": "window.wp.element",
    "@wordpress/element": "window.wp.element",
    "@wordpress/i18n": "window.wp.i18n",
    "@wordpress/api-fetch": "window.wp.apiFetch",
    "@wordpress/components": "window.wp.components",
    "@wordpress/url": "window.wp.url",
  };

  const PREFIX = "\0wp-external:";

  return {
    name: "wp-externals-dev",
    enforce: "pre",
    apply: "serve", // Only active during dev

    resolveId(source) {
      if (globals[source] !== undefined) {
        return PREFIX + source;
      }
    },

    load(id) {
      if (!id.startsWith(PREFIX)) return;
      const source = id.slice(PREFIX.length);
      const globalPath = globals[source];

      // jsx-runtime needs a shim: wp.element has createElement but not jsx/jsxs
      if (source === "react/jsx-runtime" || source === "react/jsx-dev-runtime") {
        return [
          `const el = window.wp.element;`,
          `export const Fragment = el.Fragment;`,
          `export const jsx = el.createElement;`,
          `export const jsxs = el.createElement;`,
          `export const jsxDEV = el.createElement;`,
          `export default { jsx: el.createElement, jsxs: el.createElement, jsxDEV: el.createElement, Fragment: el.Fragment };`,
        ].join("\n");
      }

      // For everything else, re-export every own property of the window global
      // so that any named import (Component, PureComponent, etc.) resolves.
      // Exhaustively list all known exports per package so any named
      // import from third-party deps resolves correctly.
      return [
        `const g = ${globalPath};`,
        `export default g;`,
        ...(() => {
          const react18 = [
            "Children", "Component", "Fragment", "Profiler", "PureComponent",
            "StrictMode", "Suspense",
            "__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED",
            "act", "cloneElement", "createContext", "createElement",
            "createFactory", "createRef",
            "forwardRef", "isValidElement", "lazy", "memo",
            "startTransition", "unstable_act", "use", "useActionState",
            "useCallback", "useContext", "useDebugValue", "useDeferredValue",
            "useEffect", "useId", "useImperativeHandle", "useInsertionEffect",
            "useLayoutEffect", "useMemo", "useOptimistic", "useReducer",
            "useRef", "useState", "useSyncExternalStore", "useTransition",
            "version",
          ];
          const reactDom = [
            "createPortal", "createRoot", "findDOMNode", "flushSync",
            "hydrate", "hydrateRoot", "render", "unmountComponentAtNode",
            "unstable_batchedUpdates", "version",
            "__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED",
          ];
          const wpElement = [...new Set([...react18, ...reactDom,
            "RawHTML", "Platform", "renderToString", "concatChildren",
            "switchChildrenNodeName",
          ])];
          const wpI18n = [
            "__", "_n", "_x", "_nx", "sprintf", "isRTL",
            "setLocaleData", "getLocaleData", "resetLocaleData",
            "subscribe", "hasTranslation",
          ];
          const wpUrl = [
            "addQueryArgs", "buildQueryString", "cleanForSlug",
            "filterURLForDisplay", "getAuthority", "getFilename",
            "getFragment", "getPath", "getPathAndQueryString",
            "getProtocol", "getQueryArg", "getQueryArgs", "getQueryString",
            "hasQueryArg", "isEmail", "isURL", "isValidAuthority",
            "isValidFragment", "isValidPath", "isValidProtocol",
            "isValidQueryString", "normalizePath", "prependHTTP",
            "removeQueryArgs", "safeDecodeURI", "safeDecodeURIComponent",
          ];
          const map = {
            react: react18,
            "react-dom": reactDom,
            "@wordpress/element": wpElement,
            "@wordpress/i18n": wpI18n,
            "@wordpress/url": wpUrl,
            "@wordpress/api-fetch": [],
            "@wordpress/components": [],
          };
          return (map[source] || []).length
            ? [`export const { ${(map[source] || []).join(", ")} } = g;`]
            : [];
        })(),
      ].join("\n");
    },
  };
};

// Helper: Generates the structura.asset.php file so WP knows what to load
const writeAssetFile = () => ({
  name: "write-asset-file",
  writeBundle(options, bundle) {
    const assets = Object.values(bundle);

    const jsFile = assets.find((file) => file.type === "chunk" && file.isEntry);

    if (jsFile) {
      const deps = ["wp-element", "wp-i18n", "wp-api-fetch", "wp-components", "wp-url"];

      // Use renderedHash for the version string
      const version = jsFile.renderedHash || Date.now().toString();

      const phpContent = `<?php return array('dependencies' => array('${deps.join("', '")}'), 'version' => '${version}');`;

      const outDir = path.resolve(__dirname, "../plugin/assets");
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      fs.writeFileSync(path.join(outDir, "structura.asset.php"), phpContent);
    }
  },
});

export default defineConfig({
  plugins: [wpExternalsDevPlugin(), tailwindcss(), writeAssetFile()],
  esbuild: {
    jsx: "transform",
    jsxFactory: "window.wp.element.createElement",
    jsxFragment: "window.wp.element.Fragment",
  },
  build: {
    outDir: "../plugin/assets",
    emptyOutDir: true,
    minify: false,
    manifest: true,
    rollupOptions: {
      input: "src/index.tsx",
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@wordpress/element",
        "@wordpress/i18n",
        "@wordpress/api-fetch",
        "@wordpress/components",
        "@wordpress/url",
      ],
      output: {
        entryFileNames: "structura.js",
        assetFileNames: "structura.[ext]",
        globals: {
          react: "window.wp.element",
          "react-dom": "window.wp.element",
          "react/jsx-runtime": "window.wp.element",
          "react/jsx-dev-runtime": "window.wp.element",
          "@wordpress/element": "window.wp.element",
          "@wordpress/i18n": "window.wp.i18n",
          "@wordpress/api-fetch": "window.wp.apiFetch",
          "@wordpress/components": "window.wp.components",
          "@wordpress/url": "window.wp.url",
        },
      },
      onwarn(warning, warn) {
        if (warning.code === "MODULE_LEVEL_DIRECTIVE" && warning.message.includes("use client"))
          return;
        warn(warning);
      },
      plugins: [
        externalGlobals({
          react: "window.wp.element",
          "react-dom": "window.wp.element",
          "react/jsx-runtime": "window.wp.element",
          "react/jsx-dev-runtime": "window.wp.element",
          "@wordpress/element": "window.wp.element",
          "@wordpress/i18n": "window.wp.i18n",
          "@wordpress/api-fetch": "window.wp.apiFetch",
          "@wordpress/components": "window.wp.components",
          "@wordpress/url": "window.wp.url",
        }),
      ],
    },
  },
  optimizeDeps: {
    // Tell esbuild to treat WP/React packages as external during dependency
    // pre-bundling. At runtime the bare imports land back in Vite's module
    // graph and are resolved by wpExternalsDevPlugin → window globals.
    esbuildOptions: {
      plugins: [
        {
          name: "wp-externals-prebundle",
          setup(build) {
            const ids = [
              "react",
              "react-dom",
              "react/jsx-runtime",
              "react/jsx-dev-runtime",
              "@wordpress/element",
              "@wordpress/i18n",
              "@wordpress/api-fetch",
              "@wordpress/components",
              "@wordpress/url",
            ];
            const filter = new RegExp(
              `^(${ids.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`,
            );
            build.onResolve({ filter }, (args) => ({
              path: args.path,
              external: true,
            }));
          },
        },
      ],
    },
  },
  server: {
    cors: true,
    strictPort: true,
    port: 3000,
    hmr: {
      host: "localhost",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
