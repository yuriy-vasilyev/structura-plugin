import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { __, sprintf } from "@wordpress/i18n";
import {
  AlertTriangle,
  ArrowRight,
  Copy,
  FileCode,
  Info,
  Lock,
  Maximize,
  Palette,
  Save,
  SearchCheck,
  Trash2,
} from "lucide-react";
import {
  useDefaultProviders,
  useLicense,
  useVisualPresetMutations,
  useVisualPresetsQuery,
  useVisualQuery,
} from "@/features/settings";
import {
  Badge,
  Button,
  Card,
  cn,
  ConfirmDialog,
  InputField,
  PageLoader,
  Select,
  TextArea,
} from "@structura/ui";
import { AIProvider } from "@/features/campaigns/types";
import { PageTitle } from "@/components/Layout/PageTitle";
import { PageDescription } from "@/components/Layout/PageSubtitle";
import {
  buildMarketingPricingUrl,
  buildPortalSignupUrl,
} from "@/utils/portalLinks";
import { useMagicSuggest } from "@/hooks/useMagicSuggest";
import {
  ContextField,
  SuggestStrategySection,
} from "@/features/campaigns/components/SuggestStrategySection";
import type {
  VisualContent,
  VisualMedium,
  VisualPresetWire,
} from "@/features/settings/api/useVisualPresets";
import { MEDIUM_OPTIONS } from "../visualMediumOptions";
import { useVideoStylingEligibility } from "@/features/channels/hooks/useVideoStylingEligibility";
import {
  VideoPresetSection,
  VideoStylingGateTeaser,
} from "../components/VideoPresetSection";

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
  };
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
  const { defaultImageProvider } = useDefaultProviders();

  const boundPreset = useMemo(() => {
    if (!presetsData) return null;
    return (
      presetsData.presets.find((p) => p.presetId === presetsData.boundPresetId) ?? null
    );
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

  // `draft` is deliberately NOT in the deps: `setDraft(presetToDraft(...))`
  // returns a fresh object reference, so including it would re-run the
  // effect with each new draft → setDraft loop → "Maximum update depth
  // exceeded" → AppErrorBoundary jams the route. We use the functional
  // setter for the unbound init branch to read the current `draft` without
  // a dep.
  useEffect(() => {
    if (!presetsData || isPaidLicense === undefined) return;
    if (!isPristine) return;
    if (boundPreset) {
      setDraft(presetToDraft(boundPreset, isPaidLicense ? "webp" : "png"));
    } else {
      setDraft((prev) => prev ?? emptyDraft("webp", !!isPaidLicense));
    }
  }, [presetsData, boundPreset, isPaidLicense, isPristine]);

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

  const showOpenAIRatioHint =
    defaultImageProvider === "openai" &&
    (draft?.aspect_ratio === "16:9" || draft?.aspect_ratio === "9:16");

  const isShared = (boundPreset?.boundActivationCount ?? 0) > 1;
  const isBusy = isCreating || isUpdating || isForking || isRemoving || isBinding;

  const updateDraft = (patch: Partial<DraftState>) => {
    setIsPristine(false);
    setDraft((prev) => (prev ? { ...prev, ...patch } : null));
  };

  const buildContent = (d: DraftState): VisualContent => ({
    global_art_direction: d.global_art_direction,
    aspect_ratio: d.aspect_ratio,
    format: d.format,
    optimize_on_upload: d.optimize_on_upload,
    medium: d.medium ?? "photography",
    // Video keys are omitted (not defaulted) when the draft carries
    // nothing — an untouched or plan-locked section must never overwrite
    // a preset's saved video styling. See VisualContent's docblock.
    ...(d.video_style !== undefined ? { video_style: d.video_style } : {}),
    ...(d.video_art_direction !== undefined
      ? { video_art_direction: d.video_art_direction }
      : {}),
    ...(d.caption_placement !== undefined
      ? { caption_placement: d.caption_placement }
      : {}),
    ...(d.palette !== undefined ? { palette: d.palette } : {}),
  });

  const handleSaveBound = async () => {
    if (!draft) return;
    if (!boundPreset) {
      // Unbound — create a new preset for this site and bind it.
      await create({
        label: draft.label || __("Site default", "structura"),
        content: buildContent(draft),
        bind_to_activation: true,
      });
      setIsPristine(true);
      return;
    }
    await update({
      preset_id: boundPreset.presetId,
      label: draft.label,
      content: buildContent(draft),
    });
    setIsPristine(true);
  };

  const handleSaveAsNew = async () => {
    if (!draft || !boundPreset) return;
    // Fork from the currently-bound preset, then apply the in-progress
    // edits to the new fork. Two-step because the cloud's fork endpoint
    // clones the source verbatim — we update right after to land the
    // user's edits on the new doc rather than the source.
    const result = await fork({
      preset_id: boundPreset.presetId,
      label: draft.label || `${boundPreset.label} (this site)`,
      bind_to_activation: true,
    });
    if (result?.preset?.presetId) {
      await update({
        preset_id: result.preset.presetId,
        content: buildContent(draft),
      });
    }
    setIsPristine(true);
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
    data: { videoArtDirection?: unknown; palette?: unknown } | null,
  ): Partial<DraftState> => {
    if (!data) return {};
    return {
      ...(typeof data.videoArtDirection === "string" && data.videoArtDirection
        ? { video_art_direction: data.videoArtDirection }
        : {}),
      ...(Array.isArray(data.palette) &&
      data.palette.every((c) => typeof c === "string")
        ? { palette: data.palette as string[] }
        : {}),
    };
  };

  const handleMagicStyle = async (
    provider: string,
    context: ContextField[],
    medium?: string,
  ) => {
    // Medium is picked from the Suggest dropdown — persist it (drives Save
    // + the "drafted as" badge) and draft the style in it.
    const picked = (medium as VisualMedium | undefined) ?? draft?.medium ?? "photography";
    updateDraft({ medium: picked });
    const data = await suggest("visual", {
      provider: provider as AIProvider,
      context,
      medium: picked,
    });
    if (data?.prompt) {
      // One pass fills both siblings (handoff §1): the image prompt AND
      // the video art direction + palette when the response carries them.
      updateDraft({
        global_art_direction: data.prompt,
        ...videoPatchFromSuggestion(data),
      });
    }
  };

  /**
   * "Suggest video style" — same suggest call and grounding as the image
   * affordance, but only the video-side fields land: the image prompt the
   * user already curated must survive a video-only redraft.
   */
  const handleMagicVideoStyle = async (
    provider: string,
    context: ContextField[],
  ) => {
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
                  boundPreset.label,
                )
              : __("Image Generation & Optimization Engine", "structura")}
          </PageDescription>
        </div>

        {!isShared && (
          <Button onClick={handleSaveBound} disabled={isBusy} loading={isUpdating || isCreating}>
            <Save className="size-4" />
            <span className="ml-2">{__("Save Changes", "structura")}</span>
          </Button>
        )}
      </header>

      {/* UNBOUND BANNER */}
      {!boundPreset && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/30 dark:bg-amber-950/20">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="flex-1">
            <p className="m-0! text-sm font-medium text-amber-900 dark:text-amber-300">
              {__("No visual preset bound to this site", "structura")}
            </p>
            <p className="m-0! mt-1 text-xs leading-relaxed text-amber-900/80 dark:text-amber-300/80">
              {__(
                "Image generation will fail until a preset is bound. Configure one below or pick an existing preset from the workspace library.",
                "structura",
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
                boundPreset.boundActivationCount - 1,
              )}
            </p>
            <p className="m-0! mt-1 text-xs leading-relaxed text-amber-900/80 dark:text-amber-300/80">
              {__(
                "Saving will update the preset for every site that uses it. Pick \"Save as new for this site only\" to fork into an independent preset bound to this site.",
                "structura",
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={handleSaveBound} disabled={isBusy} loading={isUpdating}>
                <Save className="size-4" />
                <span className="ml-2">{__("Save (update for all sites)", "structura")}</span>
              </Button>
              <Button onClick={handleSaveAsNew} disabled={isBusy} loading={isForking} variant="secondary">
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
            <div className="mb-6">
              <h3 className="m-0! mb-6! flex! items-center gap-2 text-sm font-bold tracking-wider text-gray-900 uppercase dark:text-white">
                <Palette className="h-4 w-4 text-brand-500" />
                {__("Global Image Style", "structura")}
              </h3>
              <SuggestStrategySection
                isStrategizing={isSuggesting}
                onGenerate={async (provider, context, medium) => {
                  await handleMagicStyle(provider, context, medium);
                }}
                mediumPicker={{
                  heading: __("Image medium", "structura"),
                  current: draft.medium ?? "photography",
                  options: MEDIUM_OPTIONS,
                }}
                toggleButtonLabel={__("Suggest Image Style", "structura")}
                contextFieldLabel={__(
                  "Brand Resources (logo, guidelines, design system URL…)",
                  "structura",
                )}
                addSourceLabel={__("Add Resource", "structura")}
                ctaButtonLabel={__("Generate Image Style", "structura")}
                placeholder={{
                  title: __("Company logo", "structura"),
                  url: `${window.location.origin}/logo.png`,
                }}
                initialSources={
                  legacyConfig?.logo_url
                    ? [{ title: __("Site Logo", "structura"), url: legacyConfig.logo_url }]
                    : undefined
                }
              />
            </div>

            <InputField
              label={__("Preset name", "structura")}
              value={draft.label}
              onChange={(e) => updateDraft({ label: e.target.value })}
              placeholder={__("Site default", "structura")}
              className="mb-6"
            />

            {/* Current medium — set via the "Suggest Image Style" dropdown
              * above (it's a parameter of the suggestion, not a standalone
              * setting). Shown so it's clear what the style was drafted as. */}
            <div className="mb-4 flex items-center gap-2">
              <span className="text-xs font-medium tracking-widest text-gray-400 uppercase dark:text-gray-500">
                {__("Image medium", "structura")}
              </span>
              <Badge intent="secondary">
                {MEDIUM_OPTIONS.find((o) => o.value === (draft.medium ?? "photography"))
                  ?.label ?? __("Photography", "structura")}
              </Badge>
            </div>

            <p className="mt-0! mb-4! text-xs font-medium tracking-widest text-gray-400 uppercase dark:text-gray-500">
              {__(
                "Inject a consistent visual style into every image generated across this site.",
                "structura",
              )}
            </p>

            <TextArea
              label={__("Global Art Direction", "structura")}
              rows={14}
              value={draft.global_art_direction}
              onChange={(e) => updateDraft({ global_art_direction: e.target.value })}
              placeholder={__("Enter global art direction directives...", "structura")}
              className="w-full rounded-2xl border-gray-200 bg-gray-50 font-mono text-sm leading-relaxed dark:border-neutral-800 dark:bg-neutral-950"
              hiddenLabel
            />

            <div className="mt-6 flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/50 p-4 dark:border-brand-900/30 dark:bg-brand-950/20">
              <Info className="mt-0.5 h-4 w-4 text-brand-500" />
              <p className="m-0! text-xs leading-relaxed text-brand-900 italic dark:text-brand-300">
                {__(
                  "This directive is injected into the latent space of every generation to maintain a cohesive visual identity for this site.",
                  "structura",
                )}
              </p>
            </div>

            {/* VIDEO — preset-owned video styling (handoff §1). Anchor id +
              * highlight make this the `?section=video` deep-link target;
              * the teaser shares the wrapper so a locked plan's deep link
              * lands on the upgrade row instead of dead space. */}
            {videoEligibility !== "unknown" && (
              <div
                id="video"
                ref={videoSectionRef}
                className={cn(
                  "mt-6 border-t border-gray-200 pt-6 transition-shadow duration-normal dark:border-neutral-800",
                  videoHighlight && "rounded-xl ring-2 ring-brand-400/60",
                )}
              >
                {videoEligibility === "eligible" ? (
                  <VideoPresetSection
                    videoStyle={draft.video_style}
                    videoArtDirection={draft.video_art_direction}
                    captionPlacement={draft.caption_placement}
                    palette={draft.palette}
                    onVideoStyleChange={(style) =>
                      updateDraft({ video_style: style })
                    }
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
                          "structura",
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
                        "structura",
                      )
                    : __(
                        "OpenAI image models don't support 9:16 natively — your images will be rendered at 2:3 (1024×1536), the closest portrait size. For exact 9:16, switch the image provider to Gemini.",
                        "structura",
                      )}
                </p>
              </div>
            )}
          </Card>

          <Card
            className={cn(
              "p-6! transition-all duration-normal",
              !isPaidLicense &&
                "pointer-events-none border-dashed border-gray-300 opacity-60 grayscale-[0.5]",
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
                <SearchCheck className="h-3.5 w-3.5 text-brand-500" />
                {__("SEO Automation", "structura")}
              </h3>
              <Badge intent="success" variant="solid" className="px-2 text-[8px]">
                {__("Always on", "structura")}
              </Badge>
            </div>
            <p className="mt-0! mb-0! text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {__(
                "Every generated image automatically gets accessible alt-text and a human-friendly, SEO-ready filename. No setup required.",
                "structura",
              )}
            </p>
          </Card>
        </div>
      </div>

      {/* OTHER PRESETS IN WORKSPACE */}
      {otherPresets.length > 0 && (
        <Card>
          <h3 className="m-0! mb-4! flex! items-center gap-2 text-sm font-bold tracking-wider text-gray-900 uppercase dark:text-white">
            <Palette className="h-4 w-4 text-brand-500" />
            {__("Other presets in this workspace", "structura")}
          </h3>
          <p className="m-0! mb-6! text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {__(
              "Use here binds this site to that preset (edits will propagate). Duplicate clones it into a new preset bound only to this site.",
              "structura",
            )}
          </p>
          <ul className="space-y-3 list-none p-0">
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
                        p.boundActivationCount,
                      )}
                    </Badge>
                  </div>
                  <p className="m-0! mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                    {p.globalArtDirection || __("(no art direction)", "structura")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleUseHere(p.presetId)}
                    disabled={isBusy}
                  >
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
                __(
                  'Delete "%s"? This is only allowed when no site is bound to it.',
                  "structura",
                ),
                confirmDelete.label,
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
  const domain =
    typeof window !== "undefined" ? window.location.hostname : undefined;
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
            "structura",
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
