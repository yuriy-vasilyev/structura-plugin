/**
 * Tests for the topic-chip merge/dedup used by the interview's "What
 * topics or niches…" question.
 *
 * Why this exists: the topic question gathers TOPIC SEEDS for keyword
 * discovery, so it is fed by the AI `topic_chips` pass ONLY. It is
 * deliberately NOT prefilled from the brand keyword bank
 * (`seoIntelSettings.targetKeywords`) — those are final search terms, a
 * different granularity than seeds, and mixing them in made the step read
 * like the Keywords step (the 2026-06-04 seeding was reverted here).
 *
 * What this pins:
 *   - `mergeTopicChips` keeps any leading chips, appends only novel
 *     chips, and dedupes case-insensitively on label AND value (the AI
 *     routinely re-suggests near-dupes within one batch).
 *   - The production call passes `[]` seeds (AI-only), so the no-seed
 *     path is the live one.
 */

import { describe, expect, it } from "vitest";
import {
  mergeTopicChips,
  type ChipOption,
} from "../components/interview/GuidedInterview";

const chip = (label: string, value: string): ChipOption => ({ label, value });

describe("mergeTopicChips", () => {
  const seeds = [
    chip("wordpress ai content", "wordpress_ai_content"),
    chip("automated blog posts", "automated_blog_posts"),
  ];

  it("keeps seeds first and appends novel AI chips after them", () => {
    const merged = mergeTopicChips(seeds, [
      chip("Headless WordPress", "headless_wordpress"),
    ]);
    expect(merged.map((c) => c.value)).toEqual([
      "wordpress_ai_content",
      "automated_blog_posts",
      "headless_wordpress",
    ]);
  });

  it("drops an AI chip whose VALUE collides with a seeded keyword", () => {
    // The common case: the AI re-suggests the site's own target keyword
    // with a prettier label but the same snake_case value.
    const merged = mergeTopicChips(seeds, [
      chip("WordPress AI Content Strategies", "wordpress_ai_content"),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("drops an AI chip whose LABEL matches a seed case-insensitively", () => {
    const merged = mergeTopicChips(seeds, [
      chip("Automated Blog Posts", "automated_blog_posting"),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("dedupes within the AI batch itself", () => {
    const merged = mergeTopicChips(seeds, [
      chip("Site Speed", "site_speed"),
      chip("site speed", "site_speed_optimization"),
    ]);
    expect(merged.map((c) => c.value)).toEqual([
      "wordpress_ai_content",
      "automated_blog_posts",
      "site_speed",
    ]);
  });

  it("is AI-only with empty seeds — the live topic-question path", () => {
    const merged = mergeTopicChips(
      [],
      [
        chip("Headless WordPress", "headless_wordpress"),
        chip("headless wordpress", "headless_wp"),
      ]
    );
    // Intra-batch dedup still applies (label collision), seeds contribute
    // nothing because the topic step no longer prefills from the bank.
    expect(merged).toEqual([chip("Headless WordPress", "headless_wordpress")]);
  });

  it("returns seeds untouched when the AI pass yields nothing", () => {
    expect(mergeTopicChips(seeds, [])).toEqual(seeds);
  });
});
