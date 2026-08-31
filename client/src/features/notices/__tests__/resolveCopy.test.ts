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

import { resolveCopy } from "../utils";

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

  it("falls back to the raw key for a key outside the contract", () => {
    expect(resolveCopy("notices.some.future.key")).toBe(
      "notices.some.future.key",
    );
  });
});
