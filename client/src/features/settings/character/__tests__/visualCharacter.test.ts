/**
 * The recurring character's model (specs/visual-signatures.md §13; handoff
 * handoffs/recurring-character/README.md §2, §5): which signatures take a
 * character, the sheet's signature ref as the cloud computes it, the checks
 * on a picked file and the pure parts of the browser shrink, in the wp-admin
 * copy of the portal's model. Run for real.
 */
import { describe, expect, it } from "vitest";

import { signatureTakesCharacter } from "@structura/visual-signatures";

import { newCustomDraft, signatureForSelection } from "../../signatures/signatureModel";
import {
  CHARACTER_MAX_FILE_BYTES,
  characterSignatures,
  checkCharacterFile,
  formatMegabytes,
  hasTransparency,
  sameSignatureRef,
  scaledSize,
  shrinkOutputType,
  signatureRefOf,
} from "../visualCharacter";

const file = (name: string, type: string, size = 1024) => ({ name, type, size });

describe("characterSignatures, and which picks take a character (spec §13.2)", () => {
  it("lists the three library signatures that draw a character, in library order", () => {
    expect(characterSignatures().map((s) => s.id)).toEqual([
      "paper-cut",
      "ink-and-fill",
      "miniature-world",
    ]);
  });

  it("takes a character on those cards and on a drawn or rendered custom signature only, as the page asks it", () => {
    const takes = (
      selection: Parameters<typeof signatureForSelection>[0],
      custom = newCustomDraft("Lena")
    ) => signatureTakesCharacter(signatureForSelection(selection, custom));
    expect(takes({ kind: "curated", id: "ink-and-fill", version: 1 })).toBe(true);
    expect(takes({ kind: "curated", id: "editorial-reportage", version: 1 })).toBe(false);
    expect(takes({ kind: "curated", id: "isometric-glass", version: 1 })).toBe(false);
    expect(takes({ kind: "free" })).toBe(false);
    expect(takes({ kind: "custom" })).toBe(false);
    expect(takes({ kind: "custom" }, { ...newCustomDraft("Lena"), medium: "illustration" })).toBe(
      true
    );
    expect(takes({ kind: "custom" }, { ...newCustomDraft("Lena"), medium: "3d_render" })).toBe(
      true
    );
  });
});

describe("signatureRefOf: the same ref as the cloud's signatureRefFor", () => {
  it("is the id and version of a library signature", async () => {
    expect(await signatureRefOf({ kind: "curated", id: "paper-cut", version: 1 })).toEqual({
      kind: "curated",
      id: "paper-cut",
      version: 1,
    });
    expect(await signatureRefOf(null)).toBeNull();
  });

  // Vectors from functions/src/visualSignatures/character.ts signatureRefFor
  // (2026-11-18): a mismatch would show a needed sheet the cloud does not
  // ask for, or miss one it refuses Save for.
  it("hashes a custom signature's medium and four fields, not its name, like the cloud", async () => {
    const ref = await signatureRefOf({
      kind: "custom",
      name: "Pulse sketchbook",
      medium: "illustration",
      technique: "Black ink linework, one flat fill color",
      motifs: "Garden tools",
      composition: "One object, centred",
      avoid: "Text",
    });
    expect(ref).toEqual({
      kind: "custom",
      hash: "8a22e2be13ca448e78f39248f9c6511e0a5556a3212dba86b9e0c0b1de13f82f",
    });
    const renamed = await signatureRefOf({
      kind: "custom",
      name: "Another name",
      medium: "illustration",
      technique: " Black ink linework, one flat fill color ",
      motifs: "Garden tools",
      composition: "One object, centred",
      avoid: "Text",
    });
    expect(renamed).toEqual(ref);
    expect(
      await signatureRefOf({
        kind: "custom",
        name: "Ünïcode",
        medium: "3d_render",
        technique: "Clay „figures“ — soft",
        motifs: "Seeds",
        composition: "Centred",
        avoid: "Logos",
      })
    ).toEqual({
      kind: "custom",
      hash: "e2194e85f1c80764200f2742a80ab2f4f770746112afef33c213794171984168",
    });
  });

  it("compares refs by id and version, or by hash", () => {
    expect(
      sameSignatureRef(
        { kind: "curated", id: "a", version: 1 },
        { kind: "curated", id: "a", version: 1 }
      )
    ).toBe(true);
    expect(
      sameSignatureRef(
        { kind: "curated", id: "a", version: 1 },
        { kind: "curated", id: "a", version: 2 }
      )
    ).toBe(false);
    expect(sameSignatureRef({ kind: "custom", hash: "x" }, { kind: "custom", hash: "x" })).toBe(
      true
    );
    expect(
      sameSignatureRef({ kind: "custom", hash: "x" }, { kind: "curated", id: "x", version: 1 })
    ).toBe(false);
    expect(sameSignatureRef({ kind: "custom", hash: "x" }, null)).toBe(false);
  });
});

