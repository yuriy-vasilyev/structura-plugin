import type { AIProvider, CampaignMode, ReferralLink } from "@structura/types";
import { getRegistryModelId } from "./catalog";
import { resolveRecommendedTextModel } from "./bindings";
import { RECOMMENDATIONS } from "./recommendations";

/**
 * New-campaign defaults, shared by the customer portal (`web/`, through its
 * `defaultCampaignInput` wrapper) and the cloud (`functions/`, through the
 * `pnpm sync:model-catalog` mirror) so a campaign created from either side
 * opens on the same settings. Spec: specs/mcp-server.md §3.4.
 *
 * Value imports stay inside this package on purpose: `@structura/types` is a
 * type-only dependency here, and `@structura/i18n-contracts` is not a
 * dependency at all. Callers therefore resolve the plan's provider allowlist,
 * whether the plan seeds models, the post length and the campaign language
 * themselves and pass them in.
 */

/**
 * The SEO directive slugs exposed as toggles.
 *
 * `number_in_title` was removed on 2026-09-14: whether a headline carries a
 * digit is craft rather than a per-project decision, and shipping it ON by
 * default bypassed the cloud's title-shape rotation on every paid campaign.
 * The cadence layer decides per post now. Campaigns created earlier still have
 * the value stored and the server ignores it.
 */
export const SEO_RULES = [
  "include_faq_section",
  "include_action_steps",
  "include_statistics",
  "internal_link_optimization",
  "outbound_link_authority",
  "eeat_signals",
  "entity_coverage",
] as const;

/** Gutenberg block vocabulary the generator supports (WP surfaces). */
export const CONTENT_BLOCKS = [
  "core/paragraph",
  "core/heading",
  "core/list",
  "core/quote",
  "core/table",
  "core/code",
] as const;

/**
 * Cadence a new campaign opens on, and the one the keyword step assumes
 * when a campaign's own cron can't be read — twice a week, 09:00
 * (Tue/Thu). Single-sourced here because the create defaults and the
 * runway prediction must agree: a drifting copy would show the user a
 * runway for a cadence the campaign never runs on.
 */
export const DEFAULT_CAMPAIGN_CRON = "0 9 * * 2,4";

/**
 * A campaign cadence as the schedule builders edit it: the parsed form of
 * the only cron shape the product writes, "minute hour * * dayList".
 */
export interface CampaignCadence {
  /** ISO weekday indexes as cron uses them: 0/7 = Sunday … 6 = Saturday. */
  days: number[];
  hour: number;
  minute: number;
}

/**
 * Read a campaign's cron string back into a {@link CampaignCadence}. Not a
 * general cron parser: anything outside "minute hour * * dayList" returns
 * null, and callers fall back to showing the raw string, which is the honest
 * thing to do for a hand-edited doc.
 */
export function parseCampaignCron(cron: string | undefined): CampaignCadence | null {
  if (!cron) return null;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minuteRaw, hourRaw, dom, month, dowRaw] = parts;
  if (dom !== "*" || month !== "*") return null;
  const minute = Number(minuteRaw);
  const hour = Number(hourRaw);
  if (!Number.isInteger(minute) || !Number.isInteger(hour)) return null;
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;

  if (dowRaw === "*") return { days: [0, 1, 2, 3, 4, 5, 6], hour, minute };
  const days = dowRaw.split(",").map(Number);
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 7)) return null;
  // Normalize cron's "7 = Sunday" alias and dedupe.
  return {
    days: [...new Set(days.map((d) => (d === 7 ? 0 : d)))].sort(),
    hour,
    minute,
  };
}

/**
 * Build the scheduler's cron string from UI inputs — the inverse of
 * {@link parseCampaignCron}, ported from the plugin's ScheduleBuilder.
 * `days` uses cron weekday indexes (0 = Sunday); empty days = every day.
 */
export function buildCampaignCron(input: { hour: number; minute: number; days: number[] }): string {
  const dow = input.days.length === 0 ? "*" : [...input.days].sort().join(",");
  return `${input.minute} ${input.hour} * * ${dow}`;
}

/**
 * The provider half of the site's setup-wizard AI defaults
 * (`LicenseActivation.aiDefaults`). The stored models are deliberately not
 * part of it; {@link buildCampaignDefaults} says why.
 */
