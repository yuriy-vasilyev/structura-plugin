/**
 * SEO Targeting — the wp-admin "Generate a Post" single-post twin of the
 * campaign keyword/authority discovery. A single post needs ONE focus
 * keyphrase (not a round-robin bank), so the keyphrase picker is single-select;
 * authority sources reuse the shared `DiscoverableChipList`.
 *
 * Tier model (None = unlicensed install, Free = licensed, Pro/Cloud = paid):
 * None/Free see one locked teaser (no inputs), matching the campaign keyword
 * step. The CTA differs by tier — None gets "Create account", Free "Unlock
 * with Pro". Paid is fully interactive.
 */
import { useState } from "react";
import { __ } from "@wordpress/i18n";
import {
  Check,
  CloudOff,
  ExternalLink,
  Globe2,
  Key,
  Loader2,
  RefreshCw,
  SearchX,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { Badge, Button, cn, DiscoverableChipList, InputField } from "@structura/ui";
import { useCampaignMutations } from "@/features/campaigns/api/useCampaignMutations";
import type { BankKeyword, CampaignFormData } from "@/features/campaigns/types";
import { buildPortalSignupUrl } from "@/utils/portalLinks";
import { buildWizardResumeUrl } from "@/features/campaigns/utils/wizardReturnUrl";

type Phase = "idle" | "loading" | "results" | "empty" | "error";

/** Compact monthly-volume label: 1.2K / 12K / 850 (StepKeywords parity). */
function compactVolume(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

interface Candidate {
  keyword: string;
  volumeNumber?: number;
}

interface SeoTargetingSectionProps {
  formData: CampaignFormData;
  onChange: (patch: Partial<CampaignFormData>) => void;
  isPaidLicense: boolean;
  isLicensed: boolean;
  plan?: string;
}

export const SeoTargetingSection = ({
  formData,
  onChange,
  isPaidLicense,
  isLicensed,
  plan,
}: SeoTargetingSectionProps) => {
  const {
    discoverKeywordsDetached,
    isDiscoveringKeywords,
    discoverAuthorityDetached,
    isDiscoveringDetached,
  } = useCampaignMutations();

  const [phase, setPhase] = useState<Phase>("idle");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [dataPath, setDataPath] = useState<"provider" | "legacy" | null>(null);
  const [ownInput, setOwnInput] = useState("");
  const [authoritySuggested, setAuthoritySuggested] = useState<string[]>([]);

  const objective = formData.identity.objective.trim();
  const selected = formData.identity.focusKeyphrase ?? "";
  const authorityDomains = formData.authority?.domains ?? [];

  const setFocus = (kp: string) =>
    onChange({ identity: { ...formData.identity, focusKeyphrase: kp } });

  // ── Locked teaser for None / Free (campaign StepKeywords parity) ──────────
  if (!isPaidLicense) {
    const domain = typeof window !== "undefined" ? window.location.hostname : undefined;
    const portalUrl = buildPortalSignupUrl({
      intent: "unlock_keyword_bank",
      domain,
      plan,
      returnTo: buildWizardResumeUrl("keywords"),
    });
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="from-brand-50 dark:from-brand-950/30 mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br to-purple-50 dark:to-purple-950/30">
          <Key size={28} className="text-brand-400" />
        </div>
        <h3 className="mb-2 text-base font-semibold text-neutral-800 dark:text-white">
          {__("SEO Targeting", "structura")}
        </h3>
        <p className="mx-auto mb-4 max-w-md text-sm text-neutral-500">
          {__(
            "Ground this post in a real focus keyphrase with live search volume and vetted authority sources — using real Google search data.",
            "structura",
          )}
        </p>
        <span className="from-brand-500 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r to-purple-500 px-4 py-1.5 text-xs font-bold text-white">
          <Sparkles size={12} />
          {__("Pro / Cloud Feature", "structura")}
        </span>
        <div className="mt-8">
          <Button asChild>
            <a href={portalUrl} target="_blank" rel="noopener noreferrer">
              {isLicensed
                ? __("Unlock with Pro", "structura")
                : __("Create account", "structura")}
              <ExternalLink size={14} className="ml-1.5" />
            </a>
          </Button>
        </div>
      </div>
    );
  }

  // ── Keyphrase discovery ───────────────────────────────────────────────────
  const runSuggest = () => {
    if (!objective) return;
    setPhase("loading");
    discoverKeywordsDetached({
      keyphrase: objective,
      language: formData.intelligence.language || "default",
      provider: formData.intelligence.textProvider,
    })
      .then((res) => {
        const metrics = res?.metrics ?? {};
        const next: Candidate[] = (res?.keywords ?? []).map((k: BankKeyword) => ({
          keyword: k.keyword,
          volumeNumber: metrics[k.keyword]?.volumeNumber,
        }));
        setCandidates(next);
        setDataPath(res?.meta?.path ?? null);
        setPhase(next.length > 0 ? "results" : "empty");
      })
      .catch(() => setPhase("error"));
  };

  const useOwn = () => {
    const v = ownInput.trim();
    if (!v) return;
    setFocus(v);
    setOwnInput("");
  };

  const runAuthorityDiscovery = () => {
    discoverAuthorityDetached({
      keyphrase: objective || selected,
      language: formData.intelligence.language || "default",
      provider: formData.intelligence.textProvider,
    })
      .then((res) => {
        const found = (res?.domains ?? []).map((d) => d.domain);
        const existing = new Set(authorityDomains.map((d) => d.domain));
        // Surface as suggestions; the user taps to add (keeps their list intact).
        setAuthoritySuggested(found.filter((d) => !existing.has(d)));
      })
      .catch(() => setAuthoritySuggested([]));
  };

  const setAuthority = (domains: string[]) =>
    onChange({
      authority: {
        domains: domains.map(
          (domain) =>
            authorityDomains0(formData)[domain] ?? {
              domain,
              description: domain,
              tier: "niche" as const,
              citedBy: 0,
              category: "",
              sampleUrls: [],
            },
        ),
        discoveredAt: new Date().toISOString(),
      },
    });

  const serpPreview = candidates.filter((c) => c.keyword !== selected).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Focus keyphrase */}
      <div>
        <label className="mb-2 block text-xs font-bold text-neutral-500 dark:text-neutral-400">
          {__("Focus keyphrase", "structura")}
        </label>

        {selected && (
          <div className="border-brand-500 bg-brand-50 dark:border-brand-500/60 dark:bg-brand-500/10 mb-3 flex items-center gap-3 rounded-xl border-[1.5px] p-3">
            <span className="bg-brand-600 grid h-8 w-8 flex-none place-items-center rounded-lg text-white">
              <Target size={16} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-neutral-900 dark:text-white">
              {selected}
            </span>
            <button
              type="button"
              onClick={() => setFocus("")}
              aria-label={__("Clear keyphrase", "structura")}
              className="grid h-6 w-6 flex-none place-items-center rounded-full text-neutral-400 hover:text-neutral-700"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {phase === "idle" && !selected && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 px-5 py-7 text-center dark:border-neutral-700">
            <p className="max-w-sm text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
              {__(
                "Pick one focus keyphrase and every heading, section, and meta field is optimized around it. Suggest pulls ranked candidates with real monthly search volume.",
                "structura",
              )}
            </p>
            <Button onClick={runSuggest} disabled={!objective}>
              <Sparkles size={14} className="mr-1.5" />
              {__("Suggest keyphrases", "structura")}
            </Button>
            {!objective && (
              <p className="text-[11px] text-neutral-400">
                {__("Describe the post topic above first.", "structura")}
              </p>
            )}
          </div>
        )}

        {phase === "loading" && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <Loader2 size={24} className="text-brand-500 animate-spin" />
            <p className="text-sm text-neutral-500">
              {__("Finding your best keyphrase…", "structura")}
            </p>
          </div>
        )}

        {phase === "results" && (
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                {__("Pick one — it becomes your focus keyphrase.", "structura")}
                {dataPath === "provider" ? (
                  <Badge intent="success">{__("Live data", "structura")}</Badge>
                ) : dataPath === "legacy" ? (
                  <Badge intent="warning">{__("AI estimate", "structura")}</Badge>
                ) : null}
              </span>
              <Button variant="secondary" size="sm" onClick={runSuggest} loading={isDiscoveringKeywords}>
                <RefreshCw size={14} className="mr-1.5" />
                {__("Re-suggest", "structura")}
              </Button>
            </div>
            {/* Compact single-select chips — keyword + monthly volume. Far
                denser than full-width rows; the selected chip fills brand. */}
            <div className="flex flex-wrap gap-2">
              {candidates.map((c) => {
                const on = c.keyword === selected;
                return (
                  <button
                    key={c.keyword}
                    type="button"
                    onClick={() => setFocus(c.keyword)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      on
                        ? "border-brand-500 bg-brand-50 text-brand-900 dark:border-brand-500/60 dark:bg-brand-500/10 dark:text-brand-100"
                        : "border-neutral-200 text-neutral-700 hover:border-brand-300 dark:border-neutral-700 dark:text-neutral-300",
                    )}
                  >
                    {on && <Check size={12} className="text-brand-500 shrink-0" />}
                    <span>{c.keyword}</span>
                    {typeof c.volumeNumber === "number" && (
                      <span
                        className={cn(
                          "rounded px-1 py-0.5 font-mono text-[9px] font-bold",
                          on
                            ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"
                            : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
                        )}
                      >
                        {compactVolume(c.volumeNumber)}/mo
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <OwnKeyphrase value={ownInput} onChange={setOwnInput} onUse={useOwn} />
            {serpPreview.length > 0 && (
              <div className="mt-5 rounded-xl border border-neutral-200 dark:border-neutral-800">
                <p className="border-b border-neutral-200 px-4 py-2 text-[10px] font-black tracking-[0.14em] text-neutral-400 uppercase dark:border-neutral-800">
                  {__("What searchers also ask", "structura")}
                </p>
                <ul className="m-0 list-none p-0">
                  {serpPreview.map((c) => (
                    <li
                      key={c.keyword}
                      className="border-b border-neutral-100 px-4 py-2 text-xs text-neutral-600 last:border-b-0 dark:border-neutral-800/70 dark:text-neutral-300"
                    >
                      {c.keyword}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {phase === "empty" && (
          <div className="rounded-xl border border-dashed border-neutral-200 px-5 py-6 text-center dark:border-neutral-700">
            <SearchX size={22} className="mx-auto mb-2 text-neutral-300 dark:text-neutral-600" />
            <p className="mb-3 text-xs text-neutral-500">
              {__("No live search data for that topic. Enter your own focus keyphrase.", "structura")}
            </p>
            <OwnKeyphrase value={ownInput} onChange={setOwnInput} onUse={useOwn} />
          </div>
        )}

        {phase === "error" && (
          <div className="rounded-xl border border-red-200 px-5 py-6 text-center dark:border-red-900/40">
            <CloudOff size={22} className="mx-auto mb-2 text-red-400" />
            <p className="mb-3 text-xs text-neutral-500">
              {__(
                "Couldn't reach the keyword service. The post can still generate — enter a keyphrase manually or retry.",
                "structura",
              )}
            </p>
            <Button variant="secondary" size="sm" onClick={runSuggest}>
              <RefreshCw size={14} className="mr-1.5" />
              {__("Retry", "structura")}
            </Button>
            <OwnKeyphrase value={ownInput} onChange={setOwnInput} onUse={useOwn} />
          </div>
        )}
      </div>

      {/* Authority sources */}
      <div className="border-t border-neutral-200/70 pt-5 dark:border-neutral-800">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-neutral-500 dark:text-neutral-400">
          <Globe2 size={13} />
          {__("Authority sources", "structura")}
          <span className="font-normal text-neutral-400">
            {__("· optional", "structura")}
          </span>
        </p>
        <p className="mb-3 text-[11px] leading-snug text-neutral-400">
          {__(
            "Reputable domains the post can cite as outbound links for E-E-A-T. Discover them automatically or add your own — leave empty to let the writer choose.",
            "structura",
          )}
        </p>
        <DiscoverableChipList
          kind="domain"
          added={authorityDomains.map((d) => ({ value: d.domain, label: d.domain }))}
          suggested={authoritySuggested.map((d) => ({ value: d, label: d }))}
          onAdd={(value) => {
            setAuthority([...authorityDomains.map((d) => d.domain), value]);
            setAuthoritySuggested((prev) => prev.filter((d) => d !== value));
          }}
          onRemove={(value) =>
            setAuthority(authorityDomains.map((d) => d.domain).filter((d) => d !== value))
          }
          onAddManual={(raw) => {
            const v = raw.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
            if (!v) return false;
            setAuthority([...authorityDomains.map((d) => d.domain), v]);
            return true;
          }}
          onDiscover={runAuthorityDiscovery}
          discovering={isDiscoveringDetached}
          discoverLabel={__("Discover authority sources", "structura")}
          suggestedLabel={__("Suggested — tap to add", "structura")}
          emptyText={__("No authority sources yet.", "structura")}
          inputPlaceholder={__("Add a domain (e.g. developer.mozilla.org)", "structura")}
          ariaLabel={__("Authority sources", "structura")}
        />
      </div>
    </div>
  );
};

/** Existing authority domains keyed by domain — preserves tier/category on edit. */
function authorityDomains0(
  formData: CampaignFormData,
): Record<string, NonNullable<CampaignFormData["authority"]>["domains"][number]> {
  const out: Record<
    string,
    NonNullable<CampaignFormData["authority"]>["domains"][number]
  > = {};
  for (const d of formData.authority?.domains ?? []) out[d.domain] = d;
  return out;
}

const OwnKeyphrase = ({
  value,
  onChange,
  onUse,
}: {
  value: string;
  onChange: (v: string) => void;
  onUse: () => void;
}) => (
  <div className="mt-3">
    <InputField
      label={__("…or type your own keyphrase", "structura")}
      hiddenLabel
      size="sm"
      value={value}
      placeholder={__("…or type your own keyphrase", "structura")}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onUse();
        }
      }}
      rightAdornment={
        <Button variant="transparent" size="sm" onClick={onUse} disabled={!value.trim()}>
          {__("Use", "structura")}
        </Button>
      }
    />
  </div>
);
