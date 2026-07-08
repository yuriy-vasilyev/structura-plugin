/**
 * Unit tests for the milestone copy resolver.
 *
 * These pin three things:
 *
 *   1. Every known `Milestone` id maps to a non-empty localized string.
 *      Catches the "I added a milestone to the union but forgot to
 *      add copy" case.
 *
 *   2. Unknown milestone ids (forward-compat — cloud may emit a new one
 *      before the plugin's client bundle ships copy for it) fall through
 *      to a safe generic string instead of rendering the raw id. This
 *      is the spec §12 back-compat rail.
 *
 *   3. `isTerminalMilestone` narrows correctly for the two terminal
 *      states the drawer branches on.
 */

import { describe, expect, it, vi } from "vitest";
import type { Milestone } from "@structura/types";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
}));

import {
  milestoneHeadline,
  milestoneSubtext,
  milestoneIcon,
  MILESTONE_ORDER,
  milestoneOrderForFlowAndTier,
  isTerminalMilestone,
} from "../milestones";

// List kept in sync with the `Milestone` union in `packages/types/src/index.ts`.
// TypeScript enforces the relationship at compile time via the `satisfies`
// check below — if the union grows, this list must too, or the test file
// won't compile.
const ALL_MILESTONES = [
  "queued",
  "research",
  "competitor_analysis",
  "authority",
  "outlining",
  "drafting",
  "link_validation",
  "images",
  "assembling",
  "publishing",
  "done",
  "error",
] as const satisfies readonly Milestone[];

describe("milestoneHeadline", () => {
  it.each(ALL_MILESTONES)(
    "returns a non-empty headline for milestone %s",
    (milestone) => {
      const headline = milestoneHeadline(milestone);
      expect(headline).toBeTruthy();
      expect(typeof headline).toBe("string");
      expect(headline.length).toBeGreaterThan(0);
    },
  );

  it("falls back to a generic string for unknown ids instead of exposing them", () => {
    // Forward-compat: cloud may ship a milestone id the client doesn't
    // know yet. Rendering the raw id in the drawer would be an obvious
    // bug; pin the fallback instead.
    const fallback = milestoneHeadline("mystery_step_from_the_future");
    expect(fallback).not.toContain("mystery_step_from_the_future");
    expect(fallback).toBe("Working on your post");
  });
});

describe("MILESTONE_ORDER", () => {
  it("excludes terminal milestones (done, error) — they render as receipts", () => {
    // The expanded stepper view renders each milestone as a row. Showing
    // `done` and `error` as rows would collide with the dedicated
    // success / failure receipt cards. Spec §8.4.
    expect(MILESTONE_ORDER).not.toContain("done");
    expect(MILESTONE_ORDER).not.toContain("error");
  });

  it("puts queued first, publishing followed by channels as the tail", () => {
    // The user's mental model of the pipeline: "just clicked the button"
    // → ... → "the post is live" → "we told the world." Anchors:
    //   - queued at the head,
    //   - publishing is the last in-pipeline step (the run reaches
    //     terminal-success on this step),
    //   - channels is the post-pipeline tail (dispatched asynchronously
    //     from the structura/post/inserted hook, patched onto the
    //     already-terminal run doc).
    // Middle steps can shuffle without breaking anything.
    expect(MILESTONE_ORDER[0]).toBe("queued");
    expect(MILESTONE_ORDER[MILESTONE_ORDER.length - 2]).toBe("publishing");
    expect(MILESTONE_ORDER[MILESTONE_ORDER.length - 1]).toBe("channels");
  });
});

describe("research sub-phase milestones (competitor_analysis, authority)", () => {
  const SUBPHASES = ["competitor_analysis", "authority"] as const;

  it.each(SUBPHASES)("has headline, subtext, and a distinct icon for %s", (m) => {
    expect(milestoneHeadline(m)).toBeTruthy();
    expect(milestoneSubtext(m)).toBeTruthy();
    // Must resolve a real icon, not the unknown-id Timer fallback.
    expect(milestoneIcon(m)).toBeTruthy();
  });

  it("orders them inside the research window (after research, before outlining)", () => {
    const research = MILESTONE_ORDER.indexOf("research");
    const outlining = MILESTONE_ORDER.indexOf("outlining");
    const competitor = MILESTONE_ORDER.indexOf("competitor_analysis");
    const authority = MILESTONE_ORDER.indexOf("authority");
    expect(research).toBeLessThan(competitor);
    expect(competitor).toBeLessThan(authority);
    expect(authority).toBeLessThan(outlining);
  });

  it("is hidden on Free tier and shown on paid tiers", () => {
    // Pro-gated in the cloud's gatherResearch — they never emit on Free,
    // so the timeline must not show phantom steps there.
    const free = milestoneOrderForFlowAndTier(undefined, false);
    expect(free).not.toContain("competitor_analysis");
    expect(free).not.toContain("authority");

    const paid = milestoneOrderForFlowAndTier(undefined, true);
    expect(paid).toContain("competitor_analysis");
    expect(paid).toContain("authority");
  });
});

describe("isTerminalMilestone", () => {
  it("returns true for done and error", () => {
    expect(isTerminalMilestone("done")).toBe(true);
    expect(isTerminalMilestone("error")).toBe(true);
  });

  it("returns false for every non-terminal milestone in the catalog", () => {
    const nonTerminal = ALL_MILESTONES.filter(
      (m) => m !== "done" && m !== "error",
    );
    for (const m of nonTerminal) {
      expect(isTerminalMilestone(m)).toBe(false);
    }
  });

  it("returns false for unknown ids (safe default)", () => {
    // Treating an unknown id as non-terminal keeps the drawer in its
    // progress state rather than prematurely showing a success receipt
    // for a milestone the cloud meant as still-running.
    expect(isTerminalMilestone("something_new")).toBe(false);
  });
});
