import { FC, useEffect, useRef, useState } from "react";
import { _x, sprintf } from "@wordpress/i18n";
import {
  InlineAdvice,
  type InlineAdviceHandle,
  type InlineAdviceSecondaryAction,
} from "@structura/ui";
import { adviceFor, type AdviceAction } from "@structura/model-catalog";
import { isManagedPlan, type PlanId } from "@structura/types";

import { useAiSettingsQuery } from "@/features/ai-engine";
import { ProviderSetupWizard } from "@/features/ai-engine/components/ProviderSetupWizard";
import { useAiConnections, useLicense } from "@/features/settings";
import { planHasImageGeneration } from "@/features/ai-engine/helpers";
import { buildPortalSignupUrl } from "@/utils/portalLinks";
import { ADVICE_PROVIDER_NAMES, recommendedTextTier } from "@/features/campaigns/aiGuidance";
import type { AIProvider } from "@/features/campaigns/types";
import type { ModelTier } from "@/features/campaigns/modelTier";

export interface ProviderAdviceProps {
  /** The text provider the campaign or post currently writes with. */
  provider: AIProvider;
  /**
   * Applies a Switch: the caller sets the text provider and its tier (and
   * whatever goes with them, e.g. clearing an equal fallback) and returns a
   * function that restores the previous values and moves focus to the text
   * provider control.
   */
  onSwitch: (to: AIProvider, tier: ModelTier) => () => void;
  /** True when the advice is hidden for this campaign and this provider. */
  hidden?: boolean;
  /** Hides the advice. Without it there is no × (the generate page has none). */
  onHide?: () => void;
  /** Shows the hidden advice again. */
  onShow?: () => void;
  /** Classes for the outer wrapper, rendered only when the slot shows something. */
  className?: string;
}

/** The lead and reason sentences, read together by screen readers. */
const lead = () => _x("Gemini isn’t recommended for writing.", "ai advice", "structura");
const reason = () =>
  _x("In our tests, its posts contained more invented details.", "ai advice", "structura");

/** Returns the translated label of one advice action. */
const actionLabel = (action: AdviceAction): string => {
  switch (action.label) {
    case "aiAdvice.switchTo":
      return sprintf(
        /* translators: %s: AI provider name, e.g. "Claude". */
        _x("Switch to %s", "ai advice", "structura"),
        ADVICE_PROVIDER_NAMES[(action as { provider: AIProvider }).provider]
      );
    case "aiAdvice.connectAnthropicOrOpenai":
      return _x("Connect a Claude or OpenAI key", "ai advice", "structura");
    case "aiAdvice.connectAnthropicForBest":
      return _x("Connect Claude for the best results", "ai advice", "structura");
    case "aiAdvice.upgradeCloud":
      return _x("Upgrade to Cloud, where we run the AI", "ai advice", "structura");
  }
};

/**
 * The provider advice for own-key plans (anonymous, Free, BYOK) in wp-admin: an `InlineAdvice`
 * driven by the shared `adviceFor` resolver, shown when the text provider is
 * a caution provider (Gemini). Managed plans never see it.
 *
 * - Switch calls `onSwitch` with the provider's recommended tier, shows the
 *   confirmation with Undo, announces it and focuses Undo. Undo runs the
 *   function `onSwitch` returned.
 * - Connect opens the plugin's provider setup wizard on that provider; on
 *   close the advice re-resolves (a connected Anthropic becomes situation 1)
 *   and focus returns to its first action.
 * - Upgrade opens the customer portal's plans page in a new tab.
 * - Picking the caution provider (or Undo) announces lead and reason; page
 *   load announces nothing, the notice is read in reading order.
 *
 * wp-admin has no per-member key or billing roles: everyone who can open
 * this SPA is a WordPress administrator, who manages the site's keys on the
 * AI Engine page, and the plans page in the portal authenticates the
 * account itself. So `canManageKeys` and `canManageBilling` are both true.
 * It never blocks saving. Spec: specs/byok-ai-guidance.md §3, §5 (wp-admin).
 */
