/**
 * Tests for `portalLinks` URL builders.
 *
 * What's worth pinning:
 *   - `resolveMarketingLocale` survives the three locale shapes the
 *     browser actually exposes (WP `en_US`, BCP-47 `en-US`, bare `en`)
 *     and falls through to `"en"` for unsupported locales. The
 *     marketing site only ships four locales — anything else has to
 *     land on the English page rather than a 404.
 *   - `buildMarketingPricingUrl` builds the `/{locale}/pricing` path
 *     and only emits query params it actually has values for. Empty
 *     params would leak the wp-admin's defaults into analytics.
 *   - `buildPortalSignupUrl` still accepts the new `unlock_keyword_bank`
 *     intent without other intents regressing — the union widening
 *     was the whole point of the change.
 */

import { describe, expect, it } from "vitest";

import {
  buildMarketingPricingUrl,
  buildPortalSignupUrl,
  resolveMarketingLocale,
} from "../portalLinks";

describe("resolveMarketingLocale", () => {
  it("passes through the four supported base locales", () => {
    expect(resolveMarketingLocale("en")).toBe("en");
    expect(resolveMarketingLocale("de")).toBe("de");
    expect(resolveMarketingLocale("es")).toBe("es");
    expect(resolveMarketingLocale("fr")).toBe("fr");
  });

  it("strips WP-style region tags (en_US, de_DE) down to the base", () => {
    expect(resolveMarketingLocale("en_US")).toBe("en");
    expect(resolveMarketingLocale("de_DE")).toBe("de");
    expect(resolveMarketingLocale("es_ES")).toBe("es");
    expect(resolveMarketingLocale("fr_CA")).toBe("fr");
  });

  it("strips BCP-47 region tags (en-US, pt-BR) down to the base", () => {
    expect(resolveMarketingLocale("en-US")).toBe("en");
    expect(resolveMarketingLocale("de-AT")).toBe("de");
    expect(resolveMarketingLocale("es-419")).toBe("es");
  });

  it("falls through to 'en' for unsupported locales and empty input", () => {
    expect(resolveMarketingLocale("ja")).toBe("en");
    expect(resolveMarketingLocale("pt_BR")).toBe("en");
    expect(resolveMarketingLocale("")).toBe("en");
    expect(resolveMarketingLocale(null)).toBe("en");
    expect(resolveMarketingLocale(undefined)).toBe("en");
  });

  it("is case-insensitive on the input", () => {
    expect(resolveMarketingLocale("DE_DE")).toBe("de");
    expect(resolveMarketingLocale("FR")).toBe("fr");
  });
});

describe("buildMarketingPricingUrl", () => {
  it("prepends the resolved locale segment to the /pricing path", () => {
    const url = buildMarketingPricingUrl({
      intent: "unlock_keyword_bank",
      locale: "de_DE",
    });
    expect(url).toMatch(
      /^https:\/\/www\.structurawp\.com\/de\/pricing\?intent=unlock_keyword_bank/,
    );
  });

  it("includes intent + source=plugin by default", () => {
    const url = buildMarketingPricingUrl({
      intent: "unlock_keyword_bank",
      locale: "en",
    });
    expect(url).toContain("intent=unlock_keyword_bank");
    expect(url).toContain("source=plugin");
  });

  it("emits only the optional params that have values", () => {
    const url = buildMarketingPricingUrl({
      intent: "unlock_keyword_bank",
      locale: "en",
      domain: "example.com",
      suggest: "cloud",
    });
    expect(url).toContain("domain=example.com");
    expect(url).toContain("suggest=cloud");
    expect(url).not.toContain("plan=");
  });

  it("falls back to /en/pricing when locale is unsupported", () => {
    const url = buildMarketingPricingUrl({
      intent: "unlock_keyword_bank",
      locale: "ja_JP",
    });
    expect(url).toMatch(/^https:\/\/www\.structurawp\.com\/en\/pricing\?/);
  });
});

describe("buildPortalSignupUrl — unlock_keyword_bank intent", () => {
  it("accepts the new intent and round-trips the context params", () => {
    const url = buildPortalSignupUrl({
      intent: "unlock_keyword_bank",
      domain: "example.com",
      plan: "free",
    });
    expect(url).toContain("intent=unlock_keyword_bank");
    expect(url).toContain("source=plugin");
    expect(url).toContain("domain=example.com");
    expect(url).toContain("plan=free");
  });

  it("does not regress existing intents", () => {
    const url = buildPortalSignupUrl({
      intent: "connect_more_providers",
      providerId: "anthropic",
    });
    expect(url).toContain("intent=connect_more_providers");
    expect(url).toContain("provider=anthropic");
  });
});

describe("buildPortalSignupUrl — returnTo", () => {
  it("emits returnTo URL-encoded when provided", () => {
    const url = buildPortalSignupUrl({
      intent: "unlock_keyword_bank",
      returnTo:
        "https://example.com/wp-admin/admin.php?page=structura#/campaigns/new?resume=draft&step=keywords",
    });
    // URLSearchParams encodes `:` `/` `#` `?` `&` `=` — assert by
    // round-tripping the value rather than pinning encoded output.
    const parsed = new URL(url);
    expect(parsed.searchParams.get("returnTo")).toBe(
      "https://example.com/wp-admin/admin.php?page=structura#/campaigns/new?resume=draft&step=keywords",
    );
  });

  it("omits returnTo when not provided (no empty param)", () => {
    const url = buildPortalSignupUrl({ intent: "unlock_keyword_bank" });
    expect(url).not.toContain("returnTo=");
  });
});

describe("buildMarketingPricingUrl — returnTo + anchor", () => {
  it("emits returnTo before the anchor fragment", () => {
    const url = buildMarketingPricingUrl({
      intent: "unlock_authority",
      locale: "en",
      returnTo: "https://example.com/wp-admin/admin.php?page=structura",
      anchor: "agency-volume",
    });
    expect(url).toMatch(
      /^https:\/\/www\.structurawp\.com\/en\/pricing\?.*#agency-volume$/,
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("returnTo")).toBe(
      "https://example.com/wp-admin/admin.php?page=structura",
    );
    expect(parsed.hash).toBe("#agency-volume");
  });

  it("accepts an anchor with or without leading #", () => {
    const a = buildMarketingPricingUrl({
      intent: "unlock_addon",
      locale: "en",
      anchor: "#addons",
    });
    const b = buildMarketingPricingUrl({
      intent: "unlock_addon",
      locale: "en",
      anchor: "addons",
    });
    expect(new URL(a).hash).toBe("#addons");
    expect(new URL(b).hash).toBe("#addons");
  });

  it("omits the anchor entirely when not provided", () => {
    const url = buildMarketingPricingUrl({
      intent: "unlock_addon",
      locale: "en",
    });
    expect(new URL(url).hash).toBe("");
  });
});

describe("New intents are accepted by the union", () => {
  // Compile-time check: passing each new intent literal must not be a
  // type error. The test body uses `toContain` so the runtime catches
  // any helper-side mistakes (e.g. lowercasing) as well.
  it.each([
    "unlock_authority",
    "unlock_channels",
    "unlock_addon",
    "manage_account",
    "general_upgrade",
  ] as const)("accepts intent=%s on both builders", (intent) => {
    const a = buildPortalSignupUrl({ intent });
    const b = buildMarketingPricingUrl({ intent, locale: "en" });
    expect(a).toContain(`intent=${intent}`);
    expect(b).toContain(`intent=${intent}`);
  });
});
