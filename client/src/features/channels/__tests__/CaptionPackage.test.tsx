/**
 * CaptionPackage — per-platform paste packages (YouTube Shorts / TikTok /
 * Instagram Reels) on the video Ready row.
 *
 * Design handoff: marketing/design_handoff_platform_captions/README.md +
 * platform-captions/package.js. The wire contract that shipped differs from
 * the handoff's draft sketch: `socialPackages` carries fully-composed
 * strings with `\n\n` between blocks and no separate `hooks` field, so
 * presentation (hook emphasis, hashtag run, counters) is derived
 * client-side. Copy payloads must always be the RAW wire strings.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(?:(\d+)\$)?[sd]/g, (_m, pos) =>
      String(pos ? args[Number(pos) - 1] : args[i++]),
    );
  },
}));

import { CaptionPackage } from "../components/CaptionPackage";
import type { VideoSocialPackages } from "../types";

const writeText = vi.fn(() => Promise.resolve());

beforeEach(() => {
  writeText.mockClear();
  // jsdom ships no Clipboard API — install a spyable stand-in.
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

const packages: VideoSocialPackages = {
  shorts: {
    title: "Programmatic SEO for SaaS: the 2026 playbook in 47 seconds",
    description:
      "How SaaS teams build thousands of ranking pages from one template.\n\nFull article: https://acme-blog.com/programmatic-seo-2026\n\n#ProgrammaticSEO #SaaS #SEO",
  },
  tiktok: {
    caption:
      "Still hand-writing every landing page? Programmatic SEO builds thousands from one template.\n\nProgrammatic SEO pairs keyword clustering with page templates.\n\nWould your team template it?\nFull breakdown — link in bio\n\n#programmaticseo #saas #seotips #b2bmarketing",
  },
  reels: {
    caption:
      "Most SaaS teams still hand-write every landing page.\n\nKeyword clustering, page templates, quality guardrails.\n\nWhich keyword cluster would you build first?\nFull guide — link in bio\n\n#programmaticseo #saas #seo #contentmarketing #growthmarketing",
  },
};

describe("CaptionPackage — switcher", () => {
  it("renders the three platform tabs with Shorts active by default", () => {
    render(<CaptionPackage packages={packages} />);

    const tablist = screen.getByRole("tablist", { name: "Platform" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Shorts",
      "TikTok",
      "Reels",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    // Full platform names ride the native tooltip.
    expect(tabs[0]).toHaveAttribute("title", "YouTube Shorts");
    expect(tabs[2]).toHaveAttribute("title", "Instagram Reels");

    // Shorts body: Title + Description fields under the overline label.
    expect(screen.getByText("Suggested captions")).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
  });

  it("switching platforms swaps the body", () => {
    render(<CaptionPackage packages={packages} />);

    fireEvent.click(screen.getByRole("tab", { name: "TikTok" }));
    expect(screen.getByText("Caption")).toBeInTheDocument();
    expect(screen.queryByText("Title")).toBeNull();
    expect(
      screen.getByText(/Still hand-writing every landing page\?/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Reels" }));
    expect(
      screen.getByText(/Most SaaS teams still hand-write/),
    ).toBeInTheDocument();
  });
});

describe("CaptionPackage — copy payloads (raw wire strings)", () => {
  it("copies the raw Shorts title", () => {
    render(<CaptionPackage packages={packages} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy title" }));
    expect(writeText).toHaveBeenCalledWith(packages.shorts.title);
  });

  it("copies the raw Shorts description with \\n\\n block breaks, never styled HTML", () => {
    render(<CaptionPackage packages={packages} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy description" }));
    expect(writeText).toHaveBeenCalledWith(packages.shorts.description);
  });

  it("Copy all composes labeled title + description", () => {
    render(<CaptionPackage packages={packages} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Copy title and description" }),
    );
    expect(writeText).toHaveBeenCalledWith(
      `Title:\n${packages.shorts.title}\n\nDescription:\n${packages.shorts.description}`,
    );
  });

  it("copies the raw TikTok / Reels captions", () => {
    render(<CaptionPackage packages={packages} />);

    fireEvent.click(screen.getByRole("tab", { name: "TikTok" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy caption" }));
    expect(writeText).toHaveBeenCalledWith(packages.tiktok.caption);

    fireEvent.click(screen.getByRole("tab", { name: "Reels" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy caption" }));
    expect(writeText).toHaveBeenLastCalledWith(packages.reels.caption);
  });

  it("flips the button to a Copied confirmation", async () => {
    render(<CaptionPackage packages={packages} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy title" }));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});

describe("CaptionPackage — advisory counters", () => {
  it("shows the Shorts title counter, neutral within the limit", () => {
    render(<CaptionPackage packages={packages} />);
    const counter = screen.getByText(`${packages.shorts.title.length}/100`);
    expect(counter.className).toContain("text-neutral-400");
    expect(counter.className).not.toContain("amber");
  });

  it("flips amber over the limit without ever blocking copy", () => {
    const long: VideoSocialPackages = {
      ...packages,
      shorts: { ...packages.shorts, title: "x".repeat(107) },
    };
    render(<CaptionPackage packages={long} />);

    const counter = screen.getByText("107/100");
    expect(counter.className).toContain("text-amber-600");
    expect(counter.className).toContain("font-semibold");

    // Advisory only — copy still hands over the over-limit string.
    fireEvent.click(screen.getByRole("button", { name: "Copy title" }));
    expect(writeText).toHaveBeenCalledWith("x".repeat(107));
  });

  it("counts the TikTok hook (first \\n\\n block) against /100 with the hook marker", () => {
    render(<CaptionPackage packages={packages} />);
    fireEvent.click(screen.getByRole("tab", { name: "TikTok" }));

    const hook = packages.tiktok.caption.split("\n\n")[0];
    expect(screen.getByText("hook")).toBeInTheDocument();
    expect(screen.getByText(`${hook.length}/100`)).toBeInTheDocument();
  });

  it("counts the Reels hook against /125", () => {
    render(<CaptionPackage packages={packages} />);
    fireEvent.click(screen.getByRole("tab", { name: "Reels" }));

    const hook = packages.reels.caption.split("\n\n")[0];
    expect(screen.getByText(`${hook.length}/125`)).toBeInTheDocument();
  });

  it("renders no counter on the Shorts description", () => {
    render(<CaptionPackage packages={packages} />);
    // Exactly one counter in the Shorts body — the title's.
    expect(screen.getAllByText(/^\d+\/\d+$/)).toHaveLength(1);
  });
});

describe("CaptionPackage — block rendering", () => {
  it("sets the hook font-medium and the hashtag run in brand", () => {
    render(<CaptionPackage packages={packages} />);
    fireEvent.click(screen.getByRole("tab", { name: "TikTok" }));

    const hook = screen.getByText(/Still hand-writing every landing page\?/);
    expect(hook.className).toContain("font-medium");

    const tags = screen.getByText(
      "#programmaticseo #saas #seotips #b2bmarketing",
    );
    expect(tags.className).toContain("text-brand-600");
  });
});

describe("CaptionPackage — info rows", () => {
  it("TikTok shows the persistent AI-content note as role=note", () => {
    render(<CaptionPackage packages={packages} />);
    fireEvent.click(screen.getByRole("tab", { name: "TikTok" }));

    const note = screen.getByRole("note");
    expect(note.textContent).toMatch(/AI-generated content/);
    expect(note.textContent).toMatch(/AI voiceover/);
  });

  it("Shorts shows the links-not-clickable helper; Reels has no note", () => {
    render(<CaptionPackage packages={packages} />);
    expect(screen.getByRole("note").textContent).toMatch(/clickable/);

    fireEvent.click(screen.getByRole("tab", { name: "Reels" }));
    expect(screen.queryByRole("note")).toBeNull();
  });
});
