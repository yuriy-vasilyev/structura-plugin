import { __ } from "@wordpress/i18n";
import type { ConnectionStatus } from "./types";

/**
 * Human-readable label for a channel connection-status value.
 *
 * Mirrors the switch that previously lived inside `ChannelConnectionRow` so
 * every surface that renders a connection status (the Connections list, the
 * per-campaign Channels tab, future diagnostics views) agrees on wording in
 * every locale. The raw string stays the authoritative key for
 * `statusBadgeIntent`; this helper exists solely for display.
 */
export const connectionStatusLabel = (status: ConnectionStatus | string): string => {
  switch (status) {
    case "connected":
      return __("Connected", "structura");
    case "expired":
      return __("Expired", "structura");
    case "revoked":
      return __("Revoked", "structura");
    case "error":
      return __("Error", "structura");
    default:
      // Unknown status emitted by a newer cloud schema — surface it
      // verbatim rather than silently hiding behind a generic word so we
      // don't mask a real diagnostic during a schema evolution window.
      return String(status);
  }
};

/**
 * Chip label for an integration capability, or `null` when the capability
 * shouldn't render a chip at all.
 *
 * Only `insights` gets a chip today: it's the one capability whose meaning
 * ("this channel never publishes — it only reads data") isn't already
 * conveyed by the card's category pill, and hiding that distinction would
 * make a read-only source look like yet another posting channel. `publish`
 * / `notify` / `adapt` deliberately map to `null` — chipping every card
 * with its mechanics would add noise without adding information.
 *
 * Unknown strings also return `null`: the cloud ships new capabilities
 * ahead of plugin releases (this SPA runs on older sites for months), and
 * a raw internal token like `"insights_v2"` leaking into the UI would be
 * worse than no chip. Callers must treat `null` as "render nothing".
 */
export const capabilityLabel = (capability: string): string | null => {
  switch (capability) {
    case "insights":
      return __("Read-only insights", "structura");
    default:
      return null;
  }
};
