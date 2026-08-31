import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

/**
 * Source-file subpath exports must resolve under CommonJS `require`
 * conditions, not only `import`. Playwright loads spec dependencies through
 * Node's CJS resolver, so an exports entry without a `default` condition
 * makes any e2e spec that touches the subpath die with
 * ERR_PACKAGE_PATH_NOT_EXPORTED — www CI, run 29652208533 (2026-07-18),
 * the first CI contact of e2e/pricing.spec.ts → @structura/ui/pricing.
 */
const requireCjs = createRequire(import.meta.url);

describe("package export conditions", () => {
  it.each(["@structura/ui/pricing", "@structura/ui/search-perf"])(
    "%s resolves for CommonJS consumers (Playwright specs)",
    (subpath) => {
      expect(() => requireCjs.resolve(subpath)).not.toThrow();
    },
  );
});
