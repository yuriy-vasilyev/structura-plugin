/**
 * CloudUnreachableBanner tests.
 *
 * Coverage priorities:
 *   - Self-gates on `window.structuraConfig.cloud_unreachable` — the
 *     same zero-network bootstrap-flag pattern as WpCronDisabledBanner.
 *   - Renders nothing when the flag is false or missing (back-compat
 *     with plugin builds predating the flag — must NOT cry wolf).
 *   - Renders the error banner + docs link when the flag is true.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
}));

vi.mock("@/utils/docsUrl", () => ({
  docsUrl: (path: string) => `https://docs.structurawp.com/en/${path}`,
}));

import { CloudUnreachableBanner } from "../CloudUnreachableBanner";

function setFlag(value: boolean | undefined) {
  const existing =
    (window as unknown as { structuraConfig?: Record<string, unknown> })
      .structuraConfig ?? {};
  if (value === undefined) {
    delete (existing as { cloud_unreachable?: unknown }).cloud_unreachable;
  } else {
    (existing as { cloud_unreachable?: boolean }).cloud_unreachable = value;
  }
  (window as unknown as { structuraConfig?: Record<string, unknown> }).structuraConfig =
    existing;
}

beforeEach(() => {
  setFlag(undefined);
});

describe("CloudUnreachableBanner", () => {
  it("renders nothing when the flag is absent (back-compat)", () => {
    setFlag(undefined);
    const { container } = render(<CloudUnreachableBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the site is reachable", () => {
    setFlag(false);
    const { container } = render(<CloudUnreachableBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the banner and a docs link when the cloud can't reach the site", () => {
    setFlag(true);
    render(<CloudUnreachableBanner />);

    expect(
      screen.getByText("Structura Cloud can't reach this site"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Read the setup guide/i }),
    ).toHaveAttribute(
      "href",
      "https://docs.structurawp.com/en/troubleshooting/cloud-unreachable",
    );
  });
});
