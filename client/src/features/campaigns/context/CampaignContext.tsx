import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CampaignFormData } from "../types";
import { useLicense, useDefaultProviders } from "@/features/settings";
import { useAiSettingsQuery } from "@/features/ai-engine";
import { useAvailableModelsQuery } from "@/features/ai-engine/api/useAvailableModelsQuery";
import { resolveDefaultModel } from "@/features/ai-engine/helpers";
import { DEFAULT_CAMPAIGN_FORM_DATA } from "@/features/campaigns/constants";
import { getCampaignFormDataForLicense } from "@/features/campaigns/helpers";
import { useCampaignDraftStore } from "./draftStore";

export type SchedulerMode = "campaign" | "single";

interface CampaignContextType {
  formData: CampaignFormData;
  updateForm: <K extends keyof CampaignFormData>(
    cluster: K,
    data: Partial<CampaignFormData[K]>
  ) => void;
  isValid: (step: number) => boolean;
  mode: SchedulerMode;
  /**
   * True only in the new-campaign create flow (the persisted-draft
   * provider). False when editing an existing campaign or composing a
   * single post. Surfaces used to scope tier gates that should apply to
   * NEW campaigns only — e.g. the Free weekly cadence lock in the
   * Publishing Frequency step. Editing an existing campaign is left to
   * the grandfather-aware server gate (`validateCadenceForTier`).
   */
  isCreate: boolean;
}

const CampaignContext = createContext<CampaignContextType | undefined>(undefined);

export const CampaignProvider = ({
  children,
  initialData,
  mode = "campaign",
}: {
  children: ReactNode;
  initialData?: CampaignFormData;
  mode?: SchedulerMode;
}) => {
  // The persisted-draft store backs the create-flow only. Edit (initialData
  // present) and the single-post scheduler keep using local state — neither
  // wants to share the new-campaign draft slot.
  const isPersistedFlow = mode === "campaign" && !initialData;

  if (isPersistedFlow) {
    return <PersistedCampaignProvider mode={mode}>{children}</PersistedCampaignProvider>;
  }

  return (
    <LocalCampaignProvider mode={mode} initialData={initialData}>
      {children}
    </LocalCampaignProvider>
  );
};

// ─── Validation — shared between providers ─────────────────────────────

const buildIsValid = (formData: CampaignFormData, mode: SchedulerMode) => (step: number) => {
  switch (step) {
    case 1: // Identity
      if (mode === "single") return formData.identity.objective.length >= 20;
      return formData.identity.name.length >= 3 && formData.identity.objective.length >= 20;
    case 2: // Intelligence
      return !!formData.intelligence.textProvider && !!formData.intelligence.personaId;
    case 3: // Taxonomy
      if (formData.taxonomy.categories.mode === "restricted") {
        return formData.taxonomy.categories.list.length > 0;
      }
      return true;
    case 5: // Schedule/Deployment
      return !!formData.schedule.cron;
    default:
      return true;
  }
};

// ─── Model backfill — shared by both providers ─────────────────────────

/**
 * Backfills empty `textModel` / `imageModel` once provider settings and
 * the model catalog hydrate, keyed off whichever provider the form
 * currently holds.
 *
 * Why at the provider level: the previous backfill lived in mount
 * effects inside `<CampaignAiEngineSection>` / `<ProviderToggle>` —
 * components tucked into the collapsed Advanced Settings group. A
 * campaign created without ever expanding it persisted `textModel: ""`
 * and every run leaned on the cloud's silent fallback ("[engine] Empty
 * textModel on campaign", observed 2026-06-04). Filling here guarantees
 * the create/update payload carries the model the pickers would have
 * shown, regardless of which step components mounted. Also heals legacy
 * empty-model campaigns on their next edit→save.
 *
 * The provider itself is never the gap — both providers seed
 * `textProvider`/`imageProvider` from `useDefaultProviders`, which
 * resolves even without an explicit default (first connected with the
 * capability → first active → "gemini"). Model source priority lives in
 * `resolveDefaultModel`; if neither source has hydrated yet the field
 * stays "" and the cloud-side fallback remains the safety net.
 *
 * Managed plans are skipped — models resolve server-side from curated
 * per-plan defaults and the BYOK pickers aren't rendered.
 */
