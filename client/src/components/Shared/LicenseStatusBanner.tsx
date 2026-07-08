import { FC } from "react";
import { __ } from "@wordpress/i18n";
import { Alert, AlertProps, Button } from "@structura/ui";
import { AlertTriangle, CreditCard, ExternalLink, XCircle } from "lucide-react";
import { useLicense } from "@/features/settings";
import { buildPortalSignupUrl } from "@/utils/portalLinks";

export const LicenseStatusBanner: FC = () => {
  const { isPaidLicense, status, plan } = useLicense();

  if (!isPaidLicense || ["none", "active"].includes(status)) {
    return null;
  }

  // Configuration for different license "trouble" states
  const config = {
    past_due: {
      variant: "warning" as AlertProps["variant"],
      icon: <CreditCard />,
      title: __("Payment Required", "structura"),
      description: __(
        "We couldn't process your last subscription payment. Please update your billing information to avoid service interruption.",
        "structura"
      ),
      actionLabel: __("Update Billing", "structura"),
    },
    expired: {
      variant: "error" as AlertProps["variant"],
      icon: <AlertTriangle />,
      title: __("License Expired", "structura"),
      description: __(
        "Your Pro features are currently locked. Renew your subscription to resume AI synthesis and campaign scheduling.",
        "structura"
      ),
      actionLabel: __("Renew License", "structura"),
    },
    canceled: {
      variant: "error" as AlertProps["variant"],
      icon: <XCircle />,
      title: __("Subscription Canceled", "structura"),
      description: __(
        "Your subscription has been canceled. You can still access your data, but Pro features are disabled.",
        "structura"
      ),
      actionLabel: __("View Plans", "structura"),
    },
    revoked: {
      variant: "error" as AlertProps["variant"],
      icon: <XCircle />,
      title: __("License Revoked", "structura"),
      description: __(
        "This license has been disabled due to a security flag or refund. Contact support if you believe this is an error.",
        "structura"
      ),
      actionLabel: __("Contact Support", "structura"),
    },
  };

  const current = config[status as keyof typeof config] || config.expired;

  return (
    <div className="mb-6">
      <Alert variant={current.variant}>
        {current.icon}
        <Alert.Title>{current.title}</Alert.Title>
        <Alert.Description>{current.description}</Alert.Description>
        <Alert.Action>
          <Button size="sm" variant="secondary" asChild>
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
              {current.actionLabel}
              <ExternalLink size={14} />
            </a>
          </Button>
        </Alert.Action>
      </Alert>
    </div>
  );
};