describe("checkCharacterFile: the cloud's order, before anything is sent", () => {
  it("accepts JPG, PNG and WebP up to 10 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(checkCharacterFile(file("a", type, CHARACTER_MAX_FILE_BYTES))).toBeNull();
    }
  });

  it("names HEIC by its type or, when the browser leaves the type empty, its extension", () => {
    expect(checkCharacterFile(file("IMG_0001.HEIC", ""))).toBe("heic");
    expect(checkCharacterFile(file("photo.heif", ""))).toBe("heic");
    expect(checkCharacterFile(file("photo", "image/heic"))).toBe("heic");
    // HEIC comes first, even when the file is also too large.
    expect(checkCharacterFile(file("big.heic", "image/heic", CHARACTER_MAX_FILE_BYTES + 1))).toBe(
      "heic"
    );
  });

  it("refuses any other type, then a file over 10 MB", () => {
    expect(checkCharacterFile(file("a.gif", "image/gif"))).toBe("wrongType");
    expect(checkCharacterFile(file("a.pdf", "application/pdf"))).toBe("wrongType");
    expect(checkCharacterFile(file("a.gif", "image/gif", CHARACTER_MAX_FILE_BYTES + 1))).toBe(
      "wrongType"
    );
    expect(checkCharacterFile(file("a.jpg", "image/jpeg", CHARACTER_MAX_FILE_BYTES + 1))).toBe(
      "tooLarge"
    );
  });
});

describe("the browser shrink's pure parts", () => {
  it("scales the long side to 1536 px and never enlarges", () => {
    expect(scaledSize(4032, 3024)).toEqual({ width: 1536, height: 1152 });
    expect(scaledSize(2000, 3000)).toEqual({ width: 1024, height: 1536 });
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(scaledSize(1536, 1536)).toEqual({ width: 1536, height: 1536 });
  });

  it("finds a transparent pixel", () => {
    expect(hasTransparency(new Uint8ClampedArray([0, 0, 0, 255, 9, 9, 9, 255]))).toBe(false);
    expect(hasTransparency(new Uint8ClampedArray([0, 0, 0, 255, 9, 9, 9, 0]))).toBe(true);
  });

  it("re-encodes opaque images as JPEG and keeps PNG or WebP where they are transparent", () => {
    expect(shrinkOutputType("image/jpeg", false)).toBe("image/jpeg");
    expect(shrinkOutputType("image/png", false)).toBe("image/jpeg");
    expect(shrinkOutputType("image/webp", false)).toBe("image/jpeg");
    expect(shrinkOutputType("image/png", true)).toBe("image/png");
    expect(shrinkOutputType("image/webp", true)).toBe("image/webp");
  });

  it("formats a size in megabytes with one decimal in the reader's language", () => {
    expect(formatMegabytes(14.2 * 1024 * 1024, "en")).toBe("14.2");
    expect(formatMegabytes(14.2 * 1024 * 1024, "de")).toBe("14,2");
  });
});
