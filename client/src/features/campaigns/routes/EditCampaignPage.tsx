import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { __ } from "@wordpress/i18n";
import apiFetch from "@wordpress/api-fetch";
import {
  ArrowLeft,
  Bot,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  FolderOpen,
  HelpCircle,
  Image as ImageIcon,
  Key,
  Layout,
  Loader2,
  RefreshCw,
  Rocket,
  Save,
  Scale,
  Settings2,
  Shield,
  Sparkles,
  Tag,
} from "lucide-react";
import { Badge, Button, cn, InputField, PageLoader, Switch, TextArea, Tooltip, } from "@structura/ui";

import { PageTitle } from "@/components/Layout/PageTitle";
import { PageDescription } from "@/components/Layout/PageSubtitle";
import { PageContainer } from "@/components/Layout/PageContainer";
import { PageBuilderCompatCard } from "@/features/campaigns/components/PageBuilderCompatCard";
import { CampaignProvider, useCampaignForm } from "@/features/campaigns/context/CampaignContext";
import { useCampaignQuery } from "@/features/campaigns/api/useCampaignQuery";
import { useCampaignMutations } from "@/features/campaigns/api/useCampaignMutations";
import { KeywordDiscoveryHandle, StepKeywords, } from "@/features/campaigns/components/steps/StepKeywords";
import {
  AuthorityDiscovery,
  AuthorityDiscoveryHandle,
} from "@/features/campaigns/components/steps/AuthorityDiscovery";
import { SimpleStepRhythm } from "@/features/campaigns/components/steps/SimpleStepRhythm";
import { TaxonomySection } from "@/features/campaigns/components/TaxonomySection";
import { CampaignAiEngineSection } from "@/features/campaigns/components/CampaignAiEngineSection";
import { AIProvider, Campaign, CampaignFormData, CampaignMode } from "@/features/campaigns/types";
import { SeoRuleName, SUPPORTED_BLOCK_TYPE, useDefaultProviders, useLicense, useSeoRules, } from "@/features/settings";
import { CONTENT_BLOCKS } from "@/features/settings/constants";
import { CoreContentSettings } from "@/features/campaigns/components/CoreContentSettings";
import { VisualStyleFallbackNotice } from "@/features/campaigns/components/VisualStyleFallbackNotice";
import { normalizePostStatus } from "@/features/campaigns/helpers";
import { getBadgeIntentByCampaignStatus } from "@/utils/helpers";
import { campaignStatusLabel } from "@/features/campaigns/labels";

// ─── Page wrapper ───────────────────────────────────────────────────────

const EditCampaignPage = () => {
  const { id: campaignId } = useParams<{ id: string }>();
  // Cloud campaign IDs are opaque strings (Firestore auto-IDs).
  // parseInt() would yield NaN for non-numeric IDs and the query would
  // never fire. Pass the raw string straight through.
  const { data: campaign, isLoading, dataUpdatedAt } = useCampaignQuery(campaignId);

  if (isLoading) {
    return <PageLoader label={__("Loading campaign…", "structura")} size="lg" padding="lg" />;
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <p className="text-sm text-neutral-500">{__("Campaign not found.", "structura")}</p>
        <Button asChild variant="secondary">
          <a href="#/campaigns">{__("Back to Campaigns", "structura")}</a>
        </Button>
      </div>
    );
  }

  // Convert Campaign → CampaignFormData (strip id, status, stats).
  // postStatus is backfilled to 'publish' for campaigns persisted before the
  // field was added — matching the historical behavior of the removed
  // `structura_post_status` global option so nobody sees a blank Select.
  const initialData: CampaignFormData = {
    identity: campaign.identity,
    intelligence: campaign.intelligence,
    structure: {
      ...campaign.structure,
      // Normalize legacy "pending" (removed 2026-07-09) → "draft"; a
      // pre-postStatus campaign (no value) keeps the historical publish
      // default it actually ran with.
      postStatus: normalizePostStatus(campaign.structure.postStatus ?? "publish"),
    },
    taxonomy: campaign.taxonomy,
    schedule: campaign.schedule,
    authority: campaign.authority,
    keywords: campaign.keywords,
  };

  // Key on dataUpdatedAt so the provider (and all child state) resets
  // whenever fresh campaign data arrives from the API.
  return (
    <CampaignProvider key={dataUpdatedAt} initialData={initialData} mode="campaign">
      <EditCampaignInner campaign={campaign} />
    </CampaignProvider>
  );
};

