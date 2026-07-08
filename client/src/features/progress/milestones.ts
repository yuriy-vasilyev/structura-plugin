import type { ComponentType, SVGProps } from "react";
import { __ } from "@wordpress/i18n";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Globe,
  Image as ImageIcon,
  Layers,
  Layout,
  Link2,
  PackageOpen,
  PenTool,
  Search,
  Share2,
  Telescope,
  Timer,
} from "lucide-react";
import type { CampaignRunFlow, Milestone } from "@structura/types";

/**
 * User-facing copy for each progress milestone.
 *
 * The cloud writes a milestone id; the client maps it to a headline here.
 * Changing copy doesn't require a backend deploy — that's the whole point
 * of the split. Spec: `specs/progress-stream.md` §9.
 *
 * Rules (spec §9):
 *   - Second person, active voice ("Writing the draft", not "Draft is
 *     being generated").
 *   - Show the work, not the plumbing ("Matching your brand voice", not
 *     "Applying persona rewrite pass").
 *   - Never expose provider names. "Generating images", not "Calling Imagen".
 *   - One level of detail only — headline is the milestone, subtext is
 *     within-milestone context set by the cloud write. No nesting here.
 *   - Localize everything through `__()` with the `structura` text domain
 *     (CLAUDE.md §6).
 *
 * Back-compat: the cloud may introduce a new milestone id before the
 * plugin's client bundle ships with copy for it. `milestoneHeadline()`
 * falls back to a generic "Working on your post" rather than rendering
 * a raw id — unknown ids must never leak to the UI.
 */
const MILESTONE_HEADLINES: Record<Milestone, () => string> = {
  queued: () => __("Queued — starting soon", "structura"),
  // Stock-served runs only. The cloud holds the run in this state
  // while the dispatcher consumes the next ready entry from the
  // campaign's stock buffer. See functions/src/stock/serve.ts.
  stock_check: () => __("Pulling pre-generated draft", "structura"),
  research: () => __("Researching your topic", "structura"),
  competitor_analysis: () =>
    __("Analyzing top-ranking competitors", "structura"),
  authority: () => __("Finding authoritative sources", "structura"),
  outlining: () => __("Planning the outline", "structura"),
  drafting: () => __("Writing the draft", "structura"),
  link_validation: () => __("Validating links", "structura"),
  // Legacy single-bucket label. Runs created before 2026-05-22
  // stamped `images` as one milestone; we still render their
  // duration here on the run-detail view. New runs split into
  // image_featured + image_body below.
  images: () => __("Generating images", "structura"),
  image_featured: () => __("Generating featured image", "structura"),
  image_body: () => __("Generating body image", "structura"),
  assembling: () => __("Assembling the final post", "structura"),
  publishing: () => __("Publishing to WordPress", "structura"),
  channels: () => __("Sharing to channels", "structura"),
  done: () => __("Post published", "structura"),
  error: () => __("Generation stopped", "structura"),
};

/**
 * User-facing subtext for each milestone — the second line under the
 * headline. Same localisation pattern as MILESTONE_HEADLINES: the cloud
 * writes a fixed English default into `run.subtext` from its
 * `MILESTONE_DEFAULTS` table, and the SPA overrides with this translated
 * mapping at render time. Without this layer the subtext (e.g.
 * "Ordering for flow and SEO") landed in English on every locale because
 * the cloud-emitted value bypassed @wordpress/i18n entirely. Spec §9.
 *
 * Returning `undefined` is intentional for milestones that don't carry
 * a second line — terminal states (`done`, `error`) put their detail on
 * the receipt / failure card, not under the in-flight headline.
 */
const MILESTONE_SUBTEXTS: Record<Milestone, () => string | undefined> = {
  queued: () => __("Reserving a spot in the queue", "structura"),
  stock_check: () => __("From your campaign's stock buffer", "structura"),
  research: () => __("Expanding keywords and intent", "structura"),
  competitor_analysis: () =>
    __("Studying the pages you're up against", "structura"),
  authority: () => __("Vetting references worth citing", "structura"),
  outlining: () => __("Ordering for flow and SEO", "structura"),
  drafting: () => undefined,
  link_validation: () =>
    __("Checking that every link the AI wrote actually resolves", "structura"),
  images: () => undefined,
  image_featured: () => __("The post's hero visual", "structura"),
  image_body: () => __("Inline visual that breaks up the copy", "structura"),
  assembling: () => __("Stitching copy, images, metadata", "structura"),
  publishing: () => __("Pushing the post into WordPress", "structura"),
  channels: () => __("LinkedIn, Slack, IndexNow, and the rest", "structura"),
  done: () => undefined,
  error: () => undefined,
};

