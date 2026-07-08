/**
 * Video channel constants + pure helpers.
 *
 * Pins the wire-adjacent vocabulary the Video channel UI is built on:
 *   - the six v1 voices and three style presets (ids are what rides the
 *     `video_voice` / `video_style` wire fields — a typo here is a dead
 *     save, so the ids are asserted verbatim);
 *   - the CDN sample-URL shape;
 *   - the row-state resolver, especially the client-side "expired"
 *     derivation (status "ready" + expiresAt in the past) the cloud never
 *     sends explicitly;
 *   - the meta-line formatters (duration / size).
 *
 * Design handoff: marketing/design_handoff_video_channel/README.md §2–§3.
 */

import { describe, expect, it } from "vitest";
import {
  CAPTION_LIMITS,
  DEFAULT_VIDEO_STYLE,
  DEFAULT_VIDEO_VOICE,
  VIDEO_INTEGRATION_ID,
  VIDEO_STYLE_PRESETS,
  VIDEO_VOICES,
  captionHook,
  formatVideoBytes,
  formatVideoDuration,
  isSocialPackages,
  parseCaptionBlocks,
  resolveVideoRowState,
  videoStyleById,
  videoVoiceById,
  voiceSampleUrl,
} from "../videoChannel";
import type { VideoJob, VideoSocialPackages } from "../types";

const readyJob = (overrides: Partial<VideoJob> = {}): VideoJob => ({
  jobId: "job-1",
  status: "ready",
  downloadUrl: "https://cdn.example/render.mp4",
  durationSec: 47,
  bytes: 26004889,
  expiresAt: "2099-01-01T00:00:00Z",
  ...overrides,
});

describe("video channel constants", () => {
  it("exposes the video integration id", () => {
    expect(VIDEO_INTEGRATION_ID).toBe("video");
  });

  it("ships the six v1 voices with their wire ids in order", () => {
    expect(VIDEO_VOICES.map((v) => v.id)).toEqual([
      "ava",
      "marcus",
      "lena",
      "oliver",
      "priya",
      "noah",
    ]);
    // Names/descriptors are proper nouns + tone fragments — untranslated
    // by design, so asserting the literals is safe.
    expect(videoVoiceById("marcus")).toMatchObject({
      name: "Marcus",
      descriptor: "Deep · Authoritative",
      sexTag: "M",
    });
  });

  it("ships the three v1 style presets with their wire ids", () => {
    expect(VIDEO_STYLE_PRESETS.map((p) => p.id)).toEqual([
      "clean",
      "bold",
      "kinetic",
    ]);
    expect(videoStyleById("kinetic")).toMatchObject({
      name: "Kinetic",
      descriptor: "Word-by-word motion",
    });
  });

  it("defaults to Ava / Clean — the install-time defaults", () => {
    expect(DEFAULT_VIDEO_VOICE).toBe("ava");
    expect(DEFAULT_VIDEO_STYLE).toBe("clean");
    // Unknown / missing ids fall back to the defaults so a newer cloud
    // voice id never crashes the row or the modal.
    expect(videoVoiceById(undefined).id).toBe("ava");
    expect(videoVoiceById("someone-new").id).toBe("ava");
    expect(videoStyleById("holo").id).toBe("clean");
  });

  it("builds voice sample URLs on the releases CDN", () => {
    expect(voiceSampleUrl("lena")).toBe(
      "https://storage.googleapis.com/structura-releases/assets/voice-samples/lena.mp3",
    );
  });
});

describe("resolveVideoRowState", () => {
  it("passes rendering / failed / skipped_quota through verbatim", () => {
    expect(resolveVideoRowState(readyJob({ status: "rendering" }))).toBe(
      "rendering",
    );
    expect(resolveVideoRowState(readyJob({ status: "failed" }))).toBe("failed");
    expect(resolveVideoRowState(readyJob({ status: "skipped_quota" }))).toBe(
      "skipped_quota",
    );
  });

  it("keeps a ready job ready while the download link is still live", () => {
    const now = Date.parse("2026-07-02T00:00:00Z");
    expect(
      resolveVideoRowState(readyJob({ expiresAt: "2026-07-09T00:00:00Z" }), now),
    ).toBe("ready");
  });

  it("derives 'expired' client-side from ready + expiresAt in the past", () => {
    const now = Date.parse("2026-07-02T00:00:00Z");
    expect(
      resolveVideoRowState(readyJob({ expiresAt: "2026-07-01T00:00:00Z" }), now),
    ).toBe("expired");
  });

  it("treats a ready job without expiresAt as still ready", () => {
    expect(resolveVideoRowState(readyJob({ expiresAt: undefined }))).toBe(
      "ready",
    );
  });
});

