import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { __ } from "@wordpress/i18n";
import { ArrowLeft, ArrowRight, Crown, Image, Layout, Lock, Sparkles, Zap } from "lucide-react";
import { Badge, Button, cn, InputField, Select, Switch, TextArea } from "@structura/ui";
import { PageTitle } from "@/components/Layout/PageTitle";
import { PageDescription } from "@/components/Layout/PageSubtitle";
import { DefaultPersonaAdvisory } from "@/components/Shared/DefaultPersonaAdvisory";
import { NoPersonasBlocker } from "@/components/Shared/NoPersonasBlocker";
import { ProviderToggle } from "@/features/campaigns/components/ProviderToggle";
import { useCampaignMutations } from "@/features/campaigns/api/useCampaignMutations";
import { SeoTargetingSection } from "@/features/campaigns/components/SeoTargetingSection";
import { MagicSuggestButton } from "@/features/campaigns/components/MagicSuggestButton";
import { useMagicSuggest } from "@/hooks/useMagicSuggest";
import type { AIProvider } from "@/features/campaigns/types";
import { usePersonasQuery } from "@/features/personas";
import { useAiConnections, useDefaultProviders, useLicense } from "@/features/settings";
import { VisualStyleFallbackNotice } from "@/features/campaigns/components/VisualStyleFallbackNotice";
import {
  buildMarketingPricingUrl,
  buildPortalSignupUrl,
} from "@/utils/portalLinks";
import type { SUPPORTED_BLOCK_TYPE } from "@/features/settings/types";
import { useAiSettingsQuery } from "@/features/ai-engine";
import { CONTENT_BLOCKS } from "@/features/settings/constants";
import { getCampaignFormDataForLicense } from "@/features/campaigns/helpers";
import { getCampaignModeMeta } from "@/utils/campaignModeMeta";
import type {
  CampaignFormData,
  CampaignMode,
  CampaignPostStatus,
} from "@/features/campaigns/types";
import { isManagedPlan, type PlanId } from "@structura/types";

const POST_STATUS_OPTIONS: Array<{ value: CampaignPostStatus; label: string }> = [
  { value: "publish", label: __("Publish immediately", "structura") },
  { value: "draft", label: __("Save as draft", "structura") },
  // "Pending review" was removed 2026-07-09 — WP treated it as a draft.
];

// ─── Campaign mode selector ──────────────────────────────────────────

const MODES: CampaignMode[] = ["traffic_magnet", "quick_wins", "conversion", "authority"];

const MODE_DESCRIPTIONS: Record<CampaignMode, string> = {
  traffic_magnet: __("Maximize organic traffic with high-volume topics", "structura"),
  quick_wins: __("Target low-competition keywords for fast rankings", "structura"),
  conversion: __("Content designed to convert readers to customers", "structura"),
  authority: __("Build topical authority with comprehensive coverage", "structura"),
};

const ModeSelector = ({
  value,
  onChange,
}: {
  value: CampaignMode;
  onChange: (mode: CampaignMode) => void;
}) => (
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    {MODES.map((mode) => {
      const meta = getCampaignModeMeta(mode);
      const isActive = value === mode;
      return (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-center transition-all",
            isActive
              ? "border-brand-500 bg-brand-50/50 dark:border-brand-400 dark:bg-brand-950/20 shadow-sm"
              : "border-transparent bg-neutral-50 hover:border-neutral-200 hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:border-neutral-600 dark:hover:bg-neutral-700"
          )}
        >
          <span
            className={cn(
              "text-xs font-bold",
              isActive
                ? "text-brand-600 dark:text-brand-400"
                : "text-neutral-600 dark:text-neutral-400"
            )}
          >
            {meta.label}
          </span>
          <span className="text-[10px] leading-snug text-neutral-400 dark:text-neutral-500">
            {MODE_DESCRIPTIONS[mode]}
          </span>
        </button>
      );
    })}
  </div>
);

// ─── Section wrapper ─────────────────────────────────────────────────

const Section = ({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "space-y-4 rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm sm:p-6 dark:border-neutral-800 dark:bg-neutral-900",
      className
    )}
  >
    <h3 className="mt-0! mb-2! text-xs font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
      {title}
    </h3>
    {children}
  </div>
);