export interface SiteAiProviderDefaults {
  /** The site's preferred text provider. */
  textProvider?: string | null;
  /** The site's preferred image provider; `null` when the site chose none. */
  imageProvider?: string | null;
}

/** What the caller resolved about the site before the defaults are built. */
export interface CampaignDefaultsSeed {
  /**
   * Providers the site's plan may use (`getProvidersForTier(planId)` from
   * `@structura/types`). `null` skips tier filtering, which only legacy
   * portal callers without a plan id rely on.
   */
  allowedProviders: readonly AIProvider[] | null;
  /**
   * Providers with a credential bound to the activation (`site.aiBindings`).
   * Absent or empty skips the filter.
   */
  connectedProviders?: readonly string[] | null;
  /** The campaign language, already resolved from the site's language. */
  language: string;
  /** Target word count (`DEFAULT_POST_LENGTH` in `@structura/types`). */
  postLength: number;
  /**
   * Whether to seed concrete text and image models. False on Cloud and Cloud
   * Pro: the server resolves the model from the plan, and the portal never
   * holds a model name for those plans (specs/managed-ai-lineup.md §3.2).
   */
  seedsModels: boolean;
}

/**
 * The fields a new campaign opens with: the subset of the portal's
 * `CampaignInput` (`web/src/features/sites/api/useCampaignFlow.ts`) that the
 * defaults set. The portal's `defaultCampaignInput` returns this as a
 * `CampaignInput`, so `tsc` in `web/` fails when a field here stops being
 * assignable there or the portal adds a required field.
 */
export interface CampaignDefaults {
  /** Campaign name; empty until the user or the setup draft fills it. */
  name: string;
  /** What the campaign is for, in the user's words. */
  objective: string;
  /** SEO strategy the keyword discovery and writer follow. */
  campaignMode: CampaignMode;
  /** Text generation provider. */
  textProvider: AIProvider;
  /** BYOK text quality tier; the cloud resolves the model from it at run time. */
  textTier: "top" | "mid";
  /** BYOK image quality tier; the cloud resolves the model from it at run time. */
  imageTier: "top" | "mid";
  /** Registry mirror of the text tier's model, kept for display and legacy reads. */
  textModel: string;
  /** Image generation provider; `null` when the campaign generates no images. */
  imageProvider: AIProvider | null;
  /** Registry mirror of the image tier's model, kept for display and legacy reads. */
  imageModel: string;
  /** Text provider to retry on when the primary fails. */
  fallbackTextProvider: AIProvider | null;
  /** Image provider to retry on when the primary fails. */
  fallbackImageProvider: AIProvider | null;
  /** Persona id, or `"random"` to rotate through the library. */
  personaId: string;
  /** Campaign language: a content-language option or a WordPress locale code. */
  language: string;
  /** Replace em and en dashes in generated copy. */
  replaceLongDashes: boolean;
  /** Strip emojis from generated copy. */
  disableEmojis: boolean;
  /** Target post length in words. */
  postLength: number;
  /** Enabled {@link SEO_RULES} slugs. */
  seoRules: string[];
  /** Enabled {@link CONTENT_BLOCKS} names. */
  enabledBlocks: string[];
  /** Generate a featured image per post. */
  featuredImage: boolean;
  /** Generate images inside the post body. */
  bodyImages: boolean;
  /** Append a disclosure to each post. */
  disclosureEnabled: boolean;
  /** The disclosure text when enabled. */
  disclosureText: string;
  /** Client referral / partner links woven into topically relevant posts. */
  referralLinks: ReferralLink[];
  /** Status a generated post lands in. */
  postStatus: "publish" | "draft" | "pending";
  /** Whether the writer picks categories or uses `allowedCategories`. */
  categoryMode: "auto" | "manual";
  /** Category ids allowed in manual mode. */
  allowedCategories: number[];
  /** Whether the writer picks tags or uses `allowedTags`. */
  tagMode: "auto" | "manual";
  /** Tag ids allowed in manual mode. */
  allowedTags: number[];
  /** Scheduler cadence as a five-field cron string. */
  cronSchedule: string;
  /** When the campaign stops: never, after a post quota, or on a date. */
  endMode: "infinite" | "quota" | "date";
  /** The quota or date for `endMode`; `null` when infinite. */
  endValue: number | string | null;
  /** Vetted authority domains for outbound links. */
  authorityDomains: string[];
  /** ISO time of the last authority discovery; `null` before the first. */
  authorityDiscoveredAt: string | null;
  /** Keyword discovery difficulty strategy; `auto` picks from the site's footprint. */
  discoveryMode: "auto" | "winnable" | "balanced" | "authority";
  /** The keywords consumed round-robin, one per post. */
  keywordBank: string[];
  /** Search-validated long-tail keyphrases that ground per-post focus keyphrases. */
  keywordLongTailPool: Array<{
    keyword: string;
    volumeNumber?: number;
    difficulty?: number;
    intent?: string;
    source?: string;
  }>;
  /** ISO time of the last keyword discovery; `null` before the first. */
  keywordsDiscoveredAt: string | null;
  /** Position of the next keyword in `keywordBank`. */
  keywordQueueIndex: number;
  /** Keep a stock of pre-generated posts ready. */
  pregenerationEnabled: boolean;
  /** Whether the scheduler runs the campaign. */
  status: "active" | "paused";
  /** Count of posts the campaign has published. */
  postsPublished: number;
  /** Epoch ms of the last run; `null` before the first. */
  lastRunTimestamp: number | null;
}

