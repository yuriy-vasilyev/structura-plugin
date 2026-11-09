/**
 * Signature picker cards (handoffs/visual-signatures/README.md §3.2, §10).
 *
 * SignatureCard keeps PresetRadioCard's radio contract (aria-checked, roving
 * tabindex, arrow keys that skip disabled radios). What is new sits around
 * the radio: the reason strip and the footer live outside it and describe
 * it, so the radio's name stays name + description + medium. The action
 * card ("Your own", "Free prompt") is a plain button in the same grid.
 */
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PresetRadioCardGroup } from "../PresetRadioCard";
import {
  SignatureActionCard,
  SignatureBuildTile,
  SignatureCard,
  SignaturePromptTile,
  type SignatureActionCardProps,
  type SignatureCardProps,
} from "../SignatureCard";
import { matchedDeclarations } from "./tailwind-rules";

const LIBRARY = [
  {
    value: "editorial-reportage",
    name: "Editorial reportage",
    description: "Natural light, real places, one clear subject.",
    medium: "Photography",
  },
  {
    value: "paper-cut",
    name: "Paper cut",
    description: "Layered paper shapes with soft shadows.",
    medium: "Illustration",
  },
  {
    value: "ink-and-fill",
    name: "Ink and fill",
    description: "Confident black linework with one flat colour.",
    medium: "Illustration",
  },
];

const REASON = "Warm and hand-made, like your seasonal planting guides.";

/** The locked footer from the handoff: gate badge plus the upgrade link. */
const LockedFooter = () => (
  <>
    <span>Paid plans</span> <a href="/plans">Upgrade plan</a>
  </>
);

/** Controlled library grid, so clicks and arrow keys actually move the selection. */
function Library({
  initial = "editorial-reportage",
  cards = {},
  onValueChange,
  children,
}: {
  initial?: string;
  cards?: Record<string, Partial<Omit<SignatureCardProps, "value">>>;
  onValueChange?: (value: string) => void;
  children?: ReactNode;
}) {
  const [value, setValue] = useState(initial);
  return (
    <PresetRadioCardGroup
      aria-label="Signature"
      value={value}
      onValueChange={(next) => {
        onValueChange?.(next);
        setValue(next);
      }}
    >
      {LIBRARY.map((s) => (
        <SignatureCard
          key={s.value}
          value={s.value}
          name={s.name}
          description={s.description}
          mediumLabel={s.medium}
          {...cards[s.value]}
        />
      ))}
      {children}
    </PresetRadioCardGroup>
  );
}

const radio = (name: string) => screen.getByRole("radio", { name: new RegExp(`^${name}`) });

/** The card frame around a radio or action button. */
const frameOf = (el: HTMLElement) => el.closest<HTMLElement>('[data-slot="signature-card"]')!;

describe("SignatureCard: radio contract", () => {
  it("renders one radio per card inside the labelled radiogroup", () => {
    render(<Library />);
    const group = screen.getByRole("radiogroup", { name: "Signature" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
  });

  it("names the radio by its name, description and medium", () => {
    render(<Library />);
    expect(radio("Paper cut")).toHaveAccessibleName(
      "Paper cut Layered paper shapes with soft shadows. Illustration"
    );
  });

  it("marks only the selected card checked and gives it the check badge", () => {
    render(<Library initial="paper-cut" />);
    expect(radio("Paper cut")).toHaveAttribute("aria-checked", "true");
    expect(radio("Ink and fill")).toHaveAttribute("aria-checked", "false");
    const check = radio("Paper cut").querySelector('[data-slot="selected-check"]');
    expect(check).toHaveAttribute("aria-hidden", "true");
    expect(check?.querySelector("svg.lucide-check")).not.toBeNull();
    expect(radio("Ink and fill").querySelector('[data-slot="selected-check"]')).toBeNull();
  });

  it("keeps only the selected card in the tab order", () => {
    render(<Library initial="paper-cut" />);
    expect(radio("Paper cut")).toHaveAttribute("tabindex", "0");
    expect(radio("Editorial reportage")).toHaveAttribute("tabindex", "-1");
  });

  it("selects a card on click", () => {
    const onValueChange = vi.fn();
    render(<Library onValueChange={onValueChange} />);
    fireEvent.click(radio("Ink and fill"));
    expect(onValueChange).toHaveBeenCalledWith("ink-and-fill");
    expect(radio("Ink and fill")).toHaveAttribute("aria-checked", "true");
  });

  it("moves selection and focus with the arrow keys", () => {
    render(<Library />);
    const first = radio("Editorial reportage");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(radio("Paper cut")).toHaveAttribute("aria-checked", "true");
    expect(radio("Paper cut")).toHaveFocus();
  });

  it("throws outside a PresetRadioCardGroup, naming itself", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<SignatureCard value="paper-cut" name="Paper cut" />)).toThrow(
      "SignatureCard must be used within a PresetRadioCardGroup."
    );
    quiet.mockRestore();
  });
});

