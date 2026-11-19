/**
 * The recurring character's model on the Visuals page
 * (specs/visual-signatures.md §13; handoff handoffs/recurring-character/README.md
 * §2): which signatures can draw a character, which sheet a signature needs,
 * the checks on a picked file and the browser-side shrink before upload.
 * Ported from the customer portal's `web/src/features/sites/lib/visualCharacter.ts`.
 */
import { __, sprintf } from "@wordpress/i18n";
import {
  VISUAL_SIGNATURES,
  type SignatureMeta,
  type VisualSignatureChoice,
} from "@structura/visual-signatures";

import type { SignatureRef } from "../api/useVisualCharacter";

/** Most uploads a character holds (spec §13.3). */
export const CHARACTER_MAX_IMAGES = 3;

/** Largest file accepted before the browser scales it down (spec §13.3). */
export const CHARACTER_MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Long side of the image the browser sends. The upload travels as a data URI
 * through the site's own REST route, whose request size the host caps (PHP's
 * `post_max_size`, often 8 MB); the cloud stores its copy at this size anyway.
 */
export const CHARACTER_LONG_SIDE = 1536;

/** The types the cloud accepts; HEIC is refused with its own message. */
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** `accept` attribute of the image picker. */
export const CHARACTER_ACCEPT = ACCEPTED_TYPES.join(",");

/** A custom signature's text fields as the cloud caps them (`SIGNATURE_FIELD_MAX`). */
const SIGNATURE_FIELD_MAX = 1_000;

/** The library signatures that can draw a character, in library order. */
export function characterSignatures(): SignatureMeta[] {
  return VISUAL_SIGNATURES.filter((meta) => meta.character);
}

/** Lower-case hex SHA-256 of a UTF-8 string. */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The `SignatureRef` of a signature, exactly as the cloud computes it
 * (`signatureRefFor` in functions/src/visualSignatures/character.ts): the
 * library id and version, or a hash of a custom signature's medium and four
 * text fields, trimmed and capped as a write stores them (its name is only a
 * label). Null for the free prompt.
 */
export async function signatureRefOf(
  signature: VisualSignatureChoice | null
): Promise<SignatureRef | null> {
  if (!signature) return null;
  if (signature.kind === "curated")
    return { kind: "curated", id: signature.id, version: signature.version };
  const field = (value: string) => value.trim().slice(0, SIGNATURE_FIELD_MAX);
  const { medium, technique, motifs, composition, avoid } = signature;
  const hash = await sha256Hex(
    JSON.stringify([medium, field(technique), field(motifs), field(composition), field(avoid)])
  );
  return { kind: "custom", hash };
}

/** True when two refs name the same signature. */
export function sameSignatureRef(
  a: SignatureRef | null | undefined,
  b: SignatureRef | null | undefined
): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "curated") return b.kind === "curated" && a.id === b.id && a.version === b.version;
  return b.kind === "custom" && a.hash === b.hash;
}

/** Why a picked file is refused before anything is sent. */
export type UploadRefusal = "heic" | "wrongType" | "tooLarge";

/**
 * Checks a picked file in the order the cloud does: HEIC (by type or
 * extension, since browsers often leave the type empty) gets its own
 * answer, anything else that is not JPG, PNG or WebP is the wrong type, and
 * a file over 10 MB is too large. The cloud checks the bytes again.
 */
export function checkCharacterFile(
  file: Pick<File, "name" | "type" | "size">
): UploadRefusal | null {
  const type = file.type.toLowerCase();
  if (/^image\/hei[cf]/.test(type) || /\.hei[cf]$/i.test(file.name)) return "heic";
  if (!(ACCEPTED_TYPES as readonly string[]).includes(type)) return "wrongType";
  if (file.size > CHARACTER_MAX_FILE_BYTES) return "tooLarge";
  return null;
}

/** Width and height scaled so the long side is at most `max`, never enlarged. */
export function scaledSize(
  width: number,
  height: number,
  max = CHARACTER_LONG_SIDE
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const scale = max / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** True when any pixel of RGBA data is not fully opaque. */
export function hasTransparency(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== 255) return true;
  }
  return false;
}

/**
 * The type the shrunk image is encoded as: JPEG for anything opaque (a
 * photo), and PNG or WebP kept as they came when the image has transparency,
 * which a mascot cut out of its background often does.
 */
export function shrinkOutputType(
  inputType: string,
  transparent: boolean
): "image/jpeg" | "image/png" | "image/webp" {
  if (transparent && (inputType === "image/png" || inputType === "image/webp")) return inputType;
  return "image/jpeg";
}

/**
 * Decodes a picked image in the browser, scales it to at most 1536 px on the
 * long side and re-encodes it (see {@link shrinkOutputType}). Resolves with
 * the data URI to upload, or null when the browser cannot decode the file.
 */
export async function shrinkCharacterImage(file: Blob): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    // "from-image" bakes in the EXIF orientation of a phone photo.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    const transparent =
      file.type !== "image/jpeg" && hasTransparency(context.getImageData(0, 0, width, height).data);
    const type = shrinkOutputType(file.type, transparent);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
    if (!blob) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } finally {
    bitmap.close();
  }
}

/** The admin's language for numbers and dates, from the page. */
export function pageLocale(): string | undefined {
  const lang = typeof document === "undefined" ? "" : document.documentElement.lang;
  return lang || undefined;
}

/** A file size in megabytes with one decimal, in the reader's number format. */
export function formatMegabytes(bytes: number, locale = pageLocale()): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(bytes / (1024 * 1024));
}

/** A date in the reader's language, medium length, in their time zone. */
export function formatCharacterDate(iso: string | undefined, locale = pageLocale()): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
}

/** The sheet's alt text: who, in which style, and what it shows. */
export function sheetAlt(name: string, signatureName: string): string {
  return sprintf(
    /* translators: 1: the character's name, e.g. "Lena", 2: a style name, e.g. "Ink and fill" */
    __(
      "Character sheet of %1$s in %2$s: front, three-quarter and back views, and two close-ups of the face, neutral and smiling.",
      "structura"
    ),
    name,
    signatureName
  );
}

/** "View your image {n} larger". */
export function viewImageLabel(n: number): string {
  return sprintf(
    /* translators: %d: the image's position, 1 to 3 */
    __("View your image %d larger", "structura"),
    n
  );
}
