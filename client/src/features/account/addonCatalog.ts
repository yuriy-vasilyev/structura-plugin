/**
 * Presentation metadata for the add-on cards on the Account page. Kept
 * separate from the runtime state machine so translators only touch
 * strings and the state logic stays pure.
 *
 * The name + description come from the marketing copy that backs the
 * Integrations store (spec §2). When a third add-on lands we can extend
 * this map; the card renderer doesn't need changes.
 */

import { __ } from "@wordpress/i18n";
import type { AddonId } from "@structura/types";

export interface AddonCatalogEntry {
  id: AddonId;
  name: string;
  description: string;
  /** Human-facing plan-page anchor for upsell CTAs. */
  pricingAnchor: string;
}

export function getAddonCatalogEntry(id: AddonId): AddonCatalogEntry {
  switch (id) {
    case "channels":
      return {
        id,
        name: __("Channels", "structura"),
        description: __(
          "AI-adapted distribution for LinkedIn, Slack, Discord, and IndexNow.",
          "structura",
        ),
        pricingAnchor: "#channels",
      };
    case "growth":
      return {
        id,
        name: __("Growth", "structura"),
        description: __(
          "High-stakes paid-spend integrations (ads, attribution, and retargeting).",
          "structura",
        ),
        pricingAnchor: "#growth",
      };
  }
}
