import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";

import { installWpJsxRuntimeShim } from "../wpJsxRuntimeShim";

/**
 * Regression for the onboarding competitors-step crash (React #130, 2026-07-20).
 *
 * The shim used to alias `jsx`/`jsxs` straight to `createElement`. Because the
 * automatic runtime passes `key` as the THIRD argument while `createElement`
 * treats the 3rd argument as a CHILD, a keyed call clobbered `children` with
 * the key string — so a keyed `<Tooltip>{chip}</Tooltip>` from `@structura/ui`
 * received a string child and crashed in `cloneElement`. These pin the correct
 * behaviour: children survive in props, and key stays a key.
 */
describe("installWpJsxRuntimeShim", () => {
  it("keeps children in props and treats the 3rd arg as a key, not a child", () => {
    const element = { createElement } as Parameters<typeof installWpJsxRuntimeShim>[0];
    installWpJsxRuntimeShim(element);

    const chip = createElement("button", null, "hi");
    // jsx(type, props, key) — the exact shape @structura/ui's automatic runtime emits.
    const wrapped = (element.jsx as (t: unknown, p: unknown, k?: unknown) => any)(
      "div",
      { children: chip },
      "https://competitor.example",
    );

    // The pre-fix alias produced `children === "https://competitor.example"`.
    expect(wrapped.props.children).toBe(chip);
    expect(wrapped.key).toBe("https://competitor.example");
  });

  it("handles a keyless call (children survive, no spurious key)", () => {
    const element = { createElement } as Parameters<typeof installWpJsxRuntimeShim>[0];
    installWpJsxRuntimeShim(element);

    const child = createElement("span", null, "x");
    const wrapped = (element.jsx as (t: unknown, p: unknown, k?: unknown) => any)(
      "div",
      { children: child },
    );

    expect(wrapped.props.children).toBe(child);
    expect(wrapped.key).toBeNull();
  });

  it("aliases jsxs + jsxDEV to the same corrected runtime", () => {
    const element = { createElement } as Parameters<typeof installWpJsxRuntimeShim>[0];
    installWpJsxRuntimeShim(element);
    expect(typeof element.jsxs).toBe("function");
    expect(typeof element.jsxDEV).toBe("function");
  });

  it("does NOT override a real jsx runtime WP already provides", () => {
    const realJsx = vi.fn();
    const element = {
      createElement,
      jsx: realJsx,
    } as unknown as Parameters<typeof installWpJsxRuntimeShim>[0];
    installWpJsxRuntimeShim(element);
    expect(element.jsx).toBe(realJsx);
  });
});
