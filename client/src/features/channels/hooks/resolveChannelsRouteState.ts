/**
 * Resolves what the `/channels/*` route tree should do on a given render,
 * given the two independent license-loading signals and the computed
 * visibility verdict.
 *
 * Companion to {@link hasChannelsAccess} (the "is this license entitled?"
 * verdict). This helper answers the orthogonal question the router needs:
 * "do we know enough yet to mount the real routes, or must we hold?"
 *
 * Why three states, and why this is split out as a pure helper:
 *
 *   `channelsVisible` (from {@link useChannelsVisibility}) is a plain
 *   boolean — it can't represent "we don't know yet," and returns `false`
 *   while the license data is still loading. If the router branched on it
 *   directly, the `/channels/*` → `/` catch-all would fire on every cold
 *   load and `replace` away a deep link (e.g. the portal's `returnTo`
 *   hand-off to `#/channels/connections` after an add-on purchase) before
 *   the heartbeat could confirm the entitlement.
 *
 *   Crucially, there are TWO loading signals, not one:
 *     - `licenseLoading`        — the fast PHP `wp_options` settings query.
 *     - `entitlementsLoading`   — the slower cloud heartbeat that is the
 *                                 ONLY source of `entitlements.channels`.
 *   The settings query resolves first. If we only waited on it, there's a
 *   window where `licenseLoading` is false but entitlements are still `{}`,
 *   so `channelsVisible` is (wrongly) false and the redirect fires. Both
 *   signals must clear before we trust the visibility verdict.
 *
 * Decision table:
 *
 *   licenseLoading | entitlementsLoading | channelsVisible | result
 *   ---------------|---------------------|-----------------|----------
 *   true           |   any               |   any           | "pending"
 *   any            |   true              |   any           | "pending"
 *   false          |   false             |   true          | "mounted"
 *   false          |   false             |   false         | "redirect"
 *
 *   - "pending"  — render nothing for `/channels/*` (a brief blank pane is
 *                  preferable to a redirect that loses the URL).
 *   - "mounted"  — mount the real Connections / Store / Activity routes.
 *   - "redirect" — entitlement confirmed absent; bounce `/channels/*` → `/`.
 *
 * Kept import-light (no runtime imports) for the same reason as
 * {@link hasChannelsAccess} — see that file for the test-resolution
 * rationale. Add no runtime imports here.
 */
export type ChannelsRouteState = "pending" | "mounted" | "redirect";

/**
 * @param licenseLoading      `useLicense().loading` — PHP settings query.
 * @param entitlementsLoading `useLicense().entitlementsLoading` — cloud
 *                            heartbeat, the only carrier of entitlements.
 * @param channelsVisible     `useChannelsVisibility()` — the plan ×
 *                            entitlement verdict.
 */
export const resolveChannelsRouteState = (
  licenseLoading: boolean,
  entitlementsLoading: boolean,
  channelsVisible: boolean,
): ChannelsRouteState => {
  // Hold until BOTH loading signals clear — `channelsVisible` is only
  // trustworthy once the heartbeat-borne entitlements have landed.
  if (licenseLoading || entitlementsLoading) return "pending";

  return channelsVisible ? "mounted" : "redirect";
};
