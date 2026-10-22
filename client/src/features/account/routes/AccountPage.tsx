import { useId, useState } from "react";
import { __, _n, sprintf } from "@wordpress/i18n";
import {
  AlertCircle,
  BookOpen,
  ExternalLink,
  Key,
  MessageSquare,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  InputField,
  ProgressBar,
  Skeleton,
  Tooltip,
} from "@structura/ui";
import { useLicense } from "@/features/settings";
import {
  buildMarketingPricingUrl,
  buildPortalSignupUrl,
  type PortalIntent,
} from "@/utils/portalLinks";
import { formatPlanName } from "@/utils/planLabel";
import {
  managedPostsUsage,
  selectOwnActivationUsage,
  useUsageAnalytics,
  type CycleUsageView,
  type ManagedActivationUsage,
} from "@/features/dashboard/api/useUsageAnalytics";
import { resolveIntlLocale } from "@/features/channels/components/SearchPerformanceSection";
import { PageContainer } from "@/components/Layout/PageContainer";
import { AddonsSection } from "../components/AddonsSection";
import { WorkspaceMembershipCard } from "../components/WorkspaceMembershipCard";
import { docsUrl } from "@/utils/docsUrl";
import { type PlanId } from "@structura/types";

type ManagedCycle = Extract<CycleUsageView, { kind: "managed" }>;

/** Returns the activation id the plugin config names, when it does. */
function ownActivationId(): string | undefined {
  return typeof window !== "undefined" ? window.structuraConfig?.activation_id : undefined;
}

/**
 * Returns this site's Cloud posts per month, as the license sets it, from the
 * cycle-usage view the dashboard already reads. Null until it loads, off a
 * managed plan, or on a cloud older than the posts quota (2026-10-01).
 */
export function cloudPostsPerSite(cycle: CycleUsageView | null | undefined): number | null {
  if (!cycle || cycle.kind !== "managed") return null;
  // Every site on a license shares its cap, so any row answers when this
  // site's row cannot be matched (plugin builds without `activation_id`).
  const row = selectOwnActivationUsage(cycle, ownActivationId()) ?? cycle.activations[0];
  return typeof row?.postsIncluded === "number" ? row.postsIncluded : null;
}

/**
 * Returns this site's row of the managed cycle view. Null when the row
 * cannot be matched on a workspace with several sites, where another
 * site's numbers would read as this site's.
 */
export function ownManagedUsage(cycle: ManagedCycle): ManagedActivationUsage | null {
  return (
    selectOwnActivationUsage(cycle, ownActivationId()) ??
    (cycle.activations.length === 1 ? cycle.activations[0] : null)
  );
}

