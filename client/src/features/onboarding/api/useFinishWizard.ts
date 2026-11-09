/**
 * Batched commit of the entire wizard at "Finish setup".
 *
 * Architecture (2026-05-29): the wizard holds every draft in the
 * Zustand store and writes NOTHING to the server per-step. This hook
 * is the single commit point — it reads each step's draft and fires
 * the matching existing mutation in sequence, then marks the wizard
 * complete server-side for the dashboard banner.
 *
 * Failure tolerance: an individual step's save failing does NOT abort
 * the whole finish — we log and continue. Rationale: a user who's
 * filled in everything shouldn't be blocked from finishing because
 * (say) the visual-preset write hit a transient error; the important
 * settings (AI provider) were already written live at step 2. The
 * mutations surface their own error toasts.
 *
 * The AI provider credential + defaults are the exception — those are
 * written live during step 2 (a credential isn't deferrable). We
 * still re-assert the chosen default models here so the workspace's
 * `settings.ai.defaults` reflects the user's final pick.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  usePublicSiteProfile,
  usePublicSiteProfileMutation,
} from "@/features/settings";
import { useUpdateAiSettings } from "@/features/ai-engine/api/useUpdateAiSettings";
import {
  readVisualSuggestion,
  useVisualPresetMutations,
  useVisualPresetsQuery,
  waitForSuggestPass,
  type VisualMedium,
} from "@/features/settings/api/useVisualPresets";
import { useUpdateSiteSeoSettingsMutation } from "@/features/site/api/useSiteAnalysis";
import { sameSignature } from "@/features/settings/signatures/signatureModel";

import { useSaveWizardPositioningMutation } from "./useWizardSeo";
import {
  useDismissOnboardingMutation,
  useSaveWizardStepMutation,
} from "./useOnboardingState";
import { useWizardStore } from "../state/wizardStore";
import { clearOnboardingDismissed } from "../utils/onboardingDismissal";

/**
 * How long Finish waits for a thin pass still reading the site before it
 * saves without that pass's palette. The pass took 28 s on 2026-11-09 (a
 * cold start, the homepage screenshot, the model call); the wait starts at
 * the click and runs alongside the other saves.
 */
const SUGGEST_PASS_WAIT_MS = 15_000;

