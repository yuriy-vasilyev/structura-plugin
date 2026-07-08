/**
 * Per-connection campaign bindings picker.
 *
 * Lets the user narrow a channel connection to a subset of campaigns instead
 * of firing for every publish event. Rendered inside the install modal (both
 * webhook and credential flows) and read back as `bound_campaign_ids` on the
 * save payload.
 *
 * Semantics (matches cloud `ConnectionRecord.boundCampaignIds`):
 *   - `null`      — "all campaigns" (default for fresh installs and
 *                   pre-binding legacy docs). Cloud normalizes empty arrays
 *                   back to `null` so we don't have to worry about round-trip
 *                   drift.
 *   - `number[]`  — explicit allowlist. The dispatcher skips the connection
 *                   when an event's `campaignId` isn't in the list and emits
 *                   a `campaign_not_bound` activity row.
 *
 * Mode UX:
 *   The two-button toggle ("All campaigns" / "Selected campaigns") mirrors
 *   the `auto` / `restricted` control TaxonomySection already uses in the
 *   campaign editor, so users see a single visual idiom for "let the system
 *   choose vs. pick explicitly" across the product.
 *
 * Spec: specs/integrations-store-spec.md §5.2 + the 2026-04-16 changelog.
 */

import { __ } from "@wordpress/i18n";
import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { cn } from "@structura/ui";
import { campaignKeys } from "@/features/campaigns/api/keys";
import type { Campaign } from "@/features/campaigns/types";
import { useLicense } from "@/features/settings/api/useLicense";

interface CampaignBindingsPickerProps {
  /**
   * Current binding selection. `null` means "all campaigns" (the default);
   * `(string | number)[]` is an explicit allowlist. Matches the wire shape 1:1.
   */
  value: (string | number)[] | null;
  /**
   * Fires with the new selection. Callers pass the value straight into the
   * save payload — the picker already normalizes the "selected campaigns"
   * mode with an empty array to an empty list (not null) so the parent form
   * can differentiate "user un-ticked everything" from "all campaigns". Cloud
   * normalizes the empty array back to `null` server-side, so either value
   * round-trips safely.
   */
  onChange: (next: (string | number)[] | null) => void;
}

export const CampaignBindingsPicker = ({
  value,
  onChange,
}: CampaignBindingsPickerProps) => {
  const { hasUsableLicense } = useLicense();
  const isAllMode = value === null;
  const selectedIds = value ?? [];

  // Only fetch the campaign list when the user actually needs it — the
  // default "all campaigns" mode doesn't render checkboxes, so firing a
  // query every time the modal mounts would be pure waste (and it would
  // muddy apiFetch mock queues in tests that only care about the save
  // call). Reusing `campaignKeys.lists()` keeps this on the same cache
  // entry as `useCampaignsQuery` so the fetch is a no-op when the campaigns
  // page is already mounted.
  const { data: campaigns, isLoading, error } = useQuery({
    queryKey: campaignKeys.lists(),
    queryFn: async () =>
      await apiFetch<Campaign[]>({ path: "/structura/v1/scheduler/campaigns" }),
    enabled: hasUsableLicense === true && !isAllMode,
    staleTime: 10000,
  });

  const toggle = (id: string | number, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...selectedIds, id]))
      : selectedIds.filter((existing) => existing !== id);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
          {__("Campaigns", "structura")}
        </span>
        {/* Two-button toggle mirrors TaxonomySection's Auto / Restricted
            control so the binding affordance reads as part of the same
            design vocabulary users already know from the campaign editor. */}
        <div className="flex rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
          <button
            type="button"
            onClick={() => onChange(null)}
            className={cn(
              "rounded-lg px-3 py-1 text-[10px] font-black transition-all",
              isAllMode
                ? "bg-white text-brand-600 shadow-sm dark:bg-neutral-700 dark:text-brand-400"
                : "cursor-pointer text-neutral-400",
            )}
          >
            {__("All campaigns", "structura")}
          </button>
          <button
            type="button"
            onClick={() => onChange(selectedIds)}
            className={cn(
              "rounded-lg px-3 py-1 text-[10px] font-black transition-all",
              !isAllMode
                ? "bg-white text-brand-600 shadow-sm dark:bg-neutral-700 dark:text-brand-400"
                : "cursor-pointer text-neutral-400",
            )}
          >
            {__("Selected only", "structura")}
          </button>
        </div>
      </div>

      {isAllMode ? (
        <p className="m-0! text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {__(
            "This channel fires for every campaign on this site. Switch to “Selected only” to scope it to specific campaigns.",
            "structura",
          )}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="m-0! text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {__(
              "Only publishes from the ticked campaigns will trigger this channel. Leaving all boxes empty silences the channel entirely.",
              "structura",
            )}
          </p>

          {isLoading && (
            <p className="m-0! text-[11px] text-neutral-500 dark:text-neutral-400">
              {__("Loading campaigns…", "structura")}
            </p>
          )}

          {error && (
            <p className="m-0! text-[11px] text-red-600 dark:text-red-400">
              {__(
                "Couldn’t load campaigns — try again in a moment.",
                "structura",
              )}
            </p>
          )}

          {!isLoading && !error && campaigns && campaigns.length === 0 && (
            // Zero-campaign fallback — the user reached the install modal
            // without ever creating a campaign. Rather than dropping a silent
            // empty list, call it out explicitly and nudge back to the All
            // mode so they don't accidentally save a "silence everything"
            // empty allowlist.
            <p className="m-0! rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
              {__(
                "No campaigns exist yet. This channel will stay silent until you create one — switch to “All campaigns” to have it fire for every future campaign.",
                "structura",
              )}
            </p>
          )}

          {!isLoading && !error && campaigns && campaigns.length > 0 && (
            // Same visual vocabulary as TaxonomySection's checkbox grid —
            // bounded height + internal scroll so a large campaign list
            // doesn't push the modal's primary actions off-screen.
            <div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-neutral-200 p-2 sm:grid-cols-2 dark:border-neutral-700">
              {campaigns.map((campaign) => {
                const checked = selectedIds.includes(campaign.id);
                return (
                  <label
                    key={campaign.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-[11px] transition-colors",
                      checked
                        ? "border-brand-200 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-900/20"
                        : "border-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggle(campaign.id, e.target.checked)}
                      className="rounded border-neutral-300 text-brand-600 dark:border-neutral-600 dark:bg-neutral-800"
                    />
                    <span className="truncate font-bold text-neutral-700 dark:text-neutral-200">
                      {campaign.identity?.name ||
                        __("Untitled campaign", "structura")}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