export default EditCampaignPage;

// ─── Campaign mode options ──────────────────────────────────────────────

const CAMPAIGN_MODES: Array<{
  value: CampaignMode;
  label: string;
  description: string;
}> = [
  {
    value: "traffic_magnet",
    label: __("Traffic Magnet", "structura"),
    description: __("Maximize organic traffic with high-volume topics", "structura"),
  },
  {
    value: "quick_wins",
    label: __("Quick Wins", "structura"),
    description: __("Target low-competition keywords for fast rankings", "structura"),
  },
  {
    value: "conversion",
    label: __("Conversion", "structura"),
    description: __("Content designed to convert readers to customers", "structura"),
  },
  {
    value: "authority",
    label: __("Authority", "structura"),
    description: __("Build topical authority with comprehensive coverage", "structura"),
  },
];

// ─── Step definitions ───────────────────────────────────────────────────

interface StepDef {
  id: string;
  label: string;
  icon: typeof ClipboardList;
}

const ALL_STEPS: StepDef[] = [
  { id: "strategy", label: __("Strategy", "structura"), icon: ClipboardList },
  { id: "keywords", label: __("Keywords", "structura"), icon: Key },
  { id: "authority", label: __("Authority", "structura"), icon: Shield },
  { id: "rhythm", label: __("Rhythm", "structura"), icon: CalendarClock },
];

// ─── Tab bar (all tabs always clickable) ────────────────────────────────

const TabBar = ({
  steps,
  activeStep,
  onStepClick,
}: {
  steps: StepDef[];
  activeStep: string;
  onStepClick: (step: string) => void;
}) => (
  <nav className="flex gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
    {steps.map((step) => {
      const isActive = activeStep === step.id;
      const Icon = step.icon;
      return (
        <button
          key={step.id}
          type="button"
          onClick={() => onStepClick(step.id)}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all",
            isActive
              ? "text-brand-700 dark:text-brand-300 bg-white shadow-sm dark:bg-neutral-700"
              : "text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
          )}
        >
          <Icon size={14} />
          {step.label}
        </button>
      );
    })}
  </nav>
);

// ─── Inner component ────────────────────────────────────────────────────

