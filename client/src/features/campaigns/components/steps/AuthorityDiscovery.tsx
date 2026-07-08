import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import {
  AlertTriangle,
  BookOpen,
  Building2,
  Check,
  ChevronsRight,
  ExternalLink,
  Globe,
  GraduationCap,
  Loader2,
  Newspaper,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import { Button, cn, Favicon, InputField } from "@structura/ui";
import { VettedAuthorityDomain } from "@/features/campaigns/types";
import { useCampaignMutations } from "@/features/campaigns/api/useCampaignMutations";
import { useLicense } from "@/features/settings";
import { docsUrl } from "@/utils/docsUrl";
import { buildPortalSignupUrl } from "@/utils/portalLinks";
import { buildWizardResumeUrl } from "@/features/campaigns/utils/wizardReturnUrl";

// ─── Types ───────────────────────────────────────────────────────────────────

type DiscoveryPhase =
  | "idle"
  | "extracting" // Phase 1: AI extracts seed keyphrase from objective
  | "suggesting" // Phase 2: AI suggests authority domains for the niche
  | "verifying" // Phase 3: Validating domain liveness
  | "complete"; // Done — show results (may be empty)

export interface AuthorityDiscoveryHandle {
  /** Returns the current domain list (for parent to include in creation payload). */
  getDomains: () => VettedAuthorityDomain[];
  /** Save domains to an existing campaign. Only valid when campaignId is provided. */
  save: (campaignId: string | number) => Promise<void>;
  /** Whether discovery is currently running. */
  isBusy: boolean;
}

interface AuthorityDiscoveryProps {
  /**
   * Campaign ID — if provided, discovery runs against the campaign's saved data.
   * If omitted (detached mode), uses keyphrase/language/provider from the form.
   */
  campaignId?: string | number;
  /** Campaign topic / objective — used as the search seed for discovery. */
  topic?: string;
  /** Campaign name — used for logging. */
  campaignName?: string;
  /** Required in detached mode. */
  language?: string;
  /** Required in detached mode. */
  provider?: string;
  /** If provided, shows existing domains in edit mode instead of running discovery. */
  existingDomains?: VettedAuthorityDomain[];
  /** Called whenever domain count changes (for parent button label updates). */
  onDomainsChange?: (count: number) => void;
  /** Called when the discovery phase changes (for parent to track busy/complete states). */
  onPhaseChange?: (phase: string) => void;
  /**
   * Skip handler for the free-tier upsell teaser's secondary action.
   * Mirrors the StepKeywords contract so the wizard parent owns the
   * "mark this step skipped + advance" semantics. Omitted in
   * non-wizard mounts (campaign-edit), in which case the secondary
   * action falls back to just opening the marketing pricing page.
   */
  onSkipToNextStep?: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

// Authority Sources page lives under `using/campaigns/authority-links`
// in the docs IA (specs/docs-site-rewrite.md §3). Kept as a module-level
// constant so the JSX call site stays readable and any future pivot
// (e.g. to `review-authority-links`) is a one-line change.
const DOCS_URL = docsUrl("using/campaigns/authority-links");

const CATEGORY_ICONS: Record<string, typeof Globe> = {
  academic: GraduationCap,
  government: Building2,
  research: BookOpen,
  publication: Newspaper,
  reference: BookOpen,
  industry: Globe,
  documentation: BookOpen,
  community: Globe,
};

const CATEGORY_LABELS: Record<string, string> = {
  academic: __("Academic", "structura"),
  government: __("Government", "structura"),
  research: __("Research", "structura"),
  publication: __("Publication", "structura"),
  reference: __("Reference", "structura"),
  industry: __("Industry", "structura"),
  documentation: __("Docs", "structura"),
  community: __("Community", "structura"),
};

const CATEGORY_COLORS: Record<string, string> = {
  academic: "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400",
  government: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  research: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400",
  publication: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400",
  reference: "bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-400",
  industry: "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400",
  documentation: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  community: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
};

// ─── Component ───────────────────────────────────────────────────────────────

export const AuthorityDiscovery = forwardRef<AuthorityDiscoveryHandle, AuthorityDiscoveryProps>(
  (
    {
      campaignId,
      topic,
      campaignName,
      language,
      provider,
      existingDomains,
      onDomainsChange,
      onPhaseChange,
      onSkipToNextStep,
    },
    ref
  ) => {
    const { isPaidLicense, isLicensed, plan } = useLicense();
    const [phase, setPhase] = useState<DiscoveryPhase>(
      existingDomains?.length ? "complete" : "idle"
    );
    const [domains, setDomains] = useState<VettedAuthorityDomain[]>(existingDomains ?? []);
    const [error, setError] = useState<string>("");
    const [newDomainInput, setNewDomainInput] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const {
      discoverAuthority,
      isDiscovering,
      discoverAuthorityDetached,
      isDiscoveringDetached,
      saveAuthority,
    } = useCampaignMutations();

    const isRunning = isDiscovering || isDiscoveringDetached;

    // Notify parent of domain count changes
    useEffect(() => {
      onDomainsChange?.(domains.length);
    }, [domains.length, onDomainsChange]);

    // Notify parent of phase changes
    useEffect(() => {
      onPhaseChange?.(phase);
    }, [phase, onPhaseChange]);

    // Expose imperative handle for parent
    useImperativeHandle(
      ref,
      () => ({
        getDomains: () => domains,
        save: async (id: string | number) => {
          await saveAuthority({ campaignId: id, domains });
        },
        isBusy: isRunning || (phase !== "complete" && phase !== "idle"),
      }),
      [domains, isRunning, phase, saveAuthority]
    );

    // Run discovery — picks the right endpoint based on whether we have a campaignId
    const runDiscovery = useCallback(async () => {
      setPhase("extracting");
      setError("");

      const phaseTimer1 = setTimeout(() => setPhase("suggesting"), 3000);
      const phaseTimer2 = setTimeout(() => setPhase("verifying"), 8000);

      try {
        let result;

        if (campaignId) {
          result = await discoverAuthority({ campaignId });
        } else {
          result = await discoverAuthorityDetached({
            keyphrase: topic ?? "",
            campaign_name: campaignName ?? "",
            language: language ?? "default",
            provider: provider ?? "gemini",
          });
        }

        clearTimeout(phaseTimer1);
        clearTimeout(phaseTimer2);

        const discovered = (result?.domains ?? []) as VettedAuthorityDomain[];

        // Preserve manually added domains — merge them with discovered ones
        setDomains((prev) => {
          const manualDomains = prev.filter(
            (d) => d.description === __("Manually added", "structura")
          );
          const deduped = manualDomains.filter(
            (m) => !discovered.some((d) => d.domain.toLowerCase() === m.domain.toLowerCase())
          );
          return [...discovered, ...deduped];
        });
        setPhase("complete");

        if (discovered.length === 0) {
          setError(
            __(
              "No authority domains were found for this niche. You can add domains manually below.",
              "structura"
            )
          );
        }
      } catch (err: any) {
        clearTimeout(phaseTimer1);
        clearTimeout(phaseTimer2);
        setError(
          err?.message ??
            __(
              "Discovery failed. You can retry, add domains manually, or skip this step.",
              "structura"
            )
        );
        setPhase("complete");
      }
    }, [
      campaignId,
      topic,
      campaignName,
      language,
      provider,
      discoverAuthority,
      discoverAuthorityDetached,
    ]);

    // Auto-start on mount if paid and no existing domains.
    //
    // Pre-2026-05 this fired unconditionally, which on Free / None tier
    // meant the discovery POST hit the cloud, came back 403 (authority
    // discovery is paid-only), and rendered a toast + empty state with
    // no upgrade path. The license gate matches the StepKeywords
    // pattern so the upsell teaser is the only thing the customer sees
    // until they upgrade.
    useEffect(() => {
      if (isPaidLicense && !existingDomains?.length && phase === "idle") {
        runDiscovery();
      }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const removeDomain = (domain: string) => {
      setDomains((prev) => prev.filter((d) => d.domain !== domain));
    };

    const addManualDomain = () => {
      const raw = newDomainInput
        .trim()
        .toLowerCase()
        .replace(/^(https?:\/\/)?(www\.)?/, "")
        .replace(/\/.*$/, "");
      if (!raw || raw.length < 3 || !raw.includes(".")) return;

      if (domains.some((d) => d.domain === raw)) {
        setNewDomainInput("");
        return;
      }

      const newDomain: VettedAuthorityDomain = {
        domain: raw,
        description: __("Manually added", "structura"),
        tier: "niche",
        citedBy: 0,
        category: "industry",
        sampleUrls: [],
      };

      setDomains((prev) => [...prev, newDomain]);
      setNewDomainInput("");
      inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addManualDomain();
      }
    };

    // ── Render: Teaser for free users ──────────────────────────────────────
    //
    // Mirrors the StepKeywords teaser: primary CTA hands the user off to
    // app.structurawp.com with `intent=unlock_authority` (root-index
    // redirect drops them on /billing for logged-in Free, /signup for
    // anonymous None); secondary lets them skip and continue without
    // forcing a pricing page detour. `returnTo` lands the customer back
    // on this step after the upgrade flow completes — the wizard reads
    // `?resume=draft&step=authority` on mount.
    if (!isPaidLicense) {
      const domain =
        typeof window !== "undefined" ? window.location.hostname : undefined;
      const returnTo = buildWizardResumeUrl("authority");
      const portalUrl = buildPortalSignupUrl({
        intent: "unlock_authority",
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
            <Shield size={28} className="text-brand-400" />
          </div>
          <h3 className="mb-2 text-base font-semibold text-neutral-800 dark:text-white">
            {__("Authority Sources", "structura")}
          </h3>
          <p className="mx-auto mb-4 max-w-md text-sm text-neutral-500">
            {__(
              "Discover real, validated authority domains for your niche — academic, government, " +
                "research, and reference sources. Every outbound link is verified live before it ships in a post.",
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

    // ── Render: Discovery in progress ─────────────────────────────────────

    if (phase !== "complete" && phase !== "idle") {
      return <DiscoveryLoader phase={phase} />;
    }

    // ── Render: Results view (always reachable, even after errors) ─────────

    return (
      <div>
        {/* Explainer */}
        <div className="border-brand-100 bg-brand-50/50 dark:border-brand-900 dark:bg-brand-950/50 mb-5 rounded-xl border px-5 py-4">
          <div className="flex items-start gap-3">
            <Shield size={18} className="text-brand-500 dark:text-brand-400 mt-0.5 shrink-0" />
            <div className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
              <p className="m-0!">
                {__(
                  "Authority Sources are high-quality domains that Structura uses for outbound links in your posts. " +
                    "We automatically discover and vet trusted sources specific to your niche — you can review, " +
                    "edit, or add your own below.",
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
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-800 dark:text-white">
            {domains.length > 0
              ? sprintf(__("%d Authority Source(s)", "structura"), domains.length)
              : __("Authority Sources", "structura")}
          </h3>
          <Button variant="secondary" onClick={runDiscovery} loading={isRunning}>
            <RefreshCw size={14} className={cn("mr-2", isRunning && "animate-spin")} />
            {domains.length > 0 ? __("Re-discover", "structura") : __("Discover", "structura")}
          </Button>
        </div>

        {/* Domain pills (compact view) */}
        {domains.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {domains.map((d) => (
              <DomainPill key={d.domain} domain={d} onRemove={() => removeDomain(d.domain)} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {domains.length === 0 && !error && (
          <div className="mb-4 rounded-xl border border-dashed border-neutral-200 px-6 py-8 text-center dark:border-neutral-700">
            <Globe size={24} className="mx-auto mb-2 text-neutral-300 dark:text-neutral-600" />
            <p className="text-xs text-neutral-400">
              {__("No domains yet. Use Discover or add domains manually below.", "structura")}
            </p>
          </div>
        )}

        {/* Manual domain input */}
        <div className="mb-6">
          <InputField
            ref={inputRef}
            label={__("Add domain", "structura")}
            hiddenLabel
            size="sm"
            value={newDomainInput}
            onChange={(e) => setNewDomainInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={__("Add a domain manually (e.g. moz.com)", "structura")}
            rightAdornment={
              <Button
                variant="transparent"
                size="sm"
                onClick={addManualDomain}
                disabled={!newDomainInput.trim()}
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

AuthorityDiscovery.displayName = "AuthorityDiscovery";

// ─── Sub-components ──────────────────────────────────────────────────────────

/**
 * Domain favicon with a category-aware fallback. Thin wrapper over the shared
 * {@link Favicon} primitive so the campaign authority list keeps its
 * per-category fallback icon (vs. the primitive's default globe).
 */
const DomainFavicon = ({ domain, category }: { domain: string; category: string }) => (
  <Favicon domain={domain} fallback={CATEGORY_ICONS[category] ?? Globe} />
);

const DomainPill = ({
  domain,
  onRemove,
}: {
  domain: VettedAuthorityDomain;
  onRemove: () => void;
}) => {
  const tierColor =
    domain.tier === "universal"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
      : "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400";
  const tierLabel =
    domain.tier === "universal" ? __("Universal", "structura") : __("Niche", "structura");

  const categoryLabel = CATEGORY_LABELS[domain.category] ?? domain.category;
  const categoryColor =
    CATEGORY_COLORS[domain.category] ??
    "bg-neutral-50 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400";

  return (
    <div
      className="group flex items-center gap-1.5 rounded-lg border border-neutral-100 bg-white px-3 py-1.5 text-xs transition-colors hover:border-neutral-200 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
      title={domain.description}
    >
      <DomainFavicon domain={domain.domain} category={domain.category} />
      <span className="text-neutral-700 dark:text-neutral-300">{domain.domain}</span>
      <span
        className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase", tierColor)}
      >
        {tierLabel}
      </span>
      <span
        className={cn(
          "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
          categoryColor
        )}
      >
        {categoryLabel}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 shrink-0 cursor-pointer rounded p-0.5 text-neutral-400 transition-colors hover:text-red-500"
        title={__("Remove domain", "structura")}
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

const PIPELINE_STEPS: PipelineStep[] = [
  {
    id: "extracting",
    label: __("Analyzing", "structura"),
    description: __("Understanding your campaign objective and niche…", "structura"),
  },
  {
    id: "suggesting",
    label: __("Discovering", "structura"),
    description: __("Identifying authoritative domains in your topic space…", "structura"),
  },
  {
    id: "verifying",
    label: __("Verifying", "structura"),
    description: __("Checking domain availability and validating sources…", "structura"),
  },
];

const phaseIndex = (phase: DiscoveryPhase): number =>
  PIPELINE_STEPS.findIndex((s) => s.id === phase);

const DiscoveryLoader = ({ phase }: { phase: DiscoveryPhase }) => {
  const currentIdx = phaseIndex(phase);
  const currentStep = PIPELINE_STEPS[currentIdx];

  return (
    <div className="flex flex-col items-center justify-center py-12">
      {/* Animated icon cluster */}
      <div className="relative mb-8">
        <div className="from-brand-50 shadow-brand-100/50 dark:from-brand-950/50 dark:shadow-brand-900/20 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br to-purple-50 shadow-lg dark:to-purple-950/50">
          <Sparkles className="text-brand-600 dark:text-brand-400 h-7 w-7" />
        </div>
        <div className="bg-brand-400 shadow-brand-400/50 absolute -top-1 -right-1 h-3 w-3 animate-pulse rounded-full shadow-lg" />
      </div>

      {/* Active phase description */}
      <p className="mb-8 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {currentStep?.description ?? ""}
      </p>

      {/* Horizontal pipeline */}
      <div className="flex w-full max-w-sm items-center justify-center">
        {PIPELINE_STEPS.map((step, i) => {
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
              {i < PIPELINE_STEPS.length - 1 && (
                <div
                  className={cn(
                    "mb-5 h-px w-10 transition-colors duration-500",
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
