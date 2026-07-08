/**
 * Step 4 — Visual-style profile.
 *
 * Deferred-save model: the draft lives in the Zustand step4 draft and
 * persists at Finish (visual preset create/update). No per-step save.
 *
 * Hydration (2026-06-03): the draft seeds from the activation's BOUND
 * visual preset when one exists — so re-entering the wizard on a configured
 * site shows the saved style and Finish UPDATES it in place. Before this the
 * step always seeded a BLANK draft, so a site with a curated preset showed
 * an empty prompt — forcing the user to recreate a style they already had,
 * and replacing the saved preset with whatever they re-typed at Finish.
 * (The empty draft can't itself be committed — the validity gate below
 * blocks Finish until the prompt is non-empty — but the redundant rewrite +
 * accidental replacement is the regression.) Surfaced once per-site
 * re-onboarding started routing configured sites back through the wizard.
 *
 * Auto-suggest (2026-06-07, replacing the earlier "never on land" rule):
 * paid users with a BRAND LOGO from Step 1 get the style auto-drafted on
 * first land — but ONLY when the prompt is empty after hydration (no saved
 * preset, no in-flight draft), which is the overwrite hazard the old rule
 * existed for. Without a logo we can't anchor the style to the brand, so
 * there's no auto-fire — an info banner recommends adding one on Site info,
 * while the manual "AI suggest style" button stays available (it works from
 * the homepage alone).
 *
 * Validity: the visual-prompt template (globalArtDirection) must be
 * non-empty. Aspect ratio / format always have defaults.
 */

import { useEffect, useMemo, useRef, useState } from "@wordpress/element";
import { __, sprintf } from "@wordpress/i18n";
import {
  Badge,
  Card,
  Select,
  Switch,
  TextArea,
  useToast,
  VideoChannelGlyph,
  type CaptionPlacement,
  type VideoStyleKind,
} from "@structura/ui";
import { ChevronDown, ChevronUp, Image as ImageIcon, Sparkles } from "lucide-react";

import {
  useDefaultProviders,
  useLicense,
  usePublicSiteProfile,
} from "@/features/settings";
import {
  useVisualPresetsQuery,
  type VisualMedium,
} from "@/features/settings/api/useVisualPresets";
import { MEDIUM_OPTIONS } from "@/features/settings/visualMediumOptions";
import { AIProvider } from "@/features/campaigns/types";
import {
  ContextField,
  SuggestStrategySection,
} from "@/features/campaigns/components/SuggestStrategySection";
import { useMagicSuggest } from "@/hooks/useMagicSuggest";

import { useVideoStylingEligibility } from "@/features/channels/hooks/useVideoStylingEligibility";
import { videoStyleById } from "@/features/channels/videoChannel";
import {
  CaptionPlacementField,
  VideoStyleCards,
} from "@/features/settings/components/VideoPresetSection";

import { useWizardStore, type VisualDraft } from "../state/wizardStore";
import { WizardMagicLoader } from "./WizardMagicLoader";

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
};

