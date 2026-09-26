/**
 * Builds the translated label bundle for the shared `DiscoverableChipList` /
 * `ChipAddInput` in the wp-admin SPA, so every per-item picker (keywords,
 * authority domains, competitors) shares one vocabulary instead of repeating
 * the `__()` calls. Same idea as `buildReferralLabels`.
 */
import { __, sprintf } from "@wordpress/i18n";

import type { DiscoverableChipLabels } from "@structura/ui";

export function buildChipListLabels(): DiscoverableChipLabels {
  return {
    /* translators: %s is the chip's label. */
    remove: (label: string) => sprintf(__("Remove %s", "structura"), label),
    addAll: __("Add all", "structura"),
    add: __("Add", "structura"),
    /* translators: %d is the number of items about to be added. */
    addCount: (count: number) => sprintf(__("Add %d", "structura"), count),
    separatorHint: __("Add several at once: separate them with commas.", "structura"),
    suggested: __("Suggested — tap to add", "structura"),
    discover: __("AI suggest", "structura"),
    addItem: __("Add an item", "structura"),
  };
}
