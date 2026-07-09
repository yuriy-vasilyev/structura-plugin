/**
 * Realistic default props for Studio preview and test renders — same
 * shape the production adapt step produces (script mirrors the
 * knife-sharpening fixture in functions' edl.test.ts, extended to four
 * scenes).
 *
 * Visuals default to stable placeholder images (picsum) so the preview
 * works offline; paste real Pexels video-file URLs into `visuals` to
 * judge stock-footage templates.
 */

import type { VideoCompositionProps } from "../types";

export const sampleProps: VideoCompositionProps = {
  script: {
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
      {
        voiceover: "Keep the stone soaked so the edge never overheats.",
        caption: "Soak the stone",
        visualQuery: "water pouring on stone",
      },
      {
        voiceover: "Finish on a leather strop for a razor edge.",
        caption: "Strop to finish",
        visualQuery: "leather strop knife",
      },
    ],
    cta: "Read the full guide, link in the description.",
    socialCaption: "Knife sharpening mistakes everyone makes.",
    hashtags: ["#knives", "#sharpening"],
  },
  visuals: [
    { kind: "color" },
    { kind: "image", url: "https://picsum.photos/seed/knife1/1080/1920" },
    { kind: "image", url: "https://picsum.photos/seed/knife2/1080/1920" },
    { kind: "image", url: "https://picsum.photos/seed/knife3/1080/1920" },
    { kind: "image", url: "https://picsum.photos/seed/knife4/1080/1920" },
    { kind: "color" },
  ],
  settings: {
    template: "baseline",
    captionPlacement: "bottom",
    paletteAccent: "#e8590c",
  },
  postTitle: "Knife Sharpening: The Complete Guide to a Razor Edge",
  domain: "jaba-knives.at",
  featuredImageUrl: "https://picsum.photos/seed/knife-hero/1080/1920",
  locale: "en",
};