export const WizardStep4Visuals = () => {
  const { isPaidLicense } = useLicense();
  const { defaultTextProvider } = useDefaultProviders();
  const { suggest, isSuggesting } = useMagicSuggest();
  const { successToast, errorToast } = useToast();
  const { data: profile } = usePublicSiteProfile();

  // Public URL + brand logo from step 1 — the sources the manual suggest reads.
  const publicUrl = useWizardStore((s) => s.drafts.step1?.publicUrl ?? "");
  const logoUrl = useWizardStore((s) => s.drafts.step1?.logoUrl ?? "");
  const step4 = useWizardStore((s) => s.drafts.step4);
  const setStep4Draft = useWizardStore((s) => s.setStep4Draft);
  const setStepValid = useWizardStore((s) => s.setStepValid);

  // The activation's existing bound preset — what Site → Visuals shows.
  // Used to HYDRATE the draft so we don't clobber a saved style at Finish.
  const { data: presetsData } = useVisualPresetsQuery();

  // Seed the draft once: a prior in-flight draft wins ONLY when the user
  // actually wrote a prompt. A PRISTINE persisted draft (empty prompt — e.g.
  // written to localStorage by a pre-hydration build, or an abandoned earlier
  // visit) must not block hydration: an empty prompt can't be committed
  // anyway (the validity gate below), and the saved bound preset is strictly
  // better than a blank. Otherwise hydrate from the bound preset (so a
  // configured site shows its real style and Finish updates rather than
  // overwrites it); otherwise fall to defaults. Free tier can't use WebP
  // encoding or optimize-on-upload (both Pro), so its defaults are PNG +
  // optimize off.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (isPaidLicense === undefined) return; // wait until tier is known
    // Paid: wait for the saved preset to load before seeding, so we hydrate
    // it instead of racing in an empty default. Free: the presets query is
    // disabled (stays undefined) — seed free-safe defaults immediately.
    if (isPaidLicense && presetsData === undefined) return;
    seededRef.current = true;
    if (step4 && step4.globalArtDirection.trim().length > 0) return; // real work wins
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
    } else if (!step4) {
      // No preset and no draft → tier-aware defaults. (A pristine draft with
      // no preset is left alone — nothing better to fill it with.)
      setStep4Draft({
        ...DEFAULT_DRAFT,
        format: isPaidLicense ? "webp" : "png",
        optimizeOnUpload: Boolean(isPaidLicense),
      });
    }
  }, [step4, setStep4Draft, isPaidLicense, presetsData]);

  const draft = step4 ?? DEFAULT_DRAFT;
  // Read the store's CURRENT draft at call time rather than the render
  // closure: the async suggest resolves several commits after it was
  // started, and a stale closure would wipe fields written in between
  // (e.g. the video-defaults effect below racing the auto-suggest).
  const update = (p: Partial<VisualDraft>) => {
    const current = useWizardStore.getState().drafts.step4 ?? draft;
    setStep4Draft({ ...current, ...p });
  };

  // Validity — needs an art-direction prompt.
  useEffect(() => {
    setStepValid(4, draft.globalArtDirection.trim().length > 0);
  }, [draft.globalArtDirection, setStepValid]);

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

  /* ─── Manual visual-prompt suggest (paid, on demand) ──────────── */
  const GEN_STAGES = useMemo(
    () => [
      __("Reading your homepage…", "structura"),
      __("Studying your brand's look…", "structura"),
      __("Composing a visual direction…", "structura"),
      __("Finishing the style…", "structura"),
    ],
    [],
  );

  // Generate a visual style from the given sources + medium. Shared by the
  // SuggestStrategySection panel (manual, with the image-medium dropdown)
  // and the auto-suggest-on-land path below. The picked medium is persisted
  // to the draft so the drafted style and every generated image share one
  // medium.
  const handleGenerate = async (
    provider: string,
    context: ContextField[],
    medium?: string,
  ) => {
    if (!provider) return;
    const picked =
      (medium as VisualMedium | undefined) ??
      (draft.medium as VisualMedium) ??
      "photography";
    const data = (await suggest("visual", {
      provider: provider as AIProvider,
      context,
      medium: picked,
    })) as {
      prompt?: string;
      videoArtDirection?: unknown;
      palette?: unknown;
    } | null;
    if (data?.prompt) {
      // The same pass drafts the video art direction + brand palette
      // (video-visuals handoff §4). They land SILENTLY on the draft —
      // there's no wizard textarea for them — and only on eligible
      // plans, so an ineligible Finish never writes video keys.
      const videoPatch: Partial<VisualDraft> =
        videoEligibility === "eligible"
          ? {
              ...(typeof data.videoArtDirection === "string" &&
              data.videoArtDirection
                ? { videoArtDirection: data.videoArtDirection }
                : {}),
              ...(Array.isArray(data.palette) &&
              data.palette.every((c) => typeof c === "string")
                ? { palette: data.palette as string[] }
                : {}),
            }
          : {};
      update({ medium: picked, globalArtDirection: data.prompt, ...videoPatch });
      successToast(__("Drafted a visual style from your brand.", "structura"));
    } else {
      // Persist the medium choice regardless; surface the empty case
      // (data===null means useMagicSuggest already toasted the error).
      update({ medium: picked });
      if (data !== null) {
        errorToast(
          __(
            "We couldn't draft a style this time. Write your own below, or try again.",
            "structura",
          ),
        );
      }
    }
  };

  // Auto-suggest on first land — builds its own sources (homepage + brand
  // logo from step 1) and uses the current medium.
  const runAutoSuggest = async () => {
    const sources: ContextField[] = [];
    const home = publicUrl || profile?.publicUrl || profile?.homeUrl || "";
    if (home) sources.push({ title: profile?.name || "Homepage", url: home });
    if (logoUrl) sources.push({ title: "Brand logo", url: logoUrl });
    await handleGenerate(defaultTextProvider ?? "", sources, draft.medium);
  };

  /* ─── Auto-suggest on first land (paid + blank prompt) ─── */
  // The seed effect above runs first (declaration order) and hydrates
  // any bound preset into the draft — but its setState only lands on
  // the NEXT render, so this effect re-checks the bound preset itself
  // rather than trusting `draft` in the same flush. Auto-fire only
  // when there's genuinely nothing to overwrite. No logo is required:
  // the cloud screenshots the homepage server-side for the brand cue,
  // so every paid site gets an on-brand draft (the logo, when present,
  // just refines the exact brand-mark hex).
  const autoFiredRef = useRef(false);
  useEffect(() => {
    if (autoFiredRef.current) return;
    if (!isPaidLicense || !defaultTextProvider) return;
    if (isPaidLicense && presetsData === undefined) return; // preset still loading
    const bound = presetsData?.boundPresetId
      ? presetsData.presets.find((p) => p.presetId === presetsData.boundPresetId)
      : undefined;
    if (bound?.globalArtDirection?.trim()) {
      autoFiredRef.current = true; // saved style exists — never overwrite
      return;
    }
    if (step4 && step4.globalArtDirection.trim().length > 0) {
      autoFiredRef.current = true; // user (or hydration) already wrote one
      return;
    }
    autoFiredRef.current = true;
    void runAutoSuggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaidLicense, defaultTextProvider, presetsData, step4]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 text-center">
        <h1 className="m-0! text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          {__("Your visual style", "structura")}
        </h1>
        <p className="m-0! text-base text-neutral-600 dark:text-neutral-400">
          {__(
            "How every post's images should look. We draft a starting style from your brand — tweak anything.",
            "structura",
          )}
        </p>
      </header>

      {isSuggesting ? (
        <Card className="p-8">
          <WizardMagicLoader
            icon={ImageIcon}
            title={__("Designing your visual style", "structura")}
            stages={GEN_STAGES}
          />
        </Card>
      ) : (
        <Card className="flex flex-col gap-6 p-8">
          {/* AI suggest — the same panel as the Visuals page, including the
              image-medium dropdown. Seeded with the brand logo as a source;
              renders its own locked state on the Free tier. */}
          <SuggestStrategySection
            isStrategizing={isSuggesting}
            onGenerate={handleGenerate}
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
              logoUrl
                ? [{ title: __("Site Logo", "structura"), url: logoUrl }]
                : undefined
            }
          />

          {/* Art direction prompt. */}
          <div className="flex flex-col gap-3">
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              {__("Visual prompt template", "structura")}
            </span>
            <TextArea
              label={__("Visual prompt template", "structura")}
              hiddenLabel
              value={draft.globalArtDirection}
              onChange={(e) => update({ globalArtDirection: e.target.value })}
              rows={4}
              placeholder={__(
                "E.g. Clean editorial photography, soft natural light, muted earthy palette, shallow depth of field.",
                "structura",
              )}
            />
            <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
              {__(
                "This anchors every image we generate. Be specific about palette, mood, and style.",
                "structura",
              )}
            </p>
          </div>

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
      )}
    </div>
  );
};

