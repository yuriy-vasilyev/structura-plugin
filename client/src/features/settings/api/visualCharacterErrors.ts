/**
 * The cloud's recurring-character refusals in the reader's language
 * (specs/visual-signatures.md §13.12 error keys). The plugin proxy forwards
 * the key under the REST error's `data.code`; the copy is the portal's.
 */
import { __ } from "@wordpress/i18n";

/** The `visualCharacter.*` (or other) error key a character call or preset save was refused with, if any. */
export function errorKeyOf(err: unknown): string | undefined {
  const code = (err as { data?: { code?: unknown } } | null | undefined)?.data?.code;
  return typeof code === "string" ? code : undefined;
}

/** The message for a `visualCharacter.*` key, or null for any other key. */
export function characterErrorMessage(key: string | undefined): string | null {
  switch (key) {
    case "visualCharacter.imageWrongType":
      return __("This file type can’t be used. Use a JPG, PNG or WebP image.", "structura");
    case "visualCharacter.imageHeic":
      return __(
        "HEIC is an iPhone photo format we can’t use. Export it as JPG first, then add it here.",
        "structura"
      );
    case "visualCharacter.imageTooLarge":
      return __("This image is larger than 10 MB. Use a smaller one.", "structura");
    case "visualCharacter.tooManyImages":
      return __(
        "A character can have up to three images. Remove one before adding another.",
        "structura"
      );
    case "visualCharacter.noImages":
      return __("Add at least one image.", "structura");
    case "visualCharacter.permissionRequired":
      return __("Confirm this before we use these images.", "structura");
    case "visualCharacter.nameRequired":
      return __("Give the character a name.", "structura");
    case "visualCharacter.descriptionRequired":
      return __("Describe how the character looks in one sentence.", "structura");
    case "visualCharacter.signatureCannotCarry":
      return __("Pick a style that can draw a character before you save.", "structura");
    case "visualCharacter.needsNewSheet":
      return __(
        "Approve a character sheet in the new style first, or keep the old style.",
        "structura"
      );
    case "visualCharacter.notApproved":
      return __("Finish the character first, or choose Nobody.", "structura");
    case "visualCharacter.noSheet":
      return __("Draw a character sheet first.", "structura");
    case "visualCharacter.modelUnavailable":
      return __(
        "The image setup on your website can’t work from a reference image. Switch to one that can under AI Engine to add a character.",
        "structura"
      );
    case "visualCharacter.sheetFailed":
      return __(
        "The sheet didn’t finish. This didn’t use an image. Try again in a moment.",
        "structura"
      );
    default:
      return null;
  }
}