describe("formatters", () => {
  it("formats durations as m:ss", () => {
    expect(formatVideoDuration(47)).toBe("0:47");
    expect(formatVideoDuration(125)).toBe("2:05");
  });

  it("formats byte counts as one-decimal MB", () => {
    expect(formatVideoBytes(26004889)).toBe("24.8 MB");
  });
});

describe("caption package helpers", () => {
  // Platform-captions handoff: the wire ships fully-composed strings with
  // \n\n between blocks and NO structured hooks field — the display roles
  // (hook emphasis, hashtag run, counter window) are derived client-side.
  const caption =
    "Still hand-writing every landing page?\n\nProgrammatic SEO pairs keyword clustering with page templates.\n\nWould your team template it?\nFull breakdown — link in bio\n\n#programmaticseo #saas";

  it("splits a composed caption on \\n\\n and marks the first block as the hook", () => {
    const blocks = parseCaptionBlocks(caption, { hookFirst: true });
    expect(blocks.map((b) => b.kind)).toEqual([
      "hook",
      "body",
      "body",
      "hashtags",
    ]);
    expect(blocks[0].text).toBe("Still hand-writing every landing page?");
    // Single \n breaks (CTA + "link in bio") stay inside one block.
    expect(blocks[2].text).toBe(
      "Would your team template it?\nFull breakdown — link in bio",
    );
  });

  it("classifies blocks starting with # as the hashtag run", () => {
    expect(parseCaptionBlocks("Body text.\n\n#one #two")).toEqual([
      { kind: "body", text: "Body text." },
      { kind: "hashtags", text: "#one #two" },
    ]);
  });

  it("marks no hook unless asked — the Shorts description has none", () => {
    const blocks = parseCaptionBlocks(
      "Summary of the post.\n\nFull article: https://acme.io/p\n\n#a #b",
    );
    expect(blocks.map((b) => b.kind)).toEqual(["body", "body", "hashtags"]);
  });

  it("drops empty blocks from a sloppy composer", () => {
    expect(parseCaptionBlocks("Hook.\n\n\n\nBody.", { hookFirst: true })).toEqual([
      { kind: "hook", text: "Hook." },
      { kind: "body", text: "Body." },
    ]);
  });

  it("captionHook returns the first block — the counter's window", () => {
    expect(captionHook(caption)).toBe("Still hand-writing every landing page?");
    expect(captionHook("")).toBe("");
  });

  it("pins the advisory limits: Shorts title /100, TikTok hook /100, Reels hook /125", () => {
    expect(CAPTION_LIMITS).toEqual({
      shortsTitle: 100,
      tiktokHook: 100,
      reelsHook: 125,
    });
  });
});

describe("isSocialPackages", () => {
  const valid: VideoSocialPackages = {
    shorts: { title: "t", description: "d" },
    tiktok: { caption: "c" },
    reels: { caption: "c" },
  };

  it("accepts the full three-platform shape", () => {
    expect(isSocialPackages(valid)).toBe(true);
  });

  it("rejects absent, partial, and non-string shapes so a malformed wire falls back to the legacy row", () => {
    expect(isSocialPackages(undefined)).toBe(false);
    expect(isSocialPackages(null)).toBe(false);
    expect(isSocialPackages("captions")).toBe(false);
    expect(isSocialPackages({ shorts: valid.shorts })).toBe(false);
    expect(isSocialPackages({ ...valid, tiktok: { caption: 42 } })).toBe(false);
    expect(isSocialPackages({ ...valid, reels: {} })).toBe(false);
  });
});
