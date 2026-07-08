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

import { useMutation } from "@tanstack/react-query";

import {
  usePublicSiteProfile,
  usePublicSiteProfileMutation,
} from "@/features/settings";
import { useUpdateAiSettings } from "@/features/ai-engine/api/useUpdateAiSettings";
import {
  useVisualPresetMutations,
  useVisualPresetsQuery,
  type VisualMedium,
} from "@/features/settings/api/useVisualPresets";
import { useUpdateSiteSeoSettingsMutation } from "@/features/site/api/useSiteAnalysis";

import { useSaveWizardPositioningMutation } from "./useWizardSeo";
import { useSaveWizardStepMutation } from "./useOnboardingState";
import { useWizardStore } from "../state/wizardStore";
import { clearOnboardingDismissed } from "../utils/onboardingDismissal";

export function useFinishWizard() {
  const { data: profile } = usePublicSiteProfile();
  const saveProfile = usePublicSiteProfileMutation();
  const saveAiSettings = useUpdateAiSettings();
  const savePositioning = useSaveWizardPositioningMutation();
  const saveSeoSettings = useUpdateSiteSeoSettingsMutation();
  const { create: createPreset, update: updatePreset } = useVisualPresetMutations();
  const { data: presetsData } = useVisualPresetsQuery();
  const markStepComplete = useSaveWizardStepMutation();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const { drafts } = useWizardStore.getState();

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
      if (drafts.step4) {
        const content = {
          global_art_direction: drafts.step4.globalArtDirection,
          aspect_ratio: drafts.step4.aspectRatio,
          format: drafts.step4.format,
          optimize_on_upload: drafts.step4.optimizeOnUpload,
          // Persist the rendering medium picked in the AI-suggest dropdown
          // so the preset (and every generated image) matches it.
          medium: drafts.step4.medium as VisualMedium,
          // Video styling (video-visuals handoff §4) — keys are OMITTED
          // (not defaulted) when the draft carries none: the video row
          // only writes them on eligible plans, and a pre-video draft
          // restored from localStorage must never clobber a preset's
          // saved video styling with defaults.
          ...(drafts.step4.videoStyle !== undefined
            ? { video_style: drafts.step4.videoStyle }
            : {}),
          ...(drafts.step4.videoArtDirection !== undefined
            ? { video_art_direction: drafts.step4.videoArtDirection }
            : {}),
          ...(drafts.step4.captionPlacement !== undefined
            ? { caption_placement: drafts.step4.captionPlacement }
            : {}),
          ...(drafts.step4.palette !== undefined
            ? { palette: drafts.step4.palette }
            : {}),
        };
        const boundId = presetsData?.boundPresetId ?? null;
        try {
          if (boundId) {
            await updatePreset({ preset_id: boundId, content });
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
      try {
        await markStepComplete.mutateAsync(6);
      } catch (e) {
        console.warn("Wizard finish: completion flag failed", e);
      }

      // A finished site no longer needs the per-site onboarding nudge —
      // drop any earlier Exit dismissal so the flag can't linger into a
      // future re-onboarding of this activation.
      clearOnboardingDismissed();
    },
  });
}
