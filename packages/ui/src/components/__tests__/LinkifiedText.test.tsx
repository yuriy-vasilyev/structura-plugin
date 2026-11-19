import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LinkifiedText } from "../LinkifiedText";

/**
 * Provider messages shown verbatim on the API key test
 * (specs/provider-key-test.md). 2026-11-17: OpenAI's "no credits" answer
 * carried the billing URL; the portal hid it behind canned copy.
 */
const NO_CREDIT =
  "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.";

describe("LinkifiedText", () => {
  it("links the URL in a provider message and keeps the sentence's full stop out of it", () => {
    const { container } = render(<LinkifiedText text={NO_CREDIT} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://platform.openai.com/settings/organization/billing/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(container.textContent).toBe(NO_CREDIT);
  });

  it("renders text without a URL as plain text", () => {
    const { container } = render(<LinkifiedText text="invalid x-api-key" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.textContent).toBe("invalid x-api-key");
  });

  it("links every URL and leaves non-http schemes as text", () => {
    render(
      <LinkifiedText text="See https://a.example/x, then http://b.example/y; never javascript:alert(1)" />
    );
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://a.example/x",
      "http://b.example/y",
    ]);
  });

  it("keeps a closing parenthesis the URL opened and drops one that wraps it", () => {
    render(
      <LinkifiedText text="Docs (https://a.example/docs) and https://en.wikipedia.org/wiki/Quota_(finance)." />
    );
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      "https://a.example/docs",
      "https://en.wikipedia.org/wiki/Quota_(finance)",
    ]);
  });

  it("renders markup in the message as text, never as HTML", () => {
    const { container } = render(<LinkifiedText text={'<img src=x onerror="alert(1)">'} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("adds the screen-reader new-tab note to each link", () => {
    render(<LinkifiedText text="Go to https://a.example/x" newTabLabel="(opens in a new tab)" />);
    expect(screen.getByRole("link", { name: "https://a.example/x (opens in a new tab)" })).toBeInTheDocument();
  });
});
