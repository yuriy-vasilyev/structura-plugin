/**
 * The picker model (specs/visual-signatures.md §2, §7; handoff §2, §3.4,
 * §3.5): selections and the `signature` they save, plan locks, the
 * builder's chip and hex rules, and the "Draft from my site" parse.
 */
import { describe, expect, it } from "vitest";
import { VISUAL_SIGNATURES } from "@structura/visual-signatures";

import {
  addPhrase,
  curatedSelection,
  customDraftFromChoice,
  hasPhrase,
  houseSelection,
  isBuilderLocked,
  isLibraryCardLocked,
  missingCustomFields,
  newCustomDraft,
  normaliseHexInput,
  orderedSignatures,
  parseDraftedStyle,
  removePhrase,
  sameSelection,
  selectionForCard,
  selectionFromChoice,
  signatureForSelection,
} from "../signatureModel";

const custom = {
  kind: "custom" as const,
  name: "Northfield sketchbook",
  medium: "illustration" as const,
  technique: "Black ink linework",
  motifs: "Plants and leaves",
  composition: "One hero object, centred",
  avoid: "Text and lettering",
};

describe("selections", () => {
  it("reads a stored choice; no signature is the free prompt", () => {
    expect(selectionFromChoice(undefined)).toEqual({ kind: "free" });
    expect(selectionFromChoice(null)).toEqual({ kind: "free" });
    expect(selectionFromChoice({ kind: "curated", id: "paper-cut", version: 1 })).toEqual({
      kind: "curated",
      id: "paper-cut",
      version: 1,
    });
    expect(selectionFromChoice(custom)).toEqual({ kind: "custom" });
  });

  it("starts from the house signature at its library version", () => {
    expect(houseSelection()).toEqual({ kind: "curated", id: "editorial-reportage", version: 1 });
  });

  it("compares curated selections by id and version", () => {
    expect(
      sameSelection(curatedSelection("paper-cut"), { kind: "curated", id: "paper-cut", version: 1 })
    ).toBe(true);
    expect(
      sameSelection(curatedSelection("paper-cut"), { kind: "curated", id: "paper-cut", version: 2 })
    ).toBe(false);
    expect(sameSelection({ kind: "free" }, { kind: "free" })).toBe(true);
    expect(sameSelection({ kind: "free" }, { kind: "custom" })).toBe(false);
    expect(sameSelection(null, { kind: "free" })).toBe(false);
  });

  it("re-picking the card in use keeps the version the preset pinned", () => {
    const bound = { kind: "curated" as const, id: "paper-cut" as const, version: 0 };
    expect(selectionForCard("paper-cut", bound)).toBe(bound);
    expect(selectionForCard("ink-and-fill", bound)).toEqual(curatedSelection("ink-and-fill"));
  });

  it("saves a curated choice, a trimmed custom one, and null for the free prompt", () => {
    expect(signatureForSelection(curatedSelection("miniature-world"), null)).toEqual({
      kind: "curated",
      id: "miniature-world",
      version: 1,
    });
    const draft = customDraftFromChoice(custom)!;
    draft.name = "  Sketchbook  ";
    expect(signatureForSelection({ kind: "custom" }, draft)).toEqual({
      ...custom,
      name: "Sketchbook",
    });
    expect(signatureForSelection({ kind: "free" }, draft)).toBeNull();
    // "Your own" with no draft behind it has nothing to save.
    expect(signatureForSelection({ kind: "custom" }, null)).toBeNull();
  });
});

describe("custom drafts", () => {
  it("a new draft carries the site's name, photography and empty fields", () => {
    expect(newCustomDraft("Northfield Garden")).toEqual({
      name: "Northfield Garden",
      medium: "photography",
      fields: { technique: "", motifs: "", composition: "", avoid: "" },
      drafted: {},
    });
  });

  it("reads a stored custom signature without Drafted marks", () => {
    expect(customDraftFromChoice(custom)).toEqual({
      name: custom.name,
      medium: "illustration",
      fields: {
        technique: custom.technique,
        motifs: custom.motifs,
        composition: custom.composition,
        avoid: custom.avoid,
      },
      drafted: {},
    });
    expect(customDraftFromChoice({ kind: "curated", id: "paper-cut", version: 1 })).toBeNull();
  });

  it("lists what a save still needs, name first", () => {
    const draft = newCustomDraft("   ");
    draft.fields.technique = "Ink";
    expect(missingCustomFields(draft)).toEqual(["name", "motifs", "composition", "avoid"]);
    expect(missingCustomFields(customDraftFromChoice(custom)!)).toEqual([]);
  });
});

