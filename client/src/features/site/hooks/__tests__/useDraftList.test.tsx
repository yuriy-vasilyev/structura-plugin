/**
 * useDraftList — local-draft semantics for the Site SEO editors.
 *
 * Pins the contract the Save-button refactor depends on: edits stay
 * local (dirty tracking), the draft re-seeds from the server when the
 * user hasn't diverged, and local edits survive an unrelated server
 * change.
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDraftList } from "../useDraftList";

describe("useDraftList", () => {
  it("seeds from the server value and is not dirty", () => {
    const { result } = renderHook(() => useDraftList(["a"]));
    expect(result.current.value).toEqual(["a"]);
    expect(result.current.dirty).toBe(false);
  });

  it("add/remove mutate only the local draft and track dirty", () => {
    const { result } = renderHook(() => useDraftList(["a"]));

    act(() => result.current.add("b"));
    expect(result.current.value).toEqual(["a", "b"]);
    expect(result.current.dirty).toBe(true);

    // Adding an existing item is a no-op.
    act(() => result.current.add("a"));
    expect(result.current.value).toEqual(["a", "b"]);

    act(() => result.current.remove("b"));
    expect(result.current.value).toEqual(["a"]);
    expect(result.current.dirty).toBe(false);
  });

  it("addMany skips duplicates and preserves order", () => {
    const { result } = renderHook(() => useDraftList(["a"]));
    act(() => result.current.addMany(["a", "b", "c"]));
    expect(result.current.value).toEqual(["a", "b", "c"]);
  });

  it("re-seeds when the server value changes and the draft is clean", () => {
    const { result, rerender } = renderHook(
      ({ s }) => useDraftList(s),
      { initialProps: { s: ["a"] as string[] } },
    );
    rerender({ s: ["a", "b"] });
    expect(result.current.value).toEqual(["a", "b"]);
    expect(result.current.dirty).toBe(false);
  });

  it("preserves local edits when the server value changes mid-edit", () => {
    const { result, rerender } = renderHook(
      ({ s }) => useDraftList(s),
      { initialProps: { s: ["a"] as string[] } },
    );
    act(() => result.current.add("local"));
    rerender({ s: ["a", "server"] });
    expect(result.current.value).toEqual(["a", "local"]);
    expect(result.current.dirty).toBe(true);
  });
});
