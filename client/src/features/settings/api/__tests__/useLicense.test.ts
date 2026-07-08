/**
 * Unit tests for `deriveIsActivationValid` — the pure helper inside
 * `useLicense` that turns the cloud heartbeat into a tri-state flag
 * ("null" / true / false) so downstream features can decide whether
 * to attempt activation-secret gated calls.
 *
 * We only test the pure helper here because the surrounding hook is
 * heavy (TanStack Query, effects, toasts). The interesting logic —
 * which branch detects the host mismatch, and the back-compat
 * fallback for pre-2026-04 cloud deploys — lives entirely in this
 * function, so a small isolated suite is enough to keep it pinned.
 */

import { describe, expect, it } from "vitest";
import {
  deriveHasAnonymousActivation,
  deriveIsActivationValid,
  deriveProviderCountCap,
  resolveIsAnonymous,
  resolveProviderCountCap,
} from "../useLicense";

describe("deriveIsActivationValid", () => {
  it("returns null when no cloud heartbeat has landed", () => {
    // Free users never trigger the heartbeat, and paid users still
    // have a pending window on first mount — both land here.
    // Null is the "assume fine for first paint" signal, not a failure.
    expect(deriveIsActivationValid(null)).toBeNull();
  });

  it("returns true when the cloud explicitly confirms the current host is an activation", () => {
    expect(
      deriveIsActivationValid({
        activationStatus: "valid",
        plan: "byok",
        status: "active",
      }),
    ).toBe(true);
  });

  it("returns false when the cloud says the current host isn't activated", () => {
    // The headline DDEV → ngrok case. The client should short-circuit
    // every activation-secret gated query rather than eating a 403.
    expect(
      deriveIsActivationValid({
        activationStatus: "domain_not_activated",
        // These can still be null on the wire — the enum is the
        // authoritative signal, not the plan/status combo.
        plan: null as unknown as string,
        status: null as unknown as string,
      }),
    ).toBe(false);
  });

  it("falls back to null plan + null status when the cloud omits activationStatus (legacy envelope)", () => {
    // Pre-2026-04 cloud deploys don't know about `activationStatus`,
    // but they did return `{ plan: null, status: null }` for the
    // host-mismatch branch. New plugins talking to old cloud still
    // need to detect the condition so the advisory renders.
    expect(
      deriveIsActivationValid({
        plan: null as unknown as string,
        status: null as unknown as string,
      }),
    ).toBe(false);
  });

  it("returns true for a healthy legacy envelope (plan + status present, no enum)", () => {
    // Old cloud + active license → plan and status are populated;
    // the enum is simply absent. That shouldn't be read as a failure.
    expect(
      deriveIsActivationValid({
        plan: "byok",
        status: "active",
      }),
    ).toBe(true);
  });

  it("returns true for a legacy envelope with non-null plan even if status is missing", () => {
    // Defensive: a partial cloud response still shouldn't be read as
    // a host mismatch. The mismatch branch is specifically
    // "both plan and status are null".
    expect(
      deriveIsActivationValid({
        plan: "none",
        status: "invalid",
      }),
    ).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────
// Phase 1.8 — workspace-presence derivations
//
// Pure helpers extracted from `useLicense` so the surrounding hook's
// TanStack Query + effects machinery doesn't need to be stood up to
// pin the matrix. The full hook composes these with the
// license-key-presence check (`hasUsableLicense`) — testing the
// composition is straightforward enough to skip the full renderHook
// dance.
// ────────────────────────────────────────────────────────────────────

describe("deriveHasAnonymousActivation", () => {
  it("returns false when structuraConfig is missing (pre-PR7a plugin)", () => {
    // Older plugin builds don't surface the workspace-presence
    // fields. Falling through to false keeps the legacy
    // license-required gating intact on those installs — the
    // workspace flip is a strict superset, so opting out is safe.
    expect(deriveHasAnonymousActivation(null)).toBe(false);
    expect(deriveHasAnonymousActivation(undefined)).toBe(false);
  });

  it("returns false when has_workspace is missing or false", () => {
    expect(deriveHasAnonymousActivation({})).toBe(false);
    expect(deriveHasAnonymousActivation({ plan: "none" })).toBe(false);
    expect(
      deriveHasAnonymousActivation({ has_workspace: false, plan: "none" }),
    ).toBe(false);
  });

  it("returns false when plan isn't 'none' (licensed install with bound bearer)", () => {
    // A licensed install ALSO has has_workspace: true (the bearer is
    // the licensed activation's bearer) but the plan is "byok" /
    // "cloud" / etc. The anonymous discriminator is specifically
    // "bearer + plan=none."
    expect(
      deriveHasAnonymousActivation({ has_workspace: true, plan: "byok" }),
    ).toBe(false);
    expect(
      deriveHasAnonymousActivation({ has_workspace: true, plan: "cloud_pro" }),
    ).toBe(false);
  });

  it("returns true when has_workspace is true AND plan is 'none' (anonymous bootstrap success)", () => {
    expect(
      deriveHasAnonymousActivation({ has_workspace: true, plan: "none" }),
    ).toBe(true);
  });
});

describe("deriveProviderCountCap", () => {
  it("falls back to 3 on pre-PR7a plugin builds (config missing)", () => {
    // Pre-PR7a plugins don't ship `provider_count_cap`. Returning 3
    // matches the legacy "no UX cap layered on top of
    // Provider_Registry tier gating" behaviour — the cap is purely
    // a Phase 1.8 UX restriction, so its absence shouldn't tighten
    // the existing rendering logic.
    expect(deriveProviderCountCap(null)).toBe(3);
    expect(deriveProviderCountCap(undefined)).toBe(3);
  });

  it("falls back to 3 when the field is missing on a present config", () => {
    // Defence-in-depth: a partial config (e.g. some other field
    // landed on the wire but not this one) shouldn't crash the
    // SPA. The fallback keeps the legacy rendering.
    expect(deriveProviderCountCap({})).toBe(3);
  });

  it("returns the raw value for the documented tier mapping", () => {
    // 1 = anonymous (`none`), 2 = `free`, 3 = `byok` and managed.
    // Spec: `specs/v2/multi-tenant-and-public-api.md` §Phase 1.8
    // feature matrix.
    expect(deriveProviderCountCap({ provider_count_cap: 1 })).toBe(1);
    expect(deriveProviderCountCap({ provider_count_cap: 2 })).toBe(2);
    expect(deriveProviderCountCap({ provider_count_cap: 3 })).toBe(3);
  });

  it("returns the raw value for unexpected numeric configurations (forward-compat)", () => {
    // A future tier that ships with a different cap — e.g. an
    // enterprise plan with 5 providers — flows through unchanged.
    // The hook trusts PHP as the source of truth.
    expect(deriveProviderCountCap({ provider_count_cap: 5 })).toBe(5);
  });
});

describe("resolveProviderCountCap", () => {
  // The settings payload travels on the REST query, so it refetches
  // after an in-SPA activation; structuraConfig is a page-render
  // snapshot that can't. Settings must therefore win whenever it
  // carries the field — that's the whole point of the 2026-06-06
  // change (a paid key activated at the wizard's license gate was
  // stuck with the anonymous 1-provider cap until a page reload).
  it("prefers the settings payload over the structuraConfig snapshot", () => {
    expect(
      resolveProviderCountCap(
        { provider_count_cap: 3 },
        { provider_count_cap: 1 },
      ),
    ).toBe(3);
  });

  it("falls back to the snapshot when the settings field is absent (old plugin build)", () => {
    expect(resolveProviderCountCap({}, { provider_count_cap: 2 })).toBe(2);
    expect(resolveProviderCountCap(null, { provider_count_cap: 1 })).toBe(1);
  });

  it("falls back to 3 when neither side carries the field (pre-PR7a)", () => {
    expect(resolveProviderCountCap(null, null)).toBe(3);
    expect(resolveProviderCountCap({}, {})).toBe(3);
  });
});

describe("resolveIsAnonymous", () => {
  it("prefers the settings payload over the structuraConfig snapshot", () => {
    // Post-activation: settings says licensed (false), the stale
    // snapshot still says anonymous (true). Settings wins.
    expect(
      resolveIsAnonymous({ is_anonymous: false }, { is_anonymous: true }),
    ).toBe(false);
    expect(
      resolveIsAnonymous({ is_anonymous: true }, { is_anonymous: false }),
    ).toBe(true);
  });

  it("falls back to the snapshot when the settings field is absent (old plugin build)", () => {
    expect(resolveIsAnonymous({}, { is_anonymous: true })).toBe(true);
    expect(resolveIsAnonymous(null, { is_anonymous: false })).toBe(false);
  });

  it("defaults to false when neither side carries the flag (pre-PR7a)", () => {
    expect(resolveIsAnonymous(null, null)).toBe(false);
    expect(resolveIsAnonymous({}, {})).toBe(false);
  });
});