describe("SignatureCard: locked", () => {
  it("is a disabled radio with a decorative lock chip, skipped by the arrow keys", () => {
    render(<Library cards={{ "paper-cut": { locked: true } }} />);
    const locked = radio("Paper cut");
    expect(locked).toBeDisabled();
    const chip = locked.querySelector('[data-slot="lock-chip"]');
    expect(chip).toHaveAttribute("aria-hidden", "true");
    expect(chip?.querySelector("svg.lucide-lock")).not.toBeNull();

    const first = radio("Editorial reportage");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(radio("Ink and fill")).toHaveAttribute("aria-checked", "true");
    expect(locked).toHaveAttribute("aria-checked", "false");
  });

  it("keeps the frame unchanged and the cursor default", () => {
    render(<Library cards={{ "paper-cut": { locked: true } }} />);
    const locked = radio("Paper cut");
    expect(frameOf(locked)).toHaveClass("border-neutral-200", "bg-white");
    expect(locked).toHaveClass("disabled:cursor-default");
    expect(locked).not.toHaveClass("disabled:opacity-55");
  });

  it("stays selectable with disabled={false}: the kept-after-downgrade card", () => {
    render(<Library cards={{ "paper-cut": { locked: true, disabled: false } }} />);
    const kept = radio("Paper cut");
    expect(kept).toBeEnabled();
    expect(kept.querySelector('[data-slot="lock-chip"]')).not.toBeNull();

    const first = radio("Editorial reportage");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(kept).toHaveAttribute("aria-checked", "true");
  });

  it("puts the lock chip beside the In use badge, after it", () => {
    render(<Library cards={{ "paper-cut": { locked: true, inUseLabel: "In use" } }} />);
    const inUse = within(radio("Paper cut")).getByText("In use");
    const chip = radio("Paper cut").querySelector('[data-slot="lock-chip"]')!;
    expect(inUse.parentElement).toBe(chip.parentElement);
    expect(inUse.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("SignatureCard: thumbnail and body", () => {
  it("shows the In use badge on the thumbnail and reads it as a description, not the name", () => {
    render(<Library cards={{ "paper-cut": { inUseLabel: "In use" } }} />);
    const card = radio("Paper cut");
    const badge = within(card).getByText("In use");
    expect(badge.closest('[data-slot="thumbnail"]')).not.toBeNull();
    expect(card).toHaveAccessibleName(
      "Paper cut Layered paper shapes with soft shadows. Illustration"
    );
    expect(card).toHaveAccessibleDescription("In use");
  });

  it("renders the recommended label as the body's first line, read as a description", () => {
    render(<Library cards={{ "paper-cut": { recommendedLabel: "Our pick for your brand" } }} />);
    const card = radio("Paper cut");
    const label = within(card).getByText("Our pick for your brand");
    const body = within(card).getByText("Paper cut").parentElement!;
    expect(body.firstElementChild?.contains(label)).toBe(true);
    expect(card).toHaveAccessibleName(
      "Paper cut Layered paper shapes with soft shadows. Illustration"
    );
    expect(card).toHaveAccessibleDescription("Our pick for your brand");
  });

  it("renders the medium as an outline badge under the description", () => {
    render(<Library />);
    const medium = within(radio("Paper cut")).getByText("Illustration");
    expect(medium).toHaveClass("border-neutral-200", "text-neutral-600");
    const description = within(radio("Paper cut")).getByText(
      "Layered paper shapes with soft shadows."
    );
    expect(description).toHaveClass("text-xs", "text-neutral-600", "dark:text-neutral-400");
  });

  it("renders a decorative 16:9 thumbnail image with its srcSet", () => {
    render(
      <Library
        cards={{
          "paper-cut": {
            thumbnailSrc: "/visual-signatures/paper-cut-640.webp",
            thumbnailSrcSet:
              "/visual-signatures/paper-cut-640.webp 1x, /visual-signatures/paper-cut-1280.webp 2x",
          },
        }}
      />
    );
    const img = radio("Paper cut").querySelector("img")!;
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("src", "/visual-signatures/paper-cut-640.webp");
    expect(img).toHaveAttribute(
      "srcset",
      "/visual-signatures/paper-cut-640.webp 1x, /visual-signatures/paper-cut-1280.webp 2x"
    );
    expect(img).toHaveClass("h-full", "w-full", "object-cover");
    expect(img.closest('[data-slot="thumbnail"]')).toHaveClass(
      "aspect-video",
      "overflow-hidden",
      "rounded-lg",
      "bg-neutral-100",
      "dark:bg-neutral-800"
    );
  });

  it("lets the thumbnail slot win over thumbnailSrc", () => {
    render(
      <Library
        cards={{
          "paper-cut": {
            thumbnailSrc: "/visual-signatures/paper-cut-640.webp",
            thumbnail: <span data-testid="custom-thumb" />,
          },
        }}
      />
    );
    expect(screen.getByTestId("custom-thumb")).toBeInTheDocument();
    expect(radio("Paper cut").querySelector("img")).toBeNull();
  });
});

describe("SignatureCard: reason strip and footer", () => {
  it("renders the reason strip outside the radio and describes the radio with it", () => {
    render(<Library cards={{ "paper-cut": { reason: REASON } }} />);
    const card = radio("Paper cut");
    const strip = screen.getByText(REASON);
    expect(card.contains(strip)).toBe(false);
    expect(frameOf(card).contains(strip)).toBe(true);
    expect(card.getAttribute("aria-describedby")?.split(" ")).toContain(strip.id);
    expect(card).toHaveAccessibleDescription(REASON);
    expect(strip).toHaveClass("border-rec-line", "bg-rec-soft", "text-rec-ink", "rounded-lg");
  });

  it("renders the footer outside the radio, keeps its link reachable, and describes the radio with it", () => {
    render(<Library cards={{ "paper-cut": { locked: true, footer: <LockedFooter /> } }} />);
    const card = radio("Paper cut");
    const link = screen.getByRole("link", { name: "Upgrade plan" });
    expect(card.contains(link)).toBe(false);
    expect(frameOf(card).contains(link)).toBe(true);
    expect(link).not.toHaveAttribute("tabindex");
    expect(card).toHaveAccessibleDescription("Paid plans Upgrade plan");
    // Under the reason and the radio, pushed to the bottom so a row's footers align.
    const footer = link.closest('[data-slot="footer"]')!;
    expect(footer).toHaveClass("mt-auto");
    expect(frameOf(card)).toHaveClass("flex", "flex-col", "h-full");
  });

  it("reads every description in order: in use, recommendation, reason, footer", () => {
    render(
      <Library
        cards={{
          "paper-cut": {
            inUseLabel: "In use",
            recommendedLabel: "Our pick for your brand",
            reason: REASON,
            footer: <LockedFooter />,
          },
        }}
      />
    );
    expect(radio("Paper cut")).toHaveAccessibleDescription(
      `In use Our pick for your brand ${REASON} Paid plans Upgrade plan`
    );
  });

  it("appends a caller's aria-describedby after the card's own", () => {
    render(
      <>
        <Library cards={{ "paper-cut": { reason: REASON, "aria-describedby": "kept-note" } }} />
        <span id="kept-note">Kept from your previous plan.</span>
      </>
    );
    expect(radio("Paper cut")).toHaveAccessibleDescription(
      `${REASON} Kept from your previous plan.`
    );
  });

  it("has no aria-describedby when there is nothing to describe", () => {
    render(<Library />);
    expect(radio("Paper cut")).not.toHaveAttribute("aria-describedby");
  });

  it("leaves arrow keys on a footer link alone", () => {
    render(
      <Library
        initial="ink-and-fill"
        cards={{ "paper-cut": { locked: true, footer: <LockedFooter /> } }}
      />
    );
    const link = screen.getByRole("link", { name: "Upgrade plan" });
    link.focus();
    const notPrevented = fireEvent.keyDown(link, { key: "ArrowRight" });
    expect(notPrevented).toBe(true);
    expect(radio("Ink and fill")).toHaveAttribute("aria-checked", "true");
    expect(link).toHaveFocus();
  });
});

describe("SignatureCard: frame", () => {
  it("uses the selected border, tint and glow in both modes", () => {
    render(<Library initial="paper-cut" />);
    expect(frameOf(radio("Paper cut"))).toHaveClass(
      "border-brand-600",
      "bg-brand-50/60",
      "shadow-glow-brand",
      "dark:border-brand-400",
      "dark:bg-brand-500/10",
      // Handoff §6: the dark glow is brand-400 at 22%, not the light glow's colour.
      "dark:shadow-brand-400/22"
    );
    expect(frameOf(radio("Ink and fill"))).toHaveClass(
      "border-neutral-200",
      "bg-white",
      "dark:border-neutral-700",
      "dark:bg-neutral-900"
    );
  });

  it("rings the frame when the radio has keyboard focus, not when the footer link does", async () => {
    render(
      <Library
        cards={{ "paper-cut": { locked: true, disabled: false, footer: <LockedFooter /> } }}
      />
    );
    const card = radio("Paper cut");
    const frame = frameOf(card);

    card.focus();
    expect(await matchedDeclarations(frame, "--tw-ring-offset-width")).toEqual(["2px"]);
    const ringColors = await matchedDeclarations(frame, "--tw-ring-color");
    // A solid brand ring (3:1 against white and neutral-900, WCAG 1.4.11); the handoff's /60 measured about 2.3:1.
    expect(ringColors.some((c) => c.includes("--color-brand-500") && !c.includes("60%"))).toBe(true);

    screen.getByRole("link", { name: "Upgrade plan" }).focus();
    expect(await matchedDeclarations(frame, "--tw-ring-offset-width")).toEqual([]);
  });

  it("puts className on the frame and the ref on the radio", () => {
    let node: HTMLButtonElement | null = null;
    render(
      <PresetRadioCardGroup aria-label="Signature" value="paper-cut" onValueChange={() => {}}>
        <SignatureCard
          value="paper-cut"
          name="Paper cut"
          className="col-span-2"
          ref={(el) => {
            node = el;
          }}
        />
      </PresetRadioCardGroup>
    );
    expect(node).toBe(radio("Paper cut"));
    expect(frameOf(radio("Paper cut"))).toHaveClass("col-span-2");
  });
});

describe("SignatureActionCard", () => {
  const YourOwn = (props: Partial<SignatureActionCardProps>) => (
    <SignatureActionCard
      label="Your own"
      description="Set the technique, motifs and framing yourself."
      mediumLabel="Custom"
      tile={<SignatureBuildTile>Build from five fields</SignatureBuildTile>}
      {...props}
    />
  );

  it("is a plain button in the grid, not one of its radios", () => {
    render(
      <Library>
        <YourOwn />
      </Library>
    );
    const group = screen.getByRole("radiogroup", { name: "Signature" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    const button = within(group).getByRole("button", {
      name: "Your own Set the technique, motifs and framing yourself. Custom",
    });
    expect(button).toHaveAttribute("type", "button");
    expect(button).not.toHaveAttribute("role");
    expect(button).not.toHaveAttribute("tabindex");
  });

  it("has no pressed state unless selected is given", () => {
    render(<YourOwn />);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-pressed");
  });

  it("reports selection with aria-pressed, the selected frame and the check badge", () => {
    const { rerender } = render(<YourOwn selected={false} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button.querySelector('[data-slot="selected-check"]')).toBeNull();
    expect(frameOf(button)).toHaveClass("border-neutral-200", "bg-white");

    rerender(<YourOwn selected />);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button.querySelector('[data-slot="selected-check"]')).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(frameOf(button)).toHaveClass(
      "border-brand-600",
      "bg-brand-50/60",
      "shadow-glow-brand",
      "dark:border-brand-400",
      "dark:bg-brand-500/10"
    );
  });

  it("calls onClick", () => {
    const onClick = vi.fn();
    render(<YourOwn onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("locked: disabled with a lock chip; the footer outside the button describes it", () => {
    const onClick = vi.fn();
    render(<YourOwn locked onClick={onClick} footer={<LockedFooter />} />);
    const button = screen.getByRole("button", { name: /^Your own/ });
    expect(button).toBeDisabled();
    expect(button.querySelector('[data-slot="lock-chip"]')).toHaveAttribute("aria-hidden", "true");
    const link = screen.getByRole("link", { name: "Upgrade plan" });
    expect(button.contains(link)).toBe(false);
    expect(frameOf(button).contains(link)).toBe(true);
    expect(button).toHaveAccessibleDescription("Paid plans Upgrade plan");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows In use on its tile, read as a description (the day-one free prompt)", () => {
    render(
      <SignatureActionCard
        label="Free prompt"
        description="Describe the look in your own words."
        mediumLabel="Text prompt"
        inUseLabel="In use"
        selected
        tile={<SignaturePromptTile />}
      />
    );
    const button = screen.getByRole("button", {
      name: "Free prompt Describe the look in your own words. Text prompt",
    });
    expect(within(button).getByText("In use").closest('[data-slot="thumbnail"]')).not.toBeNull();
    expect(button).toHaveAccessibleDescription("In use");
  });

  it("renders its tile inside the 16:9 thumbnail slot", () => {
    render(<YourOwn />);
    const tile = screen.getByText("Build from five fields");
    expect(tile.closest('[data-slot="thumbnail"]')).toHaveClass("aspect-video", "rounded-lg");
  });

  it("leaves the group's selection alone when arrow keys are pressed on it", () => {
    render(
      <Library initial="ink-and-fill">
        <YourOwn />
      </Library>
    );
    const button = screen.getByRole("button", { name: /^Your own/ });
    button.focus();
    expect(fireEvent.keyDown(button, { key: "ArrowLeft" })).toBe(true);
    expect(radio("Ink and fill")).toHaveAttribute("aria-checked", "true");
    expect(button).toHaveFocus();
  });
});

describe("SignatureBuildTile", () => {
  it("shows the pen tile and its caption over a dashed slot", () => {
    render(<SignatureBuildTile>Build from five fields</SignatureBuildTile>);
    const caption = screen.getByText("Build from five fields");
    expect(caption).toHaveClass("text-xs", "font-semibold", "text-neutral-700");
    const tile = caption.parentElement!;
    expect(tile).toHaveClass("border-dashed", "border-neutral-300", "dark:border-neutral-600");
    const icon = tile.querySelector("svg.lucide-pen-line")!;
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon.parentElement).toHaveClass(
      "size-9",
      "rounded-[10px]",
      "bg-brand-50",
      "text-brand-600"
    );
  });

  it("saved: the custom signature's tile, shapes icon and no dashed outline", () => {
    render(<SignatureBuildTile saved>Preview it below to see it</SignatureBuildTile>);
    const tile = screen.getByText("Preview it below to see it").parentElement!;
    expect(tile.querySelector("svg.lucide-shapes")).not.toBeNull();
    expect(tile.querySelector("svg.lucide-pen-line")).toBeNull();
    expect(tile).not.toHaveClass("border-dashed");
  });
});

describe("SignaturePromptTile", () => {
  it("is a decorative text icon over three bars at 100, 86 and 62 percent", () => {
    const { container } = render(<SignaturePromptTile />);
    const tile = container.firstElementChild!;
    expect(tile).toHaveAttribute("aria-hidden", "true");
    expect(tile.querySelector("svg.lucide-type")).not.toBeNull();
    const bars = Array.from(tile.querySelectorAll('[data-slot="prompt-bar"]'));
    expect(bars.map((bar) => bar.className.match(/\bw-(\S+)/)?.[1])).toEqual([
      "full",
      "[86%]",
      "[62%]",
    ]);
    for (const bar of bars)
      expect(bar).toHaveClass("h-1.5", "bg-neutral-300", "dark:bg-neutral-600");
  });
});
