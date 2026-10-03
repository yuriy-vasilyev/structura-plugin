/**
 * AI Engine provider cards — AI guidance (2026-10-02,
 * specs/byok-ai-guidance.md §5 wp-admin).
 *
 * "Recommended for text" sits in the title row of the Anthropic card. A card
 * locked behind the Pro License shows the plain line "Needs a Pro License"
 * instead of the lock chip, and its button becomes a "Compare plans" link to
 * the customer portal's plans page in a new tab. The cap lock is unchanged.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { AvailableProviderCard } from "../components/AvailableProviderCard";

const PLANS =
  "https://app.structurawp.com/?intent=unlock_provider&provider=anthropic&source=plugin";

const card = (props: Partial<React.ComponentProps<typeof AvailableProviderCard>> = {}) => {
  const onSetUp = vi.fn();
  render(
    <AvailableProviderCard
      id="anthropic"
      name="Anthropic"
      description="Claude models"
      capabilities={["text"]}
      available
      minTier="byok"
      onSetUp={onSetUp}
      comparePlansHref={PLANS}
      {...props}
    />
  );
  return { onSetUp };
};

describe("AvailableProviderCard — guidance", () => {
  it("labels the Anthropic card Recommended for text", () => {
    card();
    expect(screen.getByText("Recommended for text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect/ })).toBeInTheDocument();
  });

  it("puts no label on the other providers", () => {
    card({ id: "gemini", name: "Gemini", minTier: "none" });
    expect(screen.queryByText("Recommended for text")).toBeNull();
  });

  it("Pro-locked: label, plain 'Needs a Pro License' line and a Compare plans link", () => {
    const { onSetUp } = card({ available: false });

    expect(screen.getByText("Recommended for text")).toBeInTheDocument();
    expect(screen.getByText("Needs a Pro License")).toBeInTheDocument();
    // The lock chip ("Pro License") and the Connect button are gone.
    expect(screen.queryByText("Pro License")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();

    const link = screen.getByRole("link", { name: /Compare plans/ });
    expect(link).toHaveAttribute("href", PLANS);
    expect(link).toHaveAttribute("target", "_blank");
    fireEvent.click(link);
    expect(onSetUp).not.toHaveBeenCalled();
  });

  it("cap-locked cards keep the existing chip and Get Free License button", () => {
    card({ id: "openai", name: "OpenAI", minTier: "none", available: false, lockReason: "cap" });
    expect(screen.getByText("Free License")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Get Free License/ })).toBeInTheDocument();
    expect(screen.queryByText("Needs a Pro License")).toBeNull();
  });
});
