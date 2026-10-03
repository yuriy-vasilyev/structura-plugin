import type { ToolId } from "./types";

/**
 * Links from the free tools into the customer portal
 * (specs/blogseo-gap-analysis.md §4.8.2 "Keyword generator", §4.8.3).
 *
 * After sign-in the portal reads `tool`, `input` (or `seed`), `country` and
 * `pick` and opens that tool with the check already running (§4.9.6).
 */

/** Most keywords a content-plan link carries; beyond this the URL gets unwieldy. */
export const MAX_PICKED_KEYWORDS = 20;

/** Separator between picked keywords in `pick`. Stripped from keywords, so it cannot split one. */
const PICK_SEPARATOR = "|";

/** Context a portal link can carry. */
export interface ToolLinkContext {
  tool: ToolId;
  /** What the visitor typed (URL, domain or seed). */
  input?: string;
  country?: string;
  /** Keywords picked in the keyword generator's table. */
  pick?: readonly string[];
}

/** The `pick` value: at most {@link MAX_PICKED_KEYWORDS} keywords, separator-free, joined. */
export function encodePick(keywords: readonly string[]): string {
  return keywords
    .map((k) => k.split(PICK_SEPARATOR).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, MAX_PICKED_KEYWORDS)
    .join(PICK_SEPARATOR);
}

/**
 * `${appUrl}/signup` or `/login` with the tool context as query params,
 * URL-encoded. `plan=free` comes first on signup, as on every other
 * "Start free" link, so attribution reads the same.
 */
export function portalToolHref(appUrl: string, page: "signup" | "login", ctx: ToolLinkContext): string {
  const params = new URLSearchParams();
  if (page === "signup") params.set("plan", "free");
  params.set("tool", ctx.tool);
  if (ctx.input) params.set("input", ctx.input);
  if (ctx.country) params.set("country", ctx.country);
  const pick = ctx.pick ? encodePick(ctx.pick) : "";
  if (pick) params.set("pick", pick);
  return `${appUrl}/${page}?${params.toString()}`;
}

/**
 * "Turn these into a content plan": signup with the seed, market and picked
 * keywords (§4.8.2). The portal reopens the keyword generator with the picks
 * ticked; seeding a campaign from them is B2.5 (§4.9.1).
 */
export function contentPlanHref(
  appUrl: string,
  args: { seed: string; country: string; pick: readonly string[] },
): string {
  const params = new URLSearchParams({ plan: "free", tool: "keywords", seed: args.seed, country: args.country });
  const pick = encodePick(args.pick);
  if (pick) params.set("pick", pick);
  return `${appUrl}/signup?${params.toString()}`;
}
