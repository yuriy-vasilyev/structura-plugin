/**
 * VideoEventRow — the five video-lifecycle states on the Activity page.
 *
 * Design handoff §3 (marketing/design_handoff_video_channel/README.md):
 * Rendering → Ready → (Failed / Expired / Skipped-quota). "Expired" never
 * arrives on the wire; it's derived client-side from a ready job whose
 * `expiresAt` is in the past, so both sides of that boundary are pinned
 * here. Retry/Regenerate go through the new WP REST proxy
 * `/structura/v1/channels/video/retry` → cloud `channelsVideoRetry`.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const apiFetchMock = vi.fn();
vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => apiFetchMock(...args),
}));
// ReadyBody reads the live quota via useChannelConnectionsQuery, whose
// useLicense dependency needs settings/toast providers — stub the
// license gate so the row stays unit-testable.
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({ isActivationValid: true, hasUsableLicense: true }),
}));

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    // Honour positional specifiers (%1$d may repeat) like the real
    // sprintf does; fall back to sequential for bare %s/%d.
    let i = 0;
    return format.replace(/%(?:(\d+)\$)?[sd]/g, (_m, pos) =>
      String(pos ? args[Number(pos) - 1] : args[i++]),
    );
  },
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("@structura/ui", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    toast: { success: toastSuccess, error: toastError },
  };
});

import { VideoEventRow } from "../components/VideoEventRow";
import type { ChannelEvent, VideoJob, VideoSocialPackages } from "../types";

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ul>{node}</ul>
    </QueryClientProvider>,
  );
}

const makeEvent = (job: VideoJob): ChannelEvent => ({
  id: "evt-1",
  type: "post_published",
  postId: 42,
  campaignId: 7,
  postTitle: "The 2026 Guide to Programmatic SEO for SaaS",
  postUrl: "https://example.com/p/42",
  publishedAt: "2026-07-02T08:12:00Z",
  dispatchedTo: ["video"],
  results: {},
  createdAt: "2026-07-02T08:12:01Z",
  videoJob: job,
});

const readyJob = (overrides: Partial<VideoJob> = {}): VideoJob => ({
  jobId: "job-1",
  status: "ready",
  downloadUrl: "https://cdn.example/render.mp4?sig=abc",
  thumbnailUrl: "https://cdn.example/thumb.jpg",
  durationSec: 47,
  bytes: 26004889,
  expiresAt: "2099-07-09T00:00:00Z",
  ...overrides,
});

beforeEach(() => {
  apiFetchMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe("VideoEventRow — shell", () => {
  it("announces state changes politely (role=status, aria-live)", () => {
    renderWithClient(<VideoEventRow event={makeEvent(readyJob())} />);
    const row = screen.getByRole("status");
    expect(row).toHaveAttribute("aria-live", "polite");
    expect(
      within(row).getByText("The 2026 Guide to Programmatic SEO for SaaS"),
    ).toBeInTheDocument();
  });

  it("renders the video channel glyph tile, never a platform logo", () => {
    const { container } = renderWithClient(
      <VideoEventRow event={makeEvent(readyJob())} />,
    );
    // The glyph is an inline SVG with the 9:16 frame + play wedge.
    expect(container.querySelector("svg rect[rx='4.7']")).toBeTruthy();
  });
});

describe("VideoEventRow — rendering state", () => {
  it("shows the pulsing Rendering badge, an indeterminate bar, and the stage", () => {
    renderWithClient(
      <VideoEventRow
        event={makeEvent(
          readyJob({ status: "rendering", stage: "generating voiceover…" }),
        )}
      />,
    );

    expect(screen.getByText("Rendering")).toBeInTheDocument();
    // Indeterminate = progressbar WITHOUT aria-valuenow (ARIA convention).
    const bar = screen.getByRole("progressbar");
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(
      screen.getByText("Rendering your video — usually takes a few minutes."),
    ).toBeInTheDocument();
    expect(screen.getByText("generating voiceover…")).toBeInTheDocument();
  });

  it("omits the stage text when the pipeline doesn't report one", () => {
    renderWithClient(
      <VideoEventRow event={makeEvent(readyJob({ status: "rendering" }))} />,
    );
    expect(screen.queryByText(/voiceover/)).toBeNull();
  });
});

describe("VideoEventRow — ready state", () => {
  it("renders the meta line, duration chip, and upload nudge", () => {
    renderWithClient(<VideoEventRow event={makeEvent(readyJob())} />);

    expect(screen.getByText("Ready")).toBeInTheDocument();
    // Duration chip on the thumbnail + duration inside the meta line.
    expect(screen.getAllByText("0:47").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/24\.8 MB/)).toBeInTheDocument();
    expect(screen.getByText(/link expires/)).toBeInTheDocument();
    expect(
      screen.getByText("Ready to upload to YouTube Shorts or TikTok."),
    ).toBeInTheDocument();
  });

  it("offers Download as the primary action, pointing at the signed URL", () => {
    renderWithClient(<VideoEventRow event={makeEvent(readyJob())} />);
    const download = screen.getByRole("link", { name: /download video/i });
    expect(download).toHaveAttribute(
      "href",
      "https://cdn.example/render.mp4?sig=abc",
    );
    expect(download).toHaveAttribute("download");
  });

  it("opens the preview lightbox with the native player and metadata", async () => {
    renderWithClient(<VideoEventRow event={makeEvent(readyJob())} />);

    // The thumbnail shares the "Preview" accessible name — target the
    // action button (the one without the thumbnail img).
    fireEvent.click(
      screen
        .getAllByRole("button", { name: /preview/i })
        .find((b) => !b.querySelector("img"))!,
    );

    await waitFor(() => {
      expect(screen.getByText("Now previewing")).toBeInTheDocument();
    });
    const video = document.querySelector("video");
    expect(video).toBeTruthy();
    expect(video).toHaveAttribute("src", "https://cdn.example/render.mp4?sig=abc");
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("poster", "https://cdn.example/thumb.jpg");
    // Meta column: duration · size · fixed 1080×1920 output.
    expect(screen.getByText(/1080×1920/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /close preview/i }),
    ).toBeInTheDocument();
  });

  it("the thumbnail itself is a Preview button that opens the lightbox (2026-07-03 affordance)", async () => {
    renderWithClient(<VideoEventRow event={makeEvent(readyJob())} />);

    const thumb = screen
      .getAllByRole("button", { name: /preview/i })
      .find((b) => b.querySelector("img"));
    expect(thumb).toBeTruthy();
    fireEvent.click(thumb!);

    await waitFor(() => {
      expect(screen.getByText("Now previewing")).toBeInTheDocument();
    });
  });
});

describe("VideoEventRow — ready state caption packages", () => {
  // Platform-captions handoff: rows whose videoJob carries socialPackages
  // get the per-platform paste package under the actions row; legacy jobs
  // (pre-2026-07 renders) keep today's row untouched (handoff board 05).
  const socialPackages: VideoSocialPackages = {
    shorts: {
      title: "Programmatic SEO for SaaS: the 2026 playbook in 47 seconds",
      description:
        "How SaaS teams build thousands of ranking pages from one template.\n\nFull article: https://acme-blog.com/programmatic-seo-2026\n\n#ProgrammaticSEO #SaaS #SEO",
    },
    tiktok: { caption: "Hook line.\n\nBody.\n\n#tags" },
    reels: { caption: "Hook line.\n\nBody.\n\n#tags" },
  };

  it("renders the per-platform package with the switcher when socialPackages is present", () => {
    renderWithClient(
      <VideoEventRow event={makeEvent(readyJob({ socialPackages }))} />,
    );

    expect(screen.getByText("Suggested captions")).toBeInTheDocument();
    const tablist = screen.getByRole("tablist", { name: "Platform" });
    expect(
      within(tablist)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["Shorts", "TikTok", "Reels"]);
    // Row keeps its primary actions — the package is additive.
    expect(
      screen.getByRole("link", { name: /download video/i }),
    ).toBeInTheDocument();
  });

  it("legacy job without socialPackages renders the row unchanged — no package, no switcher", () => {
    renderWithClient(<VideoEventRow event={makeEvent(readyJob())} />);

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText("Suggested captions")).toBeNull();
    expect(
      screen.getByRole("link", { name: /download video/i }),
    ).toBeInTheDocument();
  });

  it("treats a malformed socialPackages shape as absent (no broken paste buttons)", () => {
    renderWithClient(
      <VideoEventRow
        event={makeEvent(
          readyJob({
            socialPackages: {
              shorts: { title: "only a title" },
            } as unknown as VideoSocialPackages,
          }),
        )}
      />,
    );

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText("Suggested captions")).toBeNull();
  });
});

describe("VideoEventRow — ready state regenerate", () => {
  // First-render feedback (2026-07-03): a fresh Ready video had no way
  // to re-render after pipeline improvements. Regenerate exists on
  // Ready too — behind a confirmation naming the quota cost, since a
  // re-render spends a real monthly video.
  it("offers Regenerate behind a quota confirmation and retries on confirm", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connections: [],
      videoQuota: { used: 3, cap: 20 },
    });
    apiFetchMock.mockResolvedValueOnce({ success: true, jobId: "job-1" });
    renderWithClient(<VideoEventRow event={makeEvent(readyJob())} />);

    fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));

    // Confirmation names the cost with live quota numbers + the
    // same-script semantics (quota arrives async; await the re-render).
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => {
      expect(dialog.textContent).toMatch(/1 of your 20 monthly videos/i);
    });
    expect(dialog.textContent).toMatch(/3 of 20 used/i);
    expect(dialog.textContent).toMatch(/same script/i);

    fireEvent.click(within(dialog).getByRole("button", { name: /regenerate/i }));
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining("video/retry"),
          data: expect.objectContaining({ job_id: "job-1" }),
        }),
      );
    });
  });

  it("cancelling the confirmation does not spend the quota", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connections: [],
      videoQuota: { used: 3, cap: 20 },
    });
    renderWithClient(<VideoEventRow event={makeEvent(readyJob())} />);
    fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    expect(apiFetchMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining("video/retry") }),
    );
  });

  it("falls back to generic quota copy when the meter has not loaded", async () => {
    apiFetchMock.mockResolvedValueOnce({ success: true, connections: [] });
    renderWithClient(<VideoEventRow event={makeEvent(readyJob())} />);
    fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/1 video from your monthly quota/i);
  });
});

describe("VideoEventRow — failed state", () => {
  const failedJob = (): VideoJob => ({
    jobId: "job-9",
    status: "failed",
    error: {
      code: "image_fetch_timeout",
      message: "Two images in this post couldn’t be fetched (timed out after 30s).",
    },
  });

  it("shows the human-readable reason with the quota reassurance in an alert", () => {
    renderWithClient(<VideoEventRow event={makeEvent(failedJob())} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Two images in this post couldn’t be fetched (timed out after 30s).",
    );
    expect(alert).toHaveTextContent("Nothing was used from your quota.");
  });

  it("retries the render through the video retry proxy", async () => {
    apiFetchMock.mockResolvedValueOnce({ success: true, jobId: "job-9" });
    renderWithClient(<VideoEventRow event={makeEvent(failedJob())} />);

    fireEvent.click(screen.getByRole("button", { name: /retry render/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith({
        path: "/structura/v1/channels/video/retry",
        method: "POST",
        data: { job_id: "job-9" },
      });
    });
  });

  it("links back to the post", () => {
    renderWithClient(<VideoEventRow event={makeEvent(failedJob())} />);
    const viewPost = screen.getByRole("link", { name: /view post/i });
    expect(viewPost).toHaveAttribute("href", "https://example.com/p/42");
  });
});

describe("VideoEventRow — expired state (derived)", () => {
  const expiredJob = () =>
    readyJob({ jobId: "job-4", expiresAt: "2026-07-01T00:00:00Z" });

  it("derives Expired from a ready job whose link lapsed", () => {
    renderWithClient(<VideoEventRow event={makeEvent(expiredJob())} />);
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.queryByText("Ready")).toBeNull();
    expect(
      screen.getByText(/videos are kept for 7 days/),
    ).toBeInTheDocument();
    // Download / Preview are gone — the signed URL is dead.
    expect(screen.queryByRole("link", { name: /download video/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /preview/i })).toBeNull();
    // The dimmed thumbnail stays inert — a plain div, never a button.
    const img = document.querySelector("img");
    expect(img).toBeTruthy();
    expect(img!.closest("button")).toBeNull();
  });

  it("regenerates via the same retry proxy and warns about the quota cost", async () => {
    apiFetchMock.mockResolvedValueOnce({ success: true, jobId: "job-4" });
    renderWithClient(<VideoEventRow event={makeEvent(expiredJob())} />);

    expect(
      screen.getByText("Regenerating uses 1 video from your monthly quota."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/structura/v1/channels/video/retry",
          data: { job_id: "job-4" },
        }),
      );
    });
  });
});

describe("VideoEventRow — skipped (quota) state", () => {
  it("explains the skip with the quota numbers and offers the upgrade path", () => {
    renderWithClient(
      <VideoEventRow
        event={makeEvent({
          jobId: "job-7",
          status: "skipped_quota",
          quotaUsed: 20,
          quotaCap: 20,
        })}
      />,
    );

    expect(screen.getByText("Skipped")).toBeInTheDocument();
    expect(
      screen.getByText(/Monthly video limit reached \(20 of 20\)/),
    ).toBeInTheDocument();

    const upgrade = screen.getByRole("link", {
      name: /upgrade for more videos/i,
    });
    const href = new URL(upgrade.getAttribute("href") ?? "");
    expect(href.searchParams.get("intent")).toBe("unlock_video");
  });
});
