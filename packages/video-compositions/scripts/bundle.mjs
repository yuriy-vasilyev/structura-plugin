/**
 * Build the self-contained Remotion webpack bundle the cloud render
 * worker serves compositions from (functions/remotion-bundle).
 *
 * Runs in the functions predeploy chain (see firebase.json) so the
 * bundle always matches the deployed compositions — functions/ cannot
 * depend on this workspace package directly (it deploys standalone),
 * the bundle is the handoff artifact.
 */

import { bundle } from "@remotion/bundler";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const entryPoint = path.join(here, "..", "src", "index.ts");
const outDir = path.join(here, "..", "..", "..", "functions", "remotion-bundle");

const location = await bundle({
  entryPoint,
  outDir,
  onProgress: (p) => {
    if (p % 25 === 0) console.log(`[remotion-bundle] ${p}%`);
  },
});

console.log(`[remotion-bundle] built → ${location}`);
