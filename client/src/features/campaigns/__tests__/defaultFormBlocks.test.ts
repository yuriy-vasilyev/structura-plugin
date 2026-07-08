/**
 * Default `enabledBlocks` per license tier (2026-06-06).
 *
 * Pins the `defaultOff` block flag: most blogs (recipes, travel, local
 * business…) have no natural code content, so a default-on Code block
 * invites the AI to force-fit one. Code stays available as an opt-in
 * toggle — only the *default* changes.
 */
import { describe, expect, it } from "vitest";
import { getCampaignFormDataForLicense } from "../helpers";
import { CONTENT_BLOCKS } from "@/features/settings/constants";

describe("getCampaignFormDataForLicense — enabledBlocks defaults", () => {
  it("paid tier defaults exclude core/code but keep the other Pro blocks", () => {
    const { structure } = getCampaignFormDataForLicense({
      isPaidLicense: true,
      isLicensed: true,
    });

    expect(structure.enabledBlocks).not.toContain("core/code");
    // The change must not silently drop blocks that should stay default-on.
    expect(structure.enabledBlocks).toContain("core/list");
    expect(structure.enabledBlocks).toContain("core/table");
    expect(structure.enabledBlocks).toContain("core/paragraph");
  });

  it("core/code remains in the registry as an opt-in block", () => {
    const code = CONTENT_BLOCKS.find((b) => b.name === "core/code");
    expect(code).toBeDefined();
    expect(code!.defaultOff).toBe(true);
  });

  it("free tier defaults still exclude every Pro block (unchanged)", () => {
    const { structure } = getCampaignFormDataForLicense({
      isPaidLicense: false,
      isLicensed: true,
    });

    for (const block of CONTENT_BLOCKS.filter((b) => b.isPro)) {
      expect(structure.enabledBlocks).not.toContain(block.name);
    }
  });
});

describe("getCampaignFormDataForLicense — postStatus default", () => {
  // New campaigns default to "pending" (changed 2026-06-07) so generated
  // posts wait for a human review before going live. Pinned across all
  // tiers because each tier branch spreads `structure` independently —
  // a tier-specific override would silently diverge.
  it.each([
    ["paid", { isPaidLicense: true, isLicensed: true }],
    ["free", { isPaidLicense: false, isLicensed: true }],
    ["none", { isPaidLicense: false, isLicensed: false }],
  ] as const)("%s tier defaults postStatus to pending", (_tier, license) => {
    const { structure } = getCampaignFormDataForLicense(license);
    expect(structure.postStatus).toBe("pending");
  });
});
