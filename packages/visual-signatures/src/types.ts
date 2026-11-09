import type { VisualMedium } from "@structura/types";

/** Library ids. Adding one here needs a body in `functions/src/visualSignatures/catalog.ts`. */
export type SignatureId =
  | "editorial-reportage"
  | "still-life-studio"
  | "paper-cut"
  | "ink-and-fill"
  | "miniature-world"
  | "isometric-glass";

/** The colour slots a signature's prompt body refers to by name. */
export type PaletteRole = "background" | "surface" | "primary" | "accent" | "ink";

/** What the picker and the compiler need to know about a curated signature; no prompt text. */
export interface SignatureMeta {
  id: SignatureId;
  /** Bumped on every retune; a preset pins the version it was saved with. */
  version: number;
  medium: VisualMedium;
  /** Roles the body uses; the compiler fills only these. */
  roles: readonly PaletteRole[];
  /** The signature every plan gets, and the default for an unbound site. */
  house: boolean;
  /** Thumbnails of the test board in the neutral set, served from the marketing site. */
  thumbnail: { small: string; large: string };
}

/** A preset's signature choice (specs/visual-signatures.md §4). Absent on a preset ⇒ kind `free`. */
export type VisualSignatureChoice =
  | { kind: "curated"; id: SignatureId; version: number }
  | {
      kind: "custom";
      name: string;
      medium: VisualMedium;
      technique: string;
      motifs: string;
      composition: string;
      avoid: string;
    };
