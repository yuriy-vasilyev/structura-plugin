/**
 * The references list rule (specs/study-lookup.md §12.3): off by default on
 * every plan, unavailable while authority links are off, and switched off
 * together with them. The real defaults and helpers run; nothing is mocked.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_SEO_RULES } from "../constants";
import { getCampaignFormDataForLicense, isSeoRuleUnavailable, withSeoRule } from "../helpers";

describe("references list defaults", () => {
  it("is off in the shipped defaults while the rule it needs is on", () => {
    expect(DEFAULT_SEO_RULES.references_list).toBe(false);
    expect(DEFAULT_SEO_RULES.outbound_link_authority).toBe(true);
  });

  it.each([
    ["paid", { isPaidLicense: true, isLicensed: true }],
    ["free", { isPaidLicense: false, isLicensed: true }],
    ["anonymous", { isPaidLicense: false, isLicensed: false }],
  ])("is off for a new %s campaign", (_plan, license) => {
    expect(getCampaignFormDataForLicense(license).intelligence.seoRules.references_list).toBe(false);
  });
});

describe("isSeoRuleUnavailable", () => {
  it("holds the references list back while authority links are off", () => {
    expect(isSeoRuleUnavailable("references_list", { ...DEFAULT_SEO_RULES, outbound_link_authority: false })).toBe(true);
    expect(isSeoRuleUnavailable("references_list", DEFAULT_SEO_RULES)).toBe(false);
  });

  it("reads a stored campaign without the authority key as authority off", () => {
    const { outbound_link_authority: _dropped, ...stored } = DEFAULT_SEO_RULES;
    expect(isSeoRuleUnavailable("references_list", stored as typeof DEFAULT_SEO_RULES)).toBe(true);
  });

  it("never holds back any other rule", () => {
    const allOff = { ...DEFAULT_SEO_RULES, outbound_link_authority: false };
    for (const name of Object.keys(DEFAULT_SEO_RULES).filter((n) => n !== "references_list")) {
      expect(isSeoRuleUnavailable(name as keyof typeof DEFAULT_SEO_RULES, allOff)).toBe(false);
    }
  });
});

describe("withSeoRule", () => {
  const on = { ...DEFAULT_SEO_RULES, references_list: true };

  it("turns the references list off with authority links", () => {
    expect(withSeoRule(on, "outbound_link_authority", false)).toEqual({
      ...DEFAULT_SEO_RULES,
      outbound_link_authority: false,
      references_list: false,
    });
  });

  it("leaves the references list off when authority links come back on", () => {
    const off = withSeoRule(on, "outbound_link_authority", false);
    expect(withSeoRule(off, "outbound_link_authority", true).references_list).toBe(false);
  });

  it("sets any other rule alone and does not mutate its input", () => {
    const before = { ...on };
    expect(withSeoRule(on, "include_faq_section", false)).toEqual({ ...on, include_faq_section: false });
    expect(withSeoRule(on, "references_list", false)).toEqual({ ...on, references_list: false });
    expect(on).toEqual(before);
  });

  it("adds no references key to a stored campaign that lacks it unless authority goes off", () => {
    const { references_list: _absent, ...stored } = DEFAULT_SEO_RULES;
    expect(withSeoRule(stored, "include_statistics", false)).not.toHaveProperty("references_list");
  });
});
