import { describe, expect, it } from "vitest";
import { authorityChipLabel } from "../RunDetailPage";

/**
 * Guards the run-detail authority chip against a doubly-nested
 * `authorityDomains` run doc (cloud bug fixed in cluster-adapter, 2026-07-01).
 * Rendering the raw `title` object threw React #31 and white-screened the run
 * view — so a failed run could never be opened to read why it failed.
 */
describe("authorityChipLabel", () => {
  it("returns a plain string title unchanged", () => {
    expect(authorityChipLabel({ url: "https://gartner.com", title: "Gartner" })).toBe(
      "Gartner",
    );
  });

  it("extracts .domain when title is a VettedAuthorityDomain object (the crash case)", () => {
    const corrupt = {
      url: "https://[object Object]",
      title: {
        domain: "messermagazin.de",
        description: "Fachmagazin für Messer",
        tier: "niche",
        citedBy: 1,
        category: "publication",
        sampleUrls: [],
      },
    };
    expect(authorityChipLabel(corrupt)).toBe("messermagazin.de");
    expect(typeof authorityChipLabel(corrupt)).toBe("string");
  });

  it("derives a host from the url when title is missing/non-string", () => {
    expect(
      authorityChipLabel({ url: "https://zwilling.com/de/ratgeber", title: undefined }),
    ).toBe("zwilling.com");
  });

  it("never throws and always returns a string for junk input", () => {
    expect(authorityChipLabel({})).toBe("");
    expect(authorityChipLabel({ title: 42, url: 7 })).toBe("");
    expect(authorityChipLabel({ title: null, url: null })).toBe("");
  });
});
