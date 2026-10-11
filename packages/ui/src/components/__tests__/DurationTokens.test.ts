/**
 * The theme's motion durations work as utilities. Tailwind 4 has no theme
 * namespace for transition durations, so `--duration-fast` & co. never
 * produced `duration-fast` classes: Button, Card, Checkbox and every
 * Dialog/Transition using them silently fell back to the 150ms default
 * (found 2026-10-09).
 */
import { describe, expect, it } from "vitest";
import { matchedDeclarations } from "./tailwind-rules";

const TOKENS = ["fast", "normal", "slow", "slower"] as const;

describe("theme duration utilities", () => {
  for (const token of TOKENS) {
    it(`duration-${token} sets transition-duration from --duration-${token}`, async () => {
      const el = document.createElement("div");
      el.className = `duration-${token}`;
      expect(await matchedDeclarations(el, "transition-duration")).toEqual([
        `var(--duration-${token})`,
      ]);
      // Set for the `transition*` utilities, which read --tw-duration whatever
      // their order in the stylesheet.
      expect(await matchedDeclarations(el, "--tw-duration")).toEqual([`var(--duration-${token})`]);
    });
  }
});
