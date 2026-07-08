/**
 * Wire-format types for the add-on entitlements bundle returned by the
 * `checkLicenseStatus` cloud function (spec §11.6).
 *
 * Why this mirrors `functions/src/licenses/entitlementsBundle.ts` rather
 * than importing it:
 * - The cloud-side types reference `firebase-admin.Timestamp`. On the wire
 *   those fields come through as ISO 8601 strings (the cloud function
 *   calls `.toDate().toISOString()` before serialization).
 * - Keeping the client-side shapes decoupled from the admin SDK lets us
 *   avoid pulling Firebase into the WordPress plugin bundle.
 *
 * These types intentionally do NOT live in `@structura/types` — that
 * package is the cross-process boundary for Firestore documents, whereas
 * these are the HTTP response flavor. Nothing else consumes them yet.
 */

import type { AddonId, GracePeriodReason } from "@structura/types";

/**
 * Per-add-on seat budget + current-activation view. Present only when the
 * license is entitled to this add-on right now (i.e. Stripe has provisioned
 * seats and no payment_failed revocation has landed). Spec §11.6.
 */
export interface AddonEntitlementView {
  /** License-level seat budget. */
  maxSeats: number;
  /** Account-wide count of activations that currently hold a seat. */
  seatsUsed: number;
  /** `true` iff the activation for this site holds a seat. */
  assignedHere: boolean;
  /** ISO 8601 seat-assignment timestamp. `null` iff `assignedHere` is false. */
  assignedAt: string | null;
}

/**
 * Snapshot of a currently-open grace period for an add-on. Absent key =
 * no open grace. `isOrphanedHere` is pre-computed cloud-side so the card
 * render stays branchless. Spec §11.5 + §11.6.
 */
export interface AddonGraceView {
  reason: GracePeriodReason;
  /** ISO 8601 — when the grace opened. */
  detectedAt: string;
  /** ISO 8601 — day-21 revoke deadline. */
  revokeAt: string;
  /** 0 = no reminders, 1 = day-7 sent, 2 = day-14 sent. */
  remindersSent: 0 | 1 | 2;
  /** `true` iff this site appears in the grace's `orphanedDomains` list. */
  isOrphanedHere: boolean;
  /** Full orphaned-domains list from the grace state. */
  orphanedDomains: string[];
}

/**
 * The wire-format bundle that rides on the `checkLicenseStatus` response
 * alongside the legacy `{ plan, status, message }` envelope. Both maps
 * are always present (possibly empty) so consumers can safely
 * `Object.keys()` without a null guard.
 */
export interface LicenseEntitlementsBundle {
  entitlements: Partial<Record<AddonId, AddonEntitlementView>>;
  graceperiods: Partial<Record<AddonId, AddonGraceView>>;
}
