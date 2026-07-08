/**
 * Zustand store — the single source of truth for ALL wizard data.
 *
 * Architecture (decided 2026-05-29): the wizard keeps every draft in
 * this store, persisted to localStorage, and commits to the server
 * exactly ONCE at "Finish setup" (see OnboardingPage's batched save).
 * The only mid-wizard server writes are:
 *   - AI provider credential connection (a credential, not deferrable
 *     wizard state — and it's needed live for the AI calls steps 3/5
 *     make), handled by the reused ProviderSetupWizard.
 *   - AI generation calls (positioning draft, keyword suggestions,
 *     persona draft, visual prompt) — they produce content the user
 *     reviews, so they must run live. Their RESULTS land in the
 *     drafts here and are persisted at the end like everything else.
 *
 * Why: the previous per-step-save model felt slow and introduced
 * cache-merge bugs (competitors disappearing, keyword adds failing).
 * One commit at the end is faster and removes a whole class of
 * race conditions.
 *
 * Completion + gating (decided 2026-05-29):
 *   - The wizard is skippable (Exit anytime → dismissible banner +
 *     re-run from Settings), but FINISH requires every step complete.
 *   - Step 2 (AI engine) is a hard gate: steps 3–6 stay locked until
 *     a working provider is connected. Managed (cloud) plans skip
 *     the step entirely — OnboardingPage auto-validates it and hides
 *     it from the strip, since master keys mean there's nothing to
 *     connect.
 *   - `stepValidity` is computed by each step from its draft and
 *     reported here; the stepper + Continue button gate on it.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ReferralLink } from "@structura/types";

import { perActivationStorageKey } from "@/utils/storageKey";
import type { WizardStepId } from "../api/types";

/** Step 1 — site identity. Mirrors the editable PublicSiteProfile slice. */
export interface SiteIdentityDraft {
  publicUrl: string;
  isHeadless: boolean;
  description: string;
  /**
   * Brand logo URL — in-wizard generation context only (not persisted;
   * `logoUrl` is read-only on the site-profile endpoint). Seeded from
   * WordPress's native custom-logo (`profile.logoUrl`) and fed to Step 4's
   * "AI suggest style" so the drafted visual style matches the brand. Shown
   * only on paid tiers, since the suggest it feeds is paid. Empty on headless
   * installs with no WP logo, where the user can upload one.
   */
  logoUrl: string;
}

/**
 * Step 2 — AI engine. We don't store provider keys here (the reused
 * ProviderSetupWizard writes those to the workspace credential store
 * live). We only mirror the resolved default text/image model so the
 * batched final save can persist the workspace's chosen defaults.
 */
export interface AiEngineDraft {
  textProvider?: string;
  textModel?: string;
  imageProvider?: string;
  imageModel?: string;
}

/** Step 3 — SEO intelligence. */
export interface SeoStepDraft {
  positioning: { what: string; who: string; problem: string };
  positioningSource: "user" | "ai_draft" | "edited";
  /**
   * Site-scoped competitor URLs. Keywords + authority domains moved to the
   * campaign level (per-language), so the wizard's SEO step only collects
   * positioning + competitors.
   */
  competitorUrls: string[];
  /**
   * Site-scoped referral / partner links, seeded into every new campaign.
   * Optional — pre-referral drafts restored from localStorage omit it.
   */
  referralLinks?: ReferralLink[];
}

/**
 * Step 4 — visual-style profile. The logo URL moved to step 1
 * (site identity); this step reads it from there as generation
 * context rather than owning its own copy.
 */
export interface VisualDraft {
  globalArtDirection: string;
  aspectRatio: string;
  format: string;
  optimizeOnUpload: boolean;
  /**
   * Rendering medium (photography / illustration / 3d_render) — picked from
   * the AI-suggest dropdown and persisted to the visual preset, so the
   * drafted style and every generated image share one medium. Defaults to
   * "photography" when the wizard never opens the suggest picker.
   */
  medium: string;
  /**
   * Video styling (video-visuals handoff §4) — populated ONLY when the
   * plan is eligible for the Video channel (the ineligible wizard shows
   * no video row and must not write video keys at Finish). All four stay
   * optional so pre-video localStorage drafts rehydrate cleanly.
   */
  videoStyle?: "clean" | "bold" | "kinetic";
  /** Drafted by the suggest pass; saved silently (no wizard textarea). */
  videoArtDirection?: string;
  captionPlacement?: "top" | "middle" | "bottom";
  /** Suggest-extracted brand palette; first entry is the caption accent. */
  palette?: string[];
}

