import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CampaignFormData } from "../types";
import { useLicense, useDefaultProviders } from "@/features/settings";
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

// The form-level model backfill (`useModelBackfill`, 2026-06-04) was removed
// on 2026-11-25 with model selection itself: no campaign stores a model or a
// tier, and the cloud runs each provider's Standard model
// (specs/byok-ai-guidance.md §2.2).

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
