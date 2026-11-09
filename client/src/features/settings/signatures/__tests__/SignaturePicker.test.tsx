/**
 * SignaturePicker (visual-signatures handoff §2.1, §2.5, §3.2): card flags
 * per plan and choice, the "Your own" and "Free prompt" cards, and the
 * radiogroup keyboard contract over locked cards.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { VISUAL_SIGNATURES } from "@structura/visual-signatures";

import { SignaturePicker, type SignaturePickerProps } from "../SignaturePicker";
import { newCustomDraft, orderedSignatures } from "../signatureModel";

const UPGRADE = "https://www.structurawp.com/en/pricing?intent=unlock_visuals&source=plugin";

function renderPicker(props: Partial<SignaturePickerProps> = {}) {
  const onSelect = vi.fn();
  const view = render(
    <>
      <h3 id="sig-heading">Signature</h3>
      <SignaturePicker
        labelledBy="sig-heading"
        signatures={orderedSignatures()}
        selection={{ kind: "curated", id: "editorial-reportage", version: 1 }}
        plan="byok"
        upgradeHref={UPGRADE}
        onSelect={onSelect}
        {...props}
      />
    </>
  );
  return { ...view, onSelect };
}

const radio = (name: RegExp) => screen.getByRole("radio", { name });

describe("SignaturePicker", () => {
  it("is one radiogroup named Signature, library cards in order with name, description and medium", () => {
    renderPicker();
    const group = screen.getByRole("radiogroup", { name: "Signature" });
    expect(within(group).getAllByRole("radio")).toHaveLength(VISUAL_SIGNATURES.length);
    expect(
      radio(/^Editorial reportage Natural light, real places, one clear subject\. Photography$/)
    ).toBeInTheDocument();
    expect(radio(/^Miniature world .* 3D render$/)).toBeInTheDocument();
    const thumb = radio(/^Paper cut/).querySelector("img")!;
    expect(thumb).toHaveAttribute(
      "src",
      "https://www.structurawp.com/visual-signatures/paper-cut-640.webp"
    );
    expect(thumb).toHaveAttribute("alt", "");
    expect(thumb.getAttribute("srcset")).toContain("paper-cut-1280.webp 2x");
  });

  it("checks the selected card and marks the bound one In use, separately", () => {
    renderPicker({
      selection: { kind: "curated", id: "paper-cut", version: 1 },
      bound: { kind: "curated", id: "editorial-reportage", version: 1 },
    });
    expect(radio(/^Paper cut/)).toHaveAttribute("aria-checked", "true");
    expect(radio(/^Editorial reportage/)).toHaveAttribute("aria-checked", "false");
    expect(radio(/^Editorial reportage/)).toHaveAccessibleDescription(/In use/);
    expect(radio(/^Paper cut/)).not.toHaveAccessibleDescription(/In use/);
  });

  it("marks the thin pass's pick with the chip and the reason strip", () => {
    renderPicker({
      pickId: "paper-cut",
      reason: "Warm and hand-made, like your seasonal planting guides.",
    });
    const pick = radio(/^Paper cut/);
    expect(pick).toHaveAccessibleDescription(/Our pick for your brand/);
    expect(pick).toHaveAccessibleDescription(/Warm and hand-made/);
    expect(screen.getAllByText("Our pick for your brand")).toHaveLength(1);
  });

  it("selecting a card reports the card's selection at its library version", () => {
    const { onSelect } = renderPicker();
    fireEvent.click(radio(/^Ink and fill/));
    expect(onSelect).toHaveBeenCalledWith({ kind: "curated", id: "ink-and-fill", version: 1 });
  });

  it("re-picking the card in use keeps the version the preset pinned", () => {
    const bound = { kind: "curated" as const, id: "paper-cut" as const, version: 0 };
    const { onSelect } = renderPicker({ bound, selection: { kind: "free" } });
    fireEvent.click(radio(/^Paper cut/));
    expect(onSelect).toHaveBeenCalledWith(bound);
  });

  describe("free plan (spec §7)", () => {
    it("locks every card but the house one, each with Paid plans and an Upgrade plan link", () => {
      renderPicker({ plan: "free" });
      expect(radio(/^Editorial reportage/)).toBeEnabled();
      for (const name of [
        /^Still life studio/,
        /^Paper cut/,
        /^Ink and fill/,
        /^Miniature world/,
        /^Isometric glass/,
      ]) {
        expect(radio(name)).toBeDisabled();
      }
      const upgrades = screen.getAllByRole("link", { name: /Upgrade plan/ });
      expect(upgrades).toHaveLength(5);
      for (const link of upgrades) {
        expect(link).toHaveAttribute("href", UPGRADE);
        expect(link).toHaveAttribute("target", "_blank");
      }
      expect(screen.getAllByText("Paid plans")).toHaveLength(5);
    });

    it("arrow keys skip the locked cards", () => {
      const { onSelect } = renderPicker({ plan: "free", extras: undefined });
      const house = radio(/^Editorial reportage/);
      house.focus();
      fireEvent.keyDown(house, { key: "ArrowRight" });
      // The only enabled radio is the house one: the arrow lands back on it.
      expect(onSelect).toHaveBeenLastCalledWith({
        kind: "curated",
        id: "editorial-reportage",
        version: 1,
      });
    });

    it("keeps a gated card bound before a downgrade selectable, with the warning and no upgrade link", () => {
      renderPicker({
        plan: "free",
        bound: { kind: "curated", id: "paper-cut", version: 1 },
        selection: { kind: "curated", id: "paper-cut", version: 1 },
      });
      const kept = radio(/^Paper cut/);
      expect(kept).toBeEnabled();
      expect(kept).toHaveAccessibleDescription(/Kept from your previous plan/);
      expect(screen.getAllByRole("link", { name: /Upgrade plan/ })).toHaveLength(4);
    });
  });

  describe("page extras", () => {
    const extras = (over = {}) => ({
      custom: null,
      onOpenBuilder: vi.fn(),
      onSelectFree: vi.fn(),
      ...over,
    });

    it("'Your own' is a button that opens the builder, and Free prompt a pressed-state button", () => {
      const ex = extras();
      renderPicker({ extras: ex, selection: { kind: "free" }, bound: { kind: "free" } });
      const own = screen.getByRole("button", {
        name: /^Your own Set the technique, motifs and framing yourself\. Custom$/,
      });
      expect(own).not.toHaveAttribute("aria-pressed");
      fireEvent.click(own);
      expect(ex.onOpenBuilder).toHaveBeenCalled();

      const free = screen.getByRole("button", {
        name: /^Free prompt Describe the look in your own words\. Text prompt$/,
      });
      expect(free).toHaveAttribute("aria-pressed", "true");
      expect(free).toHaveAccessibleDescription(/In use/);
      // With the free prompt checked, no radio holds the group's value.
      for (const r of screen.getAllByRole("radio"))
        expect(r).toHaveAttribute("aria-checked", "false");
      fireEvent.click(free);
      expect(ex.onSelectFree).toHaveBeenCalled();
    });

    it("'Your own' is locked on free with its upgrade link", () => {
      renderPicker({ plan: "free", extras: extras() });
      expect(screen.getByRole("button", { name: /^Your own/ })).toBeDisabled();
      expect(screen.getAllByRole("link", { name: /Upgrade plan/ })).toHaveLength(6);
    });

    it("once a custom signature exists, 'Your own' is a radio card named after it, with Edit", () => {
      const draft = { ...newCustomDraft("Northfield sketchbook"), medium: "illustration" as const };
      const ex = extras({ custom: draft });
      const { onSelect } = renderPicker({
        extras: ex,
        selection: { kind: "custom" },
        bound: { kind: "custom" },
      });
      const card = radio(/^Northfield sketchbook Your own style, in illustration\. Custom$/);
      expect(card).toHaveAttribute("aria-checked", "true");
      expect(card).toHaveAccessibleDescription(/In use/);
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      expect(ex.onOpenBuilder).toHaveBeenCalled();
      fireEvent.click(radio(/^Paper cut/));
      fireEvent.click(card);
      expect(onSelect).toHaveBeenLastCalledWith({ kind: "custom" });
    });
  });

  it("the wizard's order puts the pick first", () => {
    renderPicker({ signatures: orderedSignatures("miniature-world"), pickId: "miniature-world" });
    const first = screen.getAllByRole("radio")[0];
    expect(first).toHaveAccessibleName(/^Miniature world/);
  });
});
