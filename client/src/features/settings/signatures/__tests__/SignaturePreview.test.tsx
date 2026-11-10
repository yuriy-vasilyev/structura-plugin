/**
 * "Preview with my colours" (visual-signatures handoff §3.6; spec §8): a row
 * until first used, rendering, done with the concept, failed with the last
 * image kept, locked on free, out of images, and answers to an older run
 * dropped. Real mutation hook; only `apiFetch` (the network edge) is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@wordpress/api-fetch", () => ({ default: apiFetchMock }));

import { SignaturePreview, type SignaturePreviewProps } from "../SignaturePreview";
import type { PreviewVisualSignatureInput } from "../../api/useVisualPresets";

const REQUEST: PreviewVisualSignatureInput = {
  signature: { kind: "curated", id: "paper-cut", version: 1 },
  palette: ["#2F6B4F"],
};

function renderPreview(props: Partial<SignaturePreviewProps> = {}) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const buildRequest = props.buildRequest ?? vi.fn(() => REQUEST);
  const view = render(
    <QueryClientProvider client={client}>
      <SignaturePreview
        headingId="preview"
        locked={false}
        upgradeHref="https://www.structurawp.com/en/pricing?intent=unlock_visuals"
        imagesResetOn={null}
        {...props}
        buildRequest={buildRequest}
      />
    </QueryClientProvider>
  );
  return { ...view, buildRequest };
}

const runButton = () =>
  screen.getByRole("button", { name: /Preview with my colors|Preview again|Try again|Rendering/ });

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("SignaturePreview", () => {
  it("is a row with the cost on the button until first used", () => {
    renderPreview();
    expect(screen.getByRole("heading", { name: "Preview" })).toBeInTheDocument();
    expect(runButton()).toHaveTextContent("Preview with my colors· 1 image");
    expect(screen.queryByRole("figure")).toBeNull();
  });

  it("renders the unsaved choice: rendering, then the image with its concept", async () => {
    let resolve!: (value: unknown) => void;
    apiFetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    renderPreview();

    fireEvent.click(runButton());

    expect(await screen.findByText("Rendering your preview")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Rendering your preview" })).toBeInTheDocument();
    expect(
      screen
        .getByText("This usually takes about 20 seconds. You can keep editing meanwhile.")
        .closest('[role="status"]')
    ).not.toBeNull();
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/structura/v1/visual-signature/preview", data: REQUEST })
    );

    await act(async () =>
      resolve({ success: true, imageUrl: "https://cdn.test/a.webp", concept: "A seed packet" })
    );

    expect(await screen.findByRole("img", { name: "A seed packet" })).toHaveAttribute(
      "src",
      "https://cdn.test/a.webp"
    );
    expect(screen.getByText("Concept")).toBeInTheDocument();
    expect(runButton()).toHaveTextContent("Preview again");
  });

  it("a failed run keeps the last image and says so", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      imageUrl: "https://cdn.test/a.webp",
      concept: "A seed packet",
    });
    renderPreview();
    fireEvent.click(runButton());
    await screen.findByRole("img", { name: "A seed packet" });

    apiFetchMock.mockRejectedValueOnce({
      code: "cloud_error",
      message: "x",
      data: { status: 500, code: "internal" },
    });
    fireEvent.click(runButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The new preview didn’t render, so your last one is still shown. Try again in a moment."
    );
    expect(screen.getByRole("img", { name: "A seed packet" })).toBeInTheDocument();
    expect(runButton()).toHaveTextContent("Try again");
  });

  it("a first failure has its own line", async () => {
    apiFetchMock.mockRejectedValue({ code: "cloud_error", message: "x", data: { status: 500 } });
    renderPreview();
    fireEvent.click(runButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The preview didn’t render. Try again in a moment."
    );
  });

  it("a plan-gate refusal says the style comes with paid plans", async () => {
    apiFetchMock.mockRejectedValue({
      code: "cloud_error",
      message: "x",
      data: { status: 403, code: "permission-denied" },
    });
    renderPreview();
    fireEvent.click(runButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("That style comes with paid plans.");
  });

  it("sends nothing when the choice can't be previewed yet", () => {
    const { buildRequest } = renderPreview({ buildRequest: vi.fn(() => null) });
    fireEvent.click(runButton());
    expect(buildRequest).toHaveBeenCalled();
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Rendering your preview")).toBeNull();
  });

  it("is locked on free with Paid plans and the upgrade link", () => {
    renderPreview({ locked: true });
    expect(screen.getByRole("button", { name: /Preview with my colors/ })).toBeDisabled();
    expect(screen.getByText("Paid plans")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upgrade plan/ })).toHaveAttribute(
      "href",
      "https://www.structurawp.com/en/pricing?intent=unlock_visuals"
    );
  });

  it("is disabled with the reset date when the month's images are used up", () => {
    renderPreview({ imagesResetOn: "1 December" });
    expect(runButton()).toBeDisabled();
    expect(
      screen.getByText("No images left this month. Your allowance resets on 1 December.")
    ).toBeInTheDocument();
  });

  it("drops an answer that lands after the panel is gone", async () => {
    let resolve!: (value: unknown) => void;
    apiFetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const { unmount } = renderPreview();
    fireEvent.click(runButton());
    await screen.findByText("Rendering your preview");
    unmount();
    // No state update on an unmounted panel (React would warn).
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => resolve({ success: true, imageUrl: "u", concept: "c" }));
    await waitFor(() => expect(errorSpy).not.toHaveBeenCalled());
    errorSpy.mockRestore();
  });
});