/** Returns the reset date in the admin's language, in UTC like the monthly allowance. */
function formatResetDate(ms: number): string {
  return new Intl.DateTimeFormat(resolveIntlLocale(), {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(ms));
}

/** One allowance as a caption over a bar that the caption names. */
const UsageMeter = ({ used, total, label }: { used: number; total: number; label: string }) => {
  const labelId = useId();
  return (
    <div className="min-w-0">
      <p id={labelId} className="m-0! text-xs font-semibold text-gray-700 dark:text-gray-200">
        {label}
      </p>
      <ProgressBar
        value={used}
        max={total}
        intent={used >= total ? "warning" : "brand"}
        aria-labelledby={labelId}
        className="mt-1.5"
      />
    </div>
  );
};

/** "Resets Nov 1, 2026 · UTC" under the usage. */
const ResetLine = ({ at }: { at: number }) => (
  <p className="mt-4! mb-0! text-xs text-gray-500 dark:text-gray-400">
    {sprintf(
      /* translators: %s: date this site's monthly allowance resets, e.g. "Nov 1, 2026". */
      __("Resets %s · UTC", "structura"),
      formatResetDate(at)
    )}
  </p>
);

/**
 * This site's usage this month (specs/in-portal-billing-design.md §6): posts
 * and images against the allowance on Cloud, counts on BYOK. Loading and
 * unreadable usage say so instead of showing a zero. The cycle view sends no
 * video counts, so video is not shown here.
 */
const SiteUsage = ({ usage }: { usage: ReturnType<typeof useUsageAnalytics> }) => {
  if (usage.isLoading) {
    return (
      <div role="status" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <span className="sr-only">{__("Loading this month's usage…", "structura")}</span>
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
    );
  }
  const cycle = usage.data?.cycleUsage ?? null;
  if (cycle?.kind === "managed") {
    const row = ownManagedUsage(cycle);
    const posts = row ? managedPostsUsage(row) : null;
    if (row && posts) {
      return (
        <div className="mt-6">
          <div
            role="group"
            aria-label={__("This month's usage", "structura")}
            className="grid grid-cols-1 gap-4 sm:grid-cols-3"
          >
            <UsageMeter
              used={posts.postsUsed}
              total={posts.postsIncluded}
              label={sprintf(
                /* translators: 1: posts delivered to this site this month, 2: posts included per month. */
                _n("%1$d of %2$d post delivered", "%1$d of %2$d posts delivered", posts.postsIncluded, "structura"),
                posts.postsUsed,
                posts.postsIncluded
              )}
            />
            {row.imagesIncluded > 0 && (
              <UsageMeter
                used={row.imagesUsed}
                total={row.imagesIncluded}
                label={sprintf(
                  /* translators: 1: images delivered to this site this month, 2: images included per month. */
                  _n("%1$d of %2$d image", "%1$d of %2$d images", row.imagesIncluded, "structura"),
                  row.imagesUsed,
                  row.imagesIncluded
                )}
              />
            )}
          </div>
          <ResetLine at={cycle.cycleResetsAt} />
        </div>
      );
    }
  }
  if (cycle?.kind === "byok") {
    return (
      <div className="mt-6">
        <div
          role="group"
          aria-label={__("This month's usage", "structura")}
          className="grid grid-cols-1 gap-2 text-xs font-semibold text-gray-700 sm:grid-cols-3 dark:text-gray-200"
        >
          <p className="m-0!">
            {sprintf(
              /* translators: %d: posts delivered to this site this month. */
              _n("%d post delivered this month", "%d posts delivered this month", cycle.postsUsed, "structura"),
              cycle.postsUsed
            )}
          </p>
          <p className="m-0!">
            {sprintf(
              /* translators: %d: images delivered to this site this month. */
              _n("%d image this month", "%d images this month", cycle.imagesUsed, "structura"),
              cycle.imagesUsed
            )}
          </p>
        </div>
        <ResetLine at={cycle.cycleResetsAt} />
      </div>
    );
  }
  return (
    <p className="mt-6! mb-0! text-sm text-gray-500 dark:text-gray-400">
      {__("This month's usage is not available right now.", "structura")}
    </p>
  );
};

export const Account = () => {
  const {
    isLicensed,
    plan,
    status,
    license,
    cloudStatus,
    entitlements,
    graceperiods,
    workspace,
    activate,
    deactivate,
    processing,
  } = useLicense();

  // One Cloud card for every volume option since 2026-10-12; the posts
  // number comes from the license, not the plan id.
  const isCloud = (plan as PlanId) === "cloud";
  const usage = useUsageAnalytics();
  const cloudPosts = isCloud ? cloudPostsPerSite(usage.data?.cycleUsage) : null;

  const [licenseKeyInput, setLicenseKeyInput] = useState("");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  // Opt-in hard remove — off by default (a plain disconnect is reversible).
  const [purge, setPurge] = useState(false);

  // We branch on `plan` directly (same source the License Activation badge
  // and the nav use) rather than on `isPaidLicense`. `isPaidLicense` also
  // requires a successful cloud heartbeat, so for Cloud sites
  // where the heartbeat hasn't resolved yet — or where the locally stored
  // `license.is_pro` flag is stale after a recent upgrade — the hero would
  // otherwise flash the Free copy while the badge already says the paid
  // tier. Using `plan` keeps every surface on the account page telling
  // the same story.
  const paidPlan = isCloud || (plan as PlanId) === "byok";
  // Only the heartbeat says a payment failed; a transport error reads as
  // "active" (useLicense), so a cloud blip never shows this variant. The
  // heartbeat does not say who pays, so the copy sends everyone to the
  // portal, which decides (specs/in-portal-billing-design.md §6).
  const paymentAttention = status === "past_due" || status === "unpaid";
  // An inactive license (plan "none" with a key) still reaches the portal.
  const connected = isLicensed || Boolean(license.masked_key);

  const domain = typeof window !== "undefined" ? window.location.hostname : undefined;
  const returnTo = typeof window !== "undefined" ? window.location.href : undefined;
  /** Returns the portal link for a hero button; billing intents also name the site's workspace. */
  const portalLink = (intent: PortalIntent) =>
    buildPortalSignupUrl({
      intent,
      domain,
      plan,
      returnTo,
      workspaceId: intent === "manage_account" ? undefined : workspace?.id,
    });

  const heroTitle = isLicensed ? formatPlanName(plan, cloudPosts) : __("Anonymous Mode", "structura");
  const heroDescription = isCloud
    ? __("Managed AI for this site. Your monthly allowance includes research, writing and images.", "structura")
    : (plan as PlanId) === "byok"
      ? __("This site writes with your own AI provider key. The provider bills that usage directly.", "structura")
      : isLicensed
        ? __("Your account is connected. Upgrade for high-authority SEO rules and bulk synthesis.", "structura")
        : __(
            "Connect a free account to unlock Headings, Featured Images, and Scheduled tasks.",
            "structura"
          );

  return (
    <>
      <PageContainer variant="narrow" className="space-y-10">
        {/* HEADER SECTION */}
        <header className="mb-10">
          <h1 className="m-0! text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            {__("Account & License", "structura")}
          </h1>
          <p className="mt-1! mb-0! text-sm text-gray-500 dark:text-gray-400">
            {__("Your plan and usage for this site.", "structura")}
          </p>
        </header>

        <div className="space-y-6">
          {/* PAYMENT ATTENTION — the heartbeat reports a failed payment
              (specs/in-portal-billing-design.md §6). The portal's billing
              page takes the card update and the open invoice. */}
          {paymentAttention && (
            <Alert variant="warning" role="status">
              <AlertCircle />
              <Alert.Title>{__("Your payment needs attention", "structura")}</Alert.Title>
              <Alert.Description>
                {__(
                  "We could not collect your latest payment. Update your payment method, then check the outstanding invoice.",
                  "structura"
                )}
              </Alert.Description>
              <Alert.Action>
                {/* A button, not a link: an Alert recolours every link inside
                    it, and its `.button` opt-out is wp-admin's own button class. */}
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => window.open(portalLink("fix_payment"), "_blank", "noopener,noreferrer")}
                >
                  {__("Fix payment in customer portal", "structura")}
                  <ExternalLink className="ml-2 size-4" />
                </Button>
              </Alert.Action>
            </Alert>
          )}

          {/* PLAN HERO — the plan as the portal names it, this site's usage
              this month, and the way to the customer portal. Buttons only
              navigate; the portal checks who may change billing. */}
          <Card className="p-8! shadow-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {/* `!` on the colours too: wp-admin's own heading colour wins otherwise. */}
              <h2 className="m-0! text-2xl leading-tight font-bold tracking-tight text-gray-900! dark:text-white!">
                {heroTitle}
              </h2>
              {paidPlan &&
                (paymentAttention ? (
                  <Badge intent="warning">{__("Payment overdue", "structura")}</Badge>
                ) : status === "active" ? (
                  <Badge intent="success">{__("Active", "structura")}</Badge>
                ) : null)}
            </div>
            <p className="mt-2! mb-0! max-w-xl text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              {heroDescription}
            </p>

            {paidPlan && <SiteUsage usage={usage} />}

            {/* Anonymous installs saw a description of what a free account
                unlocks but NO way to get one — the page's only affordance
                was a license-key field they can't fill (Yurii, 2026-09-03).
                Primary CTA opens portal signup carrying the site's domain
                so the claim flow can promote this shadow workspace. */}
            {!isLicensed && (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button
                  href={buildPortalSignupUrl({
                    intent: "general_upgrade",
                    domain:
                      typeof window !== "undefined" ? window.location.hostname : undefined,
                    plan,
                  })}
                  target="_blank"
                  rel="noreferrer"
                >
                  {__("Create Free Account", "structura")}
                </Button>
                <Button
                  variant="secondary"
                  href={buildMarketingPricingUrl({
                    intent: "general_upgrade",
                    domain:
                      typeof window !== "undefined" ? window.location.hostname : undefined,
                    plan,
                  })}
                  target="_blank"
                  rel="noreferrer"
                >
                  {__("View Plans", "structura")}
                </Button>
              </div>
            )}

            {/* Manage account was in License Activation until 2026-10-21;
                the hero holds it now, as in the billing design. The primary
                action comes first in the DOM, so it also stacks first on a phone. */}
            {connected && (
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                {isCloud && (
                  <Button
                    href={portalLink("change_volume")}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full sm:w-auto"
                  >
                    {__("Change volume in customer portal", "structura")}
                    <ExternalLink className="ml-2 size-4" />
                  </Button>
                )}
                <Button
                  variant="secondary"
                  href={portalLink("manage_account")}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full sm:w-auto"
                >
                  {__("Manage account", "structura")}
                  <ExternalLink className="ml-2 size-4" />
                </Button>
              </div>
            )}

            {paidPlan && (
              <p className="mt-4! mb-0! text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                {__(
                  "Billing changes are made in the customer portal. You may need to sign in as the payer.",
                  "structura"
                )}
              </p>
            )}
          </Card>

          {/* PHASE 3.7 — workspace membership advisory. Self-gates
              on `activationsCount > 1`, so single-site licenses
              (the v1 common case) render nothing here. */}
          <WorkspaceMembershipCard />

          {/* LICENSE ACTIVATION / MANAGEMENT SECTION */}
          <Card className="p-8! shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <Key className="h-5 w-5 text-gray-400 dark:text-gray-600" />
              <h3 className="m-0! text-sm font-bold tracking-wider text-gray-900 uppercase dark:text-white">
                {__("License Activation", "structura")}
              </h3>
            </div>

            {!license.masked_key ? (
              <div className="space-y-4">
                <div className="flex flex-col items-end gap-3 md:flex-row">
                  <InputField
                    label={__("License Key", "structura")}
                    placeholder={!isLicensed ? "ST-XXXX-XXXX-XXXX" : "ST-PRO-XXXX-XXXX"}
                    className="flex-1 font-mono tracking-tighter"
                    value={licenseKeyInput}
                    onChange={(e) => setLicenseKeyInput(e.target.value)}
                    hiddenLabel
                  />
                  <Button
                    onClick={async () => {
                      try {
                        await activate(licenseKeyInput);
                        setLicenseKeyInput("");
                      } catch (e) {
                        /* empty */
                      }
                    }}
                    disabled={processing || !licenseKeyInput}
                    loading={processing}
                    title={
                      !licenseKeyInput
                        ? __("Paste your license key first.", "structura")
                        : undefined
                    }
                  >
                    <Zap className="size-4" />
                    <span className="ml-2">
                      {!isLicensed
                        ? __("Connect Account", "structura")
                        : __("Upgrade", "structura")}
                    </span>
                  </Button>
                </div>
                <p className="m-0! px-1 text-[10px] font-medium text-gray-400">
                  {__("No license key yet? It comes with your account.", "structura")}
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
                    className="text-brand-600 dark:text-brand-400 ml-1 font-bold hover:underline"
                  >
                    {__("Create Free Account", "structura")}
                  </a>
                  <span className="mx-1" aria-hidden>
                    ·
                  </span>
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
                    className="text-brand-600 dark:text-brand-400 font-bold hover:underline"
                  >
                    {__("View Pricing", "structura")}
                  </a>
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-between gap-6 rounded-xl border border-gray-100 bg-gray-50 p-6 md:flex-row dark:border-neutral-800 dark:bg-neutral-950/50">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="solid" intent="success">
                      {formatPlanName(plan, cloudPosts)}
                    </Badge>
                    {cloudStatus?.valid && (
                      <Tooltip title={__("Cloud Connection Verified", "structura")}>
                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                      </Tooltip>
                    )}
                  </div>
                  <code className="font-mono text-sm tracking-tighter text-gray-600 dark:text-gray-400">
                    {license?.masked_key}
                  </code>
                  {license.plan === "none" && (
                    <p className="m-0! text-xs text-gray-500 dark:text-gray-400">
                      {__(
                        "Your license is currently inactive. Please contact support if you believe this is an error.",
                        "structura"
                      )}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="danger"
                    onClick={() => setConfirmDialogOpen(true)}
                    disabled={processing}
                  >
                    {__("Disconnect", "structura")}
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* ADD-ONS FOR THIS SITE */}
          {/*
            Hidden until a license is connected — anonymous users have no
            site-scoped seats to manage, and the tier hero already routes
            them to the connect/upgrade flow.
          */}
          {isLicensed && (
            <AddonsSection
              entitlements={entitlements}
              graceperiods={graceperiods}
              domain={typeof window !== "undefined" ? window.location.hostname : ""}
              returnTo={typeof window !== "undefined" ? window.location.href : undefined}
            />
          )}

          {/* RESOURCE FOOTER CARDS */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <a
              href={docsUrl()}
              target="_blank"
              rel="noreferrer"
              className="group block no-underline"
            >
              <Card className="duration-normal hover:border-brand-300 dark:hover:border-brand-800 shadow-sm transition-all">
                <div className="flex items-start gap-4">
                  <div className="bg-brand-50 text-brand-600 duration-normal dark:bg-brand-950/30 dark:text-brand-400 rounded-xl p-3 transition-transform group-hover:scale-110">
                    <BookOpen size={20} />
                  </div>
                  <div>
                    <h4 className="m-0! text-sm font-bold text-gray-900 dark:text-white">
                      {__("Documentation", "structura")}
                    </h4>
                    <p className="m-0! mt-1! text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                      {__(
                        "Learn how to master the Architect and configure custom personas.",
                        "structura"
                      )}
                    </p>
                  </div>
                </div>
              </Card>
            </a>

            {paidPlan ? (
              <a
                href="https://www.structurawp.com/support"
                target="_blank"
                rel="noreferrer"
                className="group block no-underline"
              >
                <Card className="duration-normal shadow-sm transition-all hover:border-purple-300 dark:hover:border-purple-800">
                  <div className="flex items-start gap-4">
                    <div className="duration-normal rounded-xl bg-purple-50 p-3 text-purple-600 transition-transform group-hover:scale-110 dark:bg-purple-950/30 dark:text-purple-400">
                      <MessageSquare size={20} />
                    </div>
                    <div>
                      <h4 className="m-0! text-sm font-bold text-gray-900 dark:text-white">
                        {__("Support Portal", "structura")}
                      </h4>
                      <p className="m-0! mt-1! text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        {__(
                          "Get help from our architects if you run into any issues.",
                          "structura"
                        )}
                      </p>
                    </div>
                  </div>
                </Card>
              </a>
            ) : (
              <a
                href="https://wordpress.org/support/plugin/structura/"
                target="_blank"
                rel="noreferrer"
                className="group block no-underline"
              >
                <Card className="duration-normal shadow-sm transition-all hover:border-blue-300 dark:hover:border-blue-800">
                  <div className="flex items-start gap-4">
                    <div className="duration-normal rounded-xl bg-blue-50 p-3 text-blue-600 transition-transform group-hover:scale-110 dark:bg-blue-950/30 dark:text-blue-400">
                      <Users size={20} />
                    </div>
                    <div>
                      <h4 className="m-0! text-sm font-bold text-gray-900 dark:text-white">
                        {__("Community Forum", "structura")}
                      </h4>
                      <p className="m-0! mt-1! text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        {__("Ask the community and browse existing support topics.", "structura")}
                      </p>
                    </div>
                  </div>
                </Card>
              </a>
            )}
          </div>
        </div>
      </PageContainer>

      <ConfirmDialog
        isOpen={confirmDialogOpen}
        onClose={() => {
          setConfirmDialogOpen(false);
          setPurge(false);
        }}
        onConfirm={async () => {
          try {
            await deactivate({ purge });
            setConfirmDialogOpen(false);
            setPurge(false);
          } catch (e) {
            /* empty */
          }
        }}
        title={__("Disconnect Account", "structura")}
        description={__(
          "Are you sure? This site will revert to Anonymous Mode and all scheduled campaign work will stop. If you later activate a different license, you'll start with a fresh workspace — your existing personas, campaigns, AI keys and channel connections won't transfer over.",
          "structura"
        )}
        variant="danger"
        loading={processing}
        confirmButtonProps={{
          label: purge
            ? __("Delete permanently", "structura")
            : __("Disconnect Site", "structura"),
        }}
      >
        <Checkbox
          className="mt-4"
          label={__("Permanently delete all data for this site", "structura")}
          description={__(
            "Erases everything we store for this site — it can't be restored. Shared personas, AI keys and presets are kept.",
            "structura"
          )}
          checked={purge}
          onChange={setPurge}
        />
      </ConfirmDialog>
    </>
  );
};
