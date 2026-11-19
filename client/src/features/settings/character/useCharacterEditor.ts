/**
 * The recurring character on the Visuals page (handoff
 * handoffs/recurring-character/README.md §2 to §7, spec
 * specs/visual-signatures.md §13.12): Who appears, the intake, the sheet
 * approval, the card, Remove, and what Save and the preview send. Ported
 * from the customer portal's `useCharacterEditor`; the calls go through the
 * plugin's routes, which name this site themselves.
 *
 * Draft model (owner decision 2026-11-18): uploads and the sheet live in the
 * server's `characterDraft`; name, description and the other fields live only
 * here until Save. Approve does not make the page clean, Save does. Remove is
 * immediate and leaves other unsaved edits on the page unsaved.
 */
import { useEffect, useRef, useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { useToast, type InlineAdviceHandle } from "@structura/ui";
import type { VisualSignatureChoice } from "@structura/visual-signatures";

import { suggestionLocale, type VisualPresetWire } from "../api/useVisualPresets";
import {
  useApproveCharacterSheet,
  useDraftCharacterDescription,
  useDrawCharacterSheet,
  useRemoveCharacter,
  useRemoveCharacterImage,
  useUploadCharacterImage,
  type CharacterDraftWire,
  type CharacterImageWire,
  type CharacterKind,
  type CharacterSaveFields,
  type CharacterSheetWire,
  type SignatureRef,
  type VisualAppearance,
} from "../api/useVisualCharacter";
import { characterErrorMessage, errorKeyOf } from "../api/visualCharacterErrors";
import {
  checkCharacterFile,
  sameSignatureRef,
  shrinkCharacterImage,
  signatureRefOf,
  type UploadRefusal,
} from "./visualCharacter";

/** The character's form fields, kept in the page until Save. */
export interface CharacterFields {
  name: string;
  description: string;
  /** The description came from the draft and was not edited since. */
  descriptionDrafted: boolean;
  /** The user typed in the description, so a later draft never replaces it. */
  descriptionEdited: boolean;
  reference: "sheet" | "asIs";
  outfit: "same" | "changes";
  keepOwnStyle: boolean;
  /** The consent (person) or rights (mascot) checkbox. */
  confirmed: boolean;
}

/** The character the card shows: finished in this session (`pending`) or saved (`live`). */
export interface EffectiveCharacter {
  source: "pending" | "live";
  kind: CharacterKind;
  name: string;
  reference: "sheet" | "asIs";
  keepOwnStyle: boolean;
  images: CharacterImageWire[];
  sheet?: CharacterSheetWire;
}

/** State of the image slot that takes the next upload. */
export type UploadSlotState =
  | { status: "idle" }
  | { status: "uploading"; previewUrl: string; fileName: string }
  | { status: "error"; refusal: UploadRefusal; size: number };

/** Inline errors of the character section, each where its problem is. */
export interface CharacterErrors {
  images?: boolean;
  name?: boolean;
  description?: boolean;
  permission?: boolean;
  /** Save refused: the character is not approved or confirmed. */
  unfinished?: boolean;
  /** Save refused: the sheet was drawn in another signature. */
  change?: boolean;
}

/**
 * The elements the editor moves focus to, registered by the sections with
 * {@link CharacterEditor.register}: the "Your character" heading, the card's
 * Replace, an image slot, Name, Description, the statement's box, the
 * next-step button, the signature-change notice and the Who appears group.
 */
export type FocusTargetName =
  | "heading"
  | "replace"
  | "name"
  | "description"
  | "permission"
  | "nextStep"
  | "notice"
  | "selector"
  | `slot-${number}`;

/** The character Remove deletes, as its confirmation names it. */
export interface RemoveTarget {
  name: string;
  kind: CharacterKind;
  imageCount: number;
}

/** What the page tells the editor about the preset and the signature picker. */
export interface CharacterEditorOptions {
  /** The site's bound preset; the character lives on it. */
  bound: VisualPresetWire | null;
  /** The form's signature as a save would send it; null for the free prompt. */
  signature: VisualSignatureChoice | null;
  /** The form's signature can carry a character. */
  signatureTakesCharacter: boolean;
  /** No style picked: the page shows the grid's error line and focuses its first card. */
  onNoStyle: () => void;
  /** False when the custom builder still has gaps (it then shows them). */
  signatureReady: () => boolean;
}

const fieldsFor = (
  kind: CharacterKind | null,
  live: VisualPresetWire["character"]
): CharacterFields =>
  live && live.kind === kind
    ? {
        name: live.name,
        description: live.description,
        descriptionDrafted: false,
        descriptionEdited: true,
        reference: live.reference,
        outfit: live.outfit ?? "same",
        keepOwnStyle: live.keepOwnStyle ?? false,
        // The saved character carries the confirmed statement (spec §13.3).
        confirmed: true,
      }
    : {
        name: "",
        description: "",
        descriptionDrafted: false,
        descriptionEdited: false,
        reference: "sheet",
        outfit: "same",
        keepOwnStyle: false,
        confirmed: false,
      };

const appearanceOf = (preset: VisualPresetWire | null): VisualAppearance =>
  preset?.appearance === "person" || preset?.appearance === "mascot" ? preset.appearance : "nobody";

const SERVER_REFUSALS: Record<string, UploadRefusal> = {
  "visualCharacter.imageHeic": "heic",
  "visualCharacter.imageWrongType": "wrongType",
  "visualCharacter.imageTooLarge": "tooLarge",
};

/** A refusal's own message, else `fallback`. */
const messageOf = (error: unknown, fallback: string): string =>
  characterErrorMessage(errorKeyOf(error)) ?? fallback;

/** The character editor's state and actions; see the module comment. */
export function useCharacterEditor(options: CharacterEditorOptions) {
  const { bound, signature, signatureTakesCharacter, onNoStyle, signatureReady } = options;
  const { errorToast, successToast } = useToast();
  const presetId = bound?.presetId ?? "";
  // The saved character Remove just deleted, until the refetched list drops it.
  const [removedLive, setRemovedLive] = useState<VisualPresetWire["character"]>(undefined);
  const live = bound?.character && bound.character !== removedLive ? bound.character : undefined;

  const upload = useUploadCharacterImage();
  const removeImage = useRemoveCharacterImage();
  const describe = useDraftCharacterDescription();
  const draw = useDrawCharacterSheet();
  const approve = useApproveCharacterSheet();
  const remove = useRemoveCharacter();

  const [appearance, setAppearance] = useState<VisualAppearance>(() => appearanceOf(bound));
  const [savedAppearance, setSavedAppearance] = useState<VisualAppearance>(() =>
    appearanceOf(bound)
  );
  // The kind the fields belong to; switching to the other kind starts over.
  const [fieldsKind, setFieldsKind] = useState<CharacterKind | null>(null);
  const [fields, setFields] = useState<CharacterFields>(() => fieldsFor(null, undefined));
  const [draft, setDraft] = useState<CharacterDraftWire | null>(null);
  // Approved (sheet) or confirmed (as is) in this session, not saved yet.
  const [pending, setPending] = useState(false);
  const [view, setView] = useState<"auto" | "intake" | "sheet">("auto");
  const [beforeReplace, setBeforeReplace] = useState<CharacterFields | null>(null);
  const [drawState, setDrawState] = useState<"idle" | "drawing" | "failed">("idle");
  const [slot, setSlot] = useState<UploadSlotState>({ status: "idle" });
  // File names of this session's uploads, by slot (the cloud keeps none).
  const [fileNames, setFileNames] = useState<Array<string | undefined>>([]);
  const [errors, setErrors] = useState<CharacterErrors>({});
  const [removeOpen, setRemoveOpen] = useState(false);
  // Kept while the dialog animates out, after Remove took the character away.
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [customRef, setCustomRef] = useState<{ key: string; ref: SignatureRef | null } | null>(
    null
  );
  const describeRequest = useRef(0);
  // The signature the page opened on: the §7 notice is announced only after
  // the user picks another one, never on load.
  const [openedOn, setOpenedOn] = useState<string | undefined>(undefined);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  // Re-hydrate whenever the bound preset changes (e.g. after "Use here"),
  // during render so no frame shows the previous preset's character.
  const boundId = bound?.presetId ?? null;
  if (boundId !== hydratedFor) {
    const next = appearanceOf(bound);
    const fieldsKindNext = next !== "nobody" ? next : (bound?.character?.kind ?? null);
    setHydratedFor(boundId);
    setAppearance(next);
    setSavedAppearance(next);
    setFieldsKind(fieldsKindNext);
    setFields(fieldsFor(fieldsKindNext, bound?.character));
    setDraft(bound?.characterDraft ?? null);
    setPending(false);
    setView("auto");
    setBeforeReplace(null);
    setDrawState("idle");
    setSlot({ status: "idle" });
    setFileNames([]);
    setErrors({});
    setOpenedOn(undefined);
  }

  const kind: CharacterKind | null = appearance === "nobody" ? null : appearance;
  const liveOfKind = live && live.kind === kind ? live : undefined;

  // The ref of the form's signature: at once for a library card, a hash for
  // a custom one (computed async), so a needed new sheet shows before Save.
  const signatureKey = JSON.stringify(signature);
  if (openedOn === undefined && signature) setOpenedOn(signatureKey);
  useEffect(() => {
    if (signature?.kind !== "custom") return;
    let current = true;
    void signatureRefOf(signature).then((ref) => {
      if (current) setCustomRef({ key: signatureKey, ref });
    });
    return () => {
      current = false;
    };
  }, [signatureKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const currentRef: SignatureRef | null | "pending" =
    signature?.kind === "curated"
      ? { kind: "curated", id: signature.id, version: signature.version }
      : signature?.kind === "custom"
        ? customRef?.key === signatureKey
          ? customRef.ref
          : "pending"
        : null;

  // Focus moves wait for the render the handler caused (section heading,
  // Replace, a slot, Name, the checkbox, the next-step button). Elements
  // register through callback refs, read only in effects and handlers.
  const elements = useRef(new Map<string, unknown>());
  const register = (name: FocusTargetName) => (element: unknown) => {
    if (element) elements.current.set(name, element);
    else elements.current.delete(name);
  };
  const element = (name: FocusTargetName) => elements.current.get(name) as HTMLElement | undefined;
  type Target =
    | "heading"
    | "replace"
    | "name"
    | "description"
    | "permission"
    | "nextStep"
    | "nobody"
    | number;
  const pendingFocus = useRef<{ target: Target; until: number } | null>(null);
  // Moves focus to the pending target once it is rendered and focusable. A
  // query's own render (a mutation settling) can commit before the one that
  // shows the target, and a closing dialog hands focus back to an earlier
  // element when it has left (Remove), so it retries until no modal dialog
  // is open, briefly, before giving up.
  useEffect(() => {
    const attempt = () => {
      const pendingTarget = pendingFocus.current;
      if (pendingTarget === null) return;
      const { target } = pendingTarget;
      const found =
        typeof target === "number"
          ? element(`slot-${target}`)
          : target === "permission"
            ? element("permission")?.querySelector<HTMLElement>('[role="checkbox"]')
            : target === "nobody"
              ? element("selector")?.querySelector<HTMLElement>('[role="radio"]')
              : element(target);
      found?.focus();
      const settled =
        !!found &&
        document.activeElement === found &&
        !document.querySelector('[aria-modal="true"]');
      if (settled || Date.now() >= pendingTarget.until) {
        pendingFocus.current = null;
        return;
      }
      window.setTimeout(attempt, 50);
    };
    attempt();
  });
  const focusLater = (target: Target) => {
    pendingFocus.current = { target, until: Date.now() + 1500 };
  };

  const images: CharacterImageWire[] =
    draft && draft.kind === kind ? draft.images : (liveOfKind?.images ?? []);
  const draftSheet = draft && draft.kind === kind ? draft.sheet : undefined;

  const effective: EffectiveCharacter | null = (() => {
    if (!kind) return null;
    if (pending && fieldsKind === kind) {
      const keepOwnStyle = kind === "mascot" && fields.keepOwnStyle;
      if (fields.reference === "asIs" && images.length > 0) {
        return {
          source: "pending",
          kind,
          name: fields.name.trim(),
          reference: "asIs",
          keepOwnStyle,
          images,
        };
      }
      if (fields.reference === "sheet" && draftSheet?.approvedAt) {
        return {
          source: "pending",
          kind,
          name: fields.name.trim(),
          reference: "sheet",
          keepOwnStyle,
          images,
          sheet: draftSheet,
        };
      }
    }
    if (liveOfKind) {
      return {
        source: "live",
        kind,
        name: liveOfKind.name,
        reference: liveOfKind.reference,
        keepOwnStyle: kind === "mascot" && liveOfKind.keepOwnStyle === true,
        images: liveOfKind.images,
        ...(liveOfKind.sheet ? { sheet: liveOfKind.sheet } : {}),
      };
    }
    return null;
  })();

  /** Which part of "Your character" shows. */
  const shown: "none" | "intake" | "sheet" | "card" = !kind
    ? "none"
    : view === "sheet"
      ? "sheet"
      : view === "intake" || !effective
        ? "intake"
        : "card";

  const sheetDrawn =
    !!effective && effective.reference === "sheet" && !effective.keepOwnStyle && !!effective.sheet;
  const needsNewSheet =
    shown === "card" &&
    signatureTakesCharacter &&
    sheetDrawn &&
    currentRef !== "pending" &&
    !sameSignatureRef(effective!.sheet!.signature, currentRef);

  const changeAnnounced = needsNewSheet && openedOn !== undefined && signatureKey !== openedOn;

  const patchFields = (patch: Partial<CharacterFields>) => setFields((f) => ({ ...f, ...patch }));

  /** Who appears changes; the other kind starts from its saved character or empty. */
  const selectAppearance = (next: VisualAppearance) => {
    setAppearance(next);
    setErrors({});
    if (next === "nobody" || next === fieldsKind) return;
    setFieldsKind(next);
    setFields(fieldsFor(next, live));
    setPending(false);
    setView("auto");
    setBeforeReplace(null);
    setDrawState("idle");
    setSlot({ status: "idle" });
  };

  const runDescribe = async (forKind: CharacterKind) => {
    const id = (describeRequest.current += 1);
    try {
      const locale = suggestionLocale();
      const res = await describe.mutateAsync({
        presetId,
        kind: forKind,
        ...(locale ? { locale } : {}),
      });
      if (id !== describeRequest.current) return;
      setFields((f) =>
        f.descriptionEdited ? f : { ...f, description: res.description, descriptionDrafted: true }
      );
      setErrors((e) => ({ ...e, description: false }));
    } catch {
      // The field stays as it is; the user can write the sentence.
    }
  };

  const addImage = async (file: File) => {
    if (!kind || slot.status === "uploading") return;
    const refusal = checkCharacterFile(file);
    if (refusal) {
      setSlot({ status: "error", refusal, size: file.size });
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setSlot({ status: "uploading", previewUrl, fileName: file.name });
    try {
      const dataUri = await shrinkCharacterImage(file);
      if (!dataUri) {
        setSlot({ status: "error", refusal: "wrongType", size: file.size });
        return;
      }
      const index = images.length;
      const res = await upload.mutateAsync({ presetId, kind, dataUri });
      setDraft(res.draft);
      setFileNames((names) => {
        const next = [...names];
        next[index] = file.name;
        return next;
      });
      setSlot({ status: "idle" });
      setErrors((e) => ({ ...e, images: false }));
      void runDescribe(kind);
    } catch (error) {
      const refused = SERVER_REFUSALS[errorKeyOf(error) ?? ""];
      if (refused) {
        setSlot({ status: "error", refusal: refused, size: file.size });
      } else {
        setSlot({ status: "idle" });
        errorToast(
          messageOf(error, __("The image didn’t upload. Try again in a moment.", "structura"))
        );
      }
    } finally {
      URL.revokeObjectURL(previewUrl);
    }
  };

  const removeImageAt = async (index: number) => {
    try {
      const res = await removeImage.mutateAsync({ presetId, index });
      setDraft(res.draft);
      setFileNames((names) => names.filter((_, i) => i !== index));
      focusLater(Math.min(index, res.draft?.images.length ?? 0));
    } catch (error) {
      errorToast(
        messageOf(error, __("The image couldn’t be removed. Try again in a moment.", "structura"))
      );
    }
  };

  /** The intake's checks before Draw or Use these images, in the handoff's order (§5). */
  const intakeReady = (needsStyle: boolean): boolean => {
    const next: CharacterErrors = {
      images: images.length === 0,
      name: !fields.name.trim(),
      description: !fields.description.trim(),
      permission: !fields.confirmed,
    };
    setErrors(next);
    if (next.images) {
      focusLater(0);
      return false;
    }
    if (needsStyle && !signatureTakesCharacter) {
      onNoStyle();
      return false;
    }
    if (next.name) {
      focusLater("name");
      return false;
    }
    if (next.description) {
      focusLater("description");
      return false;
    }
    if (next.permission) {
      focusLater("permission");
      return false;
    }
    return true;
  };

  const runDraw = async () => {
    if (!kind || !signature || !signatureReady()) return;
    setView("sheet");
    setDrawState("drawing");
    setErrors({});
    focusLater("heading");
    try {
      const res = await draw.mutateAsync({
        presetId,
        kind,
        signature,
        ...(kind === "mascot" ? { keepOwnStyle: fields.keepOwnStyle } : {}),
        confirmed: true,
      });
      setDraft(res.draft);
      setDrawState("idle");
    } catch (error) {
      const key = errorKeyOf(error);
      // No key (a timeout or a dropped connection) is a failed render too.
      if (!key || key === "visualCharacter.sheetFailed" || key === "common.internal") {
        setDrawState("failed");
        return;
      }
      setDrawState("idle");
      if (!draftSheet) setView("intake");
      if (key === "visualCharacter.signatureCannotCarry") onNoStyle();
      else
        errorToast(
          messageOf(error, __("The sheet didn’t finish. Try again in a moment.", "structura"))
        );
    }
  };

  /** "Draw character sheet" in the intake. */
  const drawFromIntake = () => {
    if (!intakeReady(true)) return;
    void runDraw();
  };

  /** "Use these images": the as-is path needs no sheet and spends no image. */
  const useAsIs = () => {
    if (!intakeReady(false)) return;
    setPending(true);
    setView("auto");
    setBeforeReplace(null);
    focusLater("replace");
  };

  const approveSheet = async () => {
    try {
      const res = await approve.mutateAsync({ presetId });
      setDraft(res.draft);
      setPending(true);
      setView("auto");
      setBeforeReplace(null);
      setErrors({});
      focusLater("replace");
    } catch (error) {
      errorToast(messageOf(error, __("The sheet could not be approved.", "structura")));
    }
  };

  const backToImages = () => {
    setView("intake");
    setDrawState("idle");
    focusLater("heading");
  };

  const startReplace = () => {
    setBeforeReplace(fields);
    // New images need the statement again.
    patchFields({ confirmed: false });
    setView("intake");
    setErrors({});
    focusLater("heading");
  };

  const cancelReplace = () => {
    if (beforeReplace) setFields(beforeReplace);
    setBeforeReplace(null);
    setView("auto");
    setSlot({ status: "idle" });
    setErrors({});
    focusLater("replace");
  };

  /** The §7 notice's primary: a new sheet in the picked signature, from the kept images. */
  const drawForNewSignature = () => {
    void runDraw();
  };

  /** Opens the Remove confirmation for the shown character, or the saved one under Nobody. */
  const openRemove = () => {
    const subject = effective ?? live;
    if (!subject) return;
    setRemoveTarget({ name: subject.name, kind: subject.kind, imageCount: subject.images.length });
    setRemoveOpen(true);
  };

  const confirmRemove = async () => {
    const name = removeTarget?.name ?? "";
    try {
      await remove.mutateAsync({ presetId });
    } catch {
      errorToast(
        sprintf(
          /* translators: %s: the character's name, e.g. "Lena" */
          __("%s couldn’t be removed. Nothing was deleted. Try again in a moment.", "structura"),
          name
        )
      );
      return;
    }
    setRemoveOpen(false);
    setRemovedLive(bound?.character);
    setAppearance("nobody");
    setSavedAppearance("nobody");
    setFieldsKind(null);
    setFields(fieldsFor(null, undefined));
    setDraft(null);
    setPending(false);
    setView("auto");
    setBeforeReplace(null);
    setDrawState("idle");
    setSlot({ status: "idle" });
    setFileNames([]);
    setErrors({});
    focusLater("nobody");
    successToast(__("The images you uploaded and the character sheet are deleted.", "structura"), {
      title: sprintf(
        /* translators: %s: the character's name, e.g. "Lena" */
        __("%s was removed.", "structura"),
        name
      ),
    });
  };

  /**
   * Save's character checks, in the handoff's order (§2): a style that takes
   * a character, no sheet drawn for another style, then a finished
   * character. Each refusal puts its line where the problem is and moves
   * focus there; nothing is sent.
   */
  const validateForSave = (): boolean => {
    if (!kind) return true;
    if (!signatureTakesCharacter) {
      onNoStyle();
      return false;
    }
    if (needsNewSheet) {
      setErrors({ change: true });
      (elements.current.get("notice") as InlineAdviceHandle | undefined)?.focusPrimary();
      return false;
    }
    if (shown !== "card") {
      setErrors((e) => ({ ...e, unfinished: true }));
      focusLater("nextStep");
      return false;
    }
    return true;
  };

  /** The fields a Save sends: only for a character finished in this session. */
  const sendsFields = pending && effective?.source === "pending";
  const saveFields = (): CharacterSaveFields => ({
    name: fields.name.trim(),
    description: fields.description.trim(),
    reference: fields.reference,
    ...(kind === "person" ? { outfit: fields.outfit } : {}),
    ...(kind === "mascot" ? { keepOwnStyle: fields.keepOwnStyle } : {}),
    confirmed: fields.confirmed,
  });

  /** The character part of the preset save; empty for an untouched Nobody site. */
  const savePatch = (): { appearance?: VisualAppearance; character?: CharacterSaveFields } => ({
    ...(appearance !== savedAppearance || sendsFields ? { appearance } : {}),
    ...(sendsFields ? { character: saveFields() } : {}),
  });

  /** After a successful Save: the sent state is the saved one. */
  const markSaved = (sentFields: boolean) => {
    setSavedAppearance(appearance);
    if (sentFields) {
      setPending(false);
      setDraft(null);
    }
    setErrors({});
  };

  /**
   * The character part of a preview request (§13.12): the finished unsaved
   * character from the draft, the saved one under the chosen appearance, or
   * none until a character is finished. An untouched Nobody site sends
   * nothing, so its request is the one it sent before.
   */
  const previewPart = (): {
    appearance?: VisualAppearance;
    character?: Omit<CharacterSaveFields, "confirmed">;
    useCharacterDraft?: boolean;
    confirmed?: boolean;
  } => {
    if (!kind) return savedAppearance !== "nobody" ? { appearance: "nobody" } : {};
    if (shown !== "card") return { appearance: "nobody" };
    if (sendsFields) {
      const { confirmed: _confirmed, ...character } = saveFields();
      return { appearance, character, useCharacterDraft: true, confirmed: true };
    }
    return { appearance };
  };

  const dirty = appearance !== savedAppearance || (pending && !!kind);

  return {
    appearance,
    kind,
    live,
    fields,
    patchFields,
    images,
    fileNames,
    draftSheet,
    effective,
    shown,
    needsNewSheet,
    currentRef,
    pending,
    dirty,
    // The Save-refused line under the notice goes with the notice.
    errors: needsNewSheet ? errors : { ...errors, change: false },
    setErrors,
    slot,
    setSlot,
    drawState,
    describing: describe.isPending,
    approving: approve.isPending,
    removing: remove.isPending,
    removingImage: removeImage.isPending,
    removeOpen,
    removeTarget,
    openRemove,
    closeRemove: () => setRemoveOpen(false),
    changeAnnounced,
    sendsFields,
    register,
    replacing: shown === "intake" && !!effective,
    selectAppearance,
    addImage,
    removeImageAt,
    drawFromIntake,
    useAsIs,
    approveSheet,
    tryAgain: () => void runDraw(),
    backToImages,
    startReplace,
    cancelReplace,
    drawForNewSignature,
    confirmRemove,
    validateForSave,
    savePatch,
    markSaved,
    previewPart,
  };
}

/** What {@link useCharacterEditor} returns. */
export type CharacterEditor = ReturnType<typeof useCharacterEditor>;