interface ModelBackfillPatch {
  textModel?: string;
  imageModel?: string;
  /**
   * The providers the models were resolved AGAINST. Appliers must
   * re-check these against current state before writing: the effect's
   * closure can be one render stale (e.g. the license-defaults
   * bootstrap swaps the draft's provider in the same effect flush),
   * and applying a model resolved for provider A onto a form that now
   * holds provider B would silently mis-pair them. The effect re-runs
   * against the fresh provider after a rejected apply, so the fill
   * still converges.
   */
  resolvedFor: { textProvider: string; imageProvider: string };
}

const useModelBackfill = (
  intelligence: CampaignFormData["intelligence"],
  applyPatch: (patch: ModelBackfillPatch) => void,
) => {
  const { isCloud } = useDefaultProviders();
  const { data: ai } = useAiSettingsQuery();
  const { data: availableModels } = useAvailableModelsQuery();

  const { textProvider, imageProvider, textModel, imageModel } = intelligence;

  useEffect(() => {
    if (isCloud) return;

    const patch: ModelBackfillPatch = {
      resolvedFor: { textProvider, imageProvider },
    };
    if (!textModel) {
      const resolved = resolveDefaultModel({
        provider: textProvider,
        capability: "text",
        providerSettings: ai?.providers,
        catalogDefaults: availableModels?.defaults,
      });
      if (resolved) patch.textModel = resolved;
    }
    if (!imageModel) {
      const resolved = resolveDefaultModel({
        provider: imageProvider,
        capability: "image",
        providerSettings: ai?.providers,
        catalogDefaults: availableModels?.defaults,
      });
      if (resolved) patch.imageModel = resolved;
    }
    if (patch.textModel || patch.imageModel) applyPatch(patch);
  }, [
    isCloud,
    ai,
    availableModels,
    textProvider,
    imageProvider,
    textModel,
    imageModel,
    applyPatch,
  ]);
};

/**
 * Drops the parts of a backfill patch that no longer apply to the
 * current intelligence state — field already filled, or provider
 * changed since the patch was resolved (see `ModelBackfillPatch`).
 */
const guardModelPatch = (
  patch: ModelBackfillPatch,
  current: CampaignFormData["intelligence"],
): Partial<Pick<CampaignFormData["intelligence"], "textModel" | "imageModel">> => ({
  ...(patch.textModel &&
  !current.textModel &&
  current.textProvider === patch.resolvedFor.textProvider
    ? { textModel: patch.textModel }
    : {}),
  ...(patch.imageModel &&
  !current.imageModel &&
  current.imageProvider === patch.resolvedFor.imageProvider
    ? { imageModel: patch.imageModel }
    : {}),
});

// ─── Edit / single-post mode — local state ─────────────────────────────

const LocalCampaignProvider = ({
  children,
  initialData,
  mode,
}: {
  children: ReactNode;
  initialData?: CampaignFormData;
  mode: SchedulerMode;
}) => {
  const { isPaidLicense, isLicensed } = useLicense();
  const { defaultTextProvider, defaultImageProvider } = useDefaultProviders();

  const defaultFormData = useMemo<CampaignFormData>(
    () => ({
      ...DEFAULT_CAMPAIGN_FORM_DATA,
      intelligence: {
        ...DEFAULT_CAMPAIGN_FORM_DATA.intelligence,
        textProvider: defaultTextProvider,
        imageProvider: defaultImageProvider,
      },
    }),
    [defaultTextProvider, defaultImageProvider]
  );

  const [formData, setFormData] = useState<CampaignFormData>(initialData ?? defaultFormData);

  useEffect(() => {
    if (initialData || (!isLicensed && !isPaidLicense)) {
      return;
    }

    const refinedData = getCampaignFormDataForLicense({ isPaidLicense, isLicensed });

    setFormData({
      ...refinedData,
      intelligence: {
        ...refinedData.intelligence,
        textProvider: defaultTextProvider,
        imageProvider: defaultImageProvider,
      },
    });
  }, [initialData, isPaidLicense, isLicensed, defaultTextProvider, defaultImageProvider]);

  const updateForm = useCallback(
    <K extends keyof CampaignFormData>(cluster: K, data: Partial<CampaignFormData[K]>) => {
      setFormData((prev) => ({
        ...prev,
        [cluster]: { ...prev[cluster], ...data },
      }));
    },
    []
  );

  const applyModelPatch = useCallback(
    (patch: ModelBackfillPatch) =>
      setFormData((prev) => {
        const safe = guardModelPatch(patch, prev.intelligence);
        if (!safe.textModel && !safe.imageModel) return prev;
        return { ...prev, intelligence: { ...prev.intelligence, ...safe } };
      }),
    []
  );
  useModelBackfill(formData.intelligence, applyModelPatch);

  const value = useMemo(
    () => ({ formData, updateForm, isValid: buildIsValid(formData, mode), mode, isCreate: false }),
    [formData, updateForm, mode]
  );

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
};

