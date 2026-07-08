import { useState } from "react";
import { __ } from "@wordpress/i18n";
import {
  Activity,
  ArrowRight,
  Award,
  BookOpen,
  ExternalLink,
  Key,
  MessageSquare,
  ShieldCheck,
  UserCircle,
  Users,
  Zap,
} from "lucide-react";
import { Badge, Button, Card, Checkbox, cn, ConfirmDialog, InputField, Tooltip } from "@structura/ui";
import { useLicense } from "@/features/settings";
import { buildMarketingPricingUrl, buildPortalSignupUrl } from "@/utils/portalLinks";
import { formatPlanLabel } from "@/utils/planLabel";
import { PageContainer } from "@/components/Layout/PageContainer";
import { AddonsSection } from "../components/AddonsSection";
import { WorkspaceMembershipCard } from "../components/WorkspaceMembershipCard";
import { docsUrl } from "@/utils/docsUrl";
import { type PlanId } from "@structura/types";

export const Account = () => {
  const {
    isLicensed,
    plan,
    audience,
    license,
    cloudStatus,
    entitlements,
    graceperiods,
    activate,
    deactivate,
    processing,
  } = useLicense();

  const [licenseKeyInput, setLicenseKeyInput] = useState("");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  // Opt-in hard remove — off by default (a plain disconnect is reversible).
  const [purge, setPurge] = useState(false);

  // Status mapping aligned with the new HTML Design
  const statusConfig = {
    none: {
      title: __("Anonymous Mode", "structura"),
      desc: __(
        "Connect a free account to unlock Headings, Featured Images, and Scheduled tasks.",
        "structura"
      ),
      icon: <UserCircle className="h-7 w-7" />,
      theme: "text-neutral-600 bg-neutral-50 ring-neutral-100",
    },
    free: {
      title: __("Registered Architect", "structura"),
      desc: __(
        "Your account is connected. Upgrade to Pro for high-authority SEO rules and bulk synthesis.",
        "structura"
      ),
      icon: <Activity className="h-7 w-7" />,
      theme:
        "text-emerald-600 bg-emerald-50 ring-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/30 dark:ring-emerald-900/50",
    },
    pro: {
      title: __("Pro Architect", "structura"),
      desc: __(
        "All systems operational. You have full access to the Structura ecosystem.",
        "structura"
      ),
      icon: <Award className="h-7 w-7" />,
      theme:
        "text-brand-600 bg-brand-50 ring-brand-100 dark:text-brand-400 dark:bg-brand-950/30 dark:ring-brand-900/50",
    },
    cloud: {
      title: __("Cloud Architect", "structura"),
      desc: __(
        "Fully managed AI — no API keys required. Maximum output, zero maintenance.",
        "structura"
      ),
      icon: <Zap className="h-7 w-7" />,
      theme:
        "text-violet-600 bg-violet-50 ring-violet-100 dark:text-violet-400 dark:bg-violet-950/30 dark:ring-violet-900/50",
    },
    // Agency: top-tier managed plan with per-post model swaps and bundled
    // Channels. Uses amber to distinguish from Cloud's violet in the
    // dashboard — see specs/design-guide.md on premium-tier accents.
    agency: {
      title: __("Agency Architect", "structura"),
      desc: __(
        "Top-tier AI models, per-post model swaps, bundled Channels distribution, and volume pricing across your whole roster.",
        "structura"
      ),
      icon: <Award className="h-7 w-7" />,
      theme:
        "text-amber-600 bg-amber-50 ring-amber-100 dark:text-amber-400 dark:bg-amber-950/30 dark:ring-amber-900/50",
    },
  };

  // Agency is a distinct hero card so subscribers see the tier they pay
  // for reflected in-product; Cloud and Agency share the "managed" badge
  // semantics elsewhere via isManagedPlan().
  //
  // We branch on `plan` directly (same source the License Activation badge
  // and the nav use) rather than on `isPaidLicense`. `isPaidLicense` also
  // requires a successful cloud heartbeat, so for Agency/Cloud sites where
  // the heartbeat hasn't resolved yet — or where the locally stored
  // `license.is_pro` flag is stale after a recent upgrade — the hero would
  // otherwise flash the free-tier "Registered Architect" copy with an
  // "Upgrade to Pro" blurb while the badge already says AGENCY PLAN. Using
  // `plan` keeps every surface on the account page telling the same story.
  const paidPlan =
    (plan as PlanId) === "cloud_pro" ||
    (plan as PlanId) === "cloud" ||
    (plan as PlanId) === "byok";

  const currentStatus =
    (plan as PlanId) === "cloud_pro"
      ? statusConfig.agency
      : (plan as PlanId) === "cloud"
        ? statusConfig.cloud
        : (plan as PlanId) === "byok"
          ? statusConfig.pro
          : isLicensed
            ? statusConfig.free
            : statusConfig.none;

  return (
    <>
      <PageContainer variant="narrow" className="space-y-10">
        {/* HEADER SECTION */}
        <header className="mb-10">
          <h1 className="m-0! text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            {__("Account & License", "structura")}
          </h1>
          <p className="mt-1! mb-0! text-xs font-bold tracking-[0.2em] text-gray-400 uppercase dark:text-gray-500">
            {__("Manage your Structura identity and subscription tier", "structura")}
          </p>
        </header>

        <div className="space-y-6">
          {/* TIER HERO CARD */}
          <Card className="p-8! shadow-sm">
            <div className="mb-8 flex items-start gap-5">
              <div className={cn("rounded-xl p-3 ring-1 transition-colors", currentStatus.theme)}>
                {currentStatus.icon}
              </div>
              <div>
                <h2 className="mt-0! mb-1! text-lg leading-none font-bold text-gray-900 dark:text-white">
                  {currentStatus.title}
                </h2>
                <p className="m-0! max-w-md text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  {currentStatus.desc}
                </p>
              </div>
            </div>

            {/* Visual Progress Bar (Micro-interaction)
                Two-segment journey: connect → upgrade. The second segment
                is tinted to match the current paid tier so Agency users see
                amber (not brand-blue) and Cloud users see violet, mirroring
                the hero card's tier accent. Keyed off `plan` — same source
                as the hero copy — so the two never disagree while the cloud
                heartbeat is in flight. */}
            <div className="flex items-center gap-3 px-1">
              <div
                className={cn(
                  "h-2 flex-1 rounded-full transition-colors duration-500",
                  isLicensed ? "bg-emerald-500" : "bg-gray-200 dark:bg-neutral-800"
                )}
              />
              <ArrowRight size={12} className="text-gray-300 dark:text-gray-700" />
              <div
                className={cn(
                  "h-2 flex-[1.5] rounded-full transition-colors duration-500",
                  (plan as PlanId) === "cloud_pro"
                    ? "bg-amber-500"
                    : (plan as PlanId) === "cloud"
                      ? "bg-violet-500"
                      : (plan as PlanId) === "byok"
                        ? "bg-brand-500"
                        : "bg-gray-200 dark:bg-neutral-800"
                )}
              />
            </div>
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
                  {__("Unlock pro features and boost your organic traffic!", "structura")}
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
                    className="text-brand-600 dark:text-brand-400 ml-1 font-bold hover:underline"
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
                      {formatPlanLabel(plan, audience)}
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

                {/* Manage account opens the customer portal (billing,
                    subscription, site activations). Shown for every
                    connected account — free and paid alike — since the
                    header dropdown is the only other route to it. */}
                <div className="flex items-center gap-3">
                  <Button asChild variant="secondary">
                    <a
                      href={buildPortalSignupUrl({
                        intent: "manage_account",
                        domain:
                          typeof window !== "undefined"
                            ? window.location.hostname
                            : undefined,
                        plan,
                      })}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="size-4" />
                      <span className="ml-2">{__("Manage account", "structura")}</span>
                    </a>
                  </Button>
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
            "Erases everything we store for this site — it can't be restored. If this is your only site, your shared personas, AI keys and presets are deleted too.",
            "structura"
          )}
          checked={purge}
          onChange={setPurge}
        />
      </ConfirmDialog>
    </>
  );
};
