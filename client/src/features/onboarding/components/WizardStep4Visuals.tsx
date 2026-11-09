/**
 * Step 4 — Visual signature (specs/visual-signatures.md §6, §8; handoff §3.8).
 *
 * Deferred-save model: the draft lives in the Zustand step4 draft and
 * persists at Finish (visual preset create/update). No per-step save.
 *
 * Hydration (2026-06-03): the draft seeds from the activation's BOUND
 * visual preset when one exists — so re-entering the wizard on a configured
 * site shows the saved choice and Finish UPDATES it in place. Before this the
 * step always seeded a BLANK draft, which replaced a curated preset at Finish.
 * A bound free-prompt or custom preset keeps its own choice until the user
 * picks a card: the step has no "Your own" and no "Free prompt" card.
 *
 * The pick (2026-11-09, replacing the visual-style auto-suggest): the thin
 * pass reads the homepage, picks a library signature and the brand palette.
 * Paid plans get the pick preselected and first; free plans see it first but
 * locked, with the house signature preselected. Until the pass answers, the
 * pick sentence says so and the house signature stays preselected. Continue
 * is always enabled: a signature is always preselected.
 */

import { useEffect, useRef, useState } from "@wordpress/element";
import { createInterpolateElement } from "@wordpress/element";
import { __, sprintf } from "@wordpress/i18n";
import {
  Badge,
  Card,
  PaletteSwatches,
  Select,
  Spinner,
  Switch,
  VideoChannelGlyph,
  type CaptionPlacement,
  type VideoStyleKind,
} from "@structura/ui";
import { canUseSignatureLibrary } from "@structura/types";
import { HOUSE_SIGNATURE_ID, type SignatureId } from "@structura/visual-signatures";
import { BadgeCheck, ChevronDown, ChevronUp, PenLine, Sparkles } from "lucide-react";

import {
  useDefaultProviders,
  useLicense,
  usePublicSiteProfile,
} from "@/features/settings";
import {
  useSuggestVisualSignatureMutation,
  useVisualPresetsQuery,
  useVisualSignatureSuggestion,
  type VisualSignatureSuggestion,
} from "@/features/settings/api/useVisualPresets";
import { AIProvider } from "@/features/campaigns/types";
import type { ContextField } from "@/features/campaigns/components/SuggestStrategySection";
import { useMagicSuggest } from "@/hooks/useMagicSuggest";
import { SignaturePicker } from "@/features/settings/signatures/SignaturePicker";
import { BrandPaletteSummary } from "@/features/settings/signatures/BrandPaletteField";
import { signatureName } from "@/features/settings/signatures/signatureCopy";
import {
  curatedSelection,
  houseSelection,
  orderedSignatures,
  selectionFromChoice,
  signatureForSelection,
  type SignatureSelection,
} from "@/features/settings/signatures/signatureModel";
import { buildMarketingPricingUrl } from "@/utils/portalLinks";

import { useVideoStylingEligibility } from "@/features/channels/hooks/useVideoStylingEligibility";
import { videoStyleById } from "@/features/channels/videoChannel";
import {
  CaptionPlacementField,
  VideoStyleCards,
} from "@/features/settings/components/VideoPresetSection";

import { useWizardStore, type VisualDraft } from "../state/wizardStore";

const ASPECT_RATIOS = [
  { value: "16:9", label: __("16:9 — Hero / wide", "structura") },
  { value: "1:1", label: __("1:1 — Social square", "structura") },
  { value: "4:3", label: __("4:3 — Standard", "structura") },
  { value: "3:2", label: __("3:2 — Editorial", "structura") },
  { value: "9:16", label: __("9:16 — Story / vertical", "structura") },
  { value: "3:4", label: __("3:4 — Portrait", "structura") },
  { value: "2:3", label: __("2:3 — Tall portrait", "structura") },
];

const FORMATS = [
  { value: "webp", label: __("WebP — recommended", "structura") },
  { value: "jpeg", label: __("JPEG", "structura") },
  { value: "png", label: __("PNG", "structura") },
];

