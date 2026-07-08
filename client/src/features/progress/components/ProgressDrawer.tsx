/**
 * ⚠️ REMOVED — the floating ProgressDrawer is gone as of v1.5.
 *
 * Reasons we pulled it:
 *   1. Its custom portal-rendered `showToast` didn't integrate with the
 *      app's own `@structura/ui` toast provider — users got two visual
 *      treatments for what felt like the same notification surface.
 *   2. The "Run complete — progress details are no longer available"
 *      fallback fired on every 404 during the Action Scheduler jitter
 *      window, storming the drawer with false-terminal messages while
 *      the run was actually healthy and just waiting for the cloud
 *      dispatcher to prime the Firestore run doc.
 *   3. The drawer duplicated information the inline
 *      `CampaignRunProgress` strip already shows on the originating
 *      card — the card is the better surface because progress shows
 *      up where the user clicked, not floating in the corner.
 *
 * What replaced it:
 *   - Inline per-card strip:            `CampaignRunProgress`
 *   - App-level terminal broadcast:      `RunStatusToastHost` /
 *                                        `useRunStatusToasts`
 *   - Shared duration formatter:         `formatDuration` (moved to
 *                                        `../formatDuration.ts`)
 *
 * This file is kept only because our session can't delete filesystem
 * entries; nothing imports it. If you're reaching for `ProgressDrawer`,
 * you want `CampaignRunProgress` (per-card) or `RunStatusToastHost`
 * (global toast) instead.
 */

export {};