/**
 * Plan family for the pre-generation control — mirrors the plugin's
 * `PregenerationControl` split: BYOK toggle / Free lock / Managed
 * banner. Cloud + Cloud Pro are managed (master keys, pre-gen always
 * on); every other paid family is BYOK-style.
 */
export function pregenTier(planId: string | undefined | null): "free" | "managed" | "byok" {
  if (!planId || planId === "free") return "free";
  if (planId.startsWith("cloud")) return "managed";
  return "byok";
}

/** The campaign fields {@link clampCampaignForPlan} sets. */
export interface PlanClampedFields {
  /** Keep a stock of pre-generated posts ready. */
  pregenerationEnabled: boolean;
  /** Concrete text model; empty on managed plans. */
  textModel: string;
  /** Concrete image model; empty on managed plans. */
  imageModel: string;
}

/**
 * Clamp tier-bound fields right before a create/save — the in-form
 * control does the same live, but a user who never opens Advanced
 * settings would otherwise ship the default `pregenerationEnabled:
 * true` on a Free plan.
 */
export function clampCampaignForPlan<T extends PlanClampedFields>(
  form: T,
  planId: string | undefined | null
): T {
  const tier = pregenTier(planId);
  if (tier === "free") return { ...form, pregenerationEnabled: false };
  if (tier === "managed") {
    // Managed campaigns must not persist a model: the cloud resolves it
    // from the plan and ignores a stored one, but whatever lands on the
    // doc surfaced later as the post's "AI model" — Cloud Pro campaigns
    // were showing the seeded mid-tier default (2026-07-14). Clearing here
    // also self-heals existing campaigns on their next save. The text
    // provider stays: it is hidden on managed plans, but the save's
    // provider gate still reads it (specs/managed-ai-lineup.md §3.2).
    return { ...form, pregenerationEnabled: true, textModel: "", imageModel: "" };
  }
  return form;
}

/** Anthropic is text-only — never a valid image seed. */
const isImageCapableProvider = (p: string): boolean => p !== "anthropic";

/** The providers sorted by the capability's recommendation order, best first. */
function orderByRecommendation<P extends string>(capability: "text" | "image", providers: readonly P[]): P[] {
  const order: readonly string[] = RECOMMENDATIONS[capability].order ?? [];
  const rank = (p: string) => (order.includes(p) ? order.indexOf(p) : order.length);
  return [...providers].sort((a, b) => rank(a) - rank(b));
}

/**
 * New-campaign defaults — the plugin SPA's paid-tier baseline.
 *
 * `aiDefaults` (optional) seeds the PROVIDER from the site's setup-wizard
 * choice. The concrete models are always the registry mirror of the seeded
 * tier — never `aiDefaults.textModel`/`imageModel`: those were written from a
 * hand-maintained map that went stale and seeded retired, 404-ing ids.
 *
 * Provider pick order (per capability): aiDefaults if allowed+connected →
 * the best connected+allowed provider in the capability's recommendation
 * order (text since specs/byok-ai-guidance.md §3; images, Gemini then
 * OpenAI, since 2026-10-06, specs/open-providers.md) →
 * aiDefaults if merely allowed → Gemini baseline. Text opens on the
 * provider's recommended tier, which is Standard, so the 2026-07-23 rule
 * below holds.
 * A provider outside the tier allowlist (`seed.allowedProviders`) or without
 * a bound credential would save fine and then fail every run with
 * `credentials_missing` — filtering here keeps the seed honest.
 *
 * `seed.seedsModels` false (a managed plan) seeds no concrete model.
 */
