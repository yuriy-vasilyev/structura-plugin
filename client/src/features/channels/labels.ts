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