/**
 * Ordered list used by the expanded stepper view for SYNC runs (the
 * default ~30-60s synthesis path). Terminal states (`done`, `error`)
 * are NOT included — they're rendered by the terminal receipt card
 * instead of as a step in the list.
 *
 * `stock_check` sits between `queued` and `research` because the
 * dispatcher *always* checks the stock buffer first before falling
 * through to synchronous generation. Showing it on every timeline
 * (sync + stock) tells the same honest story: "we always look for a
 * pre-baked draft first; if there is one we ship it, otherwise we
 * generate fresh." Sync runs that fell through show stock_check with
 * a tiny duration; stock-served runs show the full <1s pull instead.
 */
export const MILESTONE_ORDER: Milestone[] = [
  "queued",
  "stock_check",
  "research",
  // Research sub-phases — only emitted on paid runs where the work runs
  // (Pro-gated in the cloud's `gatherResearch`). Hidden on Free tier via
  // FREE_TIER_HIDDEN_MILESTONES, same as `research`/`link_validation`.
  "competitor_analysis",
  "authority",
  "outlining",
  "drafting",
  "link_validation",
  // Legacy single-bucket `images` deliberately omitted from the
  // visible order on new runs — its slot is taken by the per-image
  // milestones below. Old runs (created before 2026-05-22) that
  // stamped `images` instead still render correctly on the
  // run-detail page: the per-step duration chip resolver checks
  // `stepDurationsMs.images` and the headline resolver maps the
  // id through `MILESTONE_HEADLINES.images`. The cost of the gap
  // is one less row on those archived runs — acceptable.
  "image_featured",
  "image_body",
  "assembling",
  "publishing",
  // Channels fan-out runs after the post is inserted into WordPress.
  // The run is technically `succeeded` before this step starts; the
  // dispatcher patches `stepDurationsMs.channels` + `channelsResolvedCount`
  // post-hoc. Showing it on the timeline closes the loop visually so
  // the user sees the full story end-to-end instead of stopping at
  // "Publishing to WordPress" while the dispatcher is still running.
  "channels",
];

/**
 * Ordered list for STOCK-served runs. Collapses to three steps because
 * the cloud genuinely only does three things on this path: queue, pull
 * a pre-generated draft from the campaign's stock buffer, then ship it
 * to the plugin. Showing the eight-step sync list with empty chips
 * misrepresents what happened and confuses users — the timeline should
 * reflect the actual work, not a placeholder shape. See
 * `functions/src/stock/serve.ts::deliverStockServedRun`.
 */
export const STOCK_MILESTONE_ORDER: Milestone[] = [
  "queued",
  "stock_check",
  "publishing",
  // Same post-publish fan-out as the sync flow — stock-served runs
  // also trip the `structura/post/inserted` hook and reach the
  // dispatcher. See `MILESTONE_ORDER` for the full rationale.
  "channels",
];

/**
 * Pick the right ordered milestone list for the run's pipeline. Older
 * docs that predate the `flow` field fall through to the sync list —
 * matches the back-compat contract on `CampaignRunFlow`.
 */
export const milestoneOrderForFlow = (flow: CampaignRunFlow | undefined): Milestone[] =>
  flow === "stock" ? STOCK_MILESTONE_ORDER : MILESTONE_ORDER;

/**
 * Milestones that produce ZERO user-visible work on Free / None tiers
 * and should be hidden from the timeline + dot strip:
 *
 *   - `research` — Free has no SERP fetch, no competitor scrape, no
 *     authority resolution, and no keyword bank (all Pro-gated in the
 *     cloud's `gatherResearch`). What runs is a sub-millisecond pass
 *     that returns empty arrays. Showing "Researching your topic" for
 *     2s and then ticking it off misleads the user into thinking the
 *     real research engine fired.
 *
 *   - `link_validation` — Free has the cloud-side "no outbound links"
 *     prompt directive AND the plugin's hard `Block_Serializer` strip,
 *     so the post body contains zero external `<a href>` tags. The
 *     validator runs over nothing and ticks off in <100ms — same
 *     misleading-vs-reality problem as research.
 *
 * Pro / BYOK / Cloud / Cloud Pro keep both milestones; the actual work
 * runs there.
 */