/** Step 5 — a persona. The product point is MULTIPLE voices, so the
 *  step holds an array. It's seeded from the workspace's EXISTING
 *  personas (so the wizard manages the same library, not a parallel
 *  one); `id` carries the saved persona's id so Finish UPDATES it
 *  rather than creating a duplicate. Personas without an `id` are new
 *  (AI-drafted or hand-added) and get created. */
export interface PersonaDraft {
  /** Saved persona id (cloud nanoid / legacy WP id). Absent = new. */
  id?: string | number;
  name: string;
  systemPrompt: string;
  tone: string;
  readingLevel: string;
  authorId: number;
}

interface WizardDrafts {
  step1?: SiteIdentityDraft;
  step2?: AiEngineDraft;
  step3?: SeoStepDraft;
  step4?: VisualDraft;
  step5?: PersonaDraft[];
}

interface WizardStore {
  /** Step the SPA is currently showing (UI navigation, not progress). */
  activeStep: WizardStepId;
  setActiveStep: (step: WizardStepId) => void;

  drafts: WizardDrafts;
  setStep1Draft: (draft: SiteIdentityDraft) => void;
  setStep2Draft: (draft: AiEngineDraft) => void;
  setStep3Draft: (draft: SeoStepDraft) => void;
  setStep4Draft: (draft: VisualDraft) => void;
  setStep5Draft: (draft: PersonaDraft[]) => void;

  /**
   * Per-step completion, computed by each step from its draft +
   * external signals (e.g. step 2 reports valid only when a working
   * provider is connected). Drives the stepper gating + Continue
   * enablement + the Finish requirement.
   */
  stepValidity: Record<WizardStepId, boolean>;
  setStepValid: (step: WizardStepId, valid: boolean) => void;

  /** Whether each step has been visited (for "Not done yet" vs blank). */
  visitedSteps: WizardStepId[];
  markVisited: (step: WizardStepId) => void;

  /**
   * The user explicitly chose "continue without an account" on the
   * wizard's license gate (fresh installs with no key bound see it
   * before step 1). Persisted so a mid-wizard reload doesn't re-show
   * the gate; cleared by reset() and irrelevant once a key is bound
   * (the gate only renders while `hasUsableLicense === false`).
   */
  licenseGateSkipped: boolean;
  setLicenseGateSkipped: (skipped: boolean) => void;

  /**
   * Whether the wizard has already drafted a starting persona for THIS
   * site this onboarding. Personas are workspace-shared, so a fresh site in
   * a populated workspace would otherwise inherit the whole library with no
   * voice of its own — we draft one tailored to the site regardless of the
   * library, gated by this flag so a mid-wizard reload doesn't duplicate it.
   * Cleared by reset() so the next site's onboarding seeds its own.
   */
  personaSeeded: boolean;
  setPersonaSeeded: (seeded: boolean) => void;

  /**
   * Positioning pre-warmed by step 1's description auto-draft
   * (2026-06-07): the same homepage-read call answers both the site
   * description AND the step-3 positioning, so step 1 stashes the
   * full suggestion here instead of burning a second AI call. Step 3's
   * seed effect consumes it when (and only when) it creates a fresh
   * draft — a dedicated slot rather than a direct step3 write so the
   * pre-warm can never mask the server-saved competitor/keyword lists
   * the seed effect also merges in. Persisted so a mid-wizard reload
   * between steps 1 and 3 doesn't lose it.
   */
  prewarmedPositioning: { what: string; who: string; problem: string } | null;
  setPrewarmedPositioning: (
    p: { what: string; who: string; problem: string } | null,
  ) => void;

  reset: () => void;
}