export function buildCampaignDefaults(
  aiDefaults: SiteAiProviderDefaults | null | undefined,
  seed: CampaignDefaultsSeed
): CampaignDefaults {
  const allowed = seed.allowedProviders;
  const connected = seed.connectedProviders?.length ? seed.connectedProviders : null;

  const pickProvider = (
    preferred: string | null | undefined,
    capability: "text" | "image"
  ): AIProvider => {
    const ok = (p: string | null | undefined): p is AIProvider =>
      !!p &&
      (!allowed || allowed.includes(p as AIProvider)) &&
      (capability === "text" || isImageCapableProvider(p));
    const okConnected = (p: string | null | undefined): p is AIProvider =>
      ok(p) && (!connected || connected.includes(p));

    if (okConnected(preferred)) return preferred;
    const pool = connected ? orderByRecommendation(capability, connected) : connected;
    const firstConnected = pool?.find((p) => ok(p));
    if (firstConnected) return firstConnected as AIProvider;
    if (ok(preferred)) return preferred;
    return ok("gemini") ? "gemini" : (allowed?.[0] ?? "gemini");
  };

  const textProvider = pickProvider(aiDefaults?.textProvider, "text");
  const imageProvider = pickProvider(aiDefaults?.imageProvider, "image");

  return {
    name: "",
    objective: "",
    campaignMode: "traffic_magnet",
    textProvider,
    // New BYOK campaigns open on the STANDARD (mid) tier: the cost runs on the
    // user's own key, so Top is an explicit opt-in, never a default
    // (2026-07-23: the "top" default silently moved Anthropic campaigns from
    // Sonnet to Opus). The concrete models below are the tier's registry
    // mirror so display / legacy reads stay consistent with what runs.
    // The provider's recommended tier, Standard for every provider
    // (RECOMMENDATIONS, 2026-10-02).
    textTier: resolveRecommendedTextModel(textProvider).tier,
    imageTier: "mid",
    // Seed real model ids — an empty string used to survive all the
    // way into the campaign doc when the user never touched the
    // Strategy step's model field, and the run then had no model.
    textModel: seed.seedsModels ? resolveRecommendedTextModel(textProvider).model : "",
    imageProvider,
    // Image field must mirror a real IMAGE model — reusing the text model
    // here is what shipped campaigns with `gemini-3-flash-preview` (a text
    // model) as their image model, which the image endpoint rejects
    // ("Aspect ratio is not enabled for this model").
    imageModel: seed.seedsModels ? (getRegistryModelId(imageProvider, "image", "mid") ?? "") : "",
    fallbackTextProvider: null,
    fallbackImageProvider: null,
    personaId: "random",
    language: seed.language,
    replaceLongDashes: true,
    disableEmojis: true,
    postLength: seed.postLength,
    seoRules: [...SEO_RULES],
    // All blocks on by default EXCEPT core/code: most blogs (recipes, travel,
    // local business…) have no natural code content, and a default-on code
    // block invites the writer to force-fit one. Mirrors the wp-admin SPA,
    // where core/code carries `defaultOff: true`.
    enabledBlocks: CONTENT_BLOCKS.filter((block) => block !== "core/code"),
    featuredImage: true,
    // Body images ON to match this function's contract ("the plugin SPA's
    // paid-tier baseline" — see client/src/features/campaigns/helpers.ts,
    // paid branch). Shipped as `false` until 2026-07-03: every
    // portal-created campaign silently produced text-only post bodies.
    bodyImages: true,
    disclosureEnabled: false,
    disclosureText: "",
    referralLinks: [],
    postStatus: "pending",
    categoryMode: "auto",
    allowedCategories: [],
    tagMode: "auto",
    allowedTags: [],
    cronSchedule: DEFAULT_CAMPAIGN_CRON,
    endMode: "infinite",
    endValue: null,
    authorityDomains: [],
    authorityDiscoveredAt: null,
    discoveryMode: "auto",
    keywordBank: [],
    keywordLongTailPool: [],
    keywordsDiscoveredAt: null,
    keywordQueueIndex: 0,
    pregenerationEnabled: true,
    status: "active",
    postsPublished: 0,
    lastRunTimestamp: null,
  };
}
