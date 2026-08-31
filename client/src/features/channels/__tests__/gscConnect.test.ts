/**
 * gscConnect — pure state derivation for the GSC connect modal.
 *
 * Pins the handoff's state machine (Boards 02–05) and the spec §4.2
 * pre-selection order the "Best match" badge relies on: exact URL-prefix
 * hit → covering domain property → highest permission. Mirrors the cloud
 * matcher (functions/src/gsc/property-match.ts) from the host-only side.
 */

import { describe, expect, it } from "vitest";
import {
  bestGscPropertyMatch,
  deriveGscConnectView,
  gscPropertyKind,
  gscPropertyToRequest,
  usableGscProperties,
} from "../gscConnect";
import type { GoogleSearchConsoleProperty } from "../types";

const prop = (
  siteUrl: string,
  permissionLevel = "siteFullUser",
): GoogleSearchConsoleProperty => ({ siteUrl, permissionLevel });

describe("deriveGscConnectView", () => {
  it("returns auto_matched whenever a property is set", () => {
    expect(deriveGscConnectView("sc-domain:example.com", [])).toBe(
      "auto_matched",
    );
  });

  it("returns picker when no property is set but usable candidates exist", () => {
    expect(
      deriveGscConnectView(null, [
        prop("https://example.com/"),
        prop("sc-domain:other.com", "siteUnverifiedUser"),
      ]),
    ).toBe("picker");
  });

  it("returns insufficient_permission for a non-empty, unverified-only list", () => {
    // The wire list now INCLUDES siteUnverifiedUser entries — their
    // presence (with nothing usable) is exactly what renders Board 05.
    expect(
      deriveGscConnectView(null, [
        prop("sc-domain:example.com", "siteUnverifiedUser"),
      ]),
    ).toBe("insufficient_permission");
  });

  it("returns no_property for an empty list", () => {
    expect(deriveGscConnectView(null, [])).toBe("no_property");
  });
});

describe("usableGscProperties", () => {
  it("filters only the unverified permission level", () => {
    const list = [
      prop("https://a.com/", "siteOwner"),
      prop("https://b.com/", "siteRestrictedUser"),
      prop("https://c.com/", "siteUnverifiedUser"),
    ];
    expect(usableGscProperties(list).map((p) => p.siteUrl)).toEqual([
      "https://a.com/",
      "https://b.com/",
    ]);
  });
});

describe("gscPropertyKind", () => {
  it("classifies Google's two property id shapes", () => {
    expect(gscPropertyKind("sc-domain:example.com")).toBe("domain");
    expect(gscPropertyKind("https://example.com/")).toBe("prefix");
  });
});

describe("bestGscPropertyMatch", () => {
  it("prefers an exact URL-prefix hit over a covering domain property (spec §4.2)", () => {
    const match = bestGscPropertyMatch("example.com", [
      prop("sc-domain:example.com", "siteOwner"),
      prop("https://example.com/", "siteRestrictedUser"),
    ]);
    expect(match).toEqual({ siteUrl: "https://example.com/", covers: true });
  });

  it("falls back to a covering domain property when no prefix matches the host", () => {
    const match = bestGscPropertyMatch("blog.example.com", [
      prop("https://example.com/", "siteOwner"),
      prop("sc-domain:example.com", "siteRestrictedUser"),
    ]);
    // The domain property covers every subdomain; the prefix's host differs.
    expect(match).toEqual({
      siteUrl: "sc-domain:example.com",
      covers: true,
    });
  });

  it("falls back to the highest-permission property (covers: false) when nothing covers", () => {
    const match = bestGscPropertyMatch("example.com", [
      prop("https://other.com/", "siteRestrictedUser"),
      prop("sc-domain:another.com", "siteOwner"),
    ]);
    expect(match).toEqual({ siteUrl: "sc-domain:another.com", covers: false });
  });

  it("never selects an unverified property", () => {
    expect(
      bestGscPropertyMatch("example.com", [
        prop("sc-domain:example.com", "siteUnverifiedUser"),
      ]),
    ).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(bestGscPropertyMatch("example.com", [])).toBeNull();
  });

  it("matches hosts case-insensitively and ignores malformed prefix urls", () => {
    const match = bestGscPropertyMatch("Example.COM", [
      prop("not a url", "siteOwner"),
      prop("sc-domain:example.com", "siteFullUser"),
    ]);
    expect(match).toEqual({ siteUrl: "sc-domain:example.com", covers: true });
  });
});

describe("gscPropertyToRequest", () => {
  it("names the property covering the site host, regardless of permission", () => {
    // Board 05 asks the owner of the SITE's property — every entry is
    // unverified in that state, so permission must not filter here.
    expect(
      gscPropertyToRequest("example.com", [
        prop("sc-domain:other.com", "siteUnverifiedUser"),
        prop("sc-domain:example.com", "siteUnverifiedUser"),
      ]),
    ).toBe("sc-domain:example.com");
  });

  it("falls back to the first listed property when nothing covers", () => {
    expect(
      gscPropertyToRequest("example.com", [
        prop("sc-domain:other.com", "siteUnverifiedUser"),
      ]),
    ).toBe("sc-domain:other.com");
  });

  it("returns null for an empty list", () => {
    expect(gscPropertyToRequest("example.com", [])).toBeNull();
  });
});
