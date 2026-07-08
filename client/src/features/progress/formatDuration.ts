import { __, sprintf } from "@wordpress/i18n";

/**
 * Render a millisecond duration as a localized "Xm Ys" / "Ys" label.
 *
 * Shared by every surface that shows a run duration — `RunDetailPage`
 * receipt, the inline `CampaignRunProgress` success copy, and
 * `CampaignRunsTab`'s per-row "Completed in …" cell. Spec
 * `specs/progress-stream.md` §6.1 wants the receipt and the list-level
 * label to read identically; centralizing the formatter is what keeps
 * that promise structural rather than depending on reviewer vigilance.
 *
 * Lives in its own file (rather than a barrel helper) so deleting the
 * ProgressDrawer in v1.5 didn't require shuffling imports across
 * unrelated feature folders.
 */
export const formatDuration = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    // translators: %d is a number of seconds (e.g. "42s").
    return sprintf(__("%ds", "structura"), seconds);
  }
  // translators: %1$d minutes, %2$d seconds (e.g. "3m 42s").
  return sprintf(__("%1$dm %2$ds", "structura"), minutes, seconds);
};
