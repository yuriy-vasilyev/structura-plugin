/**
 * The visual-signature picker's model (specs/visual-signatures.md §2, §7;
 * handoff §2): what a selection is, how it maps to the preset's `signature`,
 * which cards a plan locks, and the builder's chip, hex and draft helpers.
 * Shared by the Visuals page and the wizard's Visuals step.
 */
import { canUseSignatureBuilder, canUseSignatureLibrary } from "@structura/types";
import {
  getSignatureMeta,
  HOUSE_SIGNATURE_ID,
  VISUAL_SIGNATURES,
  type SignatureId,
  type SignatureMeta,
  type VisualSignatureChoice,
} from "@structura/visual-signatures";

import type { VisualMedium } from "../api/useVisualPresets";

/** Most brand colours the palette holds; the first is the accent (handoff §3.4). */
export const PALETTE_MAX = 6;

/** A custom signature's text fields, in builder order. */
export const BUILDER_FIELDS = ["technique", "motifs", "composition", "avoid"] as const;

/** One of a custom signature's text fields. */
export type BuilderField = (typeof BUILDER_FIELDS)[number];

/** What the picker has checked: a library card, "Your own", or "Free prompt" (handoff §2). */
export type SignatureSelection =
  | { kind: "curated"; id: SignatureId; version: number }
  | { kind: "custom" }
  | { kind: "free" };

/** The builder's draft of a custom signature. */
export interface CustomSignatureDraft {
  /** Shown on the "Your own" card; required to save. */
  name: string;
  /** Photography, illustration or 3D render; the user's choice, never drafted. */
  medium: VisualMedium;
  /** Technique, motifs, composition and avoid; each required to save. */
  fields: Record<BuilderField, string>;
  /** Fields "Draft from my site" filled; each mark clears on that field's first edit. */
  drafted: Partial<Record<BuilderField, true>>;
}

/** Group value of the "Your own" radio card once a custom signature exists. */
export const CUSTOM_CARD_VALUE = "custom";

/** A library card's selection at its current version. */
export function curatedSelection(id: SignatureId): SignatureSelection {
  return { kind: "curated", id, version: getSignatureMeta(id)?.version ?? 1 };
}

/** The house signature, the default for every plan. */
export function houseSelection(): SignatureSelection {
  return curatedSelection(HOUSE_SIGNATURE_ID);
}

/** The selection a stored signature stands for; none is the free prompt. */
export function selectionFromChoice(
  choice: VisualSignatureChoice | null | undefined
): SignatureSelection {
  if (!choice) return { kind: "free" };
  if (choice.kind === "custom") return { kind: "custom" };
  return { kind: "curated", id: choice.id, version: choice.version };
}

/** Whether two selections are the same choice; a curated one includes its version. */
export function sameSelection(
  a: SignatureSelection | null | undefined,
  b: SignatureSelection | null | undefined
): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "curated" && b.kind === "curated") return a.id === b.id && a.version === b.version;
  return true;
}

/**
 * The selection a card click makes: the bound version when the card is the
 * one in use, so re-picking it is no change (a retuned signature keeps the
 * version a preset pinned, spec §3); otherwise the current version.
 */
export function selectionForCard(
  id: SignatureId,
  bound: SignatureSelection | null | undefined
): SignatureSelection {
  if (bound?.kind === "curated" && bound.id === id) return bound;
  return curatedSelection(id);
}

/** The builder draft of a stored custom signature, with no Drafted marks; null for any other kind. */
export function customDraftFromChoice(
  choice: VisualSignatureChoice | null | undefined
): CustomSignatureDraft | null {
  if (choice?.kind !== "custom") return null;
  const { name, medium, technique, motifs, composition, avoid } = choice;
  return { name, medium, fields: { technique, motifs, composition, avoid }, drafted: {} };
}

/** A new builder draft: named after the site, photography, empty fields. */
export function newCustomDraft(siteName: string): CustomSignatureDraft {
  return {
    name: siteName,
    medium: "photography",
    fields: { technique: "", motifs: "", composition: "", avoid: "" },
    drafted: {},
  };
}

/** The custom fields a save or preview still needs, in focus order (`name` first). */
export function missingCustomFields(draft: CustomSignatureDraft): Array<"name" | BuilderField> {
  const missing: Array<"name" | BuilderField> = [];
  if (!draft.name.trim()) missing.push("name");
  for (const field of BUILDER_FIELDS) {
    if (!draft.fields[field].trim()) missing.push(field);
  }
  return missing;
}

/**
 * The `signature` a save or preview sends: the curated or custom choice, or
 * `null` for the free prompt (which clears a stored signature on update).
 */
