/**
 * The recurring character's calls for the Visuals page
 * (specs/visual-signatures.md §13.12): upload and remove an image, draft the
 * description, draw and approve the character sheet, and Remove, through the
 * plugin's `/structura/v1/visual-presets/{id}/character` routes. Wire types
 * mirror `functions/src/visualSignatures/characterWire.ts`. Save rides on
 * the preset update (`VisualContent.appearance` and `character`).
 *
 * None of these hooks toasts: the page puts each failure where the problem
 * is (an upload slot, the sheet, the Remove dialog).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import type { VisualSignatureChoice } from "@structura/visual-signatures";

import { presetsKey } from "./useVisualPresets";

/** Who appears in a preset's images; absent on the preset reads as `nobody`. */
export type VisualAppearance = "nobody" | "person" | "mascot";

/** The two kinds of character. */
export type CharacterKind = "person" | "mascot";

/** The signature a sheet was drawn in: a library id and version, or a hash of a custom signature's five fields. */
export type SignatureRef =
  | { kind: "curated"; id: string; version: number }
  | { kind: "custom"; hash: string };

/** One upload, in slot order. */
export interface CharacterImageWire {
  /** Signed read URL, valid for 30 minutes; null when the cloud could not sign it. */
  url: string | null;
}

/** A character sheet. */
export interface CharacterSheetWire {
  url: string | null;
  /** The signature it was drawn in. */
  signature: SignatureRef;
  /** ISO 8601; absent on a draft sheet not approved yet. */
  approvedAt?: string;
}

/** The saved character, as the card and the Replace intake show it. */
export interface CharacterWire {
  kind: CharacterKind;
  /** A label for the user; never in an image. */
  name: string;
  /** The one sentence on appearance, as saved. */
  description: string;
  reference: "sheet" | "asIs";
  /** Person only. */
  outfit?: "same" | "changes";
  /** Mascot only. */
  keepOwnStyle?: boolean;
  /** The kept uploads, in slot order. */
  images: CharacterImageWire[];
  /** The approved sheet, when the reference is a sheet. */
  sheet?: CharacterSheetWire;
}

/** Work in progress on the server: the uploads a draw or Save would use, and the last drawn sheet. */
export interface CharacterDraftWire {
  kind: CharacterKind;
  /** The draft's own uploads, or the saved ones of the same kind during Replace. */
  images: CharacterImageWire[];
  /** The last drawn sheet; `approvedAt` once approved. */
  sheet?: CharacterSheetWire;
}

/** The character's form fields as a Save sends them; the cloud writes the permission record. */
export interface CharacterSaveFields {
  name: string;
  description: string;
  reference: "sheet" | "asIs";
  /** Person only. */
  outfit?: "same" | "changes";
  /** Mascot only. */
  keepOwnStyle?: boolean;
  /** The consent (person) or rights (mascot) statement. */
  confirmed: boolean;
}

/** Response of the calls that change the draft; null once there is none. */
export interface CharacterDraftResponse {
  draft: CharacterDraftWire | null;
}

/** Request of the upload. */
export interface UploadCharacterImageInput {
  presetId: string;
  kind: CharacterKind;
  /** `data:<mime>;base64,…` of the image the browser scaled down. */
  dataUri: string;
}

/** Request of the sheet draw; the plugin draws it for this site. */
export interface DrawCharacterSheetInput {
  presetId: string;
  kind: CharacterKind;
  /** The unsaved signature, as the preset save sends it. */
  signature: VisualSignatureChoice;
  /** Mascot only: draw in the artwork's own style. */
  keepOwnStyle?: boolean;
  /** The consent or rights statement. */
  confirmed: true;
}

const characterPath = (presetId: string) =>
  `/structura/v1/visual-presets/${encodeURIComponent(presetId)}/character`;

/** Adds one upload to the draft; resolves with the draft. */
export const useUploadCharacterImage = () =>
  useMutation({
    mutationFn: ({ presetId, kind, dataUri }: UploadCharacterImageInput) =>
      apiFetch<CharacterDraftResponse>({
        path: `${characterPath(presetId)}/images`,
        method: "POST",
        data: { kind, data_uri: dataUri },
      }),
    meta: { silentError: true },
  });

/** Takes one upload out of the draft by its slot; resolves with the draft. */
export const useRemoveCharacterImage = () =>
  useMutation({
    mutationFn: ({ presetId, index }: { presetId: string; index: number }) =>
      apiFetch<CharacterDraftResponse>({
        path: `${characterPath(presetId)}/images/${index}`,
        method: "DELETE",
      }),
    meta: { silentError: true },
  });

/** Drafts the one-sentence description from the uploads; stores nothing. */
export const useDraftCharacterDescription = () =>
  useMutation({
    mutationFn: ({
      presetId,
      ...data
    }: {
      presetId: string;
      kind: CharacterKind;
      locale?: string;
    }) =>
      apiFetch<{ description: string }>({
        path: `${characterPath(presetId)}/description`,
        method: "POST",
        data,
      }),
    meta: { silentError: true },
  });

/** Draws a character sheet (one image once it finishes, none when it fails); resolves with the draft. */
export const useDrawCharacterSheet = () =>
  useMutation({
    mutationFn: ({ presetId, ...data }: DrawCharacterSheetInput) =>
      apiFetch<CharacterDraftResponse>({
        path: `${characterPath(presetId)}/sheet`,
        method: "POST",
        data,
      }),
    meta: { silentError: true },
  });

/** Approves the draft's sheet; nothing reaches images before Save. */
export const useApproveCharacterSheet = () =>
  useMutation({
    mutationFn: ({ presetId }: { presetId: string }) =>
      apiFetch<CharacterDraftResponse>({
        path: `${characterPath(presetId)}/sheet/approve`,
        method: "POST",
      }),
    meta: { silentError: true },
  });

/**
 * Removes the character at once (uploads, sheets, Who appears back to
 * Nobody) and refetches the preset list, which then carries no character.
 */
export const useRemoveCharacter = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ presetId }: { presetId: string }) =>
      apiFetch<{ ok: true }>({ path: characterPath(presetId), method: "DELETE" }),
    meta: { silentError: true },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: presetsKey }),
  });
};
