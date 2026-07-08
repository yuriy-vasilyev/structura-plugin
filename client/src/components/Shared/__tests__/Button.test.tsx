/**
 * Button (@structura/ui) icon + gap behavior tests.
 *
 * The component lives in `packages/ui` but the package has no test
 * runner of its own; we exercise the cross-package contract from the
 * client where vitest + jsdom are wired up. Coverage focuses on the
 * fix Yurii flagged: `<Button className="gap-2">` was inert because
 * the outer `<button>` had a single child wrapping span and the gap
 * never reached the icon+label. The variants now bake in a size-aware
 * gap, and Button.tsx mirrors that gap onto the inner span so the
 * non-asChild branch picks it up too.
 *
 *   1. Non-asChild buttons: the inner span (the actual flex parent of
 *      icon+label) carries a `gap-*` class that scales with size.
 *   2. asChild buttons: the rendered child element directly carries
 *      the variant gap, since the wrapping span isn't rendered.
 *   3. Icons inside buttons inherit the size and stroke-width
 *      defaults from the variant base classes — the regression that
 *      motivated the refactor (lucide icon at default 24px / stroke
 *      2 next to font-bold label looked thin and oversized).
 */

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { UserPlus } from "lucide-react";
import { Button } from "@structura/ui";

describe("Button", () => {
  it("renders an inner span with a default gap on non-asChild md buttons", () => {
    const { container } = render(
      <Button>
        <UserPlus />
        Invite member
      </Button>,
    );
    // The span is the only direct child of <button>.
    const innerSpan = container.querySelector("button > span");
    expect(innerSpan).not.toBeNull();
    expect(innerSpan?.className).toMatch(/\bgap-2\b/);
  });

  it("uses the smaller gap on size=sm buttons", () => {
    const { container } = render(
      <Button size="sm">
        <UserPlus />
        Sm
      </Button>,
    );
    const innerSpan = container.querySelector("button > span");
    expect(innerSpan?.className).toMatch(/\bgap-1\.5\b/);
  });

  it("uses the larger gap on size=lg buttons", () => {
    const { container } = render(
      <Button size="lg">
        <UserPlus />
        Lg
      </Button>,
    );
    const innerSpan = container.querySelector("button > span");
    expect(innerSpan?.className).toMatch(/\bgap-2\.5\b/);
  });

  it("forwards the gap onto the rendered child element when asChild is set", () => {
    // asChild does NOT render the inner span — Slot merges variant
    // classes directly onto the child element, so the gap class lives
    // on the <a> instead.
    const { container } = render(
      <Button asChild>
        <a href="/test">
          <UserPlus />
          Link
        </a>
      </Button>,
    );
    const anchor = container.querySelector("a");
    expect(anchor?.className).toMatch(/\bgap-2\b/);
  });

  it("renders the icon as a direct descendant of the button", () => {
    // Sanity: lucide renders an <svg>; we want the variant's
    // `[&_svg]:size-4` and `stroke-width: 2.5` defaults to reach it.
    // jsdom doesn't compute styles from CSS classes, so we assert the
    // SVG is present and that the variant class string includes the
    // svg-targeting selectors via the button's own className.
    const { container } = render(
      <Button>
        <UserPlus />
        Invite
      </Button>,
    );
    const button = container.querySelector("button");
    expect(button?.querySelector("svg")).not.toBeNull();
    // The variant classes are emitted on the <button>; check the
    // svg-targeting tokens are present so a refactor that drops them
    // fails this test.
    expect(button?.className).toMatch(/\[&_svg\]:size-4/);
    expect(button?.className).toMatch(/stroke-width:2\.5/);
  });
});