const DEFAULT_DRAFT: VisualDraft = {
  globalArtDirection: "",
  aspectRatio: "16:9",
  format: "webp",
  optimizeOnUpload: true,
  medium: "photography",
  signature: signatureForSelection(houseSelection(), null),
};

/**
 * A translated sentence with `<b>` around names. Its `%1$s`… placeholders
 * become elements holding the site and style names, so a name can never be
 * read as markup.
 */
function boldSentence(template: string, values: string[]) {
  const withTags = values.reduce(
    (text, _, i) => text.replace(`%${i + 1}$s`, `<v${i} />`),
    template,
  );
  const elements = Object.fromEntries(values.map((value, i) => [`v${i}`, <>{value}</>]));
  return createInterpolateElement(withTags, { b: <strong />, ...elements });
}

/** The pick sentence above the grid (handoff §3.8): what we picked, in which colours, and why. */
function PickSentence({
  siteName,
  suggestion,
  pending,
  locked,
  palette,
}: {
  siteName: string;
  suggestion: VisualSignatureSuggestion | null;
  pending: boolean;
  locked: boolean;
  palette: string[];
}) {
  if (!pending && !suggestion) return null;
  return (
    <div className="border-rec-line bg-rec-soft flex gap-2.5 rounded-xl border px-4 py-3.5">
      {pending ? (
        <Spinner size="sm" className="mt-0.5 shrink-0" />
      ) : (
        <BadgeCheck size={18} className="text-rec-ink mt-0.5 shrink-0" aria-hidden="true" />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        {pending || !suggestion ? (
          <p role="status" className="m-0! text-sm text-neutral-900 dark:text-white">
            {boldSentence(
              /* translators: 1: site name, 2: the style selected meanwhile. Keep the <b> tags around 2. */
              __(
                "Still reading %1$s to pick a style. <b>%2$s</b> is selected until then.",
                "structura",
              ),
              [siteName, signatureName(HOUSE_SIGNATURE_ID)],
            )}
          </p>
        ) : (
          <>
            <p className="m-0! text-sm leading-relaxed text-neutral-900 dark:text-white">
              {locked
                ? boldSentence(
                    /* translators: 1: site name, 2: the recommended style, 3: the style used until then. Keep the <b> tags around 2 and 3. */
                    __(
                      "Our pick for %1$s is <b>%2$s</b>, which comes with paid plans. Until then, your images use <b>%3$s</b> in your colours",
                      "structura"
                    ),
                    [siteName, signatureName(suggestion.pick), signatureName(HOUSE_SIGNATURE_ID)]
                  )
                : boldSentence(
                    /* translators: 1: site name, 2: the recommended style. Keep the <b> tags around 2. */
                    __("Our pick for %1$s is <b>%2$s</b>, in your colours", "structura"),
                    [siteName, signatureName(suggestion.pick)]
                  )}
              {palette.length > 0 && (
                <PaletteSwatches
                  colors={palette}
                  size={16}
                  max={6}
                  label={__("Brand colours", "structura")}
                  className="ml-1.5 inline-flex align-middle"
                />
              )}
            </p>
            {suggestion.reason && (
              <p className="text-rec-ink m-0! text-[13px] leading-relaxed">{suggestion.reason}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export const WizardStep4Visuals = () => {
  const { plan, isPaidLicense } = useLicense();
  const { defaultTextProvider } = useDefaultProviders();
  const { suggest } = useMagicSuggest();
  const { data: profile } = usePublicSiteProfile();
  const libraryOpen = canUseSignatureLibrary(plan);

  // Public URL + brand logo from step 1 — the video draft's sources.
  const publicUrl = useWizardStore((s) => s.drafts.step1?.publicUrl ?? "");
  const logoUrl = useWizardStore((s) => s.drafts.step1?.logoUrl ?? "");
  const step4 = useWizardStore((s) => s.drafts.step4);
  const setStep4Draft = useWizardStore((s) => s.setStep4Draft);
  const setStepValid = useWizardStore((s) => s.setStepValid);

  // The activation's existing bound preset — what Site → Visuals shows.
  // Used to HYDRATE the draft so we don't clobber a saved style at Finish.
  const { data: presetsData } = useVisualPresetsQuery();
  const knownSuggestion = useVisualSignatureSuggestion(presetsData?.visualSuggestion);
  const suggestSignature = useSuggestVisualSignatureMutation();
  const [scanning, setScanning] = useState(false);

  // Seed the draft once: a prior in-flight draft wins when it carries a
  // signature (this build wrote it) or a prompt the user wrote (an older
  // build did). Otherwise hydrate from the bound preset (so a configured
  // site shows its real choice and Finish updates rather than overwrites
  // it); otherwise fall to defaults with the house signature. Free tier
  // can't use WebP encoding or optimize-on-upload (both Pro), so its
  // defaults are PNG + optimize off.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (isPaidLicense === undefined) return; // wait until tier is known
    // A licensed site waits for its saved preset before seeding, so we
    // hydrate it instead of racing in a default: since Finish writes the
    // signature (2026-11-09), a default seeded too early would replace a
    // free site's saved prompt with the house signature. Without a license
    // the presets query stays disabled, so seed the defaults immediately.
    if (plan !== "none" && presetsData === undefined) return;
    seededRef.current = true;
    if (step4 && (step4.signature !== undefined || step4.globalArtDirection.trim().length > 0)) {
      return;
    }
    const bound = presetsData?.boundPresetId
      ? presetsData.presets.find((p) => p.presetId === presetsData.boundPresetId)
      : undefined;
    if (bound) {
      setStep4Draft({
        globalArtDirection: bound.globalArtDirection ?? "",
        aspectRatio: bound.aspectRatio || DEFAULT_DRAFT.aspectRatio,
        format: bound.format || (isPaidLicense ? "webp" : "png"),
        optimizeOnUpload: bound.optimizeOnUpload ?? Boolean(isPaidLicense),
        medium: bound.medium ?? DEFAULT_DRAFT.medium,
        // The saved choice, or null for a free-prompt preset: Finish keeps it
        // unless the user picks a card here.
        signature: bound.signature ?? null,
        ...(step4?.suggestion !== undefined ? { suggestion: step4.suggestion } : {}),
        // Video styling hydrates too (video-visuals handoff §4) — a site
        // whose preset already carries a video look must show it (and
        // Finish must update, not replace it). Absent fields stay absent;
        // the eligible-plan defaults effect below fills those.
        ...(bound.videoStyle ? { videoStyle: bound.videoStyle } : {}),
        ...(bound.videoArtDirection
          ? { videoArtDirection: bound.videoArtDirection }
          : {}),
        ...(bound.captionPlacement
          ? { captionPlacement: bound.captionPlacement }
          : {}),
        ...(Array.isArray(bound.palette) && bound.palette.length > 0
          ? { palette: bound.palette }
          : {}),
      });
    } else {
      // No preset → tier-aware defaults with the house signature.
      setStep4Draft({
        ...DEFAULT_DRAFT,
        format: isPaidLicense ? "webp" : "png",
        optimizeOnUpload: Boolean(isPaidLicense),
        ...(step4?.suggestion !== undefined ? { suggestion: step4.suggestion } : {}),
      });
    }
  }, [step4, setStep4Draft, isPaidLicense, plan, presetsData]);

  const draft = step4 ?? DEFAULT_DRAFT;
  // Read the store's CURRENT draft at call time rather than the render
  // closure: async answers resolve several commits after they started, and
  // a stale closure would wipe fields written in between.
  const update = (p: Partial<VisualDraft>) => {
    const current = useWizardStore.getState().drafts.step4 ?? draft;
    setStep4Draft({ ...current, ...p });
  };

  // Continue is always enabled: a signature is always preselected (handoff §3.8).
  useEffect(() => {
    setStepValid(4, true);
  }, [setStepValid]);

  /* ─── The thin pass: pick + palette ───────────────────────────── */
  const hasBoundPreset = Boolean(presetsData?.boundPresetId);

  /**
   * Lands a thin-pass answer on the draft: the suggestion itself, the
   * scraped palette when the draft has none (or on Re-scan), and on paid
   * plans the pick as the preselection, unless the user picked a card or
   * the site already has a saved preset.
   */
  const applySuggestion = (
    result: VisualSignatureSuggestion | null,
    opts: { replacePalette?: boolean } = {},
  ) => {
    const current = useWizardStore.getState().drafts.step4 ?? draft;
    const patch: Partial<VisualDraft> = { suggestion: result };
    if (result && result.palette.length > 0 && (opts.replacePalette || !current.palette?.length)) {
      patch.palette = result.palette;
    }
    if (result && libraryOpen && !current.signatureTouched && !hasBoundPreset) {
      patch.signature = signatureForSelection(curatedSelection(result.pick), null);
    }
    update(patch);
  };

  // Run the pass once when the step opens and no answer is known: persisted
  // on the draft, stored on the activation (the preset list), or from this
  // page load's earlier pass.
  const passStartedRef = useRef(false);
  useEffect(() => {
    if (passStartedRef.current || !step4 || step4.suggestion !== undefined) return;
    if (knownSuggestion !== undefined) {
      applySuggestion(knownSuggestion);
      return;
    }
    passStartedRef.current = true;
    suggestSignature
      .mutateAsync()
      .then((result) => applySuggestion(result))
      .catch(() => applySuggestion(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step4, knownSuggestion]);

  const handleRescan = async () => {
    setScanning(true);
    try {
      applySuggestion(await suggestSignature.mutateAsync(), { replacePalette: true });
    } catch {
      // Re-scan keeps what the step had; the pick sentence stays as it was.
    } finally {
      setScanning(false);
    }
  };

  const suggestion = draft.suggestion ?? null;
  const pending = draft.suggestion === undefined;
  const selection: SignatureSelection = selectionFromChoice(draft.signature);
  const pickId: SignatureId | null = suggestion?.pick ?? null;
  const keepsOwnChoice = draft.signature !== undefined && selection.kind !== "curated";
  const upgradeHref = buildMarketingPricingUrl({
    intent: "unlock_visuals",
    domain: typeof window !== "undefined" ? window.location.hostname : undefined,
    plan,
  });

  /* ─── Video styling row (video-visuals handoff §4) ────────────── */
  // Eligibility is the Video channel's cloud-computed catalog
  // entitlement — ineligible plans see NO row at all (the wizard sells
  // nothing, so there's no teaser here either).
  const videoEligibility = useVideoStylingEligibility();
  const [videoOpen, setVideoOpen] = useState(false);

  // "Suggested for you" defaults — Kinetic captions at the bottom, the
  // branded look the row's badge promises (boards §4; the preset-editor
  // default for untouched presets stays Clean, but the wizard's whole
  // point is landing a new site with branded video out of the box).
  // Only fills holes: a hydrated preset's saved style/placement wins.
  useEffect(() => {
    if (videoEligibility !== "eligible") return;
    if (!step4) return; // wait for the seed effect
    if (step4.videoStyle !== undefined && step4.captionPlacement !== undefined) {
      return;
    }
    setStep4Draft({
      ...step4,
      videoStyle: step4.videoStyle ?? "kinetic",
      captionPlacement: step4.captionPlacement ?? "bottom",
    });
  }, [videoEligibility, step4, setStep4Draft]);

  // The video art direction is still drafted from the homepage on eligible
  // plans (video-visuals handoff §4): the visual-style pass that used to
  // draft the image style alongside it no longer runs for images, so it runs
  // here for the video line alone, in the background, once.
  const videoDraftStartedRef = useRef(false);
  useEffect(() => {
    if (videoDraftStartedRef.current) return;
    if (videoEligibility !== "eligible" || !step4 || presetsData === undefined) return;
    videoDraftStartedRef.current = true;
    if (step4.videoArtDirection || !defaultTextProvider) return;
    const sources: ContextField[] = [];
    const home = publicUrl || profile?.publicUrl || profile?.homeUrl || "";
    if (home) sources.push({ title: profile?.name || "Homepage", url: home });
    if (logoUrl) sources.push({ title: "Brand logo", url: logoUrl });
    void suggest("visual", {
      provider: defaultTextProvider as AIProvider,
      context: sources,
      medium: "photography",
    }).then((data: { videoArtDirection?: unknown } | null) => {
      if (typeof data?.videoArtDirection === "string" && data.videoArtDirection) {
        update({ videoArtDirection: data.videoArtDirection });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoEligibility, step4, presetsData, defaultTextProvider]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 text-center">
        <h1 className="m-0! text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          {__("Visual signature", "structura")}
        </h1>
        <p className="m-0! text-base text-neutral-600 dark:text-neutral-400">
          {__(
            "Every image on your blog shares one look. We picked one for your brand; change it now or later on the Visuals page.",
            "structura",
          )}
        </p>
      </header>

      <Card className="flex flex-col gap-6 p-8">
        <PickSentence
          siteName={profile?.name || publicUrl || ""}
          suggestion={suggestion}
          pending={pending}
          locked={!libraryOpen && pickId !== null && pickId !== HOUSE_SIGNATURE_ID}
          palette={draft.palette ?? []}
        />

        {keepsOwnChoice && (
          <p className="m-0! text-[13px] text-neutral-600 dark:text-neutral-400">
            {__("This site keeps its current style unless you pick one below.", "structura")}
          </p>
        )}

        <div className="flex flex-col gap-3">
          <span id="structura-wizard-signature-label" className="sr-only">
            {__("Signature", "structura")}
          </span>
          <SignaturePicker
            labelledBy="structura-wizard-signature-label"
            signatures={orderedSignatures(pickId)}
            selection={selection}
            plan={plan}
            pickId={pickId}
            upgradeHref={upgradeHref}
            onSelect={(next) =>
              update({ signature: signatureForSelection(next, null), signatureTouched: true })
            }
          />
        </div>

        <BrandPaletteSummary
          palette={draft.palette ?? []}
          scanning={scanning}
          onScan={handleRescan}
        />

        {libraryOpen && (
          <p className="m-0! flex! items-start gap-2 text-[13px] text-neutral-700 dark:text-neutral-300">
            <PenLine size={14} className="text-brand-500 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {__(
                "Want a look of your own? Build it later on the Visuals page, or write a prompt there.",
                "structura",
              )}
            </span>
          </p>
        )}

        {/* Video styling — collapsible row, eligible plans only
            (video-visuals handoff §4). Collapsed: one summary line +
            "Suggested for you". Expanded: compact style cards + the
            placement radio — deliberately NO textarea; the drafted
            video art direction saves silently with the preset. */}
        {videoEligibility === "eligible" && (
          <div>
            <button
              type="button"
              aria-expanded={videoOpen}
              onClick={() => setVideoOpen((open: boolean) => !open)}
              className={
                videoOpen
                  ? "flex w-full cursor-pointer items-center gap-3 rounded-xl rounded-b-none border border-b-0 border-neutral-200 bg-neutral-50/70 px-4 py-3 text-left transition-all dark:border-neutral-700 dark:bg-neutral-800/40"
                  : "flex w-full cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left transition-all hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
              }
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                <VideoChannelGlyph className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-neutral-900 dark:text-neutral-100">
                    {__("Video styling", "structura")}
                  </span>
                  <Badge intent="primary">
                    {__("Suggested for you", "structura")}
                  </Badge>
                </span>
                <span className="mt-0.5 block truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {sprintf(
                    /* translators: %s: style summary, e.g. "Kinetic · captions bottom · brand-palette accents" */
                    __("%s — edit anytime in Visuals.", "structura"),
                    [
                      // Style names are the presets' proper names —
                      // untranslated by design (videoChannel.ts).
                      videoStyleById(draft.videoStyle).name,
                      {
                        top: __("captions top", "structura"),
                        middle: __("captions middle", "structura"),
                        bottom: __("captions bottom", "structura"),
                      }[draft.captionPlacement ?? "bottom"],
                      draft.palette && draft.palette.length > 0
                        ? __("brand-palette accents", "structura")
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  )}
                </span>
              </span>
              {videoOpen ? (
                <ChevronUp size={16} className="shrink-0 text-neutral-400" aria-hidden />
              ) : (
                <ChevronDown size={16} className="shrink-0 text-neutral-400" aria-hidden />
              )}
            </button>
            {videoOpen && (
              <div className="space-y-4 rounded-b-xl border border-t-0 border-neutral-200 bg-neutral-50/70 px-4 pt-3 pb-4 dark:border-neutral-700 dark:bg-neutral-800/40">
                <div className="space-y-1.5">
                  <span className="block text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
                    {__("Style preset", "structura")}
                  </span>
                  <VideoStyleCards
                    compact
                    value={(draft.videoStyle ?? "kinetic") as VideoStyleKind}
                    onChange={(style) => update({ videoStyle: style })}
                    {...(draft.palette?.[0] ? { accent: draft.palette[0] } : {})}
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="block text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
                    {__("Caption placement", "structura")}
                  </span>
                  <CaptionPlacementField
                    value={(draft.captionPlacement ?? "bottom") as CaptionPlacement}
                    onChange={(placement) =>
                      update({ captionPlacement: placement })
                    }
                  />
                </div>
                <p className="m-0! flex! items-start gap-1.5 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                  <Sparkles
                    size={12}
                    className="mt-px shrink-0 text-brand-500 dark:text-brand-400"
                    aria-hidden
                  />
                  <span>
                    {__(
                      "Video art direction was drafted from your homepage — fine-tune it under Visuals after setup.",
                      "structura",
                    )}
                  </span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Aspect ratio + format. */}
        <div className="grid grid-cols-1 gap-4 border-t border-neutral-100 pt-6 sm:grid-cols-2 dark:border-neutral-800">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              {__("Default aspect ratio", "structura")}
            </label>
            <Select
              value={draft.aspectRatio}
              onValueChange={(val) => update({ aspectRatio: String(val) })}
              options={ASPECT_RATIOS}
            >
              <Select.Trigger />
              <Select.Content className="w-(--button-width)">
                {ASPECT_RATIOS.map((r) => (
                  <Select.Item key={r.value} value={r.value}>
                    {r.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              {__("Image format", "structura")}
              {!isPaidLicense ? (
                <Badge intent="premium">{__("Pro", "structura")}</Badge>
              ) : null}
            </label>
            {/* Format encoding (WebP etc.) is a paid feature — free
                tier is fixed to PNG, mirroring the Visuals page. */}
            <Select
              value={draft.format}
              onValueChange={(val) => update({ format: String(val) })}
              options={FORMATS}
              disabled={!isPaidLicense}
            >
              <Select.Trigger />
              <Select.Content className="w-(--button-width)">
                {FORMATS.map((f) => (
                  <Select.Item key={f.value} value={f.value}>
                    {f.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        </div>

        {/* Optimize-on-upload — Pro (alt-text + filename automation),
            disabled on free, same as the Visuals page. */}
        <div className="flex items-center justify-between gap-4 border-t border-neutral-100 pt-6 dark:border-neutral-800">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {__("Optimize images on upload", "structura")}
              {!isPaidLicense ? (
                <Badge intent="premium">{__("Pro", "structura")}</Badge>
              ) : null}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {__(
                "Re-encode and resize generated images for fast page loads.",
                "structura",
              )}
            </span>
          </div>
          <Switch
            label={__("Optimize images on upload", "structura")}
            hiddenLabel
            checked={draft.optimizeOnUpload}
            onChange={(checked) => update({ optimizeOnUpload: checked })}
            disabled={!isPaidLicense}
          />
        </div>

        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="m-0! flex! items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
            <Badge intent="info">{__("Tip", "structura")}</Badge>
            <span>
              {__(
                "Everything saves at the end. Edit later under Settings → Visuals.",
                "structura",
              )}
            </span>
          </p>
        </div>
      </Card>
    </div>
  );
};

