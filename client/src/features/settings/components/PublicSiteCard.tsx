import { useEffect, useMemo, useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { ExternalLink, Globe, Loader2, Save, Sparkles } from "lucide-react";
import {
  Button,
  Card,
  InputField,
  Select,
  Switch,
  TextArea,
  toast,
} from "@structura/ui";

import { docsUrl } from "@/utils/docsUrl";
import {
  type PermalinkStrategy,
  type PublicSiteProfileDraft,
  type QuickSetupProposal,
  usePublicSiteProfile,
  usePublicSiteProfileMutation,
  useQuickSetup,
} from "../api/usePublicSiteProfile";
import { KeyPagesEditor } from "./KeyPagesEditor";
import { QuickSetupConfirmModal } from "./QuickSetupConfirmModal";

/**
 * Empty draft shape — used while the initial fetch is in flight so the
 * form's controlled inputs never receive undefined.
 */
const EMPTY_DRAFT: PublicSiteProfileDraft = {
  publicUrl: "",
  isHeadless: false,
  description: "",
  keyPages: [],
  permalinkStrategy: "inherit",
  permalinkTemplate: "",
  defaultPermalinkLang: "",
};

/**
 * Strategy options for the permalink-pattern Select. Order matters —
 * `inherit` first because it's the safe default for non-headless
 * installs and the option most operators won't change.
 *
 * Spec: `specs/site-identity-headless.md` §3.1.
 */
const STRATEGY_OPTIONS: Array<{ value: PermalinkStrategy; label: string }> = [
  { value: "inherit", label: __("Inherit (use WP permalink)", "structura") },
  { value: "prefixSwap", label: __("Prefix swap ({publicUrl}/{lang}/blog/{slug})", "structura") },
  { value: "template", label: __("Custom template…", "structura") },
];

/**
 * Common prefixes that signal a WordPress install acting as a backend
 * for a separate public site. We strip these and offer the bare /
 * www-prefixed variants as suggestions. Order matters only for the
 * "first match wins" logic in {@link suggestPublicUrls} — `cms.` is
 * by far the most common, so list it first so it's the cheap-path
 * winner on the convention's most popular form.
 */
const BACKEND_PREFIXES = ["cms.", "wp.", "admin.", "backend.", "editor."] as const;

/**
 * Compute a small set of public-URL suggestions from the WP install's
 * `homeUrl`. Each suggestion is what an operator running a separate
 * front end at the same TLD+1 most likely typed into their DNS:
 *
 *   - Strip a known backend prefix (`cms.example.com` → `example.com`).
 *   - Offer the `www.` variant of the stripped form, since many
 *     deployments only resolve on `www.`.
 *
 * Returned in priority order, deduplicated. Empty array when no
 * heuristic matches — the operator types the URL by hand in that
 * case (the chips just don't render).
 *
 * Pure on top of `URL` parsing — kept as a top-level helper so the
 * Vitest case can pin the matrix without rendering the card.
 *
 * Spec: `specs/site-identity-headless.md` §4 (Quick setup).
 */
export function suggestPublicUrls(homeUrl: string): string[] {
  if (!homeUrl) return [];

  let parsed: URL;
  try {
    parsed = new URL(homeUrl);
  } catch {
    return [];
  }

  const host = parsed.hostname;
  const protocol = parsed.protocol === "http:" ? "http:" : "https:";
  const matchedPrefix = BACKEND_PREFIXES.find((p) => host.startsWith(p));
  if (!matchedPrefix) return [];

  const stripped = host.slice(matchedPrefix.length);
  if (stripped === "" || !stripped.includes(".")) {
    // Don't propose URLs with no dot (e.g. `cms.localhost` → `localhost`)
    // — those are dev-loop hosts the heuristic can't help with.
    return [];
  }

  // Always offer the bare host as the first suggestion. If the
  // bare host doesn't already start with `www.`, also offer the
  // `www.`-prefixed variant — many marketing sites resolve only
  // on the `www` form.
  const out: string[] = [`${protocol}//${stripped}`];
  if (!stripped.startsWith("www.")) {
    out.push(`${protocol}//www.${stripped}`);
  }
  return out;
}

/**
 * Format a URL for chip display — strip the protocol so the chip
 * reads as "xerx.io" rather than "https://xerx.io". Operator's
 * mental model is the bare host; the protocol is bookkeeping.
 */
function chipLabel(url: string): string {
  return url.replace(/^https?:\/\//i, "");
}

/**
 * Settings card for the public-site profile.
 *
 * Lives on Settings → General between the AI / Privacy cards and the
 * Advanced section. Mounts unconditionally; renders a compact "inherits
 * from WP" view when the operator hasn't enabled headless mode, and
 * the full editor when they have.
 *
 * Save semantics
 * --------------
 * Self-contained Save button. The SettingsPage's global Save covers a
 * different slice of options (general/ai); coupling them would force
 * every public-site edit to go through the page-wide draft, which
 * fights React Query's per-query cache invalidation.
 *
 * Spec: `specs/site-identity-headless.md` §4.
 */
export const PublicSiteCard = () => {
  const { data: profile, isLoading } = usePublicSiteProfile();
  const saveMutation = usePublicSiteProfileMutation();
  const quickSetup = useQuickSetup();

  const [draft, setDraft] = useState<PublicSiteProfileDraft>(EMPTY_DRAFT);
  const [quickSetupOpen, setQuickSetupOpen] = useState(false);
  const [proposal, setProposal] = useState<QuickSetupProposal | null>(null);

  // Hydrate the draft from the server response. Re-hydrate whenever
  // the server reflects a saved state (`profile` identity changes via
  // React Query cache update).
  useEffect(() => {
    if (!profile) return;
    setDraft({
      publicUrl: profile.publicUrl,
      isHeadless: profile.isHeadless,
      description: profile.description,
      keyPages: profile.keyPages,
      permalinkStrategy: profile.permalinkStrategy,
      permalinkTemplate: profile.permalinkTemplate,
      defaultPermalinkLang: profile.defaultPermalinkLang,
    });
  }, [profile]);

  const willOverwriteOnQuickSetup = useMemo(
    () => draft.description !== "" || draft.keyPages.length > 0,
    [draft.description, draft.keyPages.length]
  );

  const handleChange = <K extends keyof PublicSiteProfileDraft>(
    key: K,
    value: PublicSiteProfileDraft[K]
  ) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      // Coupled-field rule: flipping headless mode ON while the URL
      // pattern is still `inherit` is semantically contradictory — the
      // operator just said their public site lives elsewhere, then
      // told us to keep emitting the WP permalink. Auto-flip to
      // `prefixSwap` (the most common headless layout) so the
      // contradiction can't be saved. Operators who want a custom
      // pattern can still pick "Custom template" after.
      if (key === "isHeadless" && value === true && prev.permalinkStrategy === "inherit") {
        next.permalinkStrategy = "prefixSwap";
      }
      return next;
    });
  };

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync(draft);
    } catch {
      // Toast handled inside the mutation hook — no extra UI needed.
    }
  };

  /**
   * URL chip suggestions derived from the WP host. Memoised against
   * `homeUrl` so toggling the headless switch off/on or editing
   * unrelated fields doesn't re-run the URL-parse.
   */
  const urlSuggestions = useMemo(
    () => suggestPublicUrls(profile?.homeUrl ?? ""),
    [profile?.homeUrl]
  );

  /**
   * Run the scrape against the URL currently in the form. Pure on
   * top of `draft.publicUrl` — the click handler no longer derives
   * anything silently. If the field is empty the button is disabled,
   * so we never reach this with an unset URL.
   *
   * Spec: `specs/site-identity-headless.md` §4 (Quick setup).
   */
  const handleQuickSetupClick = async () => {
    const urlToScrape = draft.publicUrl.trim();
    if (urlToScrape === "") return; // Button is disabled in this state.

    setQuickSetupOpen(true);
    setProposal(null);

    try {
      const result = await quickSetup.mutateAsync(urlToScrape);
      setProposal(result.proposed);
    } catch (err) {
      const message =
        (err as { message?: string })?.message ??
        __("Quick setup failed. Try again or fill the fields manually.", "structura");
      toast.error(message);
      setQuickSetupOpen(false);
    }
  };

  const handleApplyProposal = (p: QuickSetupProposal) => {
    setDraft((prev) => ({
      ...prev,
      description: p.description || prev.description,
      keyPages: p.keyPages.length > 0 ? p.keyPages : prev.keyPages,
      // Default strategy to prefixSwap when applying — the most common
      // headless setup. Operator can change after.
      permalinkStrategy:
        prev.permalinkStrategy === "inherit" ? "prefixSwap" : prev.permalinkStrategy,
    }));
    setQuickSetupOpen(false);
    toast.success(__("Proposals applied. Review and click Save.", "structura"));
  };

  if (isLoading) {
    return (
      <Card className="p-8!">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {__("Loading public website settings…", "structura")}
          </span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-8!">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Globe className="text-brand-500 h-5 w-5" />
          <h3 className="m-0! text-sm font-bold tracking-wider text-gray-900 uppercase dark:text-white">
            {__("Public website", "structura")}
          </h3>
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending} size="sm">
          {saveMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {__("Save", "structura")}
        </Button>
      </div>

      {/* ── Headless toggle ──────────────────────────────────────── */}
      <div className="mb-6">
        <Switch
          label={__("My public website lives elsewhere (headless mode)", "structura")}
          description={__(
            "Turn this on if your readers visit a different website (e.g. xerx.io) and this WordPress install only stores content. Off by default — Structura assumes WordPress IS the public website.",
            "structura"
          )}
          checked={draft.isHeadless}
          onChange={(val) => handleChange("isHeadless", val)}
        />
      </div>

      {!draft.isHeadless && (
        <p className="m-0! rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-400">
          {__(
            "Inherits everything from this WordPress install — site title, tagline, logo, and post URLs.",
            "structura"
          )}
        </p>
      )}

      {draft.isHeadless && (
        <div className="space-y-6 border-t border-gray-200 pt-6 dark:border-gray-800">
          {/* publicUrl — input field first because the scrape below
              acts on whatever's in here. Chips below the field
              suggest plausible URLs derived from the WP host so the
              operator doesn't have to type from scratch in the
              common (cms./wp./etc.) cases. */}
          <div>
            <InputField
              label={__("Public website URL", "structura")}
              type="url"
              placeholder="https://example.com"
              value={draft.publicUrl}
              onChange={(e) => handleChange("publicUrl", e.target.value)}
            />
            <p className="mt-1.5 mb-0! text-xs text-gray-500 dark:text-gray-400">
              {__(
                "The URL readers actually visit. No trailing slash needed.",
                "structura"
              )}
            </p>
            {urlSuggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {__("Try:", "structura")}
                </span>
                {urlSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleChange("publicUrl", suggestion)}
                    className="inline-flex items-center rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs text-gray-700 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-brand-400 dark:hover:bg-brand-900/20 dark:hover:text-brand-300"
                    aria-label={sprintf(
                      // translators: %s is a public-URL suggestion (e.g. "xerx.io")
                      __("Use %s", "structura"),
                      chipLabel(suggestion),
                    )}
                  >
                    {chipLabel(suggestion)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Scrape & auto-fill — operates on the URL above. Disabled
              when the field is empty so the click never silently
              fails; the button itself is the affordance, no toast
              fallback needed. */}
          <div className="rounded-xl border border-dashed border-gray-300 p-4 dark:border-gray-700">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-xl">
                <p className="m-0! text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {__("Scrape & auto-fill", "structura")}
                </p>
                <p className="mt-1! mb-0! text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {__(
                    "Visits the URL above, reads the homepage and nav, and proposes description + key pages. Review before saving.",
                    "structura"
                  )}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleQuickSetupClick}
                disabled={
                  quickSetup.isPending || draft.publicUrl.trim() === ""
                }
              >
                {quickSetup.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-4 w-4" />
                )}
                {__("Auto-fill from this URL", "structura")}
              </Button>
            </div>
          </div>

          {/* Description */}
          <div>
            <TextArea
              label={__("Description", "structura")}
              placeholder={__(
                "A short paragraph describing what your site is for…",
                "structura"
              )}
              rows={3}
              maxLength={600}
              value={draft.description}
              onChange={(e) => handleChange("description", e.target.value)}
            />
            <p className="mt-1.5 mb-0! text-xs text-gray-500 dark:text-gray-400">
              {__(
                "Optional brand summary used as a fallback when AI grounding can't reach your homepage. ≤ 600 characters.",
                "structura"
              )}
            </p>
          </div>

          {/* Key pages */}
          <div>
            <p className="m-0! mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              {__("Key pages", "structura")}
            </p>
            <p className="m-0! mb-3 text-xs text-gray-500 dark:text-gray-400">
              {__(
                "High-value non-blog pages used for internal links and AI context. Up to 8 entries.",
                "structura"
              )}
            </p>
            <KeyPagesEditor
              pages={draft.keyPages}
              onChange={(keyPages) => handleChange("keyPages", keyPages)}
            />
          </div>

          {/* Permalink strategy — "Inherit" is filtered out in headless
              mode because it's semantically contradictory (operator just
              said the public site lives elsewhere, then asks us to emit
              the WP permalink anyway). Plugin-side reader coerces any
              stored `inherit` value to `prefixSwap` for headless installs;
              filtering the option here just prevents the contradiction
              from being re-saved going forward. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              {(() => {
                const visibleOptions = STRATEGY_OPTIONS.filter(
                  (opt) => opt.value !== "inherit",
                );
                return (
                  <Select
                    value={draft.permalinkStrategy}
                    onValueChange={(val) =>
                      handleChange("permalinkStrategy", val as PermalinkStrategy)
                    }
                    options={visibleOptions}
                  >
                    <Select.Label>{__("Post URL pattern", "structura")}</Select.Label>
                    <Select.Trigger />
                    <Select.Content>
                      {visibleOptions.map((opt) => (
                        <Select.Item key={opt.value} value={opt.value}>
                          {opt.label}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                );
              })()}
            </div>
            <div>
              <InputField
                label={__("Default language for URLs", "structura")}
                placeholder="en"
                value={draft.defaultPermalinkLang}
                onChange={(e) => handleChange("defaultPermalinkLang", e.target.value)}
              />
              <p className="mt-1.5 mb-0! text-xs text-gray-500 dark:text-gray-400">
                {__(
                  "Used when {lang} is in the URL pattern. Defaults to the WP site language.",
                  "structura"
                )}
              </p>
            </div>
          </div>

          {draft.permalinkStrategy === "template" && (
            <div>
              <InputField
                label={__("Custom template", "structura")}
                placeholder="/{lang}/blog/{slug}"
                value={draft.permalinkTemplate}
                onChange={(e) => handleChange("permalinkTemplate", e.target.value)}
              />
              <p className="mt-1.5 mb-0! text-xs text-gray-500 dark:text-gray-400">
                {__(
                  "Tokens: {slug}, {lang}, {year}, {month}. Anchored against your public URL unless the template starts with https://.",
                  "structura"
                )}
              </p>
            </div>
          )}
        </div>
      )}

      <QuickSetupConfirmModal
        open={quickSetupOpen}
        proposal={proposal}
        willOverwrite={willOverwriteOnQuickSetup}
        loading={quickSetup.isPending}
        onApply={handleApplyProposal}
        onClose={() => setQuickSetupOpen(false)}
      />

      {/* Docs link — anchored at the bottom of the card so it's
          always discoverable but doesn't compete with the headless
          toggle for attention. The walkthrough at /using/headless-mode
          covers Quick setup, key pages, permalink patterns, and the
          IndexNow keyfile follow-up that headless installs need. */}
      <div className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <a
          href={docsUrl("using/headless-mode")}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline dark:text-gray-400 dark:hover:text-gray-200"
        >
          {__("Read the headless-mode guide", "structura")}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </Card>
  );
};
