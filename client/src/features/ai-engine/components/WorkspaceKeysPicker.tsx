/**
 * Cross-site picker for workspace AI credentials. Lets the user
 * bind this site to a key already saved on a sibling site without
 * round-tripping through the customer portal — the gap the user
 * called out for AI keys parity with how visual presets and personas
 * now work.
 */

import { useEffect, useRef } from "react";
import { __ } from "@wordpress/i18n";
import { Library, Link as LinkIcon } from "lucide-react";
import { Badge, Button, Card } from "@structura/ui";

import { useBindWorkspaceKey, useWorkspaceKeysQuery, type WorkspaceCredentialView, } from "../api/useWorkspaceKeys";
import { useUpdateAiSettings } from "../api/useUpdateAiSettings";
import { useAiConnections } from "@/features/settings/api/useAiConnections";
import { useDefaultProviders } from "@/features/settings/api/useDefaultProviders";
import { getProviderVisual } from "@/features/campaigns/constants";
import { decodeEntities } from "@/utils/helpers";

/**
 * Canonical website per provider — feeds the Google S2 favicon URL
 * below. Picked the surface the provider's users land on (gemini
 * uses the consumer property at gemini.google.com, not the dev
 * console at ai.google.dev), so the favicon reads as the brand the
 * operator recognises rather than the API portal.
 */
const PROVIDER_DOMAIN: Record<string, string> = {
  openai: "openai.com",
  gemini: "gemini.google.com",
  anthropic: "anthropic.com",
};

/**
 * Build the Google S2 favicon URL for a provider. S2 caches the
 * favicon, handles redirects + bad responses, and returns a generic
 * grey globe glyph when the target has no favicon — so we don't need
 * an onError fallback. `sz=64` returns a 2x-DPI-safe asset at our
 * ~16px display size.
 *
 * Why S2 instead of e.g. simpleicons.org (which the channels catalog
 * uses for marketing entries): S2 returns the provider's ACTUAL
 * favicon, which is what Yurii asked for — "favicons from those
 * websites". simpleicons returns curated brand marks (closer to what
 * we already ship in `ProviderLogos.tsx`).
 */
const faviconFor = (provider: string): string | null => {
  const domain = PROVIDER_DOMAIN[provider];
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
};

interface WorkspaceKeysPickerProps {
  /**
   * Optional human-friendly provider names keyed by provider id.
   * Falls back to the raw provider id when unset.
   */
  providerLabels?: Record<string, string>;
}

export const WorkspaceKeysPicker = ({ providerLabels }: WorkspaceKeysPickerProps) => {
  const { data, isLoading } = useWorkspaceKeysQuery();
  const bindMutation = useBindWorkspaceKey();

  // Auto-default wiring. When binding a sibling-site key leaves this
  // site with exactly ONE connected provider, promote it to the
  // explicit text default (and image default when it can generate
  // images) so the operator doesn't have to open the provider config
  // dialog just to pick the only option that exists. We never clobber
  // an explicit choice the user already made — only fill the gap.
  const { activeProviders, imageProviders } = useAiConnections();
  const { hasExplicitTextDefault, hasExplicitImageDefault } = useDefaultProviders();
  const { mutate: updateAiSettings } = useUpdateAiSettings();
  // The provider whose bind we're waiting to see reflected in the
  // refetched connection state. A ref (not state) so setting it
  // doesn't re-render and it survives across the bind→refetch gap.
  const pendingAutoDefault = useRef<string | null>(null);

  useEffect(() => {
    const provider = pendingAutoDefault.current;
    if (!provider) return;
    // Wait until the post-bind settings refetch has landed and this
    // provider reads as connected; only then is the count meaningful.
    if (!activeProviders.includes(provider)) return;
    pendingAutoDefault.current = null;
    // Sole-provider guard — the whole point of the convenience.
    if (activeProviders.length !== 1) return;

    const defaults: Record<string, string> = {};
    if (!hasExplicitTextDefault) defaults.text_provider = provider;
    if (!hasExplicitImageDefault && imageProviders.includes(provider)) {
      defaults.image_provider = provider;
    }
    if (Object.keys(defaults).length > 0) {
      updateAiSettings({ ai: { defaults } });
    }
  }, [
    activeProviders,
    imageProviders,
    hasExplicitTextDefault,
    hasExplicitImageDefault,
    updateAiSettings,
  ]);

  const credentials = data?.credentials ?? [];
  // Show only keys NOT already bound to this site — the operator
  // can already see those in the "Your Providers" section above.
  // A workspace with one site has zero rows here, which is fine —
  // the section silently disappears.
  const candidates = credentials.filter((c) => !c.boundToCallingActivation);

  if (isLoading) return null;
  if (candidates.length === 0) return null;

  // The mutation's `variables` carries the args of the in-flight call
  // while `isPending` is true. Pre-fix we passed the whole mutation's
  // `isPending` to every row, so clicking "Use here" on one credential
  // flipped EVERY row's button into the loading state until the bind
  // resolved. Comparing variables.cred_id to the row's credId keeps the
  // loading affordance scoped to the row the user actually clicked.
  const inFlightCredId = bindMutation.isPending ? bindMutation.variables?.cred_id : undefined;

  const labelFor = (provider: string) => providerLabels?.[provider] ?? provider;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Library size={14} className="text-neutral-400" />
        <h2 className="m-0! text-[11px] font-black tracking-widest text-neutral-500 uppercase">
          {__("Use a key from this workspace", "structura")}
        </h2>
      </div>
      <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        {__(
          'Keys saved on other sites in this workspace. Click "Use here" to bind one of them to this site without re-entering the key.',
          "structura"
        )}
      </p>
      <Card className="divide-y divide-neutral-100 p-0! dark:divide-neutral-800">
        {candidates.map((c) => (
          <CandidateRow
            key={c.credId}
            credential={c}
            providerName={labelFor(c.provider)}
            // Disable every row's button while any bind is in flight
            // (the API isn't safe to fire two binds concurrently) but
            // only show the spinner on the row the user actually
            // clicked, so the other rows read as "wait" not "working".
            isBinding={inFlightCredId === c.credId}
            isAnyBinding={bindMutation.isPending}
            onBind={() =>
              bindMutation.mutate(
                { cred_id: c.credId, provider: c.provider },
                {
                  // Arm the auto-default effect for this provider; it
                  // fires once the refetched settings show it connected.
                  onSuccess: () => {
                    pendingAutoDefault.current = c.provider;
                  },
                }
              )
            }
          />
        ))}
      </Card>
    </section>
  );
};

