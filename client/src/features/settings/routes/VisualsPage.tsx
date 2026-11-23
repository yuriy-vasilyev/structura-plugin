import { createRef, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "react-router";
import { __, _n, sprintf } from "@wordpress/i18n";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  CircleCheck,
  Copy,
  ExternalLink,
  Info,
  Lock,
  Save,
} from "lucide-react";
import {
  useDefaultProviders,
  useLicense,
  usePublicSiteProfile,
  useVisualPresetMutations,
  useVisualPresetsQuery,
  useVisualQuery,
} from "@/features/settings";
import {
  AiGeneratedBadge,
  Badge,
  Button,
  Card,
  cn,
  ConfirmDialog,
  InlineAdvice,
  InputField,
  PageLoader,
  PresetLibraryDialog,
  Select,
  Switch,
  Tabs,
  TextArea,
  formatEditedDate,
  toast,
  type PresetLibraryAction,
  type PresetLibraryRow,
} from "@structura/ui";
import {
  canUseSignatureLibrary,
  canUseVisualCharacter,
  isManagedPlan,
  type PlanId,
} from "@structura/types";
import {
  getSignatureMeta,
  isSignatureId,
  signatureTakesCharacter,
  type SignatureId,
} from "@structura/visual-signatures";
import { AIProvider } from "@/features/campaigns/types";
import { PageTitle } from "@/components/Layout/PageTitle";
import { PageDescription } from "@/components/Layout/PageSubtitle";
import { buildMarketingPricingUrl, buildPortalSignupUrl } from "@/utils/portalLinks";
import { docsUrl } from "@/utils/docsUrl";
import { useMagicSuggest } from "@/hooks/useMagicSuggest";
import { humanizeSuggestionError } from "@/hooks/humanizeSuggestionError";
import {
  ContextField,
  SuggestStrategySection,
} from "@/features/campaigns/components/SuggestStrategySection";
import {
  isPlanGatedError,
  useSuggestVisualSignatureMutation,
  useVisualSignatureSuggestion,
  type VisualContent,
  type VisualMedium,
  type VisualPresetWire,
  type VisualSignatureSuggestion,
} from "@/features/settings/api/useVisualPresets";
import type { SignatureRef, VisualAppearance } from "@/features/settings/api/useVisualCharacter";
import {
  selectOwnActivationUsage,
  useUsageAnalytics,
} from "@/features/dashboard/api/useUsageAnalytics";
import { useVideoStylingEligibility } from "@/features/channels/hooks/useVideoStylingEligibility";
import { VideoPresetSection, VideoStylingGateTeaser } from "../components/VideoPresetSection";
import { SignaturePicker } from "../signatures/SignaturePicker";
import { SignatureBuilder } from "../signatures/SignatureBuilder";
import { BrandPaletteField } from "../signatures/BrandPaletteField";
import { SignaturePreview } from "../signatures/SignaturePreview";
import { signatureName } from "../signatures/signatureCopy";
import {
  BUILDER_FIELDS,
  curatedSelection,
  customDraftFromChoice,
  houseSelection,
  missingCustomFields,
  newCustomDraft,
  orderedSignatures,
  sameSignature,
  selectionFromChoice,
  signatureForSelection,
  type BuilderField,
  type CustomSignatureDraft,
  type SignatureSelection,
} from "../signatures/signatureModel";
import { CharacterSection } from "../character/CharacterSection";
import { FieldError } from "../character/CharacterIntake";
import { RemoveCharacterDialog } from "../character/RemoveCharacterDialog";
import { ReasonRow, WhoSelector } from "../character/WhoSelector";
import { useCharacterEditor } from "../character/useCharacterEditor";
import { characterSignatures, sameSignatureRef } from "../character/visualCharacter";

const aspectRatioOptions = [
  { value: "1:1", label: __("1:1 Square Format", "structura") },
  { value: "4:3", label: __("4:3 Classic Professional", "structura") },
  { value: "3:4", label: __("3:4 Standard Portrait", "structura") },
  { value: "16:9", label: __("16:9 Cinematic Landscape", "structura") },
  { value: "9:16", label: __("9:16 Vertical Portrait", "structura") },
];

const assetFormatOptions = [
  { value: "webp", label: __("WebP (Smallest File)", "structura") },
  { value: "jpeg", label: __("JPEG (Standard Compatibility)", "structura") },
  { value: "png", label: __("PNG (Lossless)", "structura") },
];

interface DraftState extends VisualContent {
  label: string;
}

function presetToDraft(p: VisualPresetWire, fallbackFormat: string): DraftState {
  return {
    label: p.label,
    global_art_direction: p.globalArtDirection,
    aspect_ratio: p.aspectRatio,
    format: p.format || fallbackFormat,
    optimize_on_upload: !!p.optimizeOnUpload,
    medium: p.medium ?? "photography",
    ai_label: p.aiLabel ?? false,
    // Video fields ride verbatim — including `undefined`. The UI applies
    // the render defaults (clean / bottom) at display time only, so a
    // save can't materialize defaults onto a preset that never had the
    // fields (rollout back-compat, see VisualContent's docblock).
    video_style: p.videoStyle,
    video_art_direction: p.videoArtDirection,
    caption_placement: p.captionPlacement,
    palette: p.palette,
  };
}

function emptyDraft(fallbackFormat: string, paid: boolean): DraftState {
  return {
    label: __("Site default", "structura"),
    global_art_direction: "",
    aspect_ratio: "16:9",
    format: paid ? fallbackFormat || "webp" : "png",
    optimize_on_upload: paid,
    medium: "photography",
    ai_label: false,
  };
}

/**
 * The preset content a save sends. `signature` is the picked choice; the
 * free prompt sends `null` on update (clearing a stored signature) and
 * nothing on create, where absent already means free (spec §4).
 */
function buildContent(
  d: DraftState,
  selection: SignatureSelection,
  custom: CustomSignatureDraft | null,
  isCreate: boolean
): VisualContent {
  const signature = signatureForSelection(selection, custom);
  return {
    global_art_direction: d.global_art_direction,
    aspect_ratio: d.aspect_ratio,
    format: d.format,
    optimize_on_upload: d.optimize_on_upload,
    medium: d.medium ?? "photography",
    ai_label: d.ai_label ?? false,
    // Video keys are omitted (not defaulted) when the draft carries
    // nothing — an untouched or plan-locked section must never overwrite
    // a preset's saved video styling. See VisualContent's docblock.
    ...(d.video_style !== undefined ? { video_style: d.video_style } : {}),
    ...(d.video_art_direction !== undefined ? { video_art_direction: d.video_art_direction } : {}),
    ...(d.caption_placement !== undefined ? { caption_placement: d.caption_placement } : {}),
    ...(d.palette !== undefined ? { palette: d.palette } : {}),
    ...(signature || !isCreate ? { signature } : {}),
  };
}

/** An unbound site's first draft takes the thin pass's palette when it found one (spec §7). */
function withScrapedPalette(
  d: DraftState,
  suggestion: VisualSignatureSuggestion | null | undefined
): DraftState {
  return suggestion && suggestion.palette.length > 0 ? { ...d, palette: suggestion.palette } : d;
}

