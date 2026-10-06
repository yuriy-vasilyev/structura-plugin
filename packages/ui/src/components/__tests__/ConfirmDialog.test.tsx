/**
 * ConfirmDialog — the `neutral` variant and `icon` override. Removing
 * something that already stopped working (an expired token) is not
 * destructive, so it gets a neutral icon tile and a secondary confirm
 * instead of the red warning (Assistant access handoff, "Remove expired").
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArchiveX } from "lucide-react";
import { ConfirmDialog } from "../ConfirmDialog";

function renderDialog(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  render(
    <ConfirmDialog
      isOpen
      onClose={vi.fn()}
      onConfirm={vi.fn()}
      title="Remove “Old Cursor install”?"
      description="This token already doesn't work."
      confirmButtonProps={{ label: "Remove" }}
      {...props}
    />
  );
}

describe("ConfirmDialog", () => {
  it("keeps the danger default: warning icon on a red tile, danger confirm", () => {
    renderDialog({ variant: "danger" });
    const tile = document.querySelector('[data-slot="confirm-icon"]') as HTMLElement;
    expect(tile).toHaveClass("bg-red-50");
    expect(tile.querySelector("svg")).toHaveClass("lucide-triangle-alert");
    expect(screen.getByRole("button", { name: "Remove" }).className).toContain("bg-red-600");
  });

  it("neutral uses a grey tile, the given icon and a secondary confirm", () => {
    renderDialog({ variant: "neutral", icon: ArchiveX });
    const tile = document.querySelector('[data-slot="confirm-icon"]') as HTMLElement;
    expect(tile).toHaveClass("bg-neutral-100");
    expect(tile.querySelector("svg")).toHaveClass("lucide-archive-x");
    const confirm = screen.getByRole("button", { name: "Remove" });
    expect(confirm.className).toContain("bg-white!");
    expect(confirm.className).not.toContain("bg-red-600");
  });
});