const EditCampaignInner = ({ campaign }: { campaign: Campaign }) => {
  const navigate = useNavigate();
  const { formData, updateForm } = useCampaignForm();
  const { updateCampaign, isUpdating } = useCampaignMutations();

  const hasAuthorityRule = formData.intelligence.seoRules?.outbound_link_authority === true;

  const keywordsRef = useRef<KeywordDiscoveryHandle>(null);
  const authorityRef = useRef<AuthorityDiscoveryHandle>(null);

  const [activeStep, setActiveStep] = useState("strategy");
  const [keywordsPhase, setKeywordsPhase] = useState<string>("idle");
  const [authorityPhase, setAuthorityPhase] = useState<string>("idle");

  // Build step list dynamically (show authority only if rule is on)
  const steps = ALL_STEPS.filter((s) => s.id !== "authority" || hasAuthorityRule);

  const goToStep = useCallback((step: string) => {
    setActiveStep(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Discovery helpers
  const isKeywordsComplete = keywordsPhase === "complete";
  const isAuthorityComplete = authorityPhase === "complete";

  // ── Save handler ──────────────────────────────────────────────────────

  const handleSave = async () => {
    // Merge imperative data from discovery components
    if (keywordsRef.current) {
      const bank = keywordsRef.current.getKeywords();
      updateForm("keywords", {
        bank,
        discoveredAt: bank.length > 0 ? new Date().toISOString() : null,
      });
    }
    if (authorityRef.current) {
      const domains = authorityRef.current.getDomains();
      updateForm("authority", {
        domains,
        discoveredAt: domains.length > 0 ? new Date().toISOString() : null,
      });
    }

    await new Promise((r) => setTimeout(r, 50));

    try {
      await updateCampaign({ id: campaign.id, data: formData });
      navigate(`/campaigns/${campaign.id}`);
    } catch {
      // Error handled by mutation (toast)
    }
  };

  return (
    <PageContainer variant="narrow" className="space-y-6 pb-24">
      {/* Page header */}
      <header className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate(`/campaigns/${campaign.id}`)}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:border-neutral-600 dark:hover:text-neutral-300"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <div className="flex items-baseline gap-3">
            <PageTitle>{campaign.identity.name}</PageTitle>
            <Badge variant="solid" intent={getBadgeIntentByCampaignStatus(campaign.status)}>
              {campaignStatusLabel(campaign.status)}
            </Badge>
          </div>
          <PageDescription>{__("Edit campaign configuration", "structura")}</PageDescription>
        </div>
      </header>

      {/* Page-builder compatibility heads-up. Silent on sites
          where Builder_Detector reports nothing. Placed above the
          tab bar so it's visible whichever step the editor is on.
          Spec: specs/page-builder-compat.md §4.2. */}
      <PageBuilderCompatCard />

      {/* Tab bar */}
      <TabBar steps={steps} activeStep={activeStep} onStepClick={goToStep} />

      {/* Content card */}
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-sm sm:p-8 dark:border-neutral-800 dark:bg-neutral-900">
        {/* ── Strategy ──────────────────────────────────────────── */}
        {activeStep === "strategy" && <StrategyEditSection />}

        {/* ── Keywords ──────────────────────────────────────────── */}
        {activeStep === "keywords" && (
          <div className="space-y-6">
            <StepKeywords
              ref={keywordsRef}
              topic={formData.identity.objective}
              campaignName={formData.identity.name}
              language={formData.intelligence.language}
              provider={formData.intelligence.textProvider}
              existingKeywords={formData.keywords?.bank}
              onKeywordsChange={() => {}}
              onPhaseChange={setKeywordsPhase}
            />
            {isKeywordsComplete && (
              <div className="flex items-center justify-end gap-3 border-t border-neutral-100 pt-5 dark:border-neutral-800">
                <Button variant="transparent" size="sm" onClick={() => setKeywordsPhase("idle")}>
                  <RefreshCw size={14} className="mr-1.5" />
                  {__("Re-discover", "structura")}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Authority ─────────────────────────────────────────── */}
        {activeStep === "authority" && (
          <div className="space-y-6">
            <AuthorityDiscovery
              ref={authorityRef}
              topic={formData.identity.objective}
              campaignName={formData.identity.name}
              language={formData.intelligence.language}
              provider={formData.intelligence.textProvider}
              existingDomains={formData.authority?.domains}
              onDomainsChange={() => {}}
              onPhaseChange={setAuthorityPhase}
            />
            {isAuthorityComplete && (
              <div className="flex items-center justify-end gap-3 border-t border-neutral-100 pt-5 dark:border-neutral-800">
                <Button variant="transparent" size="sm" onClick={() => setAuthorityPhase("idle")}>
                  <RefreshCw size={14} className="mr-1.5" />
                  {__("Re-discover", "structura")}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Rhythm ────────────────────────────────────────────── */}
        {activeStep === "rhythm" && <SimpleStepRhythm />}
      </div>

      {/* ── Save bar (sticky) ─────────────────────────────────── */}
      <div className="sticky bottom-0 z-20 flex items-center justify-end gap-3 rounded-2xl border border-neutral-200/60 bg-white/80 px-6 py-4 shadow-lg backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/80">
        <Button variant="secondary" size="sm" onClick={() => navigate(`/campaigns/${campaign.id}`)}>
          {__("Cancel", "structura")}
        </Button>
        <Button
          onClick={handleSave}
          loading={isUpdating}
          disabled={formData.identity.name.length < 3 || formData.identity.objective.length < 20}
        >
          <Save size={14} className="mr-1.5" />
          {__("Save Changes", "structura")}
        </Button>
      </div>
    </PageContainer>
  );
};

// ─── Strategy Edit Section ──────────────────────────────────────────────

const StrategyEditSection = () => {
  const { formData, updateForm } = useCampaignForm();

  return (
    <div className="space-y-5">
      {/* Campaign name */}
      <InputField
        label={__("Campaign Name", "structura")}
        value={formData.identity.name}
        onChange={(e) => updateForm("identity", { name: e.target.value })}
        placeholder={__("e.g. Winter 2026 SEO Push", "structura")}
      />

      {/* Campaign objective */}
      <TextArea
        label={__("Campaign Objective", "structura")}
        value={formData.identity.objective}
        onChange={(e) => updateForm("identity", { objective: e.target.value })}
        rows={5}
        placeholder={__("Your campaign strategy…", "structura")}
      />

      {/* Campaign mode */}
      <div>
        <label className="mb-2 block text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
          {__("Campaign Mode", "structura")}
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CAMPAIGN_MODES.map((mode) => {
            const isSelected = formData.identity.campaignMode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => updateForm("identity", { campaignMode: mode.value })}
                className={cn(
                  "cursor-pointer rounded-xl border px-3 py-3 text-left transition-all",
                  isSelected
                    ? "border-brand-300 bg-brand-50 dark:border-brand-700 dark:bg-brand-950/40 shadow-sm"
                    : "hover:border-brand-200 dark:hover:border-brand-800 border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800"
                )}
              >
                <span
                  className={cn(
                    "block text-xs font-bold",
                    isSelected
                      ? "text-brand-700 dark:text-brand-300"
                      : "text-neutral-700 dark:text-neutral-300"
                  )}
                >
                  {mode.label}
                </span>
                <span className="mt-0.5 block text-[10px] text-neutral-400 dark:text-neutral-500">
                  {mode.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Core content settings — pulled out of Advanced so the knobs authors
          reach for on every campaign aren't one click away. */}
      <CoreContentSettings />

      {/* Advanced Settings */}
      <EditAdvancedSettings />
    </div>
  );
};

// ─── Compact toggle (reused from CreateCampaignPage pattern) ────────────

const CompactToggle = ({
  label,
  description,
  isEnabled,
  onToggle,
  isDisabled,
  badge,
}: {
  label: string;
  description?: string;
  isEnabled: boolean;
  onToggle: () => void;
  isDisabled?: boolean;
  badge?: React.ReactNode;
}) => (
  <div
    className={cn(
      "flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors",
      isDisabled ? "opacity-50" : "hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
    )}
  >
    <div className="flex min-w-0 items-center gap-1.5">
      <span
        className={cn(
          "truncate text-xs font-medium",
          isEnabled && !isDisabled
            ? "text-neutral-900 dark:text-white"
            : "text-neutral-600 dark:text-neutral-400"
        )}
      >
        {label}
      </span>
      {description && (
        <Tooltip title={description} position="top">
          <span className="shrink-0 cursor-help text-neutral-300 dark:text-neutral-600">
            <HelpCircle size={12} />
          </span>
        </Tooltip>
      )}
      {badge}
    </div>
    <Switch
      label={label}
      hiddenLabel
      checked={isEnabled}
      onChange={() => !isDisabled && onToggle()}
      disabled={isDisabled}
    />
  </div>
);

// ─── Collapsible settings group ─────────────────────────────────────────

const SettingsGroup = ({
  icon,
  label,
  count,
  children,
  defaultOpen = false,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={cn(
        "rounded-lg border transition-colors duration-200",
        open
          ? "border-brand-200 bg-brand-50/30 dark:border-brand-900/40 dark:bg-brand-950/20 shadow-sm"
          : "border-neutral-200/70 hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800 dark:hover:border-neutral-700"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between px-3 py-2.5 transition-colors",
          open ? "rounded-t-lg" : "rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
        )}
      >
        <span className="flex items-center gap-2">
          {icon}
          <span
            className={cn(
              "text-[10px] font-black tracking-widest uppercase transition-colors",
              open ? "text-brand-600 dark:text-brand-400" : "text-neutral-500 dark:text-neutral-400"
            )}
          >
            {label}
          </span>
          {typeof count === "number" && (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums transition-colors",
                open
                  ? "bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400"
                  : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
              )}
            >
              {count}
            </span>
          )}
        </span>
        <ChevronDown
          size={12}
          className={cn(
            "transition-transform duration-200",
            open ? "text-brand-500 dark:text-brand-400 rotate-180" : "text-neutral-400"
          )}
        />
      </button>
      {open && <div className="px-1 pt-1 pb-2">{children}</div>}
    </div>
  );
};

// ─── Tier badges ────────────────────────────────────────────────────────

const ProBadge = () => (
  <span className="bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase">
    {__("Pro", "structura")}
  </span>
);
const FreeBadge = () => (
  <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-black text-emerald-600 uppercase dark:bg-emerald-950/30 dark:text-emerald-400">
    {__("Free", "structura")}
  </span>
);
const RequiredBadge = () => (
  <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[8px] font-black text-neutral-500 uppercase dark:bg-neutral-800 dark:text-neutral-400">
    {__("Required", "structura")}
  </span>
);

// ─── Advanced Settings (edit variant) ───────────────────────────────────

const EditAdvancedSettings = () => {
  const { formData, updateForm } = useCampaignForm();
  const { isPaidLicense, isLicensed } = useLicense();
  const { availableProviders, availableImageProviders, isCloud } = useDefaultProviders();
  const { rules, isLoading: loadingSeoRules } = useSeoRules();

  const [open, setOpen] = useState(false);

  const { intelligence, structure, taxonomy } = formData;

  // Taxonomy (lazy-fetched)
  const [availableCats, setAvailableCats] = useState<any[]>([]);
  const [availableTags, setAvailableTags] = useState<any[]>([]);
  const [loadingTax, setLoadingTax] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (availableCats.length > 0 || availableTags.length > 0 || loadingTax) return;

    const run = async () => {
      setLoadingTax(true);
      try {
        const [cats, tg] = await Promise.all([
          apiFetch<any[]>({ path: "/wp/v2/categories?per_page=100" }),
          apiFetch<any[]>({ path: "/wp/v2/tags?per_page=100" }),
        ]);
        setAvailableCats(cats);
        setAvailableTags(tg);
      } catch {
        /* taxonomy is optional */
      } finally {
        setLoadingTax(false);
      }
    };
    run();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleBlock = (blockName: SUPPORTED_BLOCK_TYPE) => {
    const cur = structure.enabledBlocks || [];
    const next = cur.includes(blockName) ? cur.filter((b) => b !== blockName) : [...cur, blockName];
    updateForm("structure", {
      enabledBlocks: next as SUPPORTED_BLOCK_TYPE[],
    });
  };

  const toggleRule = (name: SeoRuleName) => {
    updateForm("intelligence", {
      seoRules: {
        ...intelligence.seoRules,
        [name]: !intelligence.seoRules[name as SeoRuleName],
      },
    });
  };

  const enabledSeoCount = rules
    ? Object.keys(rules).filter((k) => intelligence.seoRules[k as SeoRuleName]).length
    : 0;
  const enabledBlockCount = structure.enabledBlocks.length;

  return (
    <div className="rounded-xl border border-neutral-200/60 dark:border-neutral-700/60">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between px-4 py-3 transition-colors",
          open
            ? "rounded-t-xl border-b border-neutral-100 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-800/30"
            : "rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-800/30"
        )}
      >
        <span className="flex items-center gap-2 text-xs font-bold text-neutral-600 dark:text-neutral-300">
          <Settings2 size={14} className="text-neutral-400 dark:text-neutral-500" />
          {__("Advanced Settings", "structura")}
        </span>
        <ChevronDown
          size={14}
          className={cn("text-neutral-400 transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="space-y-4 p-4">
          {/* Language/Post Length/Persona/Post Status moved out of Advanced —
              see CoreContentSettings rendered just above this component. */}

          {/* AI Engine — pre-generation toggle + provider/model/fallback
              pickers, all in a single compact block. See
              CampaignAiEngineSection.tsx for the layout rationale. */}
          {availableProviders.length > 0 && (
            <SettingsGroup
              icon={<Bot size={13} className="text-brand-500" />}
              label={__("AI Engine", "structura")}
            >
              <div className="px-2 py-2">
                <CampaignAiEngineSection
                  availableTextProviders={availableProviders as AIProvider[]}
                  availableImageProviders={availableImageProviders as AIProvider[]}
                />
              </div>
            </SettingsGroup>
          )}

          {/* Improvements */}
          <SettingsGroup
            icon={<Rocket size={13} className="text-rose-500" />}
            label={__("Improvements", "structura")}
          >
            <CompactToggle
              label={__("Replace long AI-like dashes", "structura")}
              description={__(
                "Normalize AI dashes (like—this) to standard format (like - this).",
                "structura"
              )}
              isEnabled={intelligence.replaceLongDashes}
              onToggle={() =>
                updateForm("intelligence", {
                  replaceLongDashes: !intelligence.replaceLongDashes,
                })
              }
            />
            <CompactToggle
              label={__("Disable emojis", "structura")}
              description={__(
                "Remove emojis from AI-generated content for a cleaner output.",
                "structura"
              )}
              isEnabled={intelligence.disableEmojis}
              onToggle={() =>
                updateForm("intelligence", {
                  disableEmojis: !intelligence.disableEmojis,
                })
              }
            />
          </SettingsGroup>

          {/* Images */}
          <SettingsGroup
            icon={<ImageIcon size={13} className="text-emerald-500" />}
            label={__("Images", "structura")}
          >
            <CompactToggle
              label={__("Generate featured image", "structura")}
              description={__("Create a relevant featured image for each post.", "structura")}
              isEnabled={structure.featuredImage}
              onToggle={() =>
                updateForm("structure", {
                  featuredImage: !structure.featuredImage,
                })
              }
              isDisabled={!isLicensed}
              badge={!isLicensed ? <FreeBadge /> : undefined}
            />
            <CompactToggle
              label={__("Body image generation", "structura")}
              description={__("Identify spots and generate images in the post body.", "structura")}
              isEnabled={structure.bodyImages}
              onToggle={() =>
                updateForm("structure", {
                  bodyImages: !structure.bodyImages,
                })
              }
              isDisabled={!isPaidLicense}
              badge={!isPaidLicense ? <ProBadge /> : undefined}
            />
            {/* Non-blocking heads-up when images are on but no visual
                style is bound — the cloud falls back to a generic look. */}
            <VisualStyleFallbackNotice
              imagesEnabled={structure.featuredImage || structure.bodyImages}
            />
          </SettingsGroup>

          {/* Content Blocks */}
          <SettingsGroup
            icon={<Layout size={13} className="text-purple-500" />}
            label={__("Content Blocks", "structura")}
            count={enabledBlockCount}
          >
            {CONTENT_BLOCKS.map((block) => {
              const isProLocked = block.isPro && !isPaidLicense;
              const isFreeLocked = block.name === "core/heading" && !isLicensed;
              return (
                <CompactToggle
                  key={block.name}
                  label={block.label}
                  description={block.description}
                  isEnabled={
                    block.isRequired ||
                    structure.enabledBlocks.includes(block.name as SUPPORTED_BLOCK_TYPE)
                  }
                  onToggle={() => toggleBlock(block.name as SUPPORTED_BLOCK_TYPE)}
                  isDisabled={block.isRequired || isProLocked || isFreeLocked}
                  badge={
                    block.isRequired ? (
                      <RequiredBadge />
                    ) : isProLocked ? (
                      <ProBadge />
                    ) : isFreeLocked ? (
                      <FreeBadge />
                    ) : undefined
                  }
                />
              );
            })}
          </SettingsGroup>

          {/* SEO Rules */}
          <SettingsGroup
            icon={<Sparkles size={13} className="text-amber-500" />}
            label={__("SEO Directives", "structura")}
            count={enabledSeoCount}
          >
            {loadingSeoRules ? (
              <div className="flex h-8 items-center justify-center">
                <Loader2 className="size-3 animate-spin text-neutral-400" />
              </div>
            ) : rules ? (
              Object.entries(rules).map(([name, rule]) => {
                const isProLocked = ["byok", "cloud"].includes(rule.plan) && !isPaidLicense;
                const isFreeLocked = rule.plan === "free" && !isLicensed;
                return (
                  <CompactToggle
                    key={name}
                    label={rule.label}
                    description={rule.description}
                    isEnabled={intelligence.seoRules[name as SeoRuleName]}
                    onToggle={() => toggleRule(name as SeoRuleName)}
                    isDisabled={isProLocked || isFreeLocked}
                    badge={isProLocked ? <ProBadge /> : isFreeLocked ? <FreeBadge /> : undefined}
                  />
                );
              })
            ) : null}
          </SettingsGroup>

          {/* Taxonomy */}
          <SettingsGroup
            icon={<FolderOpen size={13} className="text-brand-500" />}
            label={__("Taxonomy", "structura")}
          >
            {loadingTax ? (
              <div className="flex h-8 items-center justify-center">
                <Loader2 className="size-3 animate-spin text-neutral-400" />
              </div>
            ) : (
              <div className="space-y-3 px-2 py-2">
                <TaxonomySection
                  title={__("Categories", "structura")}
                  icon={<FolderOpen size={14} />}
                  mode={taxonomy.categories.mode}
                  setMode={(val) =>
                    updateForm("taxonomy", {
                      categories: {
                        ...taxonomy.categories,
                        mode: val,
                      },
                    })
                  }
                  items={availableCats}
                  selected={taxonomy.categories.list}
                  setSelected={(val) =>
                    updateForm("taxonomy", {
                      categories: {
                        ...taxonomy.categories,
                        list: val,
                      },
                    })
                  }
                />
                <TaxonomySection
                  title={__("Tags", "structura")}
                  icon={<Tag size={14} />}
                  mode={taxonomy.tags.mode}
                  setMode={(val) =>
                    updateForm("taxonomy", {
                      tags: { ...taxonomy.tags, mode: val },
                    })
                  }
                  items={availableTags}
                  selected={taxonomy.tags.list}
                  setSelected={(val) =>
                    updateForm("taxonomy", {
                      tags: { ...taxonomy.tags, list: val },
                    })
                  }
                />
              </div>
            )}
          </SettingsGroup>

          {/* Disclosure */}
          <div className="flex items-center justify-between rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <Scale size={13} className="text-emerald-500" />
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                {__("AI Transparency Signal", "structura")}
              </span>
              <Tooltip
                title={__(
                  "Append a disclosure notice to AI-generated content for transparency.",
                  "structura"
                )}
                position="top"
              >
                <span className="cursor-help text-neutral-300 dark:text-neutral-600">
                  <HelpCircle size={12} />
                </span>
              </Tooltip>
            </div>
            <Switch
              label={__("Disclosure", "structura")}
              hiddenLabel
              checked={structure.disclosure.enabled}
              onChange={(checked) =>
                updateForm("structure", {
                  disclosure: {
                    ...structure.disclosure,
                    enabled: checked,
                  },
                })
              }
            />
          </div>
          {structure.disclosure.enabled && (
            <div className="px-3">
              <TextArea
                label={__("Disclosure Notice", "structura")}
                value={structure.disclosure.text}
                onChange={(e) =>
                  updateForm("structure", {
                    disclosure: {
                      ...structure.disclosure,
                      text: e.target.value,
                    },
                  })
                }
                rows={2}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
