/**
 * Contract sweep for the wp-admin notice copy table.
 *
 * 2026-07-16: the copy table had silently fallen behind the cloud
 * contract — the whole `pluginHealth` and `seoIntel` sections were
 * missing, so the bell rendered raw dotted keys
 * (`notices.seoIntel.refreshed.title`) for notices the cloud emits
 * today. `resolveCopy` falls back to the literal key by design, which
 * makes "key === output" a reliable detector for missing copy. This
 * test walks every key in `@structura/i18n-contracts` so the table can
 * never fall behind again.
 */

import { describe, expect, it } from "vitest";
import { NOTICE_KEYS } from "@structura/i18n-contracts";

import { resolveCopy, SEVERITY_INTENT } from "../utils";

/** Every dotted key the cloud can emit, flattened from the contract. */
function allContractKeys(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (node && typeof node === "object") {
    return Object.values(node).flatMap(allContractKeys);
  }
  return [];
}

describe("resolveCopy", () => {
  it("has copy for every key in the cloud notice contract", () => {
    const unresolved = allContractKeys(NOTICE_KEYS).filter(
      (key) => resolveCopy(key) === key,
    );
    expect(unresolved).toEqual([]);
  });

  it("interpolates bodyParams", () => {
    const body = resolveCopy("notices.byok.key_rejected.body", {
      provider: "OpenAI",
    });
    expect(body).toContain("OpenAI");
    expect(body).not.toContain("{{provider}}");
  });

  it("pluralises the gemini-text title on the count param (2026-10-02)", () => {
    expect(resolveCopy("notices.byok.geminiText.title", { count: "1", site: "blog.test" })).toBe(
      "1 campaign on blog.test writes with Gemini",
    );
    expect(resolveCopy("notices.byok.geminiText.title", { count: "3", site: "blog.test" })).toBe(
      "3 campaigns on blog.test write with Gemini",
    );
  });

  it("falls back to the raw key for a key outside the contract", () => {
    expect(resolveCopy("notices.some.future.key")).toBe(
      "notices.some.future.key",
    );
  });
});

// 2026-10-08 (specs/empty-keyword-campaigns.md §5): a campaign with no keywords
// writes from its objective, so the notice is information, not a warning.
describe("no-keywords notice", () => {
  it("renders the info severity with the info badge", () => {
    expect(SEVERITY_INTENT.info).toBe("info");
  });

  it("says keywords are optional instead of calling the campaign broken", () => {
    const body = resolveCopy("notices.seoIntel.noKeywords.body", {
      campaignName: "Content Posting",
    });
    expect(body).toBe(
      "Content Posting has no keywords, so each post picks a new topic from the campaign objective and skips topics this site already covers. Keywords are optional. Add some if you want to choose what each post targets.",
    );
    expect(resolveCopy("notices.seoIntel.noKeywords.title")).toBe(
      "This campaign is writing from its objective",
    );
    expect(resolveCopy("notices.seoIntel.noKeywords.cta")).toBe("Add keywords");
  });
});
