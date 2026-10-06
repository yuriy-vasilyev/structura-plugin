import { describe, expect, it } from "vitest";
import { shouldShowAiLabelReminder, type AiLabelReminderInput } from "../ai-label-reminder";

/** Every condition holds: images on, photography, German, label off. */
const SHOWS: AiLabelReminderInput = {
  imagesEnabled: true,
  presetsLoaded: true,
  preset: { medium: "photography", aiLabel: false },
  language: "de",
  siteLanguage: "en-US",
};

const shows = (over: Partial<AiLabelReminderInput>) =>
  shouldShowAiLabelReminder({ ...SHOWS, ...over });

describe("shouldShowAiLabelReminder", () => {
  it("shows when every condition holds", () => {
    expect(shows({})).toBe(true);
  });

  // Truth table over the four conditions (spec §7): each row flips one.
  it.each<[string, Partial<AiLabelReminderInput>, boolean]>([
    ["images off", { imagesEnabled: false }, false],
    ["illustration", { preset: { medium: "illustration", aiLabel: false } }, false],
    ["3D render", { preset: { medium: "3d_render", aiLabel: false } }, false],
    ["English", { language: "en" }, false],
    ["Swiss German", { language: "de_CH" }, false],
    ["label on", { preset: { medium: "photography", aiLabel: true } }, false],
    ["absent medium reads as photography", { preset: { aiLabel: false } }, true],
    ["absent aiLabel reads as off", { preset: { medium: "photography" } }, true],
    ["no bound preset is the photographic house style", { preset: null }, true],
    ["presets not loaded yet", { presetsLoaded: false }, false],
    ["French", { language: "fr" }, true],
    ["Austrian German", { language: "de_AT" }, true],
  ])("%s → %s", (_name, over, expected) => {
    expect(shows(over)).toBe(expected);
  });

  it("resolves the default sentinel and an empty language to the site's language", () => {
    expect(shows({ language: "default", siteLanguage: "de-AT" })).toBe(true);
    expect(shows({ language: "", siteLanguage: "fr_FR" })).toBe(true);
    expect(shows({ language: null, siteLanguage: "nl" })).toBe(true);
    expect(shows({ language: "default", siteLanguage: "en-US" })).toBe(false);
    expect(shows({ language: "default", siteLanguage: null })).toBe(false);
  });

  it("an explicit campaign language wins over the site's", () => {
    expect(shows({ language: "en", siteLanguage: "de-DE" })).toBe(false);
    expect(shows({ language: "de", siteLanguage: "en-US" })).toBe(true);
  });
});