export const ProviderAdvice: FC<ProviderAdviceProps> = ({
  provider,
  onSwitch,
  hidden = false,
  onHide,
  onShow,
  className,
}) => {
  const { plan } = useLicense();
  const { textProviders } = useAiConnections();
  const { data: ai } = useAiSettingsQuery();
  const adviceRef = useRef<InlineAdviceHandle>(null);

  const [confirmed, setConfirmed] = useState<{ to: AIProvider; undo: () => void } | null>(null);
  const [announcement, setAnnouncement] = useState<string | undefined>(undefined);
  const [wizardFor, setWizardFor] = useState<AIProvider | null>(null);

  const managed = isManagedPlan(plan as PlanId);
  // Guidance describes a provider the customer has (2026-10-02): a text
  // provider with no key behind it (the fallback default before any key is
  // connected) gets no advice; the page's "connect a provider" message is
  // the only AI message then.
  const hasProvider = (textProviders as string[]).includes(provider);
  const advice =
    managed || !hasProvider
      ? null
      : adviceFor({
          plan: (plan || "none") as PlanId | "none",
          provider,
          connected: textProviders as AIProvider[],
          canManageKeys: true,
          canManageBilling: true,
        });

  // A provider change the user made: picking a caution provider (or Undo)
  // announces the notice; any other change ends a pending confirmation.
  const previousProvider = useRef(provider);
  useEffect(() => {
    if (previousProvider.current === provider) return;
    previousProvider.current = provider;
    if (confirmed && confirmed.to !== provider) setConfirmed(null);
    setAnnouncement(advice ? (hidden ? lead() : `${lead()} ${reason()}`) : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  if (managed) return null;

  const switchedLine = (to: AIProvider) =>
    sprintf(
      /* translators: %s: AI provider name, e.g. "Claude". */
      _x("Switched to %s with its recommended model.", "ai advice", "structura"),
      ADVICE_PROVIDER_NAMES[to]
    );

  const plansUrl = buildPortalSignupUrl({
    intent: "general_upgrade",
    domain: typeof window !== "undefined" ? window.location.hostname : undefined,
    plan,
  });

  const toInlineAction = (action: AdviceAction): InlineAdviceSecondaryAction => {
    if (action.kind === "switch") {
      return {
        label: actionLabel(action),
        onClick: () => {
          const to = action.provider;
          const undo = onSwitch(to, recommendedTextTier(to) ?? "mid");
          setConfirmed({ to, undo });
          // Set before the provider-change effect runs, which keeps it.
          previousProvider.current = to;
          setAnnouncement(switchedLine(to));
          adviceRef.current?.focusUndo();
        },
      };
    }
    if (action.kind === "connect") {
      return { label: actionLabel(action), onClick: () => setWizardFor(action.provider) };
    }
    return { label: actionLabel(action), href: plansUrl, external: true };
  };

  // The resolver only puts Switch or Connect first; an Upgrade there would
  // still open the plans page in a new tab.
  const asPrimary = (action: InlineAdviceSecondaryAction) => ({
    label: action.label,
    onClick: action.onClick ?? (() => window.open(action.href, "_blank", "noopener,noreferrer")),
  });

  const wizardMeta = wizardFor ? ai?.catalog?.[wizardFor] : undefined;
  const wizardStatus = wizardFor ? ai?.providers?.[wizardFor] : undefined;
  const wizard =
    wizardFor && wizardMeta ? (
      <ProviderSetupWizard
        open
        onClose={() => {
          setWizardFor(null);
          adviceRef.current?.focusPrimary();
        }}
        providerId={wizardFor}
        providerName={wizardMeta.name}
        description={wizardMeta.description}
        capabilities={wizardMeta.capabilities}
        keyUrl={wizardMeta.key_url}
        keyPrefix={wizardMeta.key_prefix}
        isConnected={!!wizardStatus?.connected}
        currentTextModel={wizardStatus?.text_model}
        currentImageModel={wizardStatus?.image_model}
        currentTextTier={wizardStatus?.text_tier}
        currentImageTier={wizardStatus?.image_tier}
        isDefaultText={ai?.defaults?.text_provider === wizardFor}
        isDefaultImage={ai?.defaults?.image_provider === wizardFor}
        imagesAvailable={planHasImageGeneration(plan)}
      />
    ) : null;

  if (confirmed) {
    return (
      <div className={className}>
        <InlineAdvice
          ref={adviceRef}
          state="confirmed"
          lead={lead()}
          reason={reason()}
          confirmation={switchedLine(confirmed.to)}
          onUndo={() => {
            const { undo } = confirmed;
            setConfirmed(null);
            undo();
          }}
          undoLabel={_x("Undo", "ai advice", "structura")}
          announcement={announcement}
        />
      </div>
    );
  }

  if (!advice) return null;

  const hideProps: { onHide: () => void; hideLabel: string } | { onHide?: undefined } = onHide
    ? {
        onHide: () => {
          onHide();
          adviceRef.current?.focusShow();
        },
        hideLabel: _x("Hide this advice for this campaign", "ai advice", "structura"),
      }
    : {};
  const showProps: { onShow: () => void; showLabel: string } | { onShow?: undefined } = onShow
    ? {
        onShow: () => {
          onShow();
          adviceRef.current?.focusPrimary();
        },
        showLabel: _x("Show advice", "ai advice", "structura"),
      }
    : {};

  return (
    <div className={className}>
      <InlineAdvice
        ref={adviceRef}
        state={hidden ? "collapsed" : "open"}
        lead={lead()}
        reason={reason()}
        primary={advice.primary ? asPrimary(toInlineAction(advice.primary)) : undefined}
        secondary={advice.secondary ? toInlineAction(advice.secondary) : undefined}
        collapsedText={lead()}
        announcement={announcement}
        {...hideProps}
        {...showProps}
      />
      {wizard}
    </div>
  );
};