/** The save payload as one string: "Unsaved changes" shows while it differs from the loaded one. */
function snapshotOf(
  d: DraftState,
  selection: SignatureSelection,
  custom: CustomSignatureDraft | null,
  isCreate: boolean
): string {
  return JSON.stringify({ label: d.label, content: buildContent(d, selection, custom, isCreate) });
}

/** Where a page action sends keyboard focus once it has rendered. */
type FocusTarget = "name" | BuilderField | "builder" | "custom-card" | "free-prompt" | "grid";

/** The builder's media while a recurring character is chosen (recurring-character handoff §4). */
const CHARACTER_MEDIA: readonly VisualMedium[] = ["illustration", "3d_render"];

/** The page's two tabs under the palette (2026-11-21). */
type VisualsTab = "images" | "video";

/** The tab a `?section=` value opens: Video for `video`, else Images. */
const tabFromSection = (section: string | null): VisualsTab =>
  section === "video" ? "video" : "images";

/** A managed plan's reset date when this site's images for the month are used up, else null. */
function useImagesResetOn(): string | null {
  const { data } = useUsageAnalytics();
  const cycle = data?.cycleUsage;
  if (!cycle || cycle.kind !== "managed" || cycle.unmetered) return null;
  const usage =
    selectOwnActivationUsage(
      cycle,
      typeof window !== "undefined" ? window.structuraConfig?.activation_id : undefined
    ) ?? cycle.workspace;
  if (usage.imagesIncluded <= 0 || usage.imagesUsed < usage.imagesIncluded) return null;
  const lang = typeof document !== "undefined" ? document.documentElement.lang : "";
  return new Date(cycle.cycleResetsAt).toLocaleDateString(lang || undefined, {
    day: "numeric",
    month: "long",
  });
}