// ─── Locked feature row ──────────────────────────────────────────────

const LockedFeature = ({ label, tier = "Pro" }: { label: string; tier?: string }) => (
  <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-800/50">
    <div className="flex items-center gap-2">
      <Lock size={12} className="text-neutral-300 dark:text-neutral-600" />
      <span className="text-xs text-neutral-400 dark:text-neutral-500">{label}</span>
    </div>
    <Badge variant="outline" intent="premium" className="text-[9px]">
      {tier}
    </Badge>
  </div>
);

// ─── Page ────────────────────────────────────────────────────────────

const GeneratePostPage = () => {
  const navigate = useNavigate();
  const { isLicensed, isPaidLicense, plan } = useLicense();
  // When wp-content/uploads isn't writable, generated images can never
  // save (sideload fails). Rather than let the user turn images on only
  // to have them silently never appear, disable the toggles and explain
  // why — same probe the cross-wp-admin banner
  // (Image_Uploads_Unwritable_Notice) and Site Health use. Optional flag:
  // false on plugin builds predating it.
  const uploadsUnwritable = !!window.structuraConfig?.uploads_unwritable;
  const { activeProviders } = useAiConnections();
  const { data: aiSettings } = useAiSettingsQuery();
  const { defaultTextProvider, defaultImageProvider } = useDefaultProviders();
  const { data: personas = [], isLoading: loadingPersonas } = usePersonasQuery();
  const { generatePost, isGenerating } = useCampaignMutations();
  const { suggest, isSuggesting } = useMagicSuggest();

  // AI "Generate post strategy" — same cloud suggestion the campaign objective
  // step uses (mode "campaign"): the cloud auto-detects the site's homepage +
  // key landing pages and drafts a focused objective + content goal. Fills the
  // topic textarea so the user can edit instead of starting from a blank box.
  const generateStrategy = async (provider: AIProvider) => {
    const data = await suggest("campaign", { provider, context: [] });
    if (data?.strategy) {
      update("identity", {
        objective: data.strategy as string,
        ...(data.campaign_mode && MODES.includes(data.campaign_mode as CampaignMode)
          ? { campaignMode: data.campaign_mode as CampaignMode }
          : {}),
      });
    }
  };

  const isManagedAiPlan = isManagedPlan(plan as PlanId);
  // Agency users get a per-post model picker even though they're on a
  // managed plan — that's the headline differentiator vs Cloud (see
  // marketing/PRICING-PAGE-COPY-V2.md "Swap to Claude Sonnet or Imagen 4
  // Ultra per post"). Cloud stays fully managed: defaults only.
  const showPerPostModelPicker = !isManagedAiPlan || plan === "cloud_pro";

  // Initialize form with license-aware defaults
  const [formData, setFormData] = useState<CampaignFormData>(() =>
    getCampaignFormDataForLicense({ isPaidLicense, isLicensed })
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Snap providers to the resolved defaults once useAiSettingsQuery
  // hydrates. Without this, the form keeps the static "gemini" fallback
  // baked into DEFAULT_CAMPAIGN_FORM_DATA, and ProviderToggle's auto-fill
  // effect picks Gemini's default models (Gemini 3.1 Pro / Flash Image)
  // even when the only connected provider is OpenAI. Mirrors the seeding
  // the wizard's CampaignProvider already does (CampaignContext.tsx).
  // Models are cleared so the auto-fill re-runs against the new provider.
  const hasSyncedProviders = useRef(false);
  useEffect(() => {
    if (hasSyncedProviders.current) return;
    if (!aiSettings) return;
    hasSyncedProviders.current = true;
    setFormData((prev) => ({
      ...prev,
      intelligence: {
        ...prev.intelligence,
        textProvider: defaultTextProvider,
        imageProvider: defaultImageProvider,
        textModel: "",
        imageModel: "",
      },
    }));
  }, [aiSettings, defaultTextProvider, defaultImageProvider]);

  // Auto-pin the only persona (2026-07-08). "Random persona" is
  // meaningless with a single persona on file, and the dropdown below
  // omits the "random" option entirely in that case — so leaving
  // `personaId` on its default "random" would render the Select with no
  // matching option (a blank trigger). Pin the one persona instead.
  const hasPinnedSinglePersona = useRef(false);
  useEffect(() => {
    if (hasPinnedSinglePersona.current) return;
    if (loadingPersonas) return;
    if (personas.length !== 1) return;
    hasPinnedSinglePersona.current = true;
    setFormData((prev) =>
      prev.intelligence.personaId === "random"
        ? {
            ...prev,
            intelligence: {
              ...prev.intelligence,
              personaId: String(personas[0].id),
            },
          }
        : prev,
    );
  }, [loadingPersonas, personas]);

  // Helpers
  const update = <K extends keyof CampaignFormData>(
    cluster: K,
    partial: Partial<CampaignFormData[K]>
  ) =>
    setFormData((prev) => ({
      ...prev,
      [cluster]: { ...prev[cluster], ...partial },
    }));

  // Top-level cluster patch — the SEO Targeting section replaces whole
  // clusters (identity/authority/competitors) rather than merging field-wise.
  const patch = (p: Partial<CampaignFormData>) =>
    setFormData((prev) => ({ ...prev, ...p }));

  const updateSeoRule = (key: string, value: boolean) =>
    update("intelligence", {
      seoRules: { ...formData.intelligence.seoRules, [key]: value },
    } as Partial<CampaignFormData["intelligence"]>);

  const isValid = formData.identity.objective.length >= 20;
  const hasApiKey = activeProviders.length > 0;
  // Persona hard-block (2026-05-25). Every post is attributed to a
  // persona — a pinned id or the "random" rotation — so a zero-persona
  // workspace would degrade to a generic voice and silently defeat the
  // feature. Fresh workspaces are auto-seeded with a "House voice"
  // persona, so this is normally unreachable (a failed seed or a deleted
  // last persona land here); when it happens we block submission and
  // surface `NoPersonasBlocker` with a "create a persona" CTA. The
  // cloud/plugin refuse the request in this state too — this is the UX
  // half of that contract. Hidden while the persona list is loading so
  // the button doesn't flicker disabled→enabled on first paint.
  const hasNoPersonas = !loadingPersonas && personas.length === 0;
  //
  // Match `CampaignsPage` and `DashboardPage`: managed-AI plans always
  // ready, every other tier needs a connected provider. The previous
  // `!isPaidLicense` short-circuit let None / Free hit Generate with
  // zero providers and watch the cloud reject the handover as
  // Unauthorized, filling System Logs with errors.
  const isEngineReady = isManagedAiPlan || hasApiKey;

  // Whether the form requests any AI image. Drives the non-blocking
  // "no visual style set" nudge below.
  //
  // History: this used to be a hard pre-flight gate — the cloud threw
  // `ERROR_VISUAL_PRESET_UNBOUND` when no preset was bound, so we blocked
  // submit to avoid burning ~4 minutes of text gen before the failure
  // (cms.xerx.io 2026-05-22). As of 2026-07-09 the cloud instead falls
  // back to a generic house style (`resolveInlineImageStyle`), so a
  // missing preset no longer blocks — a site upgraded from "none" (which
  // skipped the Visuals wizard step) can still generate images. The
  // `VisualStyleFallbackNotice` below just makes the user aware.
  const wantsAnyImage =
    formData.structure.featuredImage || formData.structure.bodyImages;

  const handleGenerate = async () => {
    if (!isValid || !isEngineReady || hasNoPersonas) return;
    try {
      // The mutation returns the run_id the plugin minted upfront.
      // Navigate to the run-detail surface in-place so the user sees
      // status / timeline / final receipt instead of a toast +
      // disappearing form (the pre-2026-05-01 UX, where users had no
      // idea whether their submission was queued, dispatched, failed,
      // or done).
      const result = await generatePost({ data: formData });
      const runId = (result as { run_id?: string })?.run_id;
      if (runId) {
        navigate(`/generate/runs/${runId}`);
      } else {
        // Plugin response missing run_id — older plugin build that
        // hasn't been redeployed yet. Fall back to the dashboard so
        // the user at least lands somewhere.
        navigate("/");
      }
    } catch {
      // Error toast handled by mutation
    }
  };

  // Persona options
  //
  // 2026-05-01 — cloud personas use nanoid string ids
  // (e.g. "4r9TBGo0Pj_RDioJQGyib"); legacy WP personas use numeric ids.
  // We `String(p.id)` here for a uniform option-value shape that round-
  // trips through the `<Select>` regardless of source. Pre-this-fix the
  // handler `Number()`-d the value back, which produced `NaN` for
  // nanoids and silently dropped the selection (the Persona trigger
  // showed its placeholder after every click).
  // "Random persona" only makes sense with 2+ personas to rotate
  // between; with a single persona it's noise (and that persona is
  // auto-pinned above), so omit it.
  const personaOptions = [
    ...(personas.length > 1
      ? [{ value: "random", label: __("Random persona", "structura") }]
      : []),
    ...personas.map((p) => ({ value: String(p.id), label: p.name })),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mt-1.5 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:border-neutral-600 dark:hover:text-neutral-300"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <PageTitle>{__("Generate a Post", "structura")}</PageTitle>
            <PageDescription>
              {__("Create a single post right now using AI.", "structura")}
            </PageDescription>
          </div>
        </div>
      </header>

      {/* ── Persona notices ──────────────────────────────────── */}
      {/* Mutually exclusive by persona count: the blocker renders at 0
          (submit is also disabled), the advisory at exactly 1. */}
      <NoPersonasBlocker />
      <DefaultPersonaAdvisory />

      {/* ── Engine not ready warning ─────────────────────────── */}
      {!isEngineReady && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="m-0! text-sm font-semibold text-amber-800 dark:text-amber-200">
            {__("Connect an AI provider in the AI Engine settings first.", "structura")}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => navigate("/ai-engine")}
          >
            {__("Connect AI Provider", "structura")}
            <ArrowRight size={14} className="ml-1.5" />
          </Button>
        </div>
      )}

      {/* ── No visual style set — non-blocking heads-up ──────── */}
      <VisualStyleFallbackNotice imagesEnabled={wantsAnyImage} />

      {/* ── 1. What to write about ───────────────────────────── */}
      <Section title={__("What should we write about?", "structura")}>
        <MagicSuggestButton
          isLoading={isSuggesting}
          onTrigger={generateStrategy}
          ctaLabel={__("Generate post strategy", "structura")}
          subLabel={__(
            "We'll study your site and draft a focused objective.",
            "structura",
          )}
          className="mb-4"
        />
        <TextArea
          label={__("Describe your post topic or objective", "structura")}
          hiddenLabel
          placeholder={__(
            "e.g. Write an in-depth guide on React server components for mid-level developers, covering streaming, suspense boundaries, and real-world migration patterns...",
            "structura"
          )}
          value={formData.identity.objective}
          onChange={(e) => update("identity", { objective: e.target.value })}
          rows={4}
        />
        {formData.identity.objective.length > 0 && formData.identity.objective.length < 20 && (
          <p className="m-0! text-xs text-amber-500">
            {__("Please describe your topic in at least 20 characters.", "structura")}
          </p>
        )}

        {/* Campaign mode */}
        <div className="space-y-2">
          <label className="mb-2 block text-xs font-bold text-neutral-500 dark:text-neutral-400">
            {__("Writing approach", "structura")}
          </label>
          <ModeSelector
            value={formData.identity.campaignMode ?? "traffic_magnet"}
            onChange={(mode) => update("identity", { campaignMode: mode })}
          />
        </div>
      </Section>

      {/* ── 1.5 SEO Targeting ────────────────────────────────── */}
      <Section title={__("SEO Targeting", "structura")}>
        <SeoTargetingSection
          formData={formData}
          onChange={patch}
          isPaidLicense={!!isPaidLicense}
          isLicensed={!!isLicensed}
          plan={plan}
        />
      </Section>

      {/* ── 2. AI & Persona ──────────────────────────────────── */}
      <Section title={__("AI & Persona", "structura")}>
        <ProviderToggle
          textProvider={formData.intelligence.textProvider}
          imageProvider={formData.intelligence.imageProvider}
          onTextProviderChange={(p) =>
            update("intelligence", { textProvider: p, textModel: "" })
          }
          onImageProviderChange={(p) =>
            update("intelligence", { imageProvider: p, imageModel: "" })
          }
          availableTextProviders={isManagedAiPlan ? ["gemini", "openai", "anthropic"] : activeProviders}
          availableImageProviders={isManagedAiPlan ? ["gemini", "openai"] : activeProviders}
          showModelSelectors={showPerPostModelPicker}
          textModel={formData.intelligence.textModel}
          imageModel={formData.intelligence.imageModel}
          onTextModelChange={(m) => update("intelligence", { textModel: m })}
          onImageModelChange={(m) => update("intelligence", { imageModel: m })}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Persona */}
          <Select
            options={personaOptions}
            value={
              formData.intelligence.personaId === "random"
                ? "random"
                : String(formData.intelligence.personaId)
            }
            onValueChange={(val) =>
              update("intelligence", {
                // Keep the value as the string the option emitted —
                // `Number(val)` produces `NaN` for cloud nanoid ids
                // ("4r9TBGo…") and the round-trip silently drops the
                // selection. Numeric legacy WP ids round-trip fine
                // as strings; the cloud accepts both shapes.
                personaId: val === "random" ? "random" : String(val),
              })
            }
          >
            <Select.Label>{__("Persona", "structura")}</Select.Label>
            <Select.Trigger placeholder={__("Select persona…", "structura")} />
            <Select.Content>
              {personaOptions.map((opt) => (
                <Select.Item key={opt.value} value={opt.value.toString()}>
                  {opt.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>

          {/* Language (if they have any preference) */}
          <Select
            options={[
              { value: "default", label: __("System Default", "structura") },
              { value: "en", label: "English" },
              { value: "es", label: "Español" },
              { value: "fr", label: "Français" },
              { value: "de", label: "Deutsch" },
              { value: "it", label: "Italiano" },
              { value: "pt", label: "Português" },
              { value: "nl", label: "Nederlands" },
              { value: "ru", label: "Русский" },
              { value: "ja", label: "日本語" },
              { value: "zh", label: "中文" },
              { value: "ko", label: "한국어" },
              { value: "ar", label: "العربية" },
              { value: "hi", label: "हिन्दी" },
              { value: "uk", label: "Українська" },
            ]}
            value={formData.intelligence.language}
            onValueChange={(val) => update("intelligence", { language: val as string })}
          >
            <Select.Label>{__("Language", "structura")}</Select.Label>
            <Select.Trigger placeholder={__("Select language…", "structura")} />
            <Select.Content>
              {[
                { value: "default", label: __("System Default", "structura") },
                { value: "en", label: "English" },
                { value: "es", label: "Español" },
                { value: "fr", label: "Français" },
                { value: "de", label: "Deutsch" },
                { value: "it", label: "Italiano" },
                { value: "pt", label: "Português" },
                { value: "nl", label: "Nederlands" },
                { value: "ru", label: "Русский" },
                { value: "ja", label: "日本語" },
                { value: "zh", label: "中文" },
                { value: "ko", label: "한국어" },
                { value: "ar", label: "العربية" },
                { value: "hi", label: "हिन्दी" },
                { value: "uk", label: "Українська" },
              ].map((opt) => (
                <Select.Item key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>

          {/* Post Length */}
          {/*
            Non-paid tiers (Free + anonymous None) have a 500-word
            server-side clamp in `functions/src/ai/instruction-builder.ts`.
            Surface the ceiling in the input so the user sees the cap
            instead of typing 1700 and silently receiving ~500. Paid
            tiers pick their own length (default 2700) and we don't
            constrain the field. The explanatory help text lives in a
            full-width block below the grid — the 4-col cell is too
            narrow to render a translated sentence without wrapping
            into an unreadable shape (German "Beitragslänge" copy
            wraps into ~6 lines at lg).
          */}
          <InputField
            label={__("Post Length", "structura")}
            type="number"
            value={formData.intelligence.postLength}
            max={!isPaidLicense ? 500 : undefined}
            onChange={(e) => {
              const parsed = parseInt(e.target.value);
              const next = Number.isFinite(parsed) ? parsed : 0;
              update("intelligence", {
                // Mirror the server clamp client-side so the displayed
                // value never exceeds what the post will actually be.
                postLength: !isPaidLicense ? Math.min(next, 500) : next,
              });
            }}
            rightAdornment={
              <span className="text-[10px] font-bold text-neutral-400 uppercase">
                {__("Words", "structura")}
              </span>
            }
          />

          {/* Post Status */}
          <Select
            options={POST_STATUS_OPTIONS}
            value={formData.structure.postStatus}
            onValueChange={(val) =>
              update("structure", { postStatus: val as CampaignPostStatus })
            }
          >
            <Select.Label>{__("Post Status", "structura")}</Select.Label>
            <Select.Trigger placeholder={__("Select…", "structura")} />
            <Select.Content>
              {POST_STATUS_OPTIONS.map((opt) => (
                <Select.Item key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>

        {!isPaidLicense && (
          <p className="m-0! mt-3 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
            {__(
              "Free and anonymous installs are capped at 500 words per post. Upgrade to Pro to publish longer posts.",
              "structura"
            )}
          </p>
        )}
      </Section>

      {/* ── 3. Content options ────────────────────────────────── */}
      <Section title={__("Content Options", "structura")}>
        <div className="space-y-3">
          {/* Featured image - available for free license+ */}
          {isLicensed ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Image size={14} className="text-neutral-400" />
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {__("Featured image", "structura")}
                </span>
              </div>
              <Switch
                label={__("Featured image", "structura")}
                hiddenLabel
                disabled={uploadsUnwritable}
                checked={formData.structure.featuredImage && !uploadsUnwritable}
                onChange={(checked) => update("structure", { featuredImage: checked })}
              />
            </div>
          ) : (
            <LockedFeature
              label={__("Featured image", "structura")}
              tier={__("Free License", "structura")}
            />
          )}

          {/* Body images - Pro only */}
          {isPaidLicense ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Image size={14} className="text-neutral-400" />
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {__("Body images", "structura")}
                </span>
              </div>
              <Switch
                label={__("Body images", "structura")}
                hiddenLabel
                disabled={uploadsUnwritable}
                checked={formData.structure.bodyImages && !uploadsUnwritable}
                onChange={(checked) => update("structure", { bodyImages: checked })}
              />
            </div>
          ) : (
            <LockedFeature label={__("Body images", "structura")} />
          )}

          {/* Image generation can't work while the uploads dir is
              unwritable — explain in place so the disabled toggles above
              don't read as a bug. */}
          {uploadsUnwritable && (
            <p className="m-0! text-[11px] leading-snug text-amber-600 dark:text-amber-500">
              {__(
                "Image generation is unavailable because WordPress can't write to your uploads folder. Posts will still publish without images.",
                "structura"
              )}{" "}
              <a
                href="https://docs.structurawp.com/troubleshooting/images-not-generating"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-amber-700 dark:hover:text-amber-400"
              >
                {__("How to fix this", "structura")}
              </a>
            </p>
          )}

          {/* AI Disclosure */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-neutral-400" />
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {__("AI disclosure", "structura")}
              </span>
            </div>
            <Switch
              label={__("AI disclosure", "structura")}
              hiddenLabel
              checked={formData.structure.disclosure.enabled}
              onChange={(checked) =>
                update("structure", {
                  disclosure: { ...formData.structure.disclosure, enabled: checked },
                })
              }
            />
          </div>
          {formData.structure.disclosure.enabled && (
            <div className="pl-6">
              <TextArea
                label={__("Disclosure Notice", "structura")}
                value={formData.structure.disclosure.text}
                onChange={(e) =>
                  update("structure", {
                    disclosure: { ...formData.structure.disclosure, text: e.target.value },
                  })
                }
                rows={2}
              />
            </div>
          )}
        </div>
      </Section>

      {/* ── 3.5 Content blocks ───────────────────────────────── */}
      {/*
        Mirrors the campaign-form Content Blocks panel: Paragraph is
        always required; Heading needs a Free License; everything else
        is Pro. None tier (anonymous shadow workspace) sees every block
        with the appropriate tier badge so the upgrade path is visible.
      */}
      <Section title={__("Content Blocks", "structura")}>
        <div className="space-y-3">
          {CONTENT_BLOCKS.map((block) => {
            const blockName = block.name as SUPPORTED_BLOCK_TYPE;
            // Heading requires a Free License (any licensed install);
            // other non-required blocks are Pro-only. Required blocks
            // (paragraph) ship as a permanent on-state row.
            const isFreeLocked = block.name === "core/heading" && !isLicensed;
            const isProLocked = block.isPro && !isPaidLicense;
            const isLocked = isFreeLocked || isProLocked;

            if (block.isRequired) {
              return (
                <div
                  key={block.name}
                  className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-800/50"
                >
                  <div className="flex items-center gap-2">
                    <Layout size={12} className="text-neutral-400" />
                    <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      {block.label}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[9px]">
                    {__("Required", "structura")}
                  </Badge>
                </div>
              );
            }

            if (isLocked) {
              return (
                <LockedFeature
                  key={block.name}
                  label={block.label}
                  tier={
                    isFreeLocked
                      ? __("Free License", "structura")
                      : __("Pro", "structura")
                  }
                />
              );
            }

            const isEnabled = formData.structure.enabledBlocks.includes(blockName);
            return (
              <div key={block.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layout size={14} className="text-neutral-400" />
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {block.label}
                  </span>
                </div>
                <Switch
                  label={block.label}
                  hiddenLabel
                  checked={isEnabled}
                  onChange={(checked) => {
                    const cur = formData.structure.enabledBlocks;
                    const next = checked
                      ? [...cur.filter((b) => b !== blockName), blockName]
                      : cur.filter((b) => b !== blockName);
                    update("structure", { enabledBlocks: next });
                  }}
                />
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── 4. SEO features ──────────────────────────────────── */}
      {/*
        These toggles control *structural* choices — whether the post includes
        a FAQ section, Action Steps, statistics, a number in the title, or
        internal/outbound links. Everything else (readability, keyphrase
        optimisation, SERP competitor analysis, meta fields) is now always-on
        per license tier, handled server-side. See ALWAYS_ON_RULES_BY_TIER
        in functions/src/ai/instruction-builder.ts.
      */}
      <Section title={__("Content Features", "structura")}>
        <div className="space-y-3">
          <SeoToggle
            label={__("FAQ section", "structura")}
            checked={formData.intelligence.seoRules.include_faq_section}
            onChange={(v) => updateSeoRule("include_faq_section", v)}
            available={!!isPaidLicense}
          />
          <SeoToggle
            label={__("Action steps", "structura")}
            checked={formData.intelligence.seoRules.include_action_steps}
            onChange={(v) => updateSeoRule("include_action_steps", v)}
            available={!!isPaidLicense}
          />
          <SeoToggle
            label={__("Supporting statistics", "structura")}
            checked={formData.intelligence.seoRules.include_statistics}
            onChange={(v) => updateSeoRule("include_statistics", v)}
            available={!!isPaidLicense}
          />
          <SeoToggle
            label={__("Number in title", "structura")}
            checked={formData.intelligence.seoRules.number_in_title}
            onChange={(v) => updateSeoRule("number_in_title", v)}
            available={!!isPaidLicense}
          />
          <SeoToggle
            label={__("Internal linking", "structura")}
            checked={formData.intelligence.seoRules.internal_link_optimization}
            onChange={(v) => updateSeoRule("internal_link_optimization", v)}
            available={!!isPaidLicense}
          />
          <SeoToggle
            label={__("Authority outbound links", "structura")}
            checked={formData.intelligence.seoRules.outbound_link_authority}
            onChange={(v) => updateSeoRule("outbound_link_authority", v)}
            available={!!isPaidLicense}
          />
          <SeoToggle
            label={__("E-E-A-T writing signals", "structura")}
            checked={formData.intelligence.seoRules.eeat_signals}
            onChange={(v) => updateSeoRule("eeat_signals", v)}
            available={!!isPaidLicense}
          />
          <SeoToggle
            label={__("Entity coverage", "structura")}
            checked={formData.intelligence.seoRules.entity_coverage}
            onChange={(v) => updateSeoRule("entity_coverage", v)}
            available={!!isPaidLicense}
          />
        </div>

        {/* Reassurance note: everything SEO-critical is already on. */}
        {isPaidLicense ? (
          <p className="m-0! mt-4 text-xs leading-relaxed text-neutral-400 dark:text-neutral-500">
            {__(
              "Readability, keyphrase placement, SERP analysis, and meta fields are optimised automatically on every post.",
              "structura"
            )}
          </p>
        ) : (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800/30">
            <Crown size={16} className="text-brand-500 dark:text-brand-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="m-0! text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                {__("Unlock full SEO optimisation with Pro", "structura")}
              </p>
              <p className="m-0! mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-500">
                {__(
                  "Readability tuning, keyphrase placement, SERP-aware writing, and link validation.",
                  "structura"
                )}
              </p>
            </div>
            <Button asChild variant="secondary" size="sm">
              <a
                href={buildMarketingPricingUrl({
                  intent: "general_upgrade",
                  domain:
                    typeof window !== "undefined"
                      ? window.location.hostname
                      : undefined,
                  plan,
                })}
                target="_blank"
                rel="noreferrer"
              >
                {__("Upgrade", "structura")}
                <ArrowRight size={12} className="ml-1" />
              </a>
            </Button>
          </div>
        )}
      </Section>

      {/* ── Campaign upgrade teaser (for none plan) ───────────── */}
      {!isLicensed && (
        <div className="border-brand-200 dark:border-brand-900/30 rounded-2xl border border-dashed bg-white px-6 py-5 dark:bg-neutral-900">
          <div className="flex items-start gap-4">
            <div className="bg-brand-100 dark:bg-brand-950/40 flex size-10 shrink-0 items-center justify-center rounded-xl">
              <Zap size={20} className="text-brand-500 dark:text-brand-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="m-0! text-sm font-bold text-neutral-900 dark:text-white">
                {__("Want to automate this?", "structura")}
              </h3>
              <p className="m-0! mt-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                {__(
                  "Create a free account to set up campaigns that automatically generate and publish posts on a schedule. No more manual work.",
                  "structura"
                )}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <Button asChild size="sm">
                  <a
                    href={buildPortalSignupUrl({
                      intent: "general_upgrade",
                      domain:
                        typeof window !== "undefined"
                          ? window.location.hostname
                          : undefined,
                      plan,
                    })}
                    target="_blank"
                    rel="noreferrer"
                    className="text-white!"
                  >
                    {__("Get Free Account", "structura")}
                    <ArrowRight size={14} className="ml-1.5" />
                  </a>
                </Button>
                <Button asChild variant="secondary" size="sm">
                  <a
                    href={buildMarketingPricingUrl({
                      intent: "general_upgrade",
                      domain:
                        typeof window !== "undefined"
                          ? window.location.hostname
                          : undefined,
                      plan,
                    })}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {__("See Plans", "structura")}
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── Actions ────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3">
        <Button variant="secondary" onClick={() => navigate(-1)}>
          {__("Cancel", "structura")}
        </Button>
        <Button
          onClick={handleGenerate}
          loading={isGenerating}
          disabled={!isValid || !isEngineReady || hasNoPersonas}
        >
          <Zap size={14} className="mr-1.5" />
          {__("Generate Now", "structura")}
        </Button>
      </div>
    </div>
  );
};

export default GeneratePostPage;

// ─── SEO toggle row ──────────────────────────────────────────────────

const SeoToggle = ({
  label,
  checked,
  onChange,
  available,
  tier = "Pro",
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  available: boolean;
  tier?: string;
}) => {
  if (!available) {
    return <LockedFeature label={label} tier={tier} />;
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      <Switch label={label} hiddenLabel checked={checked} onChange={onChange} />
    </div>
  );
};
