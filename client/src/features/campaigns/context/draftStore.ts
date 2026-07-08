import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { CampaignFormData } from "@/features/campaigns/types";
import { DEFAULT_CAMPAIGN_FORM_DATA } from "@/features/campaigns/constants";
import { perActivationStorageKey } from "@/utils/storageKey";

/**
 * Persisted-draft store for the New Campaign wizard.
 *
 * Why this exists: the wizard is multi-step and several steps
 * (Interview, Keywords, Authority) take real user effort. Before this
 * store the entire form lived in component state, so navigating away
 * — even briefly to check a setting on another page — wiped the draft.
 *
 * Scope: only the create-flow uses this. Edit-flow keeps using local
 * `useState` inside CampaignProvider so a campaign being edited never
 * collides with an in-progress new-campaign draft.
 *
 * Per-site keying: WordPress sites on different hosts share the same
 * browser localStorage. Keying by the activation discriminator
 * (`perActivationStorageKey`) means agencies who hop between sites in
 * tabs don't see drafts cross over.
 *
 * Schema versioning: when the form shape changes incompatibly, bump
 * `STORE_VERSION` — `migrate` returns the initial state, so the user
 * loses the draft (acceptable) but the wizard never crashes against
 * a stale shape.
 */

/** Bump when the persisted shape of CampaignFormData / step state changes incompatibly. */
const STORE_VERSION = 1;

const STORAGE_KEY_PREFIX = "structura-campaign-draft";

const getStorageKey = (): string => perActivationStorageKey(STORAGE_KEY_PREFIX);

export interface CampaignDraftState {
  formData: CampaignFormData;
  activeStep: string;
  completedSteps: string[];
  skippedSteps: string[];
  /**
   * ISO timestamp of the last user-initiated edit, or `null` while
   * the draft is "untouched" (only contains the static defaults the
   * wizard rendered at first paint). Consumers use this to decide:
   *   - whether to show a "Resume draft" banner on /campaigns
   *   - whether the license-defaults effect is allowed to overwrite
   *     the form (only when null — once the user has typed anything
   *     we must not clobber their work).
   */
  lastUpdatedAt: string | null;

  /**
   * Merge a partial update into one form cluster. Marks the draft as
   * user-touched unless `markTouched: false` — system-initiated fills
   * (the model backfill in CampaignContext) must not flip the
   * "resume draft" banner or lock out the license-defaults bootstrap.
   */
  updateForm: <K extends keyof CampaignFormData>(
    cluster: K,
    data: Partial<CampaignFormData[K]>,
    options?: { markTouched?: boolean }
  ) => void;
  /** Replace the entire form payload — used by the license-defaults bootstrap. */
  replaceForm: (data: CampaignFormData, options?: { markTouched?: boolean }) => void;
  setActiveStep: (step: string) => void;
  markComplete: (step: string) => void;
  markSkipped: (step: string) => void;
  clearStepFlag: (step: string) => void;
  discardDraft: () => void;
}

const buildInitialState = () => ({
  formData: DEFAULT_CAMPAIGN_FORM_DATA,
  activeStep: "interview",
  completedSteps: [] as string[],
  skippedSteps: [] as string[],
  lastUpdatedAt: null as string | null,
});

const touch = () => new Date().toISOString();

export const useCampaignDraftStore = create<CampaignDraftState>()(
  persist(
    (set, get) => ({
      ...buildInitialState(),

      updateForm: (cluster, data, options) =>
        set((state) => ({
          formData: {
            ...state.formData,
            [cluster]: { ...state.formData[cluster], ...data },
          },
          lastUpdatedAt:
            options?.markTouched === false ? state.lastUpdatedAt : touch(),
        })),

      replaceForm: (data, options) =>
        set({
          formData: data,
          // The license-defaults bootstrap calls this with markTouched:false
          // so applying defaults to an empty draft doesn't trip the
          // "user has a draft to resume" banner.
          lastUpdatedAt: options?.markTouched === false ? get().lastUpdatedAt : touch(),
        }),

      setActiveStep: (step) =>
        set({ activeStep: step, lastUpdatedAt: touch() }),

      markComplete: (step) =>
        set((state) =>
          state.completedSteps.includes(step)
            ? state
            : { completedSteps: [...state.completedSteps, step], lastUpdatedAt: touch() }
        ),

      markSkipped: (step) =>
        set((state) =>
          state.skippedSteps.includes(step)
            ? state
            : { skippedSteps: [...state.skippedSteps, step], lastUpdatedAt: touch() }
        ),

      clearStepFlag: (step) =>
        set((state) => ({
          completedSteps: state.completedSteps.filter((s) => s !== step),
          skippedSteps: state.skippedSteps.filter((s) => s !== step),
        })),

      discardDraft: () => {
        set({ ...buildInitialState() });
        // Belt-and-suspenders: also clear the persisted entry so
        // a hard reload doesn't rehydrate stale data through any
        // race with the in-memory reset.
        void useCampaignDraftStore.persist.clearStorage();
      },
    }),
    {
      name: getStorageKey(),
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      // On version mismatch we drop the draft. Migrating between
      // arbitrary CampaignFormData shapes isn't worth the complexity —
      // a discarded draft is a one-time inconvenience; a crash on rehydrate
      // is a recurring one.
      migrate: () => buildInitialState(),
    }
  )
);

/**
 * Convenience selector — `true` when the draft has been touched by the
 * user and is therefore worth offering to resume.
 */
export const useHasCampaignDraft = (): boolean =>
  useCampaignDraftStore((s) => s.lastUpdatedAt !== null);

/** Exposed for tests. */
export const CAMPAIGN_DRAFT_STORE_VERSION = STORE_VERSION;
export const __getCampaignDraftStorageKey = getStorageKey;
