import type { AIProvider, PlanId } from "@structura/types";

/** A capability the product can recommend a provider for. */
export type RecommendationCapability = "text" | "image";

/** The product's recommendation for one capability. */
export interface CapabilityRecommendation {
  /** Providers best first; drives the default pick and option order. `null` = no ranking. */
  order: AIProvider[] | null;
  /** The recommended provider, or `null` when none is. */
  provider: AIProvider | null;
  /** The recommended BYOK tier per provider. A provider absent here has no recommended model. */
  model: Partial<Record<AIProvider, "top" | "mid">>;
  /** Providers that trigger the provider advice when a campaign writes with them. */
  caution: AIProvider[];
}

/**
 * What Structura recommends to customers, the one place this lives
 * (owner, 2026-10-01; specs/byok-ai-guidance.md §3). Since this export the
 * catalog's `recommended` flag is derived from it and no longer stored on
 * models.
 *
 * Text: Anthropic first, then OpenAI, on their Standard tier, so new
 * campaigns keep opening on Standard and "Top is an explicit opt-in on the
 * customer's key" (2026-07-23) holds. Gemini has no recommended model and
 * is the caution provider: in the 2026-10-01 bake-off its posts carried
 * more invented details.
 *
 * Images (owner, 2026-10-06; specs/open-providers.md): Gemini first, then
 * OpenAI, each on the tier that holds the image model own-key pickers
 * already default to (Gemini Flash Image, the OpenAI catalog default).
 * The served image `recommended` flags stay frozen (frozen.ts).
 */
export const RECOMMENDATIONS: Record<RecommendationCapability, CapabilityRecommendation> = {
  text: {
    order: ["anthropic", "openai", "gemini"],
    provider: "anthropic",
    model: { anthropic: "mid", openai: "mid" },
    caution: ["gemini"],
  },
  image: {
    order: ["gemini", "openai"],
    provider: "gemini",
    model: { gemini: "mid", openai: "mid" },
    caution: [],
  },
};

/** The first provider of the capability's `order` that is connected, else `null`. */
export function bestConnected(
  capability: RecommendationCapability,
  connected: readonly AIProvider[],
): AIProvider | null {
  const order = RECOMMENDATIONS[capability].order;
  if (!order) return null;
  return order.find((p) => connected.includes(p)) ?? null;
}

/** Inputs to {@link adviceFor}: the campaign's text provider and what the viewer can act on. */
export interface AdviceContext {
  plan: PlanId | "none";
  /** The campaign's text provider. */
  provider: AIProvider;
  /** Providers with a key connected to the site. */
  connected: readonly AIProvider[];
  /** The viewer can add or bind keys. */
  canManageKeys: boolean;
  /** The viewer can change the plan. */
  canManageBilling: boolean;
}

/** One action the advice offers. `label` is an i18n key in the `sites` namespace. */
export type AdviceAction =
  | { kind: "switch"; provider: AIProvider; label: "aiAdvice.switchTo" }
  | {
      kind: "connect";
      provider: AIProvider;
      label: "aiAdvice.connectAnthropicOrOpenai" | "aiAdvice.connectAnthropicForBest";
    }
  | { kind: "upgrade"; label: "aiAdvice.upgradeCloud" };

/** The advice for one campaign, as spec §3's situation table resolves it. */
export interface Advice {
  /** Row of the spec §3 table (1 to 3; rows 4 and 5 retired 2026-10-06). */
  situation: 1 | 2 | 3;
  /** Absent when the viewer cannot act on the primary step; `note` explains instead. */
  primary?: AdviceAction;
  secondary: AdviceAction | null;
  /** i18n key (`sites` namespace) shown in place of a Connect the viewer cannot do. */
  note?: "aiAdvice.askAdmin";
}

/**
 * The provider advice for a campaign, or `null` when its text provider is
 * not a caution provider or the plan is managed (Cloud, Cloud Pro). Pure;
 * shared by the portal and wp-admin. Switch is always offered, Connect
 * needs key access (else a note), Upgrade needs billing access (else
 * hidden). Spec: specs/byok-ai-guidance.md §3.
 *
 * 2026-10-06 (specs/open-providers.md): every own-key plan, anonymous
 * included, may connect Anthropic, so Free and `none` get the same advice
 * as BYOK. The Free-only rows 4 and 5 ("Connect an OpenAI key", "Upgrade
 * for Anthropic") were deleted with that decision.
 */
export function adviceFor(ctx: AdviceContext): Advice | null {
  if (!RECOMMENDATIONS.text.caution.includes(ctx.provider)) return null;
  // Managed plans write with the managed lineup, whatever provider is stored.
  if (ctx.plan === "cloud" || ctx.plan === "cloud_pro") return null;
  const has = (p: AIProvider) => ctx.connected.includes(p);
  const upgrade: AdviceAction | null = ctx.canManageBilling ? { kind: "upgrade", label: "aiAdvice.upgradeCloud" } : null;

  if (has("anthropic")) {
    return { situation: 1, primary: { kind: "switch", provider: "anthropic", label: "aiAdvice.switchTo" }, secondary: null };
  }
  if (has("openai")) {
    return {
      situation: 2,
      primary: { kind: "switch", provider: "openai", label: "aiAdvice.switchTo" },
      secondary: ctx.canManageKeys
        ? { kind: "connect", provider: "anthropic", label: "aiAdvice.connectAnthropicForBest" }
        : null,
    };
  }
  return ctx.canManageKeys
    ? {
        situation: 3,
        primary: { kind: "connect", provider: "anthropic", label: "aiAdvice.connectAnthropicOrOpenai" },
        secondary: upgrade,
      }
    : { situation: 3, note: "aiAdvice.askAdmin", secondary: upgrade };
}