describe("plan locks (spec §7)", () => {
  const house = VISUAL_SIGNATURES.find((s) => s.house)!;
  const library = VISUAL_SIGNATURES.find((s) => !s.house)!;

  it.each(["free", "none", undefined])(
    "%s: the house signature stays open, the rest and Your own lock",
    (plan) => {
      expect(isLibraryCardLocked(house, plan)).toBe(false);
      expect(isLibraryCardLocked(library, plan)).toBe(true);
      expect(isBuilderLocked(plan)).toBe(true);
    }
  );

  it.each(["byok", "cloud"])("%s: everything is open", (plan) => {
    expect(isLibraryCardLocked(library, plan)).toBe(false);
    expect(isBuilderLocked(plan)).toBe(false);
  });
});

describe("card order", () => {
  it("keeps the library order on the page", () => {
    expect(orderedSignatures().map((s) => s.id)).toEqual([
      "editorial-reportage",
      "still-life-studio",
      "paper-cut",
      "ink-and-fill",
      "miniature-world",
      "isometric-glass",
    ]);
  });

  it("moves the wizard's pick to the front", () => {
    expect(orderedSignatures("paper-cut").map((s) => s.id)).toEqual([
      "paper-cut",
      "editorial-reportage",
      "still-life-studio",
      "ink-and-fill",
      "miniature-world",
      "isometric-glass",
    ]);
  });
});

describe("builder chips (handoff §3.5)", () => {
  it("adds the first phrase as the whole text, later ones after a comma", () => {
    expect(addPhrase("", "Soft window light")).toBe("Soft window light");
    expect(addPhrase("Soft window light", "Shallow depth of field")).toBe(
      "Soft window light, shallow depth of field"
    );
    expect(addPhrase("Soft window light, ", "Muted film colour")).toBe(
      "Soft window light, muted film colour"
    );
  });

  it("keeps the phrase's case for German", () => {
    expect(addPhrase("Weiches Fensterlicht", "Text und Schrift", true)).toBe(
      "Weiches Fensterlicht, Text und Schrift"
    );
  });

  it("is on while the phrase appears, typed by hand or in another case", () => {
    expect(hasPhrase("Soft window light, shallow depth of field", "Shallow depth of field")).toBe(
      true
    );
    expect(hasPhrase("soft WINDOW light", "Soft window light")).toBe(true);
    expect(hasPhrase("Soft window light", "Seamless backdrop")).toBe(false);
  });

  it("removes the phrase and the comma that joined it", () => {
    expect(
      removePhrase(
        "Soft window light, shallow depth of field, muted film colour",
        "Shallow depth of field"
      )
    ).toBe("Soft window light, muted film colour");
    expect(removePhrase("Soft window light, shallow depth of field", "Soft window light")).toBe(
      "shallow depth of field"
    );
    expect(removePhrase("Soft window light", "Soft window light")).toBe("");
    // A phrase with its own comma comes out whole.
    expect(
      removePhrase(
        "Plain background, one hero object, centred, eye level",
        "One hero object, centred"
      )
    ).toBe("Plain background, eye level");
    expect(removePhrase("Ink", "Gradients")).toBe("Ink");
  });
});

describe("hex input (handoff §3.4)", () => {
  it.each([
    ["#2f6b4f", "#2F6B4F"],
    ["2F6B4F", "#2F6B4F"],
    ["#abc", "#AABBCC"],
    ["  #C8553D ", "#C8553D"],
  ])("%s → %s", (input, expected) => {
    expect(normaliseHexInput(input)).toBe(expected);
  });

  it.each(["", "#12", "#12345", "#GGGGGG", "red", "#1234567"])("refuses %j", (input) => {
    expect(normaliseHexInput(input)).toBeNull();
  });
});

describe("Draft from my site", () => {
  it("takes technique from STYLE, LIGHTING and TEXTURE, avoid from AVOID, and drops PALETTE", () => {
    const blob = [
      "STYLE: Loose watercolour illustration with visible paper grain.",
      "PALETTE: #2F6B4F dominant, #C8553D accent; earthy and warm.",
      "LIGHTING: Soft, diffuse daylight with no hard shadows.",
      "TEXTURE & FINISH: Cold-press paper texture, matte finish.",
      "AVOID: text, typography, watermarks, logos, busy clutter.",
    ].join("\n");

    expect(parseDraftedStyle(blob)).toEqual({
      technique:
        "Loose watercolour illustration with visible paper grain. Soft, diffuse daylight with no hard shadows. Cold-press paper texture, matte finish.",
      avoid: "text, typography, watermarks, logos, busy clutter.",
    });
  });

  it("reads labels on one line and in any case", () => {
    expect(
      parseDraftedStyle("style: Ink. lighting: Flat. Texture&Finish: Grain. avoid: Text.")
    ).toEqual({
      technique: "Ink. Flat. Grain.",
      avoid: "Text.",
    });
  });

  it("treats a blob without labels as technique", () => {
    expect(parseDraftedStyle("  Clean editorial photography  ")).toEqual({
      technique: "Clean editorial photography",
      avoid: "",
    });
  });
});
