/**
 * InstallModal — auth-type-polymorphic install flow for a catalog entry.
 *
 * Rendered when the user clicks "Install" on a CatalogEntryCard. The body of
 * the modal switches on `entry.authType`:
 *
 *   - "webhook"  → AddWebhookForm in modal variant, scoped to this one integration.
 *                  Slack + Discord are the only webhook entries today.
 *   - "oauth2"   → OAuthConnectPanel — shows a "Connect with {provider}"
 *                  button that initiates the OAuth dance. LinkedIn is the
 *                  first OAuth integration.
 *   - "apikey"   → AddCredentialForm — renders per-integration credential
 *                  fields (Telegram: bot token + chat ID; WhatsApp: phone
 *                  number ID + access token + recipient phone).
 *   - "none"     → AddCredentialForm — renders the minimal field set for
 *                  integrations with lightweight auth (email-owner: recipient
 *                  email; IndexNow: no credentials needed at all).
 *
 * Why a single modal instead of one per auth type?
 * ------------------------------------------------
 * The common chrome — entry name/icon/category/description header, close
 * affordance, sizing, keyboard/a11y via Headless UI — is identical across
 * auth types. Diverging the shell for each would duplicate 30+ lines per
 * branch. The branches are just the body slot.
 */

import { useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { useNavigate } from "react-router";
import { Alert, Button, Dialog, cn, toast } from "@structura/ui";
import { EyeOff, ExternalLink, Loader2, X } from "lucide-react";
import type { ConnectionSummary, IntegrationCatalogEntry } from "../types";
import { useChannelConnectionMutations } from "../api/useChannelConnectionMutations";
import { useSiteIndexingStatusQuery } from "../../settings/api/useSiteIndexingStatusQuery";
import { usePublicSiteProfile } from "../../settings/api/usePublicSiteProfile";
import { AddCredentialForm } from "./AddCredentialForm";
import { AddWebhookForm, type WebhookFormIntegrationOption } from "./AddWebhookForm";
import { IntegrationIcon } from "./IntegrationIcon";

interface InstallModalProps {
  entry: IntegrationCatalogEntry;
  open: boolean;
  onClose: () => void;
  /**
   * When set, the modal switches into "Edit" mode: the title reads
   * "Edit <integration>", the form is pre-populated from the connection, and
   * saving targets the same connection id (no new row). Leave undefined for
   * the default fresh-install flow.
   */
  editingConnection?: ConnectionSummary;
}

export const InstallModal = ({
  entry,
  open,
  onClose,
  editingConnection,
}: InstallModalProps) => {
  const isEdit = Boolean(editingConnection);
  const title = isEdit
    ? sprintf(
        // translators: %s is the integration name, e.g. "Edit Slack"
        __("Edit %s", "structura"),
        entry.name,
      )
    : sprintf(
        // translators: %s is the integration name, e.g. "Install Slack"
        __("Install %s", "structura"),
        entry.name,
      );

  return (
    // `size="lg"` (max-w-2xl) reads better than `md` for the install
    // flow — the IndexNow body in particular has a long verification
    // URL + download button + warning + form, and a 448px column
    // makes the modal taller than tall and wraps the URL awkwardly.
    // 672px gives the URL room to breathe in one line. (Yurii
    // feedback 2026-05-01.)
    <Dialog.Root open={open} onClose={onClose} size="lg">
      <Dialog.Content>
        {/* Top-right X — pinned to the panel rather than the header so it
            sits flush with the panel padding regardless of header height. */}
        <button
          type="button"
          onClick={onClose}
          aria-label={__("Close", "structura")}
          className="absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-200"
        >
          <X size={16} />
        </button>

        <Dialog.Header>
          <div className="flex items-center gap-3 pr-8">
            <IntegrationIcon
              integrationId={entry.id}
              iconUrl={entry.iconUrl}
              sizeClassName="size-10"
            />
            <div className="min-w-0">
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{entry.description}</Dialog.Description>
            </div>
          </div>
        </Dialog.Header>

        <Dialog.Body>
          <InstallBody
            entry={entry}
            onClose={onClose}
            editingConnection={editingConnection}
          />
        </Dialog.Body>
      </Dialog.Content>
    </Dialog.Root>
  );
};

// ---------------------------------------------------------------------------
// Auth-type branches — each renders only the body slot.
// ---------------------------------------------------------------------------

function InstallBody({
  entry,
  onClose,
  editingConnection,
}: {
  entry: IntegrationCatalogEntry;
  onClose: () => void;
  editingConnection?: ConnectionSummary;
}) {
  const navigate = useNavigate();

  // Post-install configure hand-off (video). The video install saves a
  // zero-credential connection with the cloud defaults (voice Ava, style
  // Clean); the interesting choices live in the settings modal, so we
  // reuse the OAuth landing pattern: route to the Connections page with
  // `?configure=<id>` and let its effect pop ConfigureConnectionModal.
  // Fresh installs only — edits already happen where the modal lives.
  const handleCredentialSuccess = (connection?: ConnectionSummary) => {
    onClose();
    if (
      entry.id === "video" &&
      !editingConnection &&
      connection?.connectionId
    ) {
      navigate(
        `/channels/connections?configure=${encodeURIComponent(connection.connectionId)}`,
      );
    }
  };

  switch (entry.authType) {
    case "webhook":
      return (
        <AddWebhookForm
          variant="modal"
          availableIntegrations={[webhookOptionForEntry(entry)]}
          editingConnection={editingConnection}
          onSuccess={onClose}
          onCancel={onClose}
        />
      );
    case "oauth2":
      return <OAuthConnectPanel entry={entry} onClose={onClose} />;
    case "apikey":
    case "none":
      return (
        <div className="space-y-4">
          {entry.id === "indexnow" && <IndexNowVisibilityWarning />}
          <AddCredentialForm
            entry={entry}
            editingConnection={editingConnection}
            onSuccess={handleCredentialSuccess}
            onCancel={onClose}
          />
        </div>
      );
  }
}

/**
 * Pre-install nag for IndexNow — surfaces ONLY on actual config
 * mismatches between the WP install's `blog_public` flag (Reading →
 * "Discourage search engines from indexing this site") and whether
 * the site is in headless mode.
 *
 * Two distinct misconfigurations get a warning, each with its own
 * fix; the two happy paths render nothing:
 *
 *   non-headless + WP indexable    → happy: WP IS the public site,
 *                                     IndexNow pings work normally.
 *   non-headless + WP discouraging → BAD: this is the original case;
 *                                     IndexNow pings get ignored
 *                                     because the site is noindexed.
 *   headless + WP discouraging     → happy: WP is the CMS, the
 *                                     public site lives elsewhere
 *                                     and is indexed there.
 *   headless + WP indexable        → BAD: the CMS will get indexed
 *                                     alongside the public site,
 *                                     creating duplicate content
 *                                     and splitting SEO authority.
 *
 * Pre-2026-05-01 the warning fired whenever WP discouraged indexing,
 * which alarmed every headless customer (their CMS being hidden is
 * the *expected* setup). Yurii flagged this — the alert should be
 * about real mismatches, not a blanket "this site is hidden" nag.
 */
function IndexNowVisibilityWarning() {
  const { data: indexing } = useSiteIndexingStatusQuery();
  const { data: profile } = usePublicSiteProfile();

  // Render nothing while either query is loading — avoids a flash-
  // then-retract if one resolves before the other.
  if (!indexing || !profile) return null;

  const isHeadless = profile.isHeadless;
  const isDiscouraging = indexing.discourageSearchEngines;

  // Case 1 — non-headless + WP discouraging indexing. The original
  // warning. IndexNow pings get ignored because the site is
  // explicitly telling search engines to skip it.
  if (!isHeadless && isDiscouraging) {
    return (
      <Alert variant="warning">
        <EyeOff />
        <Alert.Title>
          {__("This site is hidden from search engines", "structura")}
        </Alert.Title>
        <Alert.Description>
          <p>
            {__(
              "WordPress is currently set to discourage search engines from indexing this site, so IndexNow pings will be ignored.",
              "structura",
            )}
          </p>
          <p className="mt-2">
            {__(
              "To fix this, go to Settings → Reading and uncheck \u201cDiscourage search engines from indexing this site\u201d.",
              "structura",
            )}
          </p>
        </Alert.Description>
      </Alert>
    );
  }

  // Case 2 — headless + WP indexable. The CMS will get crawled and
  // indexed, competing with the actual public site for SEO.
  if (isHeadless && !isDiscouraging) {
    return (
      <Alert variant="warning">
        <EyeOff />
        <Alert.Title>
          {__(
            "Your WordPress install is exposed to search engines",
            "structura",
          )}
        </Alert.Title>
        <Alert.Description>
          <p>
            {__(
              "You\u2019re running in headless mode, so your public website lives elsewhere — but this WordPress install isn\u2019t currently set to discourage indexing. Search engines may crawl your CMS alongside your public site and split SEO authority between the two.",
              "structura",
            )}
          </p>
          <p className="mt-2">
            {__(
              "To fix this, go to Settings → Reading and check \u201cDiscourage search engines from indexing this site\u201d.",
              "structura",
            )}
          </p>
        </Alert.Description>
      </Alert>
    );
  }

  // Both happy paths — no warning.
  return null;
}

/**
 * OAuth connect panel — shows a "Connect with {provider}" button and a brief
 * explanation of what happens. Clicking the button calls the WP REST proxy
 * to get the authorize URL, then redirects the browser to it. After the user
 * authorizes, the cloud callback endpoint persists the connection and
 * redirects back to wp-admin.
 */
function OAuthConnectPanel({
  entry,
  onClose,
}: {
  entry: IntegrationCatalogEntry;
  onClose: () => void;
}) {
  const { initOAuth } = useChannelConnectionMutations();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Posting-target choice. LinkedIn is the only OAuth integration that can
  // post to a company Page (the scope is requested before the redirect, so
  // the choice has to live here, not in the post-connect Configure modal —
  // which only refines *which* Page). Gate on the id, mirroring the
  // `supportsFeaturedImage` pattern in ConfigureConnectionModal.
  const supportsCompanyPage = entry.id === "linkedin";
  const [postAsOrg, setPostAsOrg] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const result = await initOAuth({
        integrationId: entry.id,
        postAsOrg: supportsCompanyPage && postAsOrg,
      });
      if (result.authorizeUrl) {
        // Redirect the browser to the provider's authorization page.
        // The user will be redirected back to wp-admin after authorization.
        window.location.href = result.authorizeUrl;
      } else {
        setError(__("Failed to get authorization URL. Please try again.", "structura"));
        setIsConnecting(false);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : __("Connection failed.", "structura");
      setError(message);
      setIsConnecting(false);
      toast.error(message);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        {sprintf(
          // translators: %s is the integration name, e.g. "LinkedIn"
          __(
            "Click the button below to connect your %s account. You\u2019ll be redirected to authorize Structura, then brought back here automatically.",
            "structura",
          ),
          entry.name,
        )}
      </p>

      {supportsCompanyPage && (
        // Explicit choice rather than a single opt-in toggle: posting as a
        // Page vs. a personal profile flips which LinkedIn app (and scopes)
        // the OAuth uses, and the old toggle was easy to skip \u2014 leaving users
        // unable to post to their company Page without reconnecting. Mirrors
        // the portal connect dialog.
        <div>
          <span className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-200">
            {__("How should Structura post?", "structura")}
          </span>
          <div
            role="radiogroup"
            aria-label={__("Posting target", "structura")}
            className="space-y-2"
          >
            {(
              [
                { org: false, label: __("Your personal profile", "structura") },
                {
                  org: true,
                  label: __("A company Page you manage", "structura"),
                },
              ] as const
            ).map((opt) => {
              const checked = opt.org === postAsOrg;
              return (
                <label
                  key={opt.label}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                    checked
                      ? "border-brand-500 bg-brand-50 text-neutral-900 dark:border-brand-400 dark:bg-brand-950/40 dark:text-neutral-100"
                      : "border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-600",
                  )}
                >
                  {/* appearance-none overrides wp-admin's native radio styling
                      so the control stays on-brand inside the SPA; m-0! resets
                      the WP global input margin. */}
                  <input
                    type="radio"
                    name="linkedin-post-as"
                    checked={checked}
                    onChange={() => setPostAsOrg(opt.org)}
                    className="m-0! size-4 shrink-0 appearance-none rounded-full border border-neutral-300 bg-white checked:border-brand-600 checked:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 dark:border-neutral-600 dark:bg-neutral-800 dark:checked:border-brand-500 dark:checked:bg-brand-500"
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex items-center justify-between gap-2">
        {entry.docsUrl ? (
          <Button
            variant="link"
            size="sm"
            href={entry.docsUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={14} className="mr-1.5" />
            {__("Read the docs", "structura")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {__("Cancel", "structura")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting && (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            )}
            {sprintf(
              // translators: %s is the integration name, e.g. "LinkedIn"
              __("Connect %s", "structura"),
              entry.name,
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Per-integration placeholder hints for the webhook form. Slack and Discord
 * use different webhook URL shapes — showing the wrong host in the placeholder
 * (e.g. hooks.slack.com when installing Discord) is actively misleading, so
 * we tailor both the URL and channel-name hints per integration id.
 *
 * Falls back to generic-but-not-wrong copy for any future webhook integration
 * we haven't special-cased yet.
 */
function webhookOptionForEntry(
  entry: IntegrationCatalogEntry,
): WebhookFormIntegrationOption {
  // Placeholders deliberately read as *hints* ("e.g. …") rather than
  // channel-name-looking strings — earlier copy used literal `#deploys` /
  // `#general`, which users mistook for default/auto-filled values (several
  // reports of someone leaving the field alone assuming it was already
  // wired). The "e.g." prefix + a descriptive suffix keeps the hint's
  // purpose explicit while still showing what a realistic value looks like.
  if (entry.id === "discord-webhook") {
    return {
      id: entry.id,
      label: entry.name,
      webhookUrlPlaceholder: "https://discord.com/api/webhooks/…",
      displayNamePlaceholder: __("e.g. #general channel", "structura"),
    };
  }
  if (entry.id === "slack-webhook") {
    return {
      id: entry.id,
      label: entry.name,
      webhookUrlPlaceholder: "https://hooks.slack.com/services/…",
      displayNamePlaceholder: __("e.g. #deploys channel", "structura"),
    };
  }
  if (entry.id === "webhook-ping") {
    // Generic signed webhook — any HTTPS endpoint. Canonical first use case
    // is a headless-WP revalidator; the hint shows that shape while staying
    // obviously user-replaceable.
    return {
      id: entry.id,
      label: entry.name,
      webhookUrlPlaceholder: "https://example.com/api/revalidate",
      displayNamePlaceholder: __("e.g. Next.js revalidator", "structura"),
      requireSigningSecret: true,
    };
  }
  return { id: entry.id, label: entry.name };
}

