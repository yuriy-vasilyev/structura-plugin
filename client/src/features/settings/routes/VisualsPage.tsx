import { createRef, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { useSearchParams } from "react-router";
import { __, sprintf } from "@wordpress/i18n";
import {
  AlertTriangle,
  ArrowRight,
  Copy,
  ExternalLink,
  FileCode,
  Info,
  Lock,
  Maximize,
  Palette,
  Save,
  SearchCheck,
  Stamp,
  Trash2,
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
  InputField,
  PageLoader,
  Select,
  Switch,
  TextArea,
  toast,
} from "@structura/ui";
import { canUseSignatureLibrary, isManagedPlan, type PlanId } from "@structura/types";
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
  type VisualPresetWire,
  type VisualSignatureSuggestion,
} from "@/features/settings/api/useVisualPresets";
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
  selectionFromChoice,
  signatureForSelection,
  type BuilderField,
  type CustomSignatureDraft,
  type SignatureSelection,
} from "../signatures/signatureModel";

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
type FocusTarget = "name" | BuilderField | "builder" | "custom-card" | "free-prompt";

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
  const idBase = useId();
  const signatureHeadingId = `${idBase}-signature`;
  const builderHeadingId = `${idBase}-builder`;
  const paletteHeadingId = `${idBase}-palette`;
  const previewHeadingId = `${idBase}-preview`;
  // Every move that sets a target also changes state, so the render it
  // causes runs this effect once the target exists.
  const pendingFocus = useRef<FocusTarget | null>(null);
  const setFocusTarget = (target: FocusTarget) => {
    pendingFocus.current = target;
  };
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
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

  // ── Video styling (video-visuals handoff §1) ─────────────────────────
  // Gate comes from the Video channel's cloud-computed catalog
  // entitlement (the same check the Store card uses); "unknown" renders
  // neither section nor teaser. The section is the deep-link target of
  // the channel dialog's "Edit in Visuals" (`/visuals?section=video` —
  // query param rather than a location hash because the SPA is
  // hash-routed): on landing we scroll it into view and pulse a brief
  // highlight ring, mirroring the Settings page's `?run=` pattern.
  const videoEligibility = useVideoStylingEligibility();
  const [searchParams] = useSearchParams();
  const videoSectionRef = useRef<HTMLDivElement>(null);
  const [videoHighlight, setVideoHighlight] = useState(false);
  const wantsVideoAnchor = searchParams.get("section") === "video";
  const videoSectionMounted = videoEligibility !== "unknown" && !!draft;
  useEffect(() => {
    if (!wantsVideoAnchor || !videoSectionMounted) return;
    videoSectionRef.current?.scrollIntoView({
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
  }, [wantsVideoAnchor, videoSectionMounted]);

  // Managed plans pick no image provider since 2026-10-06 (Structura binds
  // the image model), so there is no provider to switch.
  const showOpenAIRatioHint =
    !isCloud &&
    defaultImageProvider === "openai" &&
    (draft?.aspect_ratio === "16:9" || draft?.aspect_ratio === "9:16");

  const isShared = (boundPreset?.boundActivationCount ?? 0) > 1;
  const isBusy = isCreating || isUpdating || isForking || isRemoving || isBinding;
  const isDirty =
    draft !== null &&
    baseline !== null &&
    snapshotOf(draft, selection, custom, !boundPreset) !== baseline;
  const upgradeHref = buildMarketingPricingUrl({
    intent: "unlock_visuals",
    domain: typeof window !== "undefined" ? window.location.hostname : undefined,
    plan,
  });
  const siteName = profile?.name ?? "";

  const updateDraft = (patch: Partial<DraftState>) => {
    setIsPristine(false);
    setDraft((prev) => (prev ? { ...prev, ...patch } : null));
  };

  const selectSignature = (next: SignatureSelection) => {
    setIsPristine(false);
    setSelection(next);
  };

  const openBuilder = () => {
    setIsPristine(false);
    setCustom((prev) => prev ?? newCustomDraft(siteName));
    setSelection({ kind: "custom" });
    setMode("builder");
    setFocusTarget("builder");
  };

  /**
   * The content to save, or null when a custom signature still misses a
   * field: then the builder opens with the errors and focus on the first
   * (handoff §2.4), and nothing is sent.
   */
  const contentToSave = (): VisualContent | null => {
    if (!draft) return null;
    if (selection.kind === "custom") {
      const draftCustom = custom ?? newCustomDraft(siteName);
      const missing = missingCustomFields(draftCustom);
      if (missing.length > 0) {
        setCustom(draftCustom);
        setCustomErrors(new Set(missing));
        setMode("builder");
        setFocusTarget(missing[0]);
        return null;
      }
    }
    return buildContent(draft, selection, custom, !boundPreset);
  };

  // A refused signature (the plan gate, spec §7) puts the picker back on the
  // saved choice; the mutation already showed the toast.
  const handleSaveError = (err: unknown) => {
    if (!isPlanGatedError(err)) return;
    setSelection(boundSelection ?? houseSelection());
    setMode("picker");
  };

  const handleSaveBound = async () => {
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
        await update({
          preset_id: boundPreset.presetId,
          label: draft.label,
          content,
        });
      }
      setIsPristine(true);
    } catch (err) {
      handleSaveError(err);
    }
  };

  const handleSaveAsNew = async () => {
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
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* MAIN ART DIRECTION PANEL */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="max-w-[420px]">
              <InputField
                labelStyle="prominent"
                label={__("Preset name", "structura")}
                value={draft.label}
                onChange={(e) => updateDraft({ label: e.target.value })}
                placeholder={__("Site default", "structura")}
              />
            </div>

            <div className="my-6 h-px bg-neutral-200 dark:bg-neutral-800" />

            {/* Signature (specs/visual-signatures.md §8): the picker, or the
             * builder in its place so Palette and Preview below render the
             * unsaved draft (handoff decision 5). */}
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
              />
            ) : (
              <section aria-labelledby={signatureHeadingId} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h3
                    id={signatureHeadingId}
                    className="m-0! text-base font-bold tracking-tight text-neutral-900 dark:text-white"
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
                <SignaturePicker
                  labelledBy={signatureHeadingId}
                  signatures={orderedSignatures()}
                  selection={selection}
                  bound={boundSelection}
                  plan={plan}
                  pickId={suggestion?.pick}
                  reason={suggestion?.reason}
                  upgradeHref={upgradeHref}
                  onSelect={selectSignature}
                  extras={{
                    custom,
                    onOpenBuilder: openBuilder,
                    onSelectFree: () => {
                      selectSignature({ kind: "free" });
                      setFocusTarget("free-prompt");
                    },
                  }}
                  customCardRef={customCardRef}
                />
                {selection.kind === "free" && (
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

            <div className="mt-7 mb-6 h-px bg-neutral-200 dark:bg-neutral-800" />

            <BrandPaletteField
              headingId={paletteHeadingId}
              palette={draft.palette ?? []}
              onChange={(palette) => updateDraft({ palette })}
              scanning={scanning}
              onScan={handleScan}
            />

            <div className="my-6 h-px bg-neutral-200 dark:bg-neutral-800" />

            <SignaturePreview
              headingId={previewHeadingId}
              locked={!canUseSignatureLibrary(plan)}
              upgradeHref={upgradeHref}
              imagesResetOn={imagesResetOn}
              buildRequest={previewRequest}
            />

            {/* VIDEO — preset-owned video styling (handoff §1). Anchor id +
             * highlight make this the `?section=video` deep-link target;
             * the teaser shares the wrapper so a locked plan's deep link
             * lands on the upgrade row instead of dead space. */}
            {videoEligibility !== "unknown" && (
              <div
                id="video"
                ref={videoSectionRef}
                className={cn(
                  "duration-normal mt-6 border-t border-gray-200 pt-6 transition-shadow dark:border-neutral-800",
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
                    onVideoArtDirectionChange={(value) =>
                      updateDraft({ video_art_direction: value })
                    }
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
        </div>

        {/* SIDEBAR */}
        <div className="space-y-6">
          <Card className="p-6!">
            <h3 className="mt-0! mb-4! flex! items-center gap-2 text-[10px] font-bold text-gray-400 uppercase dark:text-gray-500">
              <Maximize className="h-3.5 w-3.5" />
              {__("Output Dimensions", "structura")}
            </h3>
            <Select
              options={aspectRatioOptions}
              onValueChange={(val) => updateDraft({ aspect_ratio: val as string })}
              value={draft.aspect_ratio}
            >
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
          </Card>

          <Card
            className={cn(
              "duration-normal p-6! transition-all",
              !isPaidLicense &&
                "pointer-events-none border-dashed border-gray-300 opacity-60 grayscale-[0.5]"
            )}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="m-0! flex! items-center gap-2 text-[10px] font-bold text-gray-400 uppercase dark:text-gray-500">
                <FileCode className="h-3.5 w-3.5 text-emerald-500" />
                {__("Format Encoding", "structura")}
              </h3>
              {!isPaidLicense && (
                <Badge intent="premium" variant="solid" className="px-2 text-[8px]">
                  {__("Pro", "structura")}
                </Badge>
              )}
            </div>
            <Select
              disabled={!isPaidLicense}
              onValueChange={(val) => updateDraft({ format: val as string })}
              value={draft.format}
              options={assetFormatOptions}
            >
              <Select.Trigger placeholder={__("Select encoding...", "structura")} />
              <Select.Content className="w-(--button-width)">
                {assetFormatOptions.map((opt) => (
                  <Select.Item key={opt.value} value={opt.value}>
                    {opt.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </Card>

          {/* EU AI label (specs/ai-image-label.md §7): every plan, no plan
           * check. The preview shows the pill the cloud stamps. */}
          <Card className="p-6!">
            <h3 className="mt-0! mb-4! flex! items-center gap-2 text-[10px] font-bold text-gray-400 uppercase dark:text-gray-500">
              <Stamp className="text-brand-500 h-3.5 w-3.5" />
              {__("AI label", "structura")}
            </h3>
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
          </Card>

          {/* SEO automation is always on: alt-text and SEO-friendly
           * filenames are written into the generation schema on every
           * image (functions/src/ai/instruction-builder.ts), regardless
           * of any setting. The old "Active Synthesis Meta" toggle wrote
           * `optimize_on_upload`, which nothing in the pipeline reads —
           * so we state the behaviour instead of shipping a dead toggle.
           * The field stays on the draft/wire payload for back-compat. */}
          <Card className="p-6!">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="m-0! flex! items-center gap-2 text-[10px] font-bold text-gray-400 uppercase dark:text-gray-500">
                <SearchCheck className="text-brand-500 h-3.5 w-3.5" />
                {__("SEO Automation", "structura")}
              </h3>
              <Badge intent="success" variant="solid" className="px-2 text-[8px]">
                {__("Always on", "structura")}
              </Badge>
            </div>
            <p className="mt-0! mb-0! text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {__(
                "Every generated image automatically gets accessible alt-text and a human-friendly, SEO-ready filename. No setup required.",
                "structura"
              )}
            </p>
          </Card>
        </div>
      </div>

      {/* OTHER PRESETS IN WORKSPACE */}
      {otherPresets.length > 0 && (
        <Card>
          <h3 className="m-0! mb-4! flex! items-center gap-2 text-sm font-bold tracking-wider text-gray-900 uppercase dark:text-white">
            <Palette className="text-brand-500 h-4 w-4" />
            {__("Other presets in this workspace", "structura")}
          </h3>
          <p className="m-0! mb-6! text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {__(
              "Use here binds this site to that preset (edits will propagate). Duplicate clones it into a new preset bound only to this site.",
              "structura"
            )}
          </p>
          <ul className="list-none space-y-3 p-0">
            {otherPresets.map((p) => (
              <li
                key={p.presetId}
                className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800 dark:bg-neutral-950"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {p.label}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {sprintf(
                        /* translators: %d: number of sites */
                        __("Used by %d site(s)", "structura"),
                        p.boundActivationCount
                      )}
                    </Badge>
                  </div>
                  <p className="mt-1! mb-0! line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                    {/* A preset with a signature renders that, not its free text. */}
                    {p.signature?.kind === "curated"
                      ? signatureName(p.signature.id)
                      : p.signature?.kind === "custom"
                        ? p.signature.name
                        : p.globalArtDirection || __("(no art direction)", "structura")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => handleUseHere(p.presetId)} disabled={isBusy}>
                    {__("Use here", "structura")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDuplicate(p.presetId)}
                    disabled={isBusy}
                  >
                    <Copy className="size-3.5" />
                    <span className="ml-1.5">{__("Duplicate to this site", "structura")}</span>
                  </Button>
                  {p.boundActivationCount === 0 && (
                    <Button
                      size="sm"
                      variant="transparent"
                      onClick={() => setConfirmDelete(p)}
                      disabled={isBusy}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
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