const FREE_TIER_HIDDEN_MILESTONES: Set<Milestone> = new Set([
  "research",
  // Both research sub-phases are Pro-gated in `gatherResearch` (the
  // effective rule set drops Pro rules for free/none), so they never
  // run — and never get emitted — on Free. Hiding them keeps the
  // timeline honest, same rationale as `research` above.
  "competitor_analysis",
  "authority",
  "link_validation",
]);

/**
 * Combine flow-based ordering with tier-based filtering. Use this in
 * the dot strip + timeline rather than `milestoneOrderForFlow` directly,
 * so the visible step set matches what the cloud actually executes for
 * the caller's tier. The `flow` arg is unchanged — stock-served runs
 * never include research / link_validation anyway, so the filter is
 * effectively a no-op on the stock list.
 */
export const milestoneOrderForFlowAndTier = (
  flow: CampaignRunFlow | undefined,
  isPaidTier: boolean,
): Milestone[] => {
  const base = milestoneOrderForFlow(flow);
  if (isPaidTier) return base;
  return base.filter((m) => !FREE_TIER_HIDDEN_MILESTONES.has(m));
};

/**
 * Resolve the user-facing headline for a milestone id.
 *
 * Why the wrapping function instead of a bare string map: `__()` must be
 * invoked at render time for @wordpress/i18n's runtime-swap behavior to
 * pick up the currently-active locale. A bare eager-string map would
 * freeze the copy at module-load time and stop translating.
 */
export const milestoneHeadline = (m: Milestone | string): string => {
  const resolver = MILESTONE_HEADLINES[m as Milestone];
  if (!resolver) {
    // Forward-compat: cloud can emit a new milestone id we don't know
    // yet. Render a safe generic line and let the cloud-supplied headline
    // (if any) carry the real detail via `headline` on the wire doc.
    return __("Working on your post", "structura");
  }
  return resolver();
};

/**
 * Resolve the user-facing subtext for a milestone id. Same wrap-in-a-
 * function pattern as `milestoneHeadline` so @wordpress/i18n's runtime
 * locale swap picks the right value at render time. Returns `undefined`
 * for milestones with no second line (drafting, images, done, error)
 * so callers can render conditionally without an empty-string check.
 */
export const milestoneSubtext = (m: Milestone | string): string | undefined => {
  const resolver = MILESTONE_SUBTEXTS[m as Milestone];
  if (!resolver) return undefined;
  return resolver();
};

/**
 * Terminal milestones — the drawer renders a "receipt" card instead of
 * the in-progress stepper. Keeping this as a predicate (rather than a
 * Set) lets TS narrow callers that pass `CampaignRunDoc["status"]`.
 */
export const isTerminalMilestone = (m: Milestone | string): boolean =>
  m === "done" || m === "error";

/**
 * Canonical icon mapping for every milestone id (plus the two terminal
 * states). Used by the textured progress bar next to the active headline,
 * the vertical Run Timeline, and anywhere else we want one glyph per step.
 *
 * Keeping a single source of truth here prevents the icons from drifting
 * between surfaces when we add a new milestone. If you introduce a new
 * milestone id, add both the headline *and* the icon here in the same PR.
 *
 * Icons are lucide-react components — consumers pass them to JSX as
 * `<Icon className="…" />`. We type the value as a loose React component
 * (not `LucideIcon`) so test doubles and alternative icon libraries can
 * substitute without a peer-dep on lucide.
 */
export const MILESTONE_ICONS: Record<
  Milestone,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  queued: Timer,
  stock_check: PackageOpen,
  research: Search,
  competitor_analysis: Telescope,
  authority: BookOpenCheck,
  outlining: Layout,
  drafting: PenTool,
  link_validation: Link2,
  images: ImageIcon,
  image_featured: ImageIcon,
  image_body: ImageIcon,
  assembling: Layers,
  publishing: Globe,
  channels: Share2,
  done: CheckCircle2,
  error: AlertTriangle,
};

/**
 * Safe accessor — returns a fallback icon for unknown milestone ids so
 * forward-compat (cloud introduces a new milestone before plugin ships)
 * can't crash the UI. Mirrors the `milestoneHeadline()` fallback pattern.
 */
export const milestoneIcon = (
  m: Milestone | string
): ComponentType<SVGProps<SVGSVGElement>> =>
  MILESTONE_ICONS[m as Milestone] ?? Timer;
