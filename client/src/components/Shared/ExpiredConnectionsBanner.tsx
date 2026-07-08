/**
 * Global "you have unhealthy channel connections" banner.
 *
 * Shown at the top of every plugin page (alongside the other persistent
 * banners) whenever at least one saved connection has a status other than
 * "connected". Three buckets:
 *
 *   1. `expired` — OAuth token or webhook is no longer valid.
 *   2. `revoked` — the provider-side credential was explicitly revoked.
 *   3. `error`   — catch-all for unknown failures.
 *
 * Each bucket maps to a slightly different copy string, but the CTA is
 * always "View Connections" pointing at `/channels/connections` where the
 * operator can delete or re-authorize the broken row.
 *
 * Gated by `useChannelsVisibility()` at the mount site in App.tsx
 * (plan + entitlement), so this component itself doesn't re-check.
 *
 * Spec: specs/integrations-store-spec.md §10, Phase 7 hardening.
 */

import { FC, useMemo } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { Alert, Button } from "@structura/ui";
import { AlertTriangle, ArrowRight, XCircle } from "lucide-react";
import { useNavigate } from "react-router";
import { useChannelConnectionsQuery } from "@/features/channels/api/useChannelConnectionsQuery";
import type { ConnectionSummary, ConnectionStatus } from "@/features/channels/types";

// ---------------------------------------------------------------------------
//  Pure helpers (exported for direct testing)
// ---------------------------------------------------------------------------

/** Connections whose status is anything other than "connected". */
export function selectUnhealthy(connections: ConnectionSummary[]): ConnectionSummary[] {
  return connections.filter((c) => c.status !== "connected");
}

/** Count by status bucket. */
export function countByStatus(
  unhealthy: ConnectionSummary[]
): Record<Exclude<ConnectionStatus, "connected">, number> {
  const out = { expired: 0, revoked: 0, error: 0 };
  for (const c of unhealthy) {
    if (c.status === "expired") out.expired++;
    else if (c.status === "revoked") out.revoked++;
    else out.error++;
  }
  return out;
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export const ExpiredConnectionsBanner: FC = () => {
  const { data: connections, isLoading } = useChannelConnectionsQuery();
  const navigate = useNavigate();

  const unhealthy = useMemo(() => selectUnhealthy(connections ?? []), [connections]);
  const counts = useMemo(() => countByStatus(unhealthy), [unhealthy]);

  // Don't flash while the query is in-flight, and don't render when healthy.
  if (isLoading || unhealthy.length === 0) return null;

  // Pick severity: revoked or expired are error-level; pure "error" is warning.
  const hasExpiredOrRevoked = counts.expired > 0 || counts.revoked > 0;
  const variant = hasExpiredOrRevoked ? "error" : "warning";
  const Icon = hasExpiredOrRevoked ? XCircle : AlertTriangle;

  const title =
    unhealthy.length === 1
      ? sprintf(
          // translators: %s = display name of the affected connection.
          __("Channel connection \u201c%s\u201d needs attention", "structura"),
          unhealthy[0].displayName
        )
      : sprintf(
          // translators: %d = number of unhealthy connections.
          __("%d channel connections need attention", "structura"),
          unhealthy.length
        );

  // Build a concise reason string from the buckets.
  const reasons: string[] = [];
  if (counts.expired > 0) {
    reasons.push(sprintf(__("%d expired", "structura"), counts.expired));
  }
  if (counts.revoked > 0) {
    reasons.push(sprintf(__("%d revoked", "structura"), counts.revoked));
  }
  if (counts.error > 0) {
    reasons.push(sprintf(__("%d errored", "structura"), counts.error));
  }

  const body = sprintf(
    // translators: %s = comma-separated status list like "2 expired, 1 revoked".
    __(
      "Some of your channel integrations aren't working (%s). Posts won't be distributed through these channels until the issue is resolved.",
      "structura"
    ),
    reasons.join(", ")
  );

  return (
    <div className="mb-6" data-testid="expired-connections-banner">
      <Alert variant={variant}>
        <Icon />
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>{body}</Alert.Description>
        <Alert.Action>
          <Button size="sm" variant="secondary" onClick={() => navigate("/channels/connections")}>
            {__("View Connections", "structura")}
            <ArrowRight size={14} />
          </Button>
        </Alert.Action>
      </Alert>
    </div>
  );
};