export function useFinishWizard() {
  const queryClient = useQueryClient();
  const { data: profile } = usePublicSiteProfile();
  const saveProfile = usePublicSiteProfileMutation();
  const saveAiSettings = useUpdateAiSettings();
  const savePositioning = useSaveWizardPositioningMutation();
  const saveSeoSettings = useUpdateSiteSeoSettingsMutation();
  const { create: createPreset, update: updatePreset } = useVisualPresetMutations();
  const presetsQuery = useVisualPresetsQuery();
  const markStepComplete = useSaveWizardStepMutation();
  const dismissOnboarding = useDismissOnboardingMutation();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const { drafts } = useWizardStore.getState();
      // A thin pass still reading the site lands its palette in the step-4
      // draft and on the activation; colours already there never change.
      const passSettled =
        drafts.step4 && !drafts.step4.palette?.length
          ? waitForSuggestPass(queryClient, SUGGEST_PASS_WAIT_MS)
          : Promise.resolve();

      // ── Step 1: site identity ──────────────────────────────────
      if (drafts.step1 && profile) {
        try {
          await saveProfile.mutateAsync({
            publicUrl: drafts.step1.publicUrl,
            isHeadless: drafts.step1.isHeadless,
            description: drafts.step1.description,
            keyPages: profile.keyPages,
            permalinkStrategy: profile.permalinkStrategy,
            permalinkTemplate: profile.permalinkTemplate,
            defaultPermalinkLang: profile.defaultPermalinkLang,
          });
        } catch (e) {
          console.warn("Wizard finish: site profile save failed", e);
        }
      }

      // ── Step 2: AI defaults (credential already live) ──────────
      if (drafts.step2?.textProvider) {
        try {
          await saveAiSettings.mutateAsync({
            ai: {
              defaults: {
                text_provider: drafts.step2.textProvider,
                text_model: drafts.step2.textModel,
                image_provider: drafts.step2.imageProvider,
                image_model: drafts.step2.imageModel,
              },
            },
          });
        } catch (e) {
          console.warn("Wizard finish: AI defaults save failed", e);
        }
      }

      // ── Step 3: positioning + competitors ───────────────────────
      // Keywords + authority domains are campaign-scoped now (per-language);
      // the wizard only persists positioning + the site competitor list.
      if (drafts.step3) {
        const { positioning, positioningSource, competitorUrls, referralLinks } =
          drafts.step3;
        if (positioning.what || positioning.who || positioning.problem) {
          try {
            await savePositioning.mutateAsync({
              what: positioning.what,
              who: positioning.who,
              problem: positioning.problem,
              source: positioningSource,
            });
          } catch (e) {
            console.warn("Wizard finish: positioning save failed", e);
          }
        }
        try {
          await saveSeoSettings.mutateAsync({
            competitorUrls,
            ...(referralLinks?.length ? { referralLinks } : {}),
          });
        } catch (e) {
          console.warn("Wizard finish: SEO settings save failed", e);
        }
      }

      // ── Step 4: visual preset ──────────────────────────────────
      // Read once the thin pass has had its chance to answer.
      await passSettled;
      let step4 = useWizardStore.getState().drafts.step4;
      let presetsData = presetsQuery.data;
      let storedPalette: string[] = [];
      if (step4 && !step4.palette?.length) {
        // A pass that answered after the step was left, or on an earlier
        // page load, is stored on the activation: refetch the list to see it.
        presetsData = (await presetsQuery.refetch()).data ?? presetsData;
        step4 = useWizardStore.getState().drafts.step4;
        storedPalette = readVisualSuggestion(presetsData?.visualSuggestion)?.palette ?? [];
      }
      if (step4) {
        // A signature without colours renders in the neutral set: a draft
        // that missed the pass's answer takes the stored palette (2026-11-09).
        const palette =
          step4.signature && !step4.palette?.length && storedPalette.length > 0
            ? storedPalette
            : step4.palette;
        const content = {
          global_art_direction: step4.globalArtDirection,
          aspect_ratio: step4.aspectRatio,
          format: step4.format,
          optimize_on_upload: step4.optimizeOnUpload,
          // Persist the rendering medium picked on the medium cards so the
          // preset (and every generated image) matches it.
          medium: step4.medium as VisualMedium,
          // Video styling (video-visuals handoff §4) — keys are OMITTED
          // (not defaulted) when the draft carries none: the video row
          // only writes them on eligible plans, and a pre-video draft
          // restored from localStorage must never clobber a preset's
          // saved video styling with defaults.
          ...(step4.videoStyle !== undefined
            ? { video_style: step4.videoStyle }
            : {}),
          ...(step4.videoArtDirection !== undefined
            ? { video_art_direction: step4.videoArtDirection }
            : {}),
          ...(step4.captionPlacement !== undefined
            ? { caption_placement: step4.captionPlacement }
            : {}),
          ...(palette !== undefined ? { palette } : {}),
          // The picked signature saves even with no prompt text: a curated or
          // custom signature makes the art direction optional (spec §4).
          // `null` (a bound free-prompt preset kept as is) and absent (a
          // draft from before 2026-11-09) leave the stored one alone.
          ...(step4.signature ? { signature: step4.signature } : {}),
        };
        const boundId = presetsData?.boundPresetId ?? null;
        const boundPreset = boundId
          ? presetsData?.presets.find((p) => p.presetId === boundId)
          : undefined;
        // Don't clobber an existing bound preset the user didn't touch.
        // Step 4 hydrates the draft FROM the bound preset, so an untouched
        // pass-through produces byte-identical content — writing it anyway
        // bumped the preset and (worse) a re-onboarding regenerated the
        // saved style from scratch (wp.org QA, 2026-09-03). Only the
        // fields the wizard actually manages are compared.
        const unchanged =
          boundPreset !== undefined &&
          boundPreset.globalArtDirection === content.global_art_direction &&
          boundPreset.aspectRatio === content.aspect_ratio &&
          boundPreset.format === content.format &&
          boundPreset.optimizeOnUpload === content.optimize_on_upload &&
          boundPreset.medium === content.medium &&
          (step4.signature === undefined ||
            step4.signature === null ||
            sameSignature(boundPreset.signature, step4.signature)) &&
          JSON.stringify(boundPreset.palette ?? []) === JSON.stringify(palette ?? []);
        try {
          if (boundId) {
            if (!unchanged) await updatePreset({ preset_id: boundId, content });
          } else {
            await createPreset({
              label: "Default",
              content,
              bind_to_activation: true,
            });
          }
        } catch (e) {
          console.warn("Wizard finish: visual preset save failed", e);
        }
      }

      // ── Step 5: personas — NOTHING to do here. ─────────────────
      // Personas save LIVE in the step now (it embeds the real
      // PersonaManager, like the Personas page), so they're already
      // persisted. Re-saving here would duplicate them.

      // ── Mark wizard complete (dashboard banner + tier tracking) ─
      // Cloud-side workspace state + growth event. Works on anonymous
      // installs through their activation bearer (2026-10-06); the durable
      // local seal below is what stops the auto-redirect for every tier.
      try {
        await markStepComplete.mutateAsync(6);
      } catch (e) {
        console.warn("Wizard finish: completion flag failed", e);
      }

      // Durable server-side seal (wp_option) so the wizard never auto-opens
      // again — install-level, so it survives the activation-id drift that
      // kept resurrecting it. This is the source of truth now.
      try {
        await dismissOnboarding.mutateAsync();
      } catch (e) {
        console.warn("Wizard finish: dismiss flag failed", e);
      }

      // Legacy localStorage dismissal is superseded by the server flag; drop
      // any stale value so it can't linger into a future re-onboarding.
      clearOnboardingDismissed();
    },
  });
}
