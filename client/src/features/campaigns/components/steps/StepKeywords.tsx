import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import {
  AlertTriangle,
  Check,
  ChevronsRight,
  ExternalLink,
  Key,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { Badge, Button, cn, InputField } from "@structura/ui";
import { BankKeyword } from "@/features/campaigns/types";
import { keywordVolumeLabel } from "@/features/campaigns/labels";
import { useCampaignMutations } from "@/features/campaigns/api/useCampaignMutations";
import { useLicense } from "@/features/settings";
import { docsUrl } from "@/utils/docsUrl";
import { buildPortalSignupUrl } from "@/utils/portalLinks";
import { buildWizardResumeUrl } from "@/features/campaigns/utils/wizardReturnUrl";

// ─── Types ───────────────────────────────────────────────────────────────────

type DiscoveryPhase =
  | "idle"
  | "extracting" // Phase 1: AI extracts seed keyphrase from objective
  | "searching" // Phase 2: Running SERP queries for related searches + PAA
  | "expanding" // Phase 3: AI expanding the pool if needed
  | "curating" // Phase 4: AI curation + volume estimation
  | "complete"; // Done — show results (may be empty)

export interface KeywordDiscoveryHandle {
  /** Returns the current keyword bank (for parent to include in creation payload). */
  getKeywords: () => BankKeyword[];
  /** Save keywords to an existing campaign. Only valid when campaignId is provided. */
  save: (campaignId: string | number) => Promise<void>;
  /** Whether discovery is currently running. */
  isBusy: boolean;
}

interface StepKeywordsProps {
  /** Campaign topic / objective — used as the search seed for discovery. */
  topic?: string;
  /**
   * Interview topics, passed as explicit keyword-discovery seeds. When
   * present the cloud expands these directly instead of re-deriving seeds
   * from the objective prose; empty (interview skipped / edit flow) →
   * objective-derived seeds.
   */
  topicSeeds?: string[];
  /** Campaign name — used for logging. */
  campaignName?: string;
  /** Required in detached mode. */
  language?: string;
  /** Required in detached mode. */
  provider?: string;
  /** If provided, shows existing keywords in edit mode instead of running discovery. */
  existingKeywords?: BankKeyword[];
  /** Called whenever keyword count changes (for parent button label updates). */
  onKeywordsChange?: (count: number) => void;
  /** Called when the discovery phase changes (for parent to track busy/complete states). */
  onPhaseChange?: (phase: string) => void;
  /**
   * Skip handler for the upsell teaser's secondary action ("See pricing
   * & continue"). The parent owns wizard state (which step is active,
   * which steps are marked skipped/complete), so it provides the
   * callback rather than us reaching into the draft store from here.
   * Omitted in non-wizard mounts (e.g. campaign-edit), in which case
   * the secondary action falls back to just opening the pricing page.
   */
  onSkipToNextStep?: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

// Keyword Bank explainer lives under `using/campaigns/target-keywords`
// in the docs IA (specs/docs-site-rewrite.md §3). The earlier slug
// (`/keyword-bank`) didn't exist — it was a draft URL that never made
// it into the rewrite.
const DOCS_URL = docsUrl("using/campaigns/target-keywords");

const SOURCE_ICONS: Record<string, typeof Search> = {
  related_search: Search,
  people_also_ask: TrendingUp,
  ai_generated: Sparkles,
  manual: Plus,
};

const SOURCE_LABELS: Record<string, string> = {
  related_search: __("Related Search", "structura"),
  people_also_ask: __("People Also Ask", "structura"),
  ai_generated: __("AI Assistant", "structura"),
  manual: __("Manual", "structura"),
};

const VOLUME_COLORS: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  medium: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  low: "bg-neutral-50 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
};

// ─── Component ───────────────────────────────────────────────────────────────

export const StepKeywords = forwardRef<KeywordDiscoveryHandle, StepKeywordsProps>(
  (
    {
      topic,
      topicSeeds,
      campaignName,
      language,
      provider,
      existingKeywords,
      onKeywordsChange,
      onPhaseChange,
      onSkipToNextStep,
    },
    ref
  ) => {
    const { isPaidLicense, isLicensed, plan } = useLicense();
    const [phase, setPhase] = useState<DiscoveryPhase>(
      existingKeywords?.length ? "complete" : "idle"
    );
    const [keywords, setKeywords] = useState<BankKeyword[]>(existingKeywords ?? []);
    const [error, setError] = useState<string>("");
    // Spec: `specs/seo-intelligence-plan.md` §3.2. Tracks whether the
    // discovery used real SEO intel provider data ("provider") or fell
    // back to the legacy LLM-only pipeline ("legacy"). Drives the
    // data-source badge so users know whether their bank is grounded
    // in real Google data or AI estimation.
    const [dataPath, setDataPath] = useState<"provider" | "legacy" | null>(null);
    const [newKeywordInput, setNewKeywordInput] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const { discoverKeywordsDetached, isDiscoveringKeywords, saveKeywords } =
      useCampaignMutations();

    const isRunning = isDiscoveringKeywords;

    // Notify parent of keyword count changes
    useEffect(() => {
      onKeywordsChange?.(keywords.length);
    }, [keywords.length, onKeywordsChange]);

    // Notify parent of phase changes
    useEffect(() => {
      onPhaseChange?.(phase);
    }, [phase, onPhaseChange]);

    // Expose imperative handle for parent
    useImperativeHandle(
      ref,
      () => ({
        getKeywords: () => keywords,
        save: async (id: string | number) => {
          await saveKeywords({ campaignId: id, keywords });
        },
        isBusy: isRunning || (phase !== "complete" && phase !== "idle"),
      }),
      [keywords, isRunning, phase, saveKeywords]
    );

    // Run discovery
    const runDiscovery = useCallback(async () => {
      setPhase("extracting");
      setError("");

      const phaseTimer1 = setTimeout(() => setPhase("searching"), 4000);
      const phaseTimer2 = setTimeout(() => setPhase("expanding"), 11000);
      const phaseTimer3 = setTimeout(() => setPhase("curating"), 20000);

      try {
        const result = await discoverKeywordsDetached({
          keyphrase: topic ?? "",
          campaign_name: campaignName ?? "",
          language: language ?? "default",
          provider: provider ?? "gemini",
          // Interview topics seed discovery directly; absent → cloud derives
          // seeds from the objective (keyphrase).
          ...(topicSeeds?.length ? { topic_seeds: topicSeeds } : {}),
        });

        clearTimeout(phaseTimer1);
        clearTimeout(phaseTimer2);
        clearTimeout(phaseTimer3);

        // Merge the real DFS monthly-volume numbers (response `metrics` map,
        // keyed by keyword) onto each keyword so the chips can show them.
        const metrics = result?.metrics ?? {};
        const discovered = (result?.keywords ?? []).map((k: BankKeyword) => {
          const vol = metrics[k.keyword]?.volumeNumber;
          return typeof vol === "number" ? { ...k, volumeNumber: vol } : k;
        });
        setDataPath(result?.meta?.path ?? null);

        // Preserve manually added keywords — merge them with discovered ones
        setKeywords((prev) => {
          const manualKeywords = prev.filter((k) => k.source === "manual");
          const deduped = manualKeywords.filter(
            (m) =>
              !discovered.some(
                (d: BankKeyword) => d.keyword.toLowerCase() === m.keyword.toLowerCase()
              )
          );
          return [...discovered, ...deduped];
        });
        setPhase("complete");

        if (discovered.length === 0) {
          setError(
            __(
              "No keywords were discovered for this topic. You can add keywords manually below.",
              "structura"
            )
          );
        }
      } catch (err: any) {
        clearTimeout(phaseTimer1);
        clearTimeout(phaseTimer2);
        clearTimeout(phaseTimer3);
        setError(
          err?.message ??
            __(
              "Keyword discovery failed. You can retry, add keywords manually, or skip this step.",
              "structura"
            )
        );
        setPhase("complete");
      }
    }, [topic, topicSeeds, campaignName, language, provider, discoverKeywordsDetached]);

    // Auto-start on mount if paid and no existing keywords
    useEffect(() => {
      if (isPaidLicense && !existingKeywords?.length && phase === "idle") {
        runDiscovery();
      }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const removeKeyword = (keyword: string) => {
      setKeywords((prev) => prev.filter((k) => k.keyword !== keyword));
    };

    const addManualKeyword = () => {
      const raw = newKeywordInput.trim().toLowerCase();
      if (!raw || raw.length < 2) return;

      if (keywords.some((k) => k.keyword.toLowerCase() === raw)) {
        setNewKeywordInput("");
        return;
      }

      const newKw: BankKeyword = {
        keyword: newKeywordInput.trim(),
        source: "manual",
        usageCount: 0,
      };

      setKeywords((prev) => [...prev, newKw]);
      setNewKeywordInput("");
      inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addManualKeyword();
      }
    };

    // ── Render: Teaser for free users ──────────────────────────────────────
    //
    // Tier-aware CTAs:
    //   - Primary "Unlock with Pro" / "Create account" — sends the user
    //     to app.structurawp.com with `intent=unlock_keyword_bank` so the
    //     portal's root-index redirect drops them on /billing (logged-in
    //     Free) where the upgrade view is already inline; anonymous None
    //     tier hits /signup first.
    //   - Secondary "Skip & continue" — advances the wizard without
    //     opening a pricing page in a new tab. We deliberately don't
    //     gate "continue" on viewing pricing — users can finish the
    //     campaign on the rest of the wizard and revisit the upsell
    //     from /billing on their own time.
    if (!isPaidLicense) {
      const domain = typeof window !== "undefined" ? window.location.hostname : undefined;
      // `returnTo` lets the portal surface a "Back to {site}" link that
      // lands the customer on this exact wizard step after they complete
      // (or abandon) the upgrade flow. `CreateCampaignPage` reads
      // `?resume=draft&step=keywords` on mount and jumps the wizard
      // back here.
      const returnTo = buildWizardResumeUrl("keywords");
      const portalUrl = buildPortalSignupUrl({
        intent: "unlock_keyword_bank",
        domain,
        plan,
        returnTo,
      });
      const primaryLabel = isLicensed
        ? __("Unlock with Pro", "structura")
        : __("Create account", "structura");

      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="from-brand-50 dark:from-brand-950/30 mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br to-purple-50 dark:to-purple-950/30">
            <Key size={28} className="text-brand-400" />
          </div>
          <h3 className="mb-2 text-base font-semibold text-neutral-800 dark:text-white">
            {__("Keyword Bank", "structura")}
          </h3>
          <p className="mx-auto mb-4 max-w-md text-sm text-neutral-500">
            {__(
              "Automatically discover 20–50 high-value keywords for your campaign using real Google search data. " +
                "Keywords are targeted round-robin across your posts for consistent SEO coverage.",
              "structura"
            )}
          </p>
          <span className="from-brand-500 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r to-purple-500 px-4 py-1.5 text-xs font-bold text-white">
            <Sparkles size={12} />
            {__("Pro / Cloud Feature", "structura")}
          </span>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <Button asChild>
              <a href={portalUrl} target="_blank" rel="noopener noreferrer">
                {primaryLabel}
                <ExternalLink size={14} className="ml-1.5" />
              </a>
            </Button>
            {onSkipToNextStep && (
              <Button variant="transparent" onClick={onSkipToNextStep}>
                {__("Skip & continue", "structura")}
                <ChevronsRight size={14} className="ml-1" />
              </Button>
            )}
          </div>
        </div>
      );
    }

    // ── Render: Discovery in progress ──────────────────────────────────────

    if (phase !== "complete" && phase !== "idle") {
      return <KeywordDiscoveryLoader phase={phase} />;
    }

    // ── Render: Results view ─────────────────────────────────────────────

    return (
      <div>
        {/* Explainer */}
        <div className="border-brand-100 bg-brand-50/50 dark:border-brand-900/30 dark:bg-brand-950/20 mb-5 rounded-xl border px-5 py-4">
          <div className="flex items-start gap-3">
            <Key size={18} className="text-brand-500 dark:text-brand-400 mt-0.5 shrink-0" />
            <div className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
              <p className="m-0!">
                {__(
                  "Your Keyword Bank contains targetable keywords discovered from real Google search data. " +
                    "Structura picks one keyword per post in round-robin order, ensuring diverse " +
                    "SEO coverage across your campaign.",
                  "structura"
                )}
              </p>
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 mt-2 inline-flex items-center gap-1 font-medium"
              >
                {__("Learn more", "structura")}
                <ExternalLink size={11} />
              </a>
            </div>
          </div>
        </div>

        {/* Error banner (non-blocking) */}
        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
            <AlertTriangle
              size={16}
              className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
            />
            <div className="flex-1 text-xs text-amber-800 dark:text-amber-300">
              <p className="m-0!">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError("")}
              className="shrink-0 cursor-pointer rounded p-1 text-amber-400 hover:text-amber-600"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Header row */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h3 className="m-0! text-sm font-semibold text-neutral-800 dark:text-white">
              {keywords.length > 0
                ? sprintf(__("%d Keyword(s)", "structura"), keywords.length)
                : __("Keyword Bank", "structura")}
            </h3>
            {/* Data-source badge — spec/seo-intelligence-plan.md §3.2.
                Surfaces whether the bank was built from real Google
                search data (provider) or AI estimation (legacy
                fallback). Critical for user trust — without this,
                users can't tell whether volumes / difficulties are
                real or guessed. */}
            {dataPath === "provider" ? (
              <Badge intent="success">{__("Live data", "structura")}</Badge>
            ) : dataPath === "legacy" ? (
              <Badge intent="warning">{__("AI estimate", "structura")}</Badge>
            ) : null}
          </div>
          <Button variant="secondary" onClick={runDiscovery} loading={isRunning}>
            <RefreshCw size={14} className={cn("mr-2", isRunning && "animate-spin")} />
            {keywords.length > 0 ? __("Re-discover", "structura") : __("Discover", "structura")}
          </Button>
        </div>

        {/* Origin note — by default the bank is prefilled from the
            workspace's target keywords (set in the wizard / Site → Keywords).
            Make that explicit so the list doesn't look like it appeared
            from nowhere; the user can still edit or re-discover. */}
        {keywords.length > 0 ? (
          <p className="mt-0! mb-4! text-xs text-neutral-500 dark:text-neutral-400">
            {__(
              "Prefilled from your site's target keywords by default. Add, remove, or re-discover to tailor them for this campaign.",
              "structura"
            )}
          </p>
        ) : null}

        {/* Explanation banner when fallback path was used — only after
            the run completes (so users don't see it mid-discovery). */}
        {dataPath === "legacy" && keywords.length > 0 ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
            <p className="m-0! text-xs text-amber-700 dark:text-amber-300">
              {__(
                "These keywords were generated by AI based on your campaign objective. Real search-volume data wasn't available for this run — typically because your tier or workspace budget caps the SEO data provider, or this language isn't supported yet. Numbers are estimates.",
                "structura"
              )}
            </p>
          </div>
        ) : null}

        {/* Keyword pills */}
        {keywords.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <KeywordPill
                key={kw.keyword}
                keyword={kw}
                onRemove={() => removeKeyword(kw.keyword)}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {keywords.length === 0 && !error && (
          <div className="mb-4 rounded-xl border border-dashed border-neutral-200 px-6 py-8 text-center dark:border-neutral-700">
            <Search size={24} className="mx-auto mb-2 text-neutral-300 dark:text-neutral-600" />
            <p className="text-xs text-neutral-400">
              {__("No keywords yet. Use Discover or add keywords manually below.", "structura")}
            </p>
          </div>
        )}

        {/* Manual keyword input */}
        <div>
          <InputField
            ref={inputRef}
            label={__("Add keyword", "structura")}
            hiddenLabel
            size="sm"
            value={newKeywordInput}
            onChange={(e) => setNewKeywordInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={__(
              "Add a keyword manually (e.g. best WordPress SEO plugins)",
              "structura"
            )}
            rightAdornment={
              <Button
                variant="transparent"
                size="sm"
                onClick={addManualKeyword}
                disabled={!newKeywordInput.trim()}
              >
                <Plus size={14} className="mr-1" />
                {__("Add", "structura")}
              </Button>
            }
          />
        </div>
      </div>
    );
  }
);

StepKeywords.displayName = "StepKeywords";

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Compact monthly-volume label: 1.2K / 12K / 850. */
function compactVolume(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

const KeywordPill = ({ keyword, onRemove }: { keyword: BankKeyword; onRemove: () => void }) => {
  const Icon = SOURCE_ICONS[keyword.source] ?? Search;
  const volumeClass = keyword.volume ? VOLUME_COLORS[keyword.volume] : "";

  return (
    <div className="group border-brand-200 bg-brand-50 hover:border-brand-300 dark:border-brand-900/40 dark:bg-brand-950/30 dark:hover:border-brand-800 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors">
      <Icon size={12} className="text-brand-500 dark:text-brand-400 shrink-0" />
      <span className="text-brand-900 dark:text-brand-100">{keyword.keyword}</span>
      {typeof keyword.volumeNumber === "number" ? (
        // Real DFS monthly volume — the strongest signal; show it verbatim.
        <span className="shrink-0 font-mono text-[9px] font-bold text-brand-500 dark:text-brand-300">
          {compactVolume(keyword.volumeNumber)}/mo
        </span>
      ) : keyword.volume ? (
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
            volumeClass
          )}
        >
          {keywordVolumeLabel(keyword.volume)}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 shrink-0 cursor-pointer rounded p-0.5 text-neutral-400 transition-colors hover:text-red-500 dark:text-neutral-500"
        title={__("Remove keyword", "structura")}
      >
        <X size={10} />
      </button>
    </div>
  );
};

// ─── Premium Discovery Loader ───────────────────────────────────────────────

interface PipelineStep {
  id: DiscoveryPhase;
  label: string;
  description: string;
}

// Loader copy is deliberately vague — the previous strings ("Querying
// Google for related searches and People Also Ask data…", "Scoring
// relevance and estimating search volumes…") read like a competitive-
// intelligence whitepaper and let anyone watching the UI reverse-
// engineer the discovery pipeline. The reworded copy below describes
// motion, not mechanism. Same principle as `MagicSuggestProgress`.
const KEYWORD_PIPELINE_STEPS: PipelineStep[] = [
  {
    id: "extracting",
    label: __("Analyzing", "structura"),
    description: __("Studying your topic landscape…", "structura"),
  },
  {
    id: "searching",
    label: __("Discovering", "structura"),
    description: __("Surfacing how readers search this niche…", "structura"),
  },
  {
    id: "expanding",
    label: __("Expanding", "structura"),
    description: __("Mapping adjacent angles and long-tail variants…", "structura"),
  },
  {
    id: "curating",
    label: __("Curating", "structura"),
    description: __("Ranking by relevance to your campaign…", "structura"),
  },
];

const keywordPhaseIndex = (phase: DiscoveryPhase): number =>
  KEYWORD_PIPELINE_STEPS.findIndex((s) => s.id === phase);

const KeywordDiscoveryLoader = ({ phase }: { phase: DiscoveryPhase }) => {
  const currentIdx = keywordPhaseIndex(phase);
  const currentStep = KEYWORD_PIPELINE_STEPS[currentIdx];

  return (
    <div className="flex flex-col items-center justify-center py-12">
      {/* Animated icon cluster */}
      <div className="relative mb-8">
        <div className="from-brand-50 shadow-brand-100/50 dark:from-brand-950/50 dark:shadow-brand-900/20 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br to-purple-50 shadow-lg dark:to-purple-950/50">
          <Key className="text-brand-600 dark:text-brand-400 h-7 w-7" />
        </div>
        <div className="bg-brand-400 shadow-brand-400/50 absolute -top-1 -right-1 h-3 w-3 animate-pulse rounded-full shadow-lg" />
      </div>

      {/* Active phase description */}
      <p className="mb-8 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {currentStep?.description ?? ""}
      </p>

      {/* Horizontal pipeline */}
      <div className="flex w-full max-w-md items-center justify-center">
        {KEYWORD_PIPELINE_STEPS.map((step, i) => {
          const isDone = i < currentIdx;
          const isActive = i === currentIdx;
          const isPending = i > currentIdx;

          return (
            <div key={step.id} className="flex items-center">
              {/* Step: circle + label */}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-500",
                    isDone &&
                      "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
                    isActive &&
                      "bg-brand-100 text-brand-600 shadow-brand-200/50 dark:bg-brand-950 dark:text-brand-400 dark:shadow-brand-900/30 shadow-md",
                    isPending &&
                      "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-600"
                  )}
                >
                  {isDone ? (
                    <Check size={14} />
                  ) : isActive ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px] font-semibold transition-colors duration-500",
                    isDone && "text-emerald-600 dark:text-emerald-400",
                    isActive && "text-brand-600 dark:text-brand-400",
                    isPending && "text-neutral-400 dark:text-neutral-600"
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {i < KEYWORD_PIPELINE_STEPS.length - 1 && (
                <div
                  className={cn(
                    "mb-5 h-px w-8 transition-colors duration-500",
                    i < currentIdx
                      ? "bg-emerald-200 dark:bg-emerald-800"
                      : "bg-neutral-200 dark:bg-neutral-700"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