// ─── Create flow — backed by the persisted draft store ────────────────

const PersistedCampaignProvider = ({
  children,
  mode,
}: {
  children: ReactNode;
  mode: SchedulerMode;
}) => {
  const { isPaidLicense, isLicensed } = useLicense();
  const { defaultTextProvider, defaultImageProvider } = useDefaultProviders();

  const formData = useCampaignDraftStore((s) => s.formData);
  const lastUpdatedAt = useCampaignDraftStore((s) => s.lastUpdatedAt);
  const updateFormStore = useCampaignDraftStore((s) => s.updateForm);
  const replaceForm = useCampaignDraftStore((s) => s.replaceForm);

  useEffect(() => {
    // License-defaults bootstrap. We only run this while the draft is
    // "untouched" (lastUpdatedAt === null). Once the user has typed
    // anything, their draft wins — even if their license tier or default
    // provider config changes mid-flow.
    if (lastUpdatedAt !== null) return;
    if (!isLicensed && !isPaidLicense) return;

    const refinedData = getCampaignFormDataForLicense({ isPaidLicense, isLicensed });

    // Keywords + authority + competitors are managed elsewhere now —
    // the Keywords/Authority steps discover their own per-campaign, and
    // competitors are a site-level fact (Site → Competitors) the cloud
    // reads directly — so nothing SEO-related is seeded into the draft.
    replaceForm(
      {
        ...refinedData,
        intelligence: {
          ...refinedData.intelligence,
          textProvider: defaultTextProvider,
          imageProvider: defaultImageProvider,
        },
      },
      { markTouched: false }
    );
  }, [
    lastUpdatedAt,
    isPaidLicense,
    isLicensed,
    defaultTextProvider,
    defaultImageProvider,
    replaceForm,
  ]);

  // System-initiated fill — must not flip `lastUpdatedAt`, or an
  // untouched draft would start showing the "Resume draft" banner and
  // block the license-defaults bootstrap above.
  const applyModelPatch = useCallback(
    (patch: ModelBackfillPatch) => {
      // Guard against the store's CURRENT state, not the render
      // closure — the bootstrap effect above can replace the form
      // (provider included) in the same flush this patch was resolved
      // in.
      const safe = guardModelPatch(
        patch,
        useCampaignDraftStore.getState().formData.intelligence,
      );
      if (!safe.textModel && !safe.imageModel) return;
      updateFormStore("intelligence", safe, { markTouched: false });
    },
    [updateFormStore]
  );
  useModelBackfill(formData.intelligence, applyModelPatch);

  const value = useMemo(
    () => ({
      formData,
      updateForm: updateFormStore,
      isValid: buildIsValid(formData, mode),
      mode,
      isCreate: true,
    }),
    [formData, updateFormStore, mode]
  );

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
};

export const useCampaignForm = () => {
  const context = useContext(CampaignContext);
  if (!context) throw new Error("useCampaignForm must be used within a CampaignProvider");
  return context;
};
