/**
 * VisualsPage unlicensed-state test — Phase 1.8a.
 *
 * Pre-1.8a, when a `none`-tier user opened the Visuals page, the
 * cloud-gated `useVisualPresetsQuery` was disabled (correctly) but
 * the page's `if (isLoadingPresets || !draft) return <PageLoader/>`
 * guard never lifted: with the query disabled, `presetsData` stayed
 * undefined, the draft-init `useEffect` early-returned on
 * `!presetsData`, and `draft` stayed null forever. Result: a stuck
 * "Calibrating Optics…" spinner.
 *
 * The fix is a dedicated `!isLicensed` branch that renders an inline
 * `UnlicensedTeaser` *before* the loader guard runs. This test pins
 * the behavior so a future refactor can't silently revert to the
 * stuck-spinner state.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (text: string, ...args: unknown[]) =>
    text.replace(/%s|%d/g, () => String(args.shift() ?? "")),
}));

vi.mock("@/features/settings", () => ({
  useDefaultProviders: () => ({ defaultImageProvider: "openai" }),
  // Phase 1.8: VisualsPage's permanent unlicensed teaser fires on
  // `plan === "none"` (post-PR7b) — covers anonymous shadow
  // workspaces, pre-bootstrap installs, and the legacy
  // disconnected case. The 1.8a `!isLicensed` gate was a strict
  // superset; this is the narrower discriminator.
  useLicense: () => ({ plan: "none", isPaidLicense: false }),
  useVisualPresetMutations: () => ({
    create: vi.fn(),
    update: vi.fn(),
    fork: vi.fn(),
    remove: vi.fn(),
    bind: vi.fn(),
    isCreating: false,
    isUpdating: false,
    isForking: false,
    isRemoving: false,
    isBinding: false,
  }),
  // The two queries below should never render their result on the
  // unlicensed branch — gating is enforced inside the hooks
  // themselves. Returning empty stubs is enough for the page to
  // type-check at render time.
  useVisualPresetsQuery: () => ({ data: undefined, isLoading: false }),
  useVisualQuery: () => ({ data: undefined }),
}));

vi.mock("@/hooks/useMagicSuggest", () => ({
  useMagicSuggest: () => ({ suggest: vi.fn(), isSuggesting: false }),
}));

// Video-styling gate (video-visuals handoff §1) — the real hook reads the
// channel catalog query, which needs a QueryClient this harness doesn't
// mount. "unknown" = render neither section nor teaser, the correct state
// for an unlicensed install anyway.
vi.mock("@/features/channels/hooks/useVideoStylingEligibility", () => ({
  useVideoStylingEligibility: () => "unknown",
}));

vi.mock("@/components/Layout/PageTitle", () => ({
  PageTitle: ({ children }: { children: React.ReactNode }) => (
    <h1>{children}</h1>
  ),
}));

vi.mock("@/components/Layout/PageSubtitle", () => ({
  PageDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
}));

vi.mock("@structura/ui", async () => {
  const actual =
    await vi.importActual<typeof import("@structura/ui")>("@structura/ui");
  return {
    ...actual,
    PageLoader: ({ label }: { label: string }) => (
      <div data-testid="page-loader">{label}</div>
    ),
  };
});

import { VisualsPage } from "../VisualsPage";

describe("VisualsPage", () => {
  it("renders the unlicensed teaser when plan === 'none'", () => {
    render(
      <MemoryRouter>
        <VisualsPage />
      </MemoryRouter>,
    );

    // Headline copy from the inline `UnlicensedTeaser` component.
    expect(
      screen.getByText("Style Every Image Consistently"),
    ).toBeInTheDocument();

    // CTA buttons live inside the teaser and link out to the customer
    // portal + pricing page.
    expect(screen.getByText("Get Free License")).toBeInTheDocument();
    expect(screen.getByText("View Pricing")).toBeInTheDocument();
  });

  it("does NOT render the calibrating-optics loader on the none-tier branch", () => {
    // Pre-1.8a regression: the page rendered the loader forever on
    // `none`-tier installs because the gated `useVisualPresetsQuery`
    // never resolved and `draft` never initialized. The unlicensed
    // teaser branch must short-circuit *before* the loader.
    render(
      <MemoryRouter>
        <VisualsPage />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
    expect(screen.queryByText("Calibrating Optics…")).not.toBeInTheDocument();
  });
});