export function signatureForSelection(
  selection: SignatureSelection,
  custom: CustomSignatureDraft | null
): VisualSignatureChoice | null {
  if (selection.kind === "curated") {
    return { kind: "curated", id: selection.id, version: selection.version };
  }
  if (selection.kind === "custom" && custom) {
    return {
      kind: "custom",
      name: custom.name.trim(),
      medium: custom.medium,
      technique: custom.fields.technique.trim(),
      motifs: custom.fields.motifs.trim(),
      composition: custom.fields.composition.trim(),
      avoid: custom.fields.avoid.trim(),
    };
  }
  return null;
}

/** Whether two stored signatures are the same choice; none and `null` both mean the free prompt. */
export function sameSignature(
  a: VisualSignatureChoice | null | undefined,
  b: VisualSignatureChoice | null | undefined
): boolean {
  if (!a || !b) return !a && !b;
  if (a.kind === "curated" && b.kind === "curated") return a.id === b.id && a.version === b.version;
  if (a.kind === "custom" && b.kind === "custom") {
    return (
      a.name === b.name &&
      a.medium === b.medium &&
      BUILDER_FIELDS.every((field) => a[field] === b[field])
    );
  }
  return false;
}

/** Whether a library card is locked on `plan`: every one but the house signature, on free and none. */
export function isLibraryCardLocked(meta: SignatureMeta, plan: string | null | undefined): boolean {
  return !meta.house && !canUseSignatureLibrary(plan);
}

/** Whether "Your own" is locked on `plan`. */
export function isBuilderLocked(plan: string | null | undefined): boolean {
  return !canUseSignatureBuilder(plan);
}

/** The library in the page's fixed order, or with `firstId` moved to the front (the wizard's pick). */
export function orderedSignatures(firstId?: SignatureId | null): readonly SignatureMeta[] {
  if (!firstId) return VISUAL_SIGNATURES;
  const first = VISUAL_SIGNATURES.find((s) => s.id === firstId);
  return first ? [first, ...VISUAL_SIGNATURES.filter((s) => s.id !== firstId)] : VISUAL_SIGNATURES;
}

// ─── Builder chips (handoff §3.5) ───────────────────────────────────────

/** Whether `phrase` already appears in `text`, ignoring case; typing it by hand counts. */
export function hasPhrase(text: string, phrase: string): boolean {
  return text.toLowerCase().includes(phrase.toLowerCase());
}

/**
 * `text` with `phrase` added: the whole text when empty, else after a comma
 * with its first letter lowered. `keepCase` skips the lowering for languages
 * whose nouns are capitalised (German).
 */
export function addPhrase(text: string, phrase: string, keepCase = false): string {
  const trimmed = text.trim();
  if (!trimmed) return phrase;
  const tail = keepCase ? phrase : phrase.charAt(0).toLowerCase() + phrase.slice(1);
  return `${trimmed.replace(/[\s,]+$/, "")}, ${tail}`;
}

/** `text` without `phrase` (any case) and the comma that joined it. */
export function removePhrase(text: string, phrase: string): string {
  const index = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (index < 0) return text;
  const before = text.slice(0, index).replace(/[\s,]+$/, "");
  const after = text.slice(index + phrase.length).replace(/^[\s,]+/, "");
  const joined = before && after ? `${before}, ${after}` : before || after;
  return joined.trim();
}

// ─── Palette (handoff §3.4) ─────────────────────────────────────────────

const HEX_INPUT = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A typed `#RGB` or `#RRGGBB` (the `#` optional) as upper-case `#RRGGBB`, or null. */
export function normaliseHexInput(value: string): string | null {
  const match = HEX_INPUT.exec(value.trim());
  if (!match) return null;
  const digits = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  return `#${digits.toUpperCase()}`;
}

// ─── "Draft from my site" (spec §6) ─────────────────────────────────────

const STYLE_SECTION = /(STYLE|PALETTE|LIGHTING|TEXTURE\s*&\s*FINISH|AVOID)\s*:\s*/gi;

/**
 * Splits the visual-style suggest blob (`STYLE: … PALETTE: … LIGHTING: …
 * TEXTURE & FINISH: … AVOID: …`) into builder fields: technique from STYLE,
 * LIGHTING and TEXTURE & FINISH, avoid from AVOID. PALETTE is dropped (the
 * palette field owns colours). A blob without labels is all technique.
 */
export function parseDraftedStyle(prompt: string): { technique: string; avoid: string } {
  const sections = new Map<string, string>();
  const matches = [...prompt.matchAll(STYLE_SECTION)];
  matches.forEach((match, i) => {
    const label = match[1]
      .toUpperCase()
      .replace(/\s+/g, " ")
      .replace(/\s*&\s*/, " & ");
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? prompt.length) : prompt.length;
    sections.set(label, prompt.slice(start, end).trim());
  });
  if (sections.size === 0) return { technique: prompt.trim(), avoid: "" };
  const technique = ["STYLE", "LIGHTING", "TEXTURE & FINISH"]
    .map((label) => sections.get(label))
    .filter((part): part is string => !!part)
    .join(" ");
  return { technique, avoid: sections.get("AVOID") ?? "" };
}
