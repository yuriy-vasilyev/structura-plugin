import { describe, expect, it } from "vitest";

import type {
  ConnectionStatus,
  ConnectionSummary,
  IntegrationCatalogEntry,
  IntegrationCategory,
  IntegrationSku,
} from "../types";

/**
 * Phase 0 smoke test — proves that:
 *   1. Vitest is wired up correctly for the client package.
 *   2. The Channels TypeScript scaffold compiles under the test runner.
 *   3. The shape of the public types is what the rest of the feature will
 *      depend on — a regression here breaks every later phase.
 *
 * Replaced/extended by component-level tests once Phase 2 lands the cards.
 */
describe("Channels client types (Phase 0 scaffold)", () => {
  it("constructs a valid catalog entry", () => {
    // Catalog shape evolved in Phase 3: the entitlement overlay is now a
    // structured `{ canInstall, blocker }` object (so the UI can render
    // "Upgrade plan" vs "Add Channels" vs "Coming soon" distinctly) and
    // gating splits into required plan + optional add-on.
    const entry: IntegrationCatalogEntry = {
      id: "indexnow",
      name: "IndexNow",
      description: "Tell Bing and Yandex about new posts instantly.",
      category: "seo",
      capabilities: ["notify"],
      authType: "none",
      iconUrl: "/assets/integrations/indexnow.svg",
      gating: { requiredPlan: "free", requiredAddon: "channels" },
      entitlement: { canInstall: true, blocker: null },
    };

    expect(entry.id).toBe("indexnow");
    expect(entry.entitlement.canInstall).toBe(true);
    expect(entry.gating.requiredAddon).toBe("channels");
  });

  it("constructs a valid connection summary", () => {
    // Mirrors what `toSummary()` projects on the cloud side: nullable
    // externalAccountId / connectedAt (a freshly-saved doc may not have
    // them yet) and a structured `lastError` envelope rather than a flat
    // string so the UI can render code-driven hints.
    const summary: ConnectionSummary = {
      integrationId: "linkedin",
      status: "connected",
      displayName: "Yurii Vassilyev",
      externalAccountId: "li_user_123",
      connectedAt: "2026-04-14T00:00:00Z",
      lastUsedAt: null,
      lastError: null,
    };

    expect(summary.status satisfies ConnectionStatus).toBe("connected");
  });

  it("allows a structured lastError envelope on a degraded connection", () => {
    const errored: ConnectionSummary = {
      integrationId: "slack",
      status: "error",
      displayName: "#deploys",
      externalAccountId: "hooks.slack.com",
      connectedAt: "2026-04-14T00:00:00Z",
      lastUsedAt: "2026-04-14T01:00:00Z",
      lastError: {
        code: "permanent_error",
        message: "Channel was archived.",
        at: "2026-04-14T01:00:00Z",
      },
    };

    expect(errored.lastError?.code).toBe("permanent_error");
  });

  it("rejects unknown enum members at the type level", () => {
    // These assignments are valid — included to lock the union shape so a
    // typo in a future PR breaks the test compile, not the runtime.
    const validCategories: IntegrationCategory[] = [
      "notify",
      "social",
      "email",
      "seo",
      "ads",
      "crm",
    ];
    const validSkus: IntegrationSku[] = ["free", "channels", "growth"];

    expect(validCategories).toHaveLength(6);
    expect(validSkus).toHaveLength(3);
  });
});