const initialValidity: Record<WizardStepId, boolean> = {
  1: false,
  2: false,
  3: false,
  4: false,
  5: false,
  6: false,
};

export const useWizardStore = create<WizardStore>()(
  persist(
    (set) => ({
      activeStep: 1,
      setActiveStep: (step) =>
        set((s) => ({
          activeStep: step,
          visitedSteps: s.visitedSteps.includes(step)
            ? s.visitedSteps
            : [...s.visitedSteps, step],
        })),

      drafts: {},
      setStep1Draft: (draft) =>
        set((s) => ({ drafts: { ...s.drafts, step1: draft } })),
      setStep2Draft: (draft) =>
        set((s) => ({ drafts: { ...s.drafts, step2: draft } })),
      setStep3Draft: (draft) =>
        set((s) => ({ drafts: { ...s.drafts, step3: draft } })),
      setStep4Draft: (draft) =>
        set((s) => ({ drafts: { ...s.drafts, step4: draft } })),
      setStep5Draft: (draft) =>
        set((s) => ({ drafts: { ...s.drafts, step5: draft } })),

      stepValidity: initialValidity,
      setStepValid: (step, valid) =>
        set((s) =>
          s.stepValidity[step] === valid
            ? s
            : { stepValidity: { ...s.stepValidity, [step]: valid } },
        ),

      visitedSteps: [1],
      markVisited: (step) =>
        set((s) =>
          s.visitedSteps.includes(step)
            ? s
            : { visitedSteps: [...s.visitedSteps, step] },
        ),

      licenseGateSkipped: false,
      setLicenseGateSkipped: (skipped) =>
        set({ licenseGateSkipped: skipped }),

      personaSeeded: false,
      setPersonaSeeded: (seeded) => set({ personaSeeded: seeded }),

      prewarmedPositioning: null,
      setPrewarmedPositioning: (p) => set({ prewarmedPositioning: p }),

      reset: () =>
        set({
          activeStep: 1,
          drafts: {},
          stepValidity: initialValidity,
          visitedSteps: [1],
          licenseGateSkipped: false,
          personaSeeded: false,
          prewarmedPositioning: null,
        }),
    }),
    {
      // Per-activation key: a fixed name leaked one site's wizard draft
      // into every other site opened in the same browser (e.g. DDEV data
      // on a live install). See `perActivationStorageKey`.
      name: perActivationStorageKey("structura-onboarding-wizard"),
      storage: createJSONStorage(() => localStorage),
      // v1: step5 became an array. (An earlier draft of v1 also moved a
      // brand `logoUrl` into step1, but the logo upload was since
      // removed — any persisted logoUrl is now simply ignored.)
      // `migrate` reshapes any localStorage written by the old
      // (object step5) layout so a returning tester doesn't crash on the
      // new accessors.
      version: 1,
      migrate: (persisted: unknown, version: number) => {
        const state = (persisted ?? {}) as {
          drafts?: Record<string, unknown> & {
            step5?: unknown;
          };
        };
        if (version < 1 && state.drafts) {
          const d = state.drafts;
          // step5: single object → array.
          if (d.step5 && !Array.isArray(d.step5)) d.step5 = [d.step5];
        }
        return state as never;
      },
      // Persist drafts + navigation + per-step validity. We DO persist
      // stepValidity (despite the staleness caveat) because otherwise a
      // reload that lands on a later step leaves steps 1–4 unmounted →
      // their validity resets to false → `canFinish` is false → "Finish
      // setup" silently dead-ends. Each step still recomputes its own
      // validity on mount and overwrites, so the persisted value only
      // bridges UNMOUNTED steps (whose drafts are likewise persisted and
      // unchanged) — keeping it consistent. The only staleness window is
      // an unmounted step across a validation-rule code change, which a
      // re-visit fixes.
      partialize: (state) => ({
        activeStep: state.activeStep,
        drafts: state.drafts,
        visitedSteps: state.visitedSteps,
        stepValidity: state.stepValidity,
        licenseGateSkipped: state.licenseGateSkipped,
        prewarmedPositioning: state.prewarmedPositioning,
      }),
    },
  ),
);
