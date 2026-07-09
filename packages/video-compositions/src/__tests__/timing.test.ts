import { describe, expect, it } from "vitest";
import { buildTimeline, chunkWords } from "../timing";
import type { VideoScript } from "../types";

const script: VideoScript = {
  hook: "Your knives are dull because of one mistake.",
  scenes: [
    {
      voiceover: "Most people sharpen at the wrong angle entirely.",
      caption: "The 15° rule",
      visualQuery: "chef sharpening knife",
    },
    {
      voiceover: "Start with a coarse whetstone and finish fine.",
      caption: "Coarse → fine grit",
      visualQuery: "whetstone close up",
    },
  ],
  cta: "Read the full guide, link in the description.",
  socialCaption: "x",
  hashtags: [],
};

describe("buildTimeline", () => {
  it("produces hook + N scenes + cta segments, contiguous from 0", () => {
    const t = buildTimeline(script);
    expect(t.segments.map((s) => s.kind)).toEqual(["hook", "scene", "scene", "cta"]);
    expect(t.segments[0].start).toBe(0);
    for (let i = 1; i < t.segments.length; i++) {
      expect(t.segments[i].start).toBeCloseTo(
        t.segments[i - 1].start + t.segments[i - 1].duration,
        6,
      );
    }
    expect(t.totalDuration).toBeCloseTo(
      t.segments.reduce((a, s) => a + s.duration, 0),
      6,
    );
  });

  it("scales segment estimates to measured Whisper duration", () => {
    const words = [
      { word: "Your", start: 0, end: 0.4 },
      { word: "knives", start: 0.4, end: 30 },
    ];
    const t = buildTimeline(script, words);
    // Measured total (30s + padding) should stretch the timeline.
    expect(t.totalDuration).toBeGreaterThan(29);
    expect(t.words).toEqual(words);
  });

  it("estimates word timings inside each segment when no Whisper data", () => {
    const t = buildTimeline(script);
    for (const w of t.words) expect(w.end).toBeGreaterThan(w.start);
    // Words never leak past the timeline end.
    expect(t.words[t.words.length - 1].end).toBeLessThanOrEqual(t.totalDuration + 1e-6);
  });
});

describe("buildTimeline chunks", () => {
  // Regression (2026-07-09 template QA): a caption chunk read
  // "entirely. Start with a coarse" — the tail of scene 1's voiceover
  // glued to scene 2's opening because chunking ignored segment cuts.
  it("never produces a chunk that spans a segment boundary", () => {
    const t = buildTimeline(script);
    for (const chunk of t.chunks) {
      const owner = t.segments.find(
        (s) => chunk.start >= s.start - 1e-4 && chunk.start < s.start + s.duration,
      );
      expect(owner).toBeDefined();
      expect(chunk.end).toBeLessThanOrEqual(owner!.start + owner!.duration + 1e-4);
    }
  });
});

describe("chunkWords", () => {
  it("groups words into ≤N-word chunks spanning their timings", () => {
    const words = Array.from({ length: 9 }, (_, i) => ({
      word: `w${i}`,
      start: i,
      end: i + 1,
    }));
    const chunks = chunkWords(words, 4);
    expect(chunks.map((c) => c.text.split(" ").length)).toEqual([4, 4, 1]);
    expect(chunks[0].start).toBe(0);
    expect(chunks[0].end).toBe(4);
  });
});