interface CandidateRowProps {
  credential: WorkspaceCredentialView;
  providerName: string;
  /** This row's bind is the one currently in flight. */
  isBinding: boolean;
  /** Any row's bind is in flight (disables clicks across rows). */
  isAnyBinding: boolean;
  onBind: () => void;
}

const CandidateRow = ({
  credential,
  providerName,
  isBinding,
  isAnyBinding,
  onBind,
}: CandidateRowProps) => {
  // Brand color comes from PROVIDER_VISUALS (the same source-of-truth
  // the campaign config screen uses) — keeps the chip's border/text
  // tint consistent across the product. The icon now resolves to the
  // provider's website favicon via Google S2 (see `faviconFor`) so the
  // chip carries the operator's real-world brand recognition cue, with
  // a small SVG fallback for any future provider that doesn't have a
  // domain mapping yet.
  const visual = getProviderVisual(credential.provider);
  const Logo = visual.icon;
  const favicon = faviconFor(credential.provider);

  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        {/* No wrap + truncate: a long site label (e.g. a full shop name)
            otherwise wrapped the provider chip, name, and "used on N sites"
            badge onto three stacked lines, so rows had inconsistent height
            vs short-named ones. */}
        <div className="flex min-w-0 items-center gap-2">
          <span
            // Branded chip: outlined pill with the provider's brand color
            // pulled from PROVIDER_VISUALS. Border + text color tinted so
            // the chip reads as a category at a glance instead of the
            // pre-fix neutral outline that gave every provider the same
            // visual weight.
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-white/50 px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase dark:bg-neutral-900/50 ${visual.border} ${visual.color}`}
          >
            {favicon ? (
              <img
                src={favicon}
                alt=""
                width={14}
                height={14}
                className="size-3.5 rounded-sm"
                // Decorative — the provider name follows in text, so the
                // image carries no extra semantic meaning. Hide from AT.
                aria-hidden
                loading="lazy"
              />
            ) : (
              <Logo size={12} className={visual.color} />
            )}
            {providerName}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {decodeEntities(credential.label)}
          </span>
          {credential.boundActivationCount > 0 && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {/* translators: %d: number of sites */ __("Used on", "structura")}
              &nbsp;{credential.boundActivationCount}&nbsp;
              {__("site(s)", "structura")}
            </Badge>
          )}
        </div>
        {credential.maskedKey && (
          <div className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
            {credential.maskedKey}
          </div>
        )}
      </div>
      <Button size="sm" onClick={onBind} disabled={isAnyBinding} loading={isBinding}>
        <LinkIcon className="size-3.5" />
        <span className="ml-1.5">{__("Use here", "structura")}</span>
      </Button>
    </div>
  );
};
