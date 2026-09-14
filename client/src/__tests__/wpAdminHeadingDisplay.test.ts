/**
 * wp-admin cascade guard: display utilities on headings need the `!`
 * modifier.
 *
 * WP admin core CSS (load-styles.php) ships an UNLAYERED
 * `h1,h2,h3,h4,h5,h6 { display: block }` rule. Our Tailwind v4 utilities
 * live in `@layer utilities`, and unlayered author rules beat layered ones
 * regardless of specificity — so a bare `flex` / `grid` / `inline-flex`
 * on a heading silently renders as `display: block` inside wp-admin.
 * First seen 2026-09-04: the GSC connect dialog's Google "G" glyph
 * stacked above the title because `Dialog.Title` (renders an <h2>) used
 * `flex` instead of `flex!`.
 *
 * jsdom can't see wp-admin's stylesheet and the affected modals need real
 * OAuth state, so this pins the rule at the source level instead: any
 * display utility on an <h1>–<h6> or Dialog.Title (an <h2>) in a static
 * className string must carry the `!` modifier. Same per-surface rule as
 * the established `m-0!` margin convention — client/ only, never web/.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(__dirname, "..");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      out.push(...tsxFiles(full));
    } else if (entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/** Display utilities WP's heading rule silently overrides. */
const DISPLAY_UTILITY = "(?:inline-)?(?:flex|grid|block)";

/**
 * A static className opener on an element whose tag WP styles as a
 * heading. Best-effort: only literal `className="…"` strings are
 * scanned (cn()/template composition is rare on headings and would
 * need a real parser).
 */
const HEADING_OPENERS = [
  // <h1 … className="…flex…">
  /<h[1-6][^>]*className="([^"]*)"/g,
  // <Dialog.Title className="…"> — Headless UI renders an <h2>.
  /<Dialog\.Title[^>]*className="([^"]*)"/g,
];

const bareDisplayToken = new RegExp(`(?:^| )${DISPLAY_UTILITY}(?= |$)`);

describe("wp-admin heading display utilities", () => {
  it("headings never use a display utility without the `!` modifier", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(SRC_ROOT)) {
      const source = readFileSync(file, "utf8");
      for (const opener of HEADING_OPENERS) {
        opener.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = opener.exec(source)) !== null) {
          if (bareDisplayToken.test(match[1])) {
            const line = source.slice(0, match.index).split("\n").length;
            offenders.push(`${file.replace(SRC_ROOT, "src")}:${line} → ${match[0]}`);
          }
        }
      }
    }
    expect(
      offenders,
      "Bare display utilities on headings lose to wp-admin's unlayered " +
        "`h1..h6 { display: block }` — use `flex!` / `grid!` / `inline-flex!`.",
    ).toEqual([]);
  });
});
