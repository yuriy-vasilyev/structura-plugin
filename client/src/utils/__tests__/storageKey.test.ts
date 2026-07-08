/**
 * perActivationStorageKey — discriminator precedence.
 *
 * The whole point is cross-site isolation: a fixed key leaked one
 * install's persisted state into another opened in the same browser.
 */
import { afterEach, describe, expect, it } from "vitest";
import { perActivationStorageKey } from "../storageKey";

const original = window.structuraConfig;
afterEach(() => {
  window.structuraConfig = original;
});

describe("perActivationStorageKey", () => {
  it("prefers the activation_id discriminator", () => {
    window.structuraConfig = {
      activation_id: "act-1",
      domain: "example.test",
    } as Window["structuraConfig"];
    expect(perActivationStorageKey("structura-x")).toBe("structura-x:act-1");
  });

  it("falls back to domain when activation_id is absent", () => {
    window.structuraConfig = {
      domain: "example.test",
    } as Window["structuraConfig"];
    expect(perActivationStorageKey("structura-x")).toBe(
      "structura-x:example.test",
    );
  });

  it("falls back to 'default' when neither is present", () => {
    window.structuraConfig = {} as Window["structuraConfig"];
    expect(perActivationStorageKey("structura-x")).toBe("structura-x:default");
  });
});