export const VisualsPage = () => {
  const { plan, isPaidLicense } = useLicense();
  const { data: presetsData, isLoading: isLoadingPresets } = useVisualPresetsQuery();
  // Legacy hook still drives the magic-suggest "Site Logo" hint —
  // it's the only consumer of `logo_url` post-rewrite.
  const { data: legacyConfig } = useVisualQuery();
  const {
    create,
    update,
    fork,
    remove,
    bind,
    isCreating,
    isUpdating,
    isForking,
    isRemoving,
    isBinding,
  } = useVisualPresetMutations();
  const { suggest, isSuggesting } = useMagicSuggest();
  const { defaultImageProvider, defaultTextProvider, isCloud } = useDefaultProviders();
  const { data: profile } = usePublicSiteProfile();
  const suggestion = useVisualSignatureSuggestion(presetsData?.visualSuggestion);
  const suggestSignature = useSuggestVisualSignatureMutation();
  const imagesResetOn = useImagesResetOn();

  const boundPreset = useMemo(() => {
    if (!presetsData) return null;
    return presetsData.presets.find((p) => p.presetId === presetsData.boundPresetId) ?? null;
  }, [presetsData]);

  const otherPresets = useMemo(() => {
    if (!presetsData) return [];
    return presetsData.presets.filter((p) => p.presetId !== presetsData.boundPresetId);
  }, [presetsData]);

  const [draft, setDraft] = useState<DraftState | null>(null);
  // True until the user touches the form — lets us reset draft from
  // server state on bind/refetch without clobbering an in-progress edit.
  const [isPristine, setIsPristine] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<VisualPresetWire | null>(null);
  // Switch preset (2026-11-21): the popup that replaced the card of other presets.
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchPending, setSwitchPending] = useState<{
    id: string;
    action: PresetLibraryAction;
  } | null>(null);

  // Visual signature (specs/visual-signatures.md §8, handoff §2): what the
  // picker has checked, the custom draft behind "Your own", and whether the
  // builder replaces the grid. One Save in the header saves all of it.
  const [selection, setSelection] = useState<SignatureSelection>(houseSelection);
  const [custom, setCustom] = useState<CustomSignatureDraft | null>(null);
  const [mode, setMode] = useState<"picker" | "builder">("picker");
  const [customErrors, setCustomErrors] = useState<ReadonlySet<"name" | BuilderField>>(new Set());
  const [scanning, setScanning] = useState(false);
  // The save payload as loaded; "Unsaved changes" compares against it.
  const [baseline, setBaseline] = useState<string | null>(null);

  const boundSelection = useMemo(
    () => (boundPreset ? selectionFromChoice(boundPreset.signature) : null),
    [boundPreset]
  );

  // `draft` is deliberately NOT in the deps: `setDraft(presetToDraft(...))`
  // returns a fresh object reference, so including it would re-run the
  // effect with each new draft → setDraft loop → "Maximum update depth
  // exceeded" → AppErrorBoundary jams the route.
  useEffect(() => {
    if (!presetsData || isPaidLicense === undefined) return;
    if (!isPristine) return;
    const seed = (
      next: DraftState,
      nextSelection: SignatureSelection,
      nextCustom: CustomSignatureDraft | null
    ) => {
      setDraft(next);
      setSelection(nextSelection);
      setCustom(nextCustom);
      setMode("picker");
      setCustomErrors(new Set());
      setBaseline(snapshotOf(next, nextSelection, nextCustom, !boundPreset));
    };
    if (boundPreset) {
      seed(
        presetToDraft(boundPreset, isPaidLicense ? "webp" : "png"),
        selectionFromChoice(boundPreset.signature),
        customDraftFromChoice(boundPreset.signature)
      );
    } else {
      // Unbound: the house signature, or the thin pass's pick when the plan
      // opens the library, in the scraped palette (spec §7). Save creates the
      // preset and binds it.
      seed(
        withScrapedPalette(emptyDraft("webp", !!isPaidLicense), suggestion),
        suggestion && canUseSignatureLibrary(plan)
          ? curatedSelection(suggestion.pick)
          : houseSelection(),
        null
      );
    }
  }, [presetsData, boundPreset, isPaidLicense, isPristine, suggestion, plan]);

  // The thin pass's pick marks a card on every plan (spec §6). The preset
  // list carries the pick stored on the activation; only when it has none
  // does the page run the pass, once per page load.
  const autoSuggested = useRef(false);
  useEffect(() => {
    if (autoSuggested.current || suggestion !== undefined) return;
    if (plan === "none" || !presetsData) return;
    autoSuggested.current = true;
    suggestSignature.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion, plan, presetsData]);

  // Focus follows the page's own moves (handoff §2.3, §2.4): into the free
  // prompt, onto the builder heading, back to the custom card, or to the
  // first field a save found empty.
  const builderHeadingRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const fieldRefs = useMemo(
    () =>
      Object.fromEntries(
        BUILDER_FIELDS.map((field) => [field, createRef<HTMLTextAreaElement>()])
      ) as Record<BuilderField, RefObject<HTMLTextAreaElement>>,
    []
  );
  const customCardRef = useRef<HTMLButtonElement>(null);
  const freePromptRef = useRef<HTMLTextAreaElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  /** Focuses the checked signature card, else the group's tab stop, its first card. */
  const focusGrid = () => {
    const group = gridRef.current;
    (
      group?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ??
      group?.querySelector<HTMLElement>('[role="radio"]:not([disabled])')
    )?.focus();
  };
  const idBase = useId();
  const whoHeadingId = `${idBase}-who`;
  const gridErrorId = `${idBase}-grid-error`;
  const signatureHeadingId = `${idBase}-signature`;
  const builderHeadingId = `${idBase}-builder`;
  const paletteHeadingId = `${idBase}-palette`;
  const previewHeadingId = `${idBase}-preview`;
  const outputHeadingId = `${idBase}-output`;
  const aiLabelHeadingId = `${idBase}-ai-label`;
  const imagesPanelId = `${idBase}-images-panel`;
  const videoPanelId = `${idBase}-video-panel`;
  // Every move that sets a target also changes state, so the render it
  // causes runs this effect once the target exists.
  const pendingFocus = useRef<FocusTarget | null>(null);
  const setFocusTarget = (target: FocusTarget) => {
    pendingFocus.current = target;
  };
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    if (target === "grid") {
      pendingFocus.current = null;
      focusGrid();
      return;
    }
    const node =
      target === "builder"
        ? builderHeadingRef.current
        : target === "custom-card"
          ? customCardRef.current
          : target === "free-prompt"
            ? freePromptRef.current
            : target === "name"
              ? nameRef.current
              : fieldRefs[target].current;
    if (!node) return;
    pendingFocus.current = null;
    node.focus();
  });

  // ── Images | Video tabs (2026-11-21) ────────────────────────────────
  // The Video tab holds the video styling (video-visuals handoff §1). Its
  // gate comes from the Video channel's cloud-computed catalog entitlement
  // (the same check the Store card uses); "unknown" renders neither the tab
  // nor anything in it. Both panels stay mounted, so the hidden one keeps
  // its edits for the one Save.
  // The tab lives in `?section=` (query param rather than a location hash
  // because the SPA is hash-routed), the param the channel dialog's "Edit in
  // Visuals" link already sends; replace, so a switch adds no history entry.
  const videoEligibility = useVideoStylingEligibility();
  const hasVideoTab = videoEligibility !== "unknown";
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get("section");
  const [tab, setTab] = useState<VisualsTab>(() => tabFromSection(sectionParam));
  // A link that changes `section` while the page is open (the header's
  // Visuals link) moves the tab with it.
  const [tabSection, setTabSection] = useState(sectionParam);
  if (sectionParam !== tabSection) {
    setTabSection(sectionParam);
    setTab(tabFromSection(sectionParam));
  }
  const shownTab: VisualsTab = hasVideoTab ? tab : "images";
  const showTab = (next: VisualsTab) => {
    setTab(next);
    const params = new URLSearchParams(searchParams);
    if (next === "video") params.set("section", "video");
    else params.delete("section");
    setSearchParams(params, { replace: true });
  };
  // Landing on `?section=video` scrolls the tabs into view and pulses a
  // brief highlight ring on the Video panel, mirroring the Settings page's
  // `?run=` pattern. Landing only: a tab click writes the same param.
  const [landedOnVideo] = useState(sectionParam === "video");
  const tabStripRef = useRef<HTMLDivElement>(null);
  const [videoHighlight, setVideoHighlight] = useState(false);
  const videoSectionMounted = hasVideoTab && !!draft;
  useEffect(() => {
    if (!landedOnVideo || !videoSectionMounted) return;
    tabStripRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    // Deferred (not set synchronously in the effect) so the highlight
    // can't cascade a re-render into the same commit — and the ring
    // landing a beat after the scroll starts reads better anyway.
    const highlightOn = setTimeout(() => setVideoHighlight(true), 150);
    const highlightOff = setTimeout(() => setVideoHighlight(false), 2150);
    return () => {
      clearTimeout(highlightOn);
      clearTimeout(highlightOff);
    };
  }, [landedOnVideo, videoSectionMounted]);

  // Managed plans pick no image provider since 2026-10-06 (Structura binds
  // the image model), so there is no provider to switch.
  const showOpenAIRatioHint =
    !isCloud &&
    defaultImageProvider === "openai" &&
    (draft?.aspect_ratio === "16:9" || draft?.aspect_ratio === "9:16");

  const upgradeHref = buildMarketingPricingUrl({
    intent: "unlock_visuals",
    domain: typeof window !== "undefined" ? window.location.hostname : undefined,
    plan,
  });
  const siteName = profile?.name ?? "";

  // Recurring character (specs/visual-signatures.md §13; handoff
  // handoffs/recurring-character/README.md). It lives on the bound preset, so
  // an unbound site saves one first; a cloud that does not answer
  // `characterAvailable` predates the feature and offers none. The library's
  // paid row (spec §13.7); Remove stays open on every plan.
  const characterOffered = !!boundPreset && presetsData?.characterAvailable !== undefined;
  const characterOpen = canUseVisualCharacter(plan);
  const [gridError, setGridError] = useState(false);
  // The signature a save or a sheet would use; the cloud wants a custom one named.
  const activeSignature = (() => {
    const signature = signatureForSelection(selection, custom);
    return signature?.kind === "custom" && !signature.name
      ? { ...signature, name: __("Your own", "structura") }
      : signature;
  })();
  const activeTakesCharacter = signatureTakesCharacter(activeSignature);
  const character = useCharacterEditor({
    bound: characterOffered ? boundPreset : null,
    signature: activeSignature,
    signatureTakesCharacter: activeTakesCharacter,
    onNoStyle: () => {
      setGridError(true);
      // The grid is on screen unless the builder replaced it; focus waits for it then.
      if (mode === "builder") {
        setMode("picker");
        setFocusTarget("grid");
      } else focusGrid();
    },
    signatureReady: () => selection.kind !== "custom" || customReady(false),
  });
  const characterMode = !!character.kind;

  /** The name a selection shows. */
  const selectionName = (choice: SignatureSelection): string =>
    choice.kind === "curated"
      ? signatureName(choice.id)
      : choice.kind === "custom"
        ? custom?.name.trim() || __("Your own", "structura")
        : __("Free prompt", "structura");
  /** The name of the signature a sheet was drawn in. */
  const refName = (ref: SignatureRef | undefined): string => {
    if (!ref) return "";
    if (ref.kind === "curated") return isSignatureId(ref.id) ? signatureName(ref.id) : ref.id;
    const current = character.currentRef === "pending" ? null : character.currentRef;
    if (custom && sameSignatureRef(ref, current)) return selectionName({ kind: "custom" });
    return boundPreset?.signature?.kind === "custom"
      ? boundPreset.signature.name
      : __("Your own", "structura");
  };
  const activeName = selectionName(selection);
  const shownSheet = character.shown === "card" ? character.effective?.sheet : character.draftSheet;
  const sheetSignatureName = refName(shownSheet?.signature) || activeName;
  const characterName = character.effective?.name || character.fields.name.trim();
  const oldSignatureName = refName(character.effective?.sheet?.signature);
  const signatureChanged = !!boundPreset && !sameSignature(activeSignature, boundPreset.signature);
  // As-is images and a mascot in its own style need no new sheet; a line says so (handoff §7).
  const noSheetNeeded =
    character.shown === "card" &&
    activeTakesCharacter &&
    signatureChanged &&
    !!character.effective &&
    (character.effective.reference === "asIs" || character.effective.keepOwnStyle);

  const chooseAppearance = (next: VisualAppearance) => {
    character.selectAppearance(next);
    setGridError(false);
    // The builder offers no photography while a character is chosen.
    if (next !== "nobody" && custom?.medium === "photography" && mode === "builder") {
      setCustom({ ...custom, medium: "illustration" });
    }
  };

  /** "Keep {old}": back to the signature the sheet was drawn in. */
  const keepSheetSignature = () => {
    const ref = character.effective?.sheet?.signature;
    if (ref?.kind === "curated") {
      setSelection({ kind: "curated", id: ref.id as SignatureId, version: ref.version });
    } else if (boundPreset?.signature?.kind === "custom") {
      setSelection({ kind: "custom" });
      setCustom(customDraftFromChoice(boundPreset.signature));
    }
    setMode("picker");
    setFocusTarget("grid");
  };

  const isShared = (boundPreset?.boundActivationCount ?? 0) > 1;
  const isBusy = isCreating || isUpdating || isForking || isRemoving || isBinding;
  const isDirty =
    (draft !== null &&
      baseline !== null &&
      snapshotOf(draft, selection, custom, !boundPreset) !== baseline) ||
    character.dirty;

  const updateDraft = (patch: Partial<DraftState>) => {
    setIsPristine(false);
    setDraft((prev) => (prev ? { ...prev, ...patch } : null));
  };

  const selectSignature = (next: SignatureSelection) => {
    setIsPristine(false);
    setSelection(next);
    setGridError(false);
  };

  const openBuilder = () => {
    setIsPristine(false);
    setCustom((prev) => {
      const next = prev ?? newCustomDraft(siteName);
      // While a character is chosen the builder offers no photography.
      return characterMode && next.medium === "photography"
        ? { ...next, medium: "illustration" }
        : next;
    });
    setSelection({ kind: "custom" });
    setGridError(false);
    setMode("builder");
    setFocusTarget("builder");
  };

  /**
   * False when the custom signature still misses one of its four fields, or
   * its name when `needName` (a save needs it, a sheet does not): the builder
   * opens with the errors and focus on the first (handoff §2.4).
   */
  const customReady = (needName: boolean): boolean => {
    const draftCustom = custom ?? newCustomDraft(siteName);
    const missing = missingCustomFields(draftCustom).filter(
      (field) => needName || field !== "name"
    );
    if (missing.length === 0) return true;
    setCustom(draftCustom);
    setCustomErrors(new Set(missing));
    setMode("builder");
    setFocusTarget(missing[0]);
    return false;
  };

  /**
   * The content to save, or null when a custom signature still misses a
   * field: then the builder opens with the errors and nothing is sent.
   */
  const contentToSave = (): VisualContent | null => {
    if (!draft) return null;
    if (selection.kind === "custom" && !customReady(true)) return null;
    return buildContent(draft, selection, custom, !boundPreset);
  };

  // A refused signature (the plan gate, spec §7) puts the picker back on the
  // saved choice; the mutation already showed the toast.
  const handleSaveError = (err: unknown) => {
    if (!isPlanGatedError(err)) return;
    setSelection(boundSelection ?? houseSelection());
    setMode("picker");
  };

  /**
   * Runs a save's checks. Every field they refuse is on the Images tab and
   * each refusal focuses its field, which a hidden panel cannot take: a
   * refusal while Video shows brings Images forward, then runs the checks
   * again so the focus lands.
   */
  const passesSaveChecks = (checks: () => boolean): boolean => {
    if (checks()) return true;
    if (shownTab !== "images") {
      flushSync(() => showTab("images"));
      checks();
    }
    return false;
  };

  const handleSaveBound = async () => {
    // The character's refusals come first, in the handoff's order (§2).
    if (!passesSaveChecks(() => character.validateForSave() && contentToSave() !== null)) return;
    const content = contentToSave();
    if (!draft || !content) return;
    try {
      if (!boundPreset) {
        // Unbound — create a new preset for this site and bind it.
        await create({
          label: draft.label || __("Site default", "structura"),
          content,
          bind_to_activation: true,
        });
      } else {
        const characterPatch = character.savePatch();
        await update({
          preset_id: boundPreset.presetId,
          label: draft.label,
          content: { ...content, ...characterPatch },
        });
        character.markSaved(!!characterPatch.character);
      }
      setIsPristine(true);
    } catch (err) {
      handleSaveError(err);
    }
  };

  const handleSaveAsNew = async () => {
    if (!passesSaveChecks(() => contentToSave() !== null)) return;
    const content = contentToSave();
    if (!draft || !boundPreset || !content) return;
    // Fork from the currently-bound preset, then apply the in-progress
    // edits to the new fork. Two-step because the cloud's fork endpoint
    // clones the source verbatim — we update right after to land the
    // user's edits on the new doc rather than the source.
    try {
      const result = await fork({
        preset_id: boundPreset.presetId,
        label: draft.label || `${boundPreset.label} (this site)`,
        bind_to_activation: true,
      });
      if (result?.preset?.presetId) {
        await update({ preset_id: result.preset.presetId, content });
      }
      setIsPristine(true);
    } catch (err) {
      handleSaveError(err);
    }
  };

  // "Scan my site" and "Re-scan site": rerun the thin pass, replacing the
  // palette and the pick (spec §6).
  const handleScan = async () => {
    setScanning(true);
    try {
      const result = await suggestSignature.mutateAsync();
      if (result && result.palette.length > 0) {
        updateDraft({ palette: result.palette });
      } else {
        toast.error(
          __("Couldn’t read your site’s colors right now. Try again in a moment.", "structura")
        );
      }
    } catch (err) {
      toast.error(humanizeSuggestionError(err, { isManagedAiPlan: isManagedPlan(plan as PlanId) }));
    } finally {
      setScanning(false);
    }
  };

  const draftSources: ContextField[] = [
    ...(profile?.publicUrl || profile?.homeUrl
      ? [{ title: profile?.name || "Homepage", url: profile.publicUrl || profile.homeUrl }]
      : []),
    ...(legacyConfig?.logo_url ? [{ title: "Site Logo", url: legacyConfig.logo_url }] : []),
  ];

  const previewRequest = () => {
    if (!draft) return null;
    if (selection.kind === "custom") {
      // Same check as Save: the cloud refuses a custom signature with an empty field.
      if (!contentToSave()) return null;
    } else if (selection.kind === "free" && !draft.global_art_direction.trim()) {
      return null;
    }
    return {
      signature: signatureForSelection(selection, custom),
      ...(selection.kind === "free"
        ? {
            global_art_direction: draft.global_art_direction,
            medium: draft.medium ?? "photography",
          }
        : {}),
      palette: draft.palette ?? [],
      ...character.previewPart(),
    };
  };

  const handleUseHere = async (presetId: string) => {
    await bind({ preset_id: presetId });
    setIsPristine(true);
  };

  const handleDuplicate = async (presetId: string) => {
    await fork({ preset_id: presetId, bind_to_activation: true });
    setIsPristine(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDelete) return;
    try {
      await remove(confirmDelete.presetId);
    } finally {
      setConfirmDelete(null);
    }
  };

  /** Runs Use here or Duplicate from Switch preset; closes it once the call went through. */
  const runSwitchAction = async (
    presetId: string,
    action: "use" | "duplicate",
    run: (presetId: string) => Promise<void>
  ) => {
    setSwitchPending({ id: presetId, action });
    try {
      await run(presetId);
      setSwitchOpen(false);
    } catch {
      // The mutation's toast says what failed; the popup stays open to try again.
    } finally {
      setSwitchPending(null);
    }
  };

  const dateLocale = typeof document !== "undefined" ? document.documentElement.lang : "";
  // Newest edit first, as the cloud lists them. A row names the look, never the prompt text.
  const switchRows: PresetLibraryRow[] = [...otherPresets]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .map((p) => {
      const curated = p.signature?.kind === "curated" ? p.signature.id : null;
      const meta = curated ? getSignatureMeta(curated) : undefined;
      const edited = formatEditedDate(p.updatedAt, dateLocale || undefined);
      return {
        id: p.presetId,
        name: p.label,
        thumbnailSrc: meta?.thumbnail.small,
        thumbnailSrcSet: meta && `${meta.thumbnail.small} 1x, ${meta.thumbnail.large} 2x`,
        look: curated
          ? isSignatureId(curated)
            ? signatureName(curated)
            : curated
          : p.signature?.kind === "custom"
            ? p.signature.name
            : __("Free prompt", "structura"),
        palette: p.palette,
        usage:
          p.boundActivationCount > 0
            ? sprintf(
                /* translators: %d: number of sites */
                __("Used by %d site(s)", "structura"),
                p.boundActivationCount
              )
            : edited
              ? sprintf(
                  /* translators: %s: the day the preset was last edited, e.g. "Sep 12" */
                  __("Not used · edited %s", "structura"),
                  edited
                )
              : __("Not used", "structura"),
        canDelete: p.boundActivationCount === 0,
      };
    });
  const switchPresetButton = (
    <Button size="sm" variant="secondary" className="shrink-0" onClick={() => setSwitchOpen(true)}>
      <ArrowLeftRight className="size-3.5" aria-hidden="true" />
      <span className="ml-1.5">{__("Switch preset", "structura")}</span>
    </Button>
  );

  /**
   * Video-field patch from a visual suggest response. The cloud's visual
   * suggest drafts `videoArtDirection` (footage/pacing/mood vocabulary)
   * and extracts the brand `palette` alongside the image prompt — both
   * are preset fields, so any suggest pass that returns them lands them
   * on the draft. Fields already sanitized cloud-side.
   */
  const videoPatchFromSuggestion = (
    data: { videoArtDirection?: unknown; palette?: unknown } | null
  ): Partial<DraftState> => {
    if (!data) return {};
    return {
      ...(typeof data.videoArtDirection === "string" && data.videoArtDirection
        ? { video_art_direction: data.videoArtDirection }
        : {}),
      ...(Array.isArray(data.palette) && data.palette.every((c) => typeof c === "string")
        ? { palette: data.palette as string[] }
        : {}),
    };
  };

  /**
   * "Suggest video style" — same suggest call and grounding as the image
   * affordance, but only the video-side fields land: the image prompt the
   * user already curated must survive a video-only redraft.
   */
  const handleMagicVideoStyle = async (provider: string, context: ContextField[]) => {
    const data = await suggest("visual", {
      provider: provider as AIProvider,
      context,
      medium: draft?.medium ?? "photography",
    });
    const patch = videoPatchFromSuggestion(data);
    if (Object.keys(patch).length > 0) {
      updateDraft(patch);
    }
  };

  // `plan === "none"` is the permanent state for users on the
  // anonymous shadow workspace flow (Phase 1.8). They have a
  // workspace + bearer, but no image generation — see the feature
  // matrix in `specs/v2/multi-tenant-and-public-api.md` §Phase 1.8.
  // The Visuals page renders a permanent teaser for them; visual
  // presets stay licensed-only, so even though the workspace
  // exists, `useVisualPresetsQuery` is gated on
  // `hasUsableLicense` and never fires. PR1a's `!isLicensed` gate
  // happened to cover both the anonymous case AND the legacy
  // disconnected case; PR7b narrows it to `plan === "none"` so
  // licensed-but-cloud-pending installs (where plan is briefly
  // "none" while the cloud heartbeat is in flight) don't flash
  // the teaser before the licensed render lands.
  if (plan === "none") {
    return (
      <div className="space-y-10">
        <header className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <PageTitle>{__("Visuals", "structura")}</PageTitle>
            <PageDescription>
              {__("Image Generation & Optimization Engine", "structura")}
            </PageDescription>
          </div>
        </header>
        <UnlicensedTeaser />
      </div>
    );
  }

  if (isLoadingPresets || !draft) {
    return <PageLoader label={__("Calibrating Optics…", "structura")} size="lg" padding="lg" />;
  }

  return (
    <div className="space-y-10">
      {/* HEADER */}
      <header className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <PageTitle>{__("Visuals", "structura")}</PageTitle>
          <PageDescription>
            {boundPreset
              ? sprintf(
                  /* translators: %s: preset label */
                  __("Active preset · %s", "structura"),
                  boundPreset.label
                )
              : __("Image Generation & Optimization Engine", "structura")}
          </PageDescription>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span role="status" className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            {isDirty ? __("Unsaved changes", "structura") : ""}
          </span>
          {!isShared && (
            <Button onClick={handleSaveBound} disabled={isBusy} loading={isUpdating || isCreating}>
              <Save className="size-4" />
              <span className="ml-2">{__("Save Changes", "structura")}</span>
            </Button>
          )}
        </div>
      </header>

      {/* UNBOUND BANNER */}
      {!boundPreset && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/30 dark:bg-amber-950/20">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="flex-1">
            <p className="m-0! text-sm font-medium text-amber-900 dark:text-amber-300">
              {__("No visual preset bound to this site", "structura")}
            </p>
            <p className="mt-1! mb-0! text-xs leading-relaxed text-amber-900/80 dark:text-amber-300/80">
              {__(
                "Image generation will fail until a preset is bound. Configure one below or pick an existing preset from the workspace library.",
                "structura"
              )}
            </p>
            {otherPresets.length > 0 && <div className="mt-3">{switchPresetButton}</div>}
          </div>
        </div>
      )}

      {/* SHARED-PRESET WARNING */}
      {boundPreset && isShared && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/30 dark:bg-amber-950/20">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="flex-1">
            <p className="m-0! text-sm font-medium text-amber-900 dark:text-amber-300">
              {sprintf(
                /* translators: %d: number of other sites */
                __("Used by %d other site(s) in this workspace", "structura"),
                boundPreset.boundActivationCount - 1
              )}
            </p>
            <p className="mt-1! mb-0! text-xs leading-relaxed text-amber-900/80 dark:text-amber-300/80">
              {__(
                'Saving will update the preset for every site that uses it. Pick "Save as new for this site only" to fork into an independent preset bound to this site.',
                "structura"
              )}
              {characterMode && characterName && (
                <>
                  {" "}
                  {sprintf(
                    /* translators: 1: the character's name, e.g. "Lena", 2: how many sites use the preset */
                    _n(
                      "%1$s appears in new images on the %2$d site that uses it.",
                      "%1$s appears in new images on all %2$d sites.",
                      boundPreset.boundActivationCount,
                      "structura"
                    ),
                    characterName,
                    boundPreset.boundActivationCount
                  )}
                </>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={handleSaveBound} disabled={isBusy} loading={isUpdating}>
                <Save className="size-4" />
                <span className="ml-2">{__("Save (update for all sites)", "structura")}</span>
              </Button>
              <Button
                onClick={handleSaveAsNew}
                disabled={isBusy}
                loading={isForking}
                variant="secondary"
              >
                <Copy className="size-4" />
                <span className="ml-2">{__("Save as new for this site only", "structura")}</span>
              </Button>
            </div>
            {/* The cloud's copy carries no character: a likeness is never duplicated. */}
            {characterMode && (
              <p className="mt-2! mb-0! text-xs leading-relaxed text-amber-900/80 dark:text-amber-300/80">
                {__(
                  "A copy is saved without the character, which stays with this preset.",
                  "structura"
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ACTIVE PRESET: one column since 2026-11-21. The name and the palette
       * belong to images and videos alike, so they sit above the tabs. */}
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-[420px] min-w-0 flex-1">
            <InputField
              labelStyle="prominent"
              label={__("Preset name", "structura")}
              value={draft.label}
              onChange={(e) => updateDraft({ label: e.target.value })}
              placeholder={__("Site default", "structura")}
            />
          </div>
          {/* An unbound site has the button in its warning above. */}
          {boundPreset && otherPresets.length > 0 && switchPresetButton}
        </div>

        <div className="my-6 h-px bg-neutral-200 dark:bg-neutral-800" />

        <BrandPaletteField
          headingId={paletteHeadingId}
          palette={draft.palette ?? []}
          onChange={(palette) => updateDraft({ palette })}
          scanning={scanning}
          onScan={handleScan}
        />

        {hasVideoTab ? (
          // The strip spans the card in two equal halves, as the head of both panels.
          // Labels a size up so the full-width strip does not read thin; `!` because
          // wp-admin's forms.css gives every button an inherited size and weight.
          <div ref={tabStripRef} className="mt-8 mb-6">
            <Tabs
              stretch
              className="[&>[role=tab]]:py-2 [&>[role=tab]]:text-sm! [&>[role=tab]]:font-bold!"
              aria-label={__("Visuals", "structura")}
              value={shownTab}
              onChange={(id) => showTab(id as VisualsTab)}
              items={[
                { id: "images", label: __("Images", "structura"), controls: imagesPanelId },
                { id: "video", label: __("Video", "structura"), controls: videoPanelId },
              ]}
            />
          </div>
        ) : (
          <div className="mt-7 mb-6 h-px bg-neutral-200 dark:bg-neutral-800" />
        )}

        <div
          id={imagesPanelId}
          role={hasVideoTab ? "tabpanel" : undefined}
          aria-label={hasVideoTab ? __("Images", "structura") : undefined}
          hidden={shownTab !== "images"}
        >
          {/* Who appears (recurring-character handoff §3), before the signature. */}
          {characterOffered && boundPreset && (
            <>
              <WhoSelector
                headingId={whoHeadingId}
                value={character.appearance}
                onChange={chooseAppearance}
                locked={!characterOpen}
                unavailable={presetsData?.characterAvailable === false}
                savedAppearance={boundPreset.appearance ?? "nobody"}
                kept={
                  character.appearance === "nobody" && character.live
                    ? { name: character.live.name, kind: character.live.kind }
                    : null
                }
                onRemoveKept={character.openRemove}
                upgradeHref={upgradeHref}
                groupRef={character.register("selector")}
              />
              <div className="my-6 h-px bg-neutral-200 dark:bg-neutral-800" />
            </>
          )}

          {/* Signature (specs/visual-signatures.md §8): the picker, or the
           * builder in its place so the palette above and Preview below
           * render the unsaved draft (handoff decision 5). */}
          {mode === "builder" && custom ? (
            <SignatureBuilder
              headingId={builderHeadingId}
              headingRef={builderHeadingRef}
              nameRef={nameRef}
              fieldRefs={fieldRefs}
              draft={custom}
              onUpdate={(update) => {
                setIsPristine(false);
                setCustom((prev) => update(prev ?? newCustomDraft(siteName)));
              }}
              errors={customErrors}
              onFieldEdited={(field) =>
                setCustomErrors((prev) => {
                  if (!prev.has(field)) return prev;
                  const next = new Set(prev);
                  next.delete(field);
                  return next;
                })
              }
              onBack={() => {
                setMode("picker");
                setFocusTarget("custom-card");
              }}
              draftProvider={defaultTextProvider}
              draftSources={draftSources}
              media={characterMode ? CHARACTER_MEDIA : undefined}
              // The palette editor's own path, so dirty state, Save and the preview see it.
              onUseColors={(palette) => updateDraft({ palette })}
            />
          ) : (
            <section aria-labelledby={signatureHeadingId} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h3
                  id={signatureHeadingId}
                  className="m-0! text-base font-bold tracking-tight text-neutral-900! dark:text-white!"
                >
                  {__("Signature", "structura")}
                </h3>
                <p className="m-0! max-w-[62ch] text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {__(
                    "Pick the look every image on this site shares. Examples are shown in neutral colors.",
                    "structura"
                  )}
                </p>
              </div>
              {characterMode && (
                <>
                  <ReasonRow icon={<Info size={14} />}>
                    <span>
                      {__(
                        "Only styles that can draw a character the same way every time are shown. Photo styles and Free prompt are hidden while a character is chosen.",
                        "structura"
                      )}
                      {!activeTakesCharacter && (
                        <>
                          {" "}
                          {sprintf(
                            /* translators: %s: the current style's name, e.g. "Editorial reportage" */
                            __(
                              "Your current style, %s, is one of them, so pick a new one here.",
                              "structura"
                            ),
                            activeName
                          )}
                        </>
                      )}
                    </span>
                  </ReasonRow>
                  {gridError && (
                    <FieldError id={gridErrorId}>
                      {characterName
                        ? sprintf(
                            /* translators: %s: the character's name, e.g. "Lena" */
                            __("Pick a style for %s before you save.", "structura"),
                            characterName
                          )
                        : __("Pick one of these styles before you save.", "structura")}
                    </FieldError>
                  )}
                </>
              )}
              <SignaturePicker
                labelledBy={signatureHeadingId}
                signatures={characterMode ? characterSignatures() : orderedSignatures()}
                // A hidden choice checks no card, so every card stays tabbable.
                selection={characterMode && !activeTakesCharacter ? null : selection}
                bound={boundSelection}
                plan={plan}
                // No "Our pick" while a character is chosen (handoff decision 9).
                pickId={characterMode ? undefined : suggestion?.pick}
                reason={characterMode ? undefined : suggestion?.reason}
                upgradeHref={upgradeHref}
                onSelect={selectSignature}
                extras={
                  characterMode
                    ? {
                        custom: custom?.medium === "photography" ? null : custom,
                        onOpenBuilder: openBuilder,
                        ownDescription: __(
                          "Set the technique, motifs and framing yourself, as an illustration or a 3D render.",
                          "structura"
                        ),
                      }
                    : {
                        custom,
                        onOpenBuilder: openBuilder,
                        onSelectFree: () => {
                          selectSignature({ kind: "free" });
                          setFocusTarget("free-prompt");
                        },
                      }
                }
                customCardRef={customCardRef}
                groupRef={gridRef}
                errorId={characterMode && gridError ? gridErrorId : undefined}
              />
              {characterMode && character.needsNewSheet && (
                <div className="flex flex-col gap-2">
                  <InlineAdvice
                    ref={character.register("notice")}
                    state="open"
                    lead={sprintf(
                      /* translators: 1: the character's name, e.g. "Lena", 2: a style name, e.g. "Ink and fill" */
                      __("%1$s was drawn in %2$s.", "structura"),
                      characterName,
                      oldSignatureName
                    )}
                    reason={sprintf(
                      /* translators: 1: the newly picked style, 2: the style the sheet was drawn in */
                      __(
                        "To use %1$s, approve a new character sheet drawn in it. Until then, Save keeps %2$s.",
                        "structura"
                      ),
                      activeName,
                      oldSignatureName
                    )}
                    primary={{
                      label: sprintf(
                        /* translators: 1: the character's name, e.g. "Lena", 2: the newly picked style */
                        __("Draw %1$s in %2$s · 1 image", "structura"),
                        characterName,
                        activeName
                      ),
                      onClick: character.drawForNewSignature,
                    }}
                    secondary={{
                      label: sprintf(
                        /* translators: %s: the style the sheet was drawn in, e.g. "Ink and fill" */
                        __("Keep %s", "structura"),
                        oldSignatureName
                      ),
                      onClick: keepSheetSignature,
                    }}
                    announcement={
                      character.changeAnnounced
                        ? sprintf(
                            /* translators: 1: the character's name, e.g. "Lena", 2: the newly picked style */
                            __("%1$s needs a new sheet for %2$s.", "structura"),
                            characterName,
                            activeName
                          )
                        : undefined
                    }
                  />
                  {character.errors.change && (
                    <FieldError>
                      {sprintf(
                        /* translators: 1: the newly picked style, 2: the style the sheet was drawn in */
                        __("Approve a sheet in %1$s first, or keep %2$s.", "structura"),
                        activeName,
                        oldSignatureName
                      )}
                    </FieldError>
                  )}
                </div>
              )}
              {characterMode && noSheetNeeded && (
                <p
                  role="status"
                  className="m-0! flex items-start gap-2 text-[12.5px] leading-[1.45] text-neutral-600 dark:text-neutral-300"
                >
                  <CircleCheck
                    size={15}
                    aria-hidden="true"
                    className="mt-px shrink-0 text-emerald-700 dark:text-emerald-400"
                  />
                  {character.effective?.reference === "asIs"
                    ? sprintf(
                        /* translators: %s: the character's name, e.g. "Lena" */
                        __(
                          "%s uses your image as it is, so no new sheet is needed for this style.",
                          "structura"
                        ),
                        characterName
                      )
                    : sprintf(
                        /* translators: %s: the character's name, e.g. "Pip" */
                        __(
                          "%s keeps its own drawing style, so no new sheet is needed for this style.",
                          "structura"
                        ),
                        characterName
                      )}
                </p>
              )}
              {!characterMode && selection.kind === "free" && (
                <TextArea
                  ref={freePromptRef}
                  labelStyle="prominent"
                  label={__("Your prompt", "structura")}
                  description={__(
                    "Describe the technique, recurring subjects and framing. We add your brand palette to it.",
                    "structura"
                  )}
                  placeholder={__(
                    "Describe the look: technique, recurring subjects, framing, what to avoid",
                    "structura"
                  )}
                  rows={6}
                  className="font-mono"
                  value={draft.global_art_direction}
                  onChange={(e) => updateDraft({ global_art_direction: e.target.value })}
                />
              )}
            </section>
          )}

          {characterMode && (
            <>
              <div className="mt-7 mb-6 h-px bg-neutral-200 dark:bg-neutral-800" />
              <CharacterSection
                editor={character}
                signatureName={activeTakesCharacter ? activeName : null}
                sheetSignatureName={sheetSignatureName}
                canEdit={characterOpen}
              />
            </>
          )}

          <div className="mt-7 mb-6 h-px bg-neutral-200 dark:bg-neutral-800" />

          <SignaturePreview
            headingId={previewHeadingId}
            locked={!canUseSignatureLibrary(plan)}
            upgradeHref={upgradeHref}
            imagesResetOn={imagesResetOn}
            buildRequest={previewRequest}
            note={
              characterMode && character.shown !== "card"
                ? __(
                    "Previews show the style without a character until a character sheet is approved.",
                    "structura"
                  )
                : undefined
            }
          />

          <div className="my-6 h-px bg-neutral-200 dark:bg-neutral-800" />

          {/* OUTPUT: the image-output settings, a column of cards beside the
           * editor until 2026-11-21. */}
          <section aria-labelledby={outputHeadingId} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h3
                id={outputHeadingId}
                className="m-0! text-base font-bold tracking-tight text-neutral-900! dark:text-white!"
              >
                {__("Output", "structura")}
              </h3>
              {/* SEO automation is always on: alt-text and SEO-friendly
               * filenames are written into the generation schema on every
               * image (functions/src/ai/instruction-builder.ts), regardless
               * of any setting. The old "Active Synthesis Meta" toggle wrote
               * `optimize_on_upload`, which nothing in the pipeline reads —
               * so we state the behaviour instead of shipping a dead toggle.
               * The field stays on the draft/wire payload for back-compat. */}
              <p className="m-0! max-w-[62ch] text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                {__(
                  "Every image gets alt text and an SEO-friendly filename automatically.",
                  "structura"
                )}
              </p>
            </div>

            <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Select
                  options={aspectRatioOptions}
                  onValueChange={(val) => updateDraft({ aspect_ratio: val as string })}
                  value={draft.aspect_ratio}
                >
                  <Select.Label labelStyle="prominent">
                    {__("Dimensions", "structura")}
                  </Select.Label>
                  <Select.Trigger placeholder={__("Select dimensions...", "structura")} />
                  <Select.Content className="w-(--button-width)">
                    {aspectRatioOptions.map((opt) => (
                      <Select.Item key={opt.value} value={opt.value}>
                        {opt.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
                {showOpenAIRatioHint && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/30 dark:bg-amber-950/20">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <p className="m-0! text-[11px] leading-relaxed text-amber-900 dark:text-amber-300">
                      {draft.aspect_ratio === "16:9"
                        ? __(
                            "OpenAI image models don't support 16:9 natively — your images will be rendered at 3:2 (1536×1024), the closest landscape size. For exact 16:9, switch the image provider to Gemini.",
                            "structura"
                          )
                        : __(
                            "OpenAI image models don't support 9:16 natively — your images will be rendered at 2:3 (1024×1536), the closest portrait size. For exact 9:16, switch the image provider to Gemini.",
                            "structura"
                          )}
                    </p>
                  </div>
                )}
              </div>
              <Select
                disabled={!isPaidLicense}
                onValueChange={(val) => updateDraft({ format: val as string })}
                value={draft.format}
                options={assetFormatOptions}
              >
                <Select.Label labelStyle="prominent" className="flex items-center gap-2">
                  {__("Format", "structura")}
                  {!isPaidLicense && (
                    <Badge intent="premium" variant="solid" className="px-2 text-[8px]">
                      {__("Pro", "structura")}
                    </Badge>
                  )}
                </Select.Label>
                <Select.Trigger placeholder={__("Select encoding...", "structura")} />
                <Select.Content className="w-(--button-width)">
                  {assetFormatOptions.map((opt) => (
                    <Select.Item key={opt.value} value={opt.value}>
                      {opt.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>

            {/* EU AI label (specs/ai-image-label.md §7): every plan, no plan
             * check. The preview shows the pill the cloud stamps. */}
            <div role="group" aria-labelledby={aiLabelHeadingId} className="mt-3 max-w-2xl">
              <h4
                id={aiLabelHeadingId}
                className="m-0! mb-3! text-sm font-bold text-neutral-900! dark:text-white!"
              >
                {__("AI label", "structura")}
              </h4>
              <Switch
                label={__("Label images as AI-generated", "structura")}
                checked={!!draft.ai_label}
                onChange={(checked) => updateDraft({ ai_label: checked })}
              />
              <p className="mt-3! mb-0! text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                {__(
                  "Adds the EU “AI generated” badge to the corner of every image we create with this preset. EU rules ask publishers to mark realistic AI images.",
                  "structura"
                )}
              </p>
              <p className="mt-2! mb-0! text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                {__(
                  "Images that already exist are not changed. Regenerating an image applies the current setting.",
                  "structura"
                )}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <AiGeneratedBadge
                  variant="black"
                  height={18}
                  label={__("EU “AI generated” badge", "structura")}
                  className="dark:hidden"
                />
                <AiGeneratedBadge
                  variant="white"
                  height={18}
                  label={__("EU “AI generated” badge", "structura")}
                  // `s-hidden`, not `hidden`: wp-admin's unlayered `.hidden`
                  // would beat `dark:block` and hide it in dark mode too.
                  className="s-hidden dark:block"
                />
                <a
                  href={docsUrl("using/generated-posts/visuals#ai-label")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {__("Learn more", "structura")}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </section>
        </div>

        {/* VIDEO — preset-owned video styling (handoff §1) in its tab, the
         * `?section=video` deep-link target; the teaser shares the panel so a
         * locked plan's deep link lands on the upgrade row instead of dead
         * space. */}
        {hasVideoTab && (
          <div
            id={videoPanelId}
            role="tabpanel"
            aria-label={__("Video", "structura")}
            hidden={shownTab !== "video"}
            className={cn(
              "duration-normal transition-shadow",
              videoHighlight && "ring-brand-400/60 rounded-xl ring-2"
            )}
          >
            {videoEligibility === "eligible" ? (
              <VideoPresetSection
                videoStyle={draft.video_style}
                videoArtDirection={draft.video_art_direction}
                captionPlacement={draft.caption_placement}
                palette={draft.palette}
                onVideoStyleChange={(style) => updateDraft({ video_style: style })}
                onVideoArtDirectionChange={(value) => updateDraft({ video_art_direction: value })}
                onCaptionPlacementChange={(placement) =>
                  updateDraft({ caption_placement: placement })
                }
                suggestSlot={
                  <SuggestStrategySection
                    isStrategizing={isSuggesting}
                    onGenerate={async (provider, context) => {
                      await handleMagicVideoStyle(provider, context);
                    }}
                    toggleButtonLabel={__("Suggest Video Style", "structura")}
                    contextFieldLabel={__(
                      "Brand Resources (logo, guidelines, design system URL…)",
                      "structura"
                    )}
                    addSourceLabel={__("Add Resource", "structura")}
                    ctaButtonLabel={__("Generate Video Style", "structura")}
                    placeholder={{
                      title: __("Company logo", "structura"),
                      url: `${window.location.origin}/logo.png`,
                    }}
                    initialSources={
                      legacyConfig?.logo_url
                        ? [
                            {
                              title: __("Site Logo", "structura"),
                              url: legacyConfig.logo_url,
                            },
                          ]
                        : undefined
                    }
                  />
                }
              />
            ) : (
              <VideoStylingGateTeaser plan={plan} />
            )}
          </div>
        )}
      </Card>

      <PresetLibraryDialog
        open={switchOpen}
        onClose={() => setSwitchOpen(false)}
        rows={switchRows}
        onUse={(id) => void runSwitchAction(id, "use", handleUseHere)}
        onDuplicate={(id) => void runSwitchAction(id, "duplicate", handleDuplicate)}
        // The page's own confirmation opens over the popup.
        onDelete={(id) => setConfirmDelete(otherPresets.find((p) => p.presetId === id) ?? null)}
        pending={switchPending}
        labels={{
          title: __("Switch preset", "structura"),
          close: __("Close", "structura"),
          search: __("Search by name", "structura"),
          useHere: __("Use here", "structura"),
          duplicate: __("Duplicate to this site", "structura"),
          delete: __("Delete", "structura"),
          palette: __("Brand colors", "structura"),
          empty: __("No other presets in your library.", "structura"),
          noMatches: __("No presets match your search.", "structura"),
        }}
      />

      {characterOffered && boundPreset && (
        <RemoveCharacterDialog
          open={character.removeOpen}
          character={character.removeTarget}
          sharedBySites={boundPreset.boundActivationCount}
          loading={character.removing}
          onCancel={character.closeRemove}
          onConfirm={() => void character.confirmRemove()}
        />
      )}

      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDeleteConfirmed}
        title={__("Delete preset?", "structura")}
        description={
          confirmDelete
            ? sprintf(
                /* translators: %s: preset label */
                __('Delete "%s"? This is only allowed when no site is bound to it.', "structura"),
                confirmDelete.label
              )
            : ""
        }
        variant="danger"
        loading={isRemoving}
        confirmButtonProps={{ label: __("Delete", "structura") }}
        cancelButtonProps={{ label: __("Cancel", "structura") }}
      />
    </div>
  );
};

// ─── Unlicensed teaser (anonymous / "none" plan) ──────────────────────

const UnlicensedTeaser = () => {
  const { plan } = useLicense();
  const domain = typeof window !== "undefined" ? window.location.hostname : undefined;
  return (
    <div className="flex flex-col items-center justify-center gap-6 rounded-3xl border-2 border-dashed border-neutral-200 bg-neutral-50 px-8 py-20 text-center dark:border-neutral-700 dark:bg-neutral-900/50">
      <div className="bg-brand-100 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 flex size-16 items-center justify-center rounded-2xl">
        <Lock size={28} />
      </div>
      <div className="space-y-2">
        <h3 className="m-0! text-lg font-black tracking-tight text-neutral-900 dark:text-white">
          {__("Style Every Image Consistently", "structura")}
        </h3>
        <p className="m-0! mx-auto max-w-sm text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
          {__(
            "Connect a free account to define a Global Art Direction that gets injected into every AI image generation across this site.",
            "structura"
          )}
        </p>
      </div>
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Button asChild>
          <a
            href={buildPortalSignupUrl({
              intent: "unlock_visuals",
              domain,
              plan,
            })}
            target="_blank"
            rel="noreferrer"
            className="text-white!"
          >
            {__("Get Free License", "structura")}
            <ArrowRight size={16} className="ml-2" strokeWidth={2.5} />
          </a>
        </Button>
        <Button asChild variant="secondary">
          <a
            href={buildMarketingPricingUrl({
              intent: "unlock_visuals",
              domain,
              plan,
            })}
            target="_blank"
            rel="noreferrer"
          >
            {__("View Pricing", "structura")}
          </a>
        </Button>
      </div>
    </div>
  );
};
