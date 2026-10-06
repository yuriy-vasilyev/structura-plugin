/**
 * AI Engine provider cards — AI guidance.
 *
 * 2026-10-02 (specs/byok-ai-guidance.md §5 wp-admin): "Recommended for
 * text" sits in the title row of the Anthropic card.
 * 2026-10-06 (specs/open-providers.md): every plan may connect every
 * provider, so the cards have no tier or count locks any more; Gemini
 * carries "Recommended for images" in the same chip; the capability chips
 * show what the provider can do, whatever the plan.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { AvailableProviderCard } from "../components/AvailableProviderCard";

const card = (props: Partial<React.ComponentProps<typeof AvailableProviderCard>> = {}) => {
  const onSetUp = vi.fn();
  render(
    <AvailableProviderCard
      id="anthropic"
      name="Anthropic Claude"
      description="Text"
      capabilities={["text"]}
      onSetUp={onSetUp}
      {...props}
    />
  );
  return { onSetUp };
};

describe("AvailableProviderCard — guidance", () => {
  it("labels the Anthropic card Recommended for text and connects it", () => {
    const { onSetUp } = card();
    expect(screen.getByText("Recommended for text")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    expect(onSetUp).toHaveBeenCalledTimes(1);
  });

  it("labels the Gemini card Recommended for images and shows its Images chip", () => {
    card({ id: "gemini", name: "Google Gemini", description: "Text and images", capabilities: ["text", "image"] });
    expect(screen.getByText("Recommended for images")).toBeInTheDocument();
    expect(screen.queryByText("Recommended for text")).toBeNull();
    expect(screen.getByText("Image")).toBeInTheDocument();
  });

  it("puts no label on OpenAI", () => {
    card({ id: "openai", name: "OpenAI", description: "Text and images", capabilities: ["text", "image"] });
    expect(screen.queryByText(/Recommended for/)).toBeNull();
  });

  it("has no lock, plan chip or upgrade link on any provider", () => {
    card();
    expect(screen.queryByText(/License/)).toBeNull();
    expect(screen.queryByText("Needs a Pro License")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
