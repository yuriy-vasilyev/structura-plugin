import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MediaLightbox } from "../MediaLightbox";

const VIDEO_SRC = "https://cdn.example.com/render.mp4";

/** Harness with a real trigger so focus-return can be asserted. */
function Harness({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        preview-trigger
      </button>
      <MediaLightbox
        open={open}
        onClose={() => setOpen(false)}
        src={VIDEO_SRC}
        closeLabel="close-preview"
      >
        {children}
      </MediaLightbox>
    </>
  );
}

describe("MediaLightbox", () => {
  it("renders nothing while closed", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
  });

  it("portals an always-dark overlay dialog to document.body when open", async () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByText("preview-trigger"));
    const dialog = await screen.findByRole("dialog");
    // Portaled out of the render container…
    expect(container.contains(dialog)).toBe(false);
    // …with the near-opaque dark scrim, identical in both modes.
    expect(document.body.innerHTML).toContain("bg-neutral-950/95");
  });

  it("renders a native-controls video element with the given src", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("preview-trigger"));
    await screen.findByRole("dialog");
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", VIDEO_SRC);
    expect(video).toHaveAttribute("controls");
  });

  it("renders the content slot for title/meta/actions", async () => {
    render(
      <Harness>
        <p>Now previewing — The 2026 Guide</p>
      </Harness>
    );
    fireEvent.click(screen.getByText("preview-trigger"));
    await screen.findByRole("dialog");
    expect(screen.getByText("Now previewing — The 2026 Guide")).toBeInTheDocument();
  });

  it("closes via the labelled close button", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("preview-trigger"));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "close-preview" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes on Escape", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("preview-trigger"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("returns focus to the trigger after closing", async () => {
    render(<Harness />);
    const trigger = screen.getByText("preview-trigger");
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("traps initial focus inside the dialog", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("preview-trigger"));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it("spreads extra video props (e.g. poster) onto the video element", async () => {
    const onClose = vi.fn();
    render(
      <MediaLightbox
        open
        onClose={onClose}
        src={VIDEO_SRC}
        poster="https://cdn.example.com/frame.jpg"
        closeLabel="close-preview"
        videoProps={{ preload: "metadata" }}
      />
    );
    await screen.findByRole("dialog");
    const video = document.querySelector("video");
    expect(video).toHaveAttribute("poster", "https://cdn.example.com/frame.jpg");
    expect(video).toHaveAttribute("preload", "metadata");
  });
});
