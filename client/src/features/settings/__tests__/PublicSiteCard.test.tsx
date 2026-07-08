/**
 * Behavioural tests for {@link PublicSiteCard} — the headless-mode
 * settings UI (spec: `specs/site-identity-headless.md` §4).
 *
 * The card wires three React Query hooks (profile fetch, profile save,
 * quick-setup scrape) into a draft + confirmation-modal flow. These
 * tests pin the user-visible contract:
 *
 *   - Headless toggle reveals / hides the editor body.
 *   - Quick setup needs a public URL before firing.
 *   - The confirmation modal opens, shows proposals, and applies them
 *     into the draft only on Apply.
 *   - Cancel preserves the prior draft state.
 *   - Save passes the current draft to the mutation.
 *
 * We mock @structura/ui, @wordpress/i18n, and the api hooks at module
 * scope.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PublicSiteProfile,
  QuickSetupProposal,
} from "../api/usePublicSiteProfile";

// ── Hook mocks (must be set up before component import) ───────────────

const mockProfile = vi.fn<() => { data: PublicSiteProfile | undefined; isLoading: boolean }>();
const mockMutate = vi.fn();
const mockMutationState = vi.fn<() => { isPending: boolean }>(() => ({ isPending: false }));
const mockQuickSetup = vi.fn();
const mockQuickSetupState = vi.fn<() => { isPending: boolean }>(() => ({ isPending: false }));

vi.mock("../api/usePublicSiteProfile", async () => {
  return {
    usePublicSiteProfile: () => mockProfile(),
    usePublicSiteProfileMutation: () => ({
      mutateAsync: mockMutate,
      ...mockMutationState(),
    }),
    useQuickSetup: () => ({
      mutateAsync: mockQuickSetup,
      ...mockQuickSetupState(),
    }),
  };
});

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (text: string, ...args: unknown[]) =>
    text.replace(/%[sd]/g, () => String(args.shift())),
}));

vi.mock("@structura/ui", () => ({
  Button: ({ children, onClick, disabled, ...rest }: any) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
  Card: ({ children }: any) => <div data-testid="public-site-card">{children}</div>,
  InputField: ({ label, value, onChange, ...rest }: any) => (
    <label>
      <span>{label}</span>
      <input value={value} onChange={onChange} {...rest} />
    </label>
  ),
  TextArea: ({ label, value, onChange, ...rest }: any) => (
    <label>
      <span>{label}</span>
      <textarea value={value} onChange={onChange} {...rest} />
    </label>
  ),
  Switch: ({ label, checked, onChange, description }: any) => (
    <label>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span>{label}</span>
      {description && <span>{description}</span>}
    </label>
  ),
  Select: Object.assign(
    ({ children }: any) => <div>{children}</div>,
    {
      Trigger: () => <div data-testid="select-trigger" />,
      Content: ({ children }: any) => <div>{children}</div>,
      Item: ({ children }: any) => <div>{children}</div>,
      Label: ({ children }: any) => <label>{children}</label>,
    }
  ),
  Dialog: {
    Root: ({ open, children }: any) => (open ? <div role="dialog">{children}</div> : null),
    Content: ({ children }: any) => <div>{children}</div>,
    Header: ({ children }: any) => <div>{children}</div>,
    Title: ({ children }: any) => <h2>{children}</h2>,
    Description: ({ children }: any) => <p>{children}</p>,
    Body: ({ children }: any) => <div>{children}</div>,
    Footer: ({ children }: any) => <div>{children}</div>,
    Close: ({ children }: any) => <div>{children}</div>,
  },
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

// ── Component under test (imported AFTER the mocks above) ─────────────

import {
  PublicSiteCard,
  suggestPublicUrls,
} from "../components/PublicSiteCard";

const baseProfile: PublicSiteProfile = {
  name: "Demo Site",
  tagline: "A demo",
  language: "en-US",
  logoUrl: "https://cms.example.com/logo.png",
  homeUrl: "https://cms.example.com",
  publicUrl: "",
  isHeadless: false,
  description: "",
  keyPages: [],
  permalinkStrategy: "inherit",
  permalinkTemplate: "",
  defaultPermalinkLang: "",
};

beforeEach(() => {
  mockProfile.mockReset();
  mockMutate.mockReset();
  mockQuickSetup.mockReset();
  mockMutationState.mockReturnValue({ isPending: false });
  mockQuickSetupState.mockReturnValue({ isPending: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("suggestPublicUrls", () => {
  // Pure heuristic — pinned here so the chip matrix doesn't drift
  // silently when someone tweaks BACKEND_PREFIXES. Spec:
  // `specs/site-identity-headless.md` §4 (Quick setup).

  it("returns the bare and www variants for cms.* hosts", () => {
    expect(suggestPublicUrls("https://cms.xerx.io")).toEqual([
      "https://xerx.io",
      "https://www.xerx.io",
    ]);
  });

  it("matches every BACKEND_PREFIXES entry", () => {
    expect(suggestPublicUrls("https://wp.example.com")[0]).toBe(
      "https://example.com",
    );
    expect(suggestPublicUrls("https://admin.example.com")[0]).toBe(
      "https://example.com",
    );
    expect(suggestPublicUrls("https://backend.example.com")[0]).toBe(
      "https://example.com",
    );
    expect(suggestPublicUrls("https://editor.example.com")[0]).toBe(
      "https://example.com",
    );
  });

  it("preserves the protocol when the WP install runs over http", () => {
    // Local dev / on-prem installs occasionally run over http. The
    // chips reflect that so a click doesn't silently upgrade and
    // produce a URL the operator's setup can't validate.
    expect(suggestPublicUrls("http://cms.example.com")).toEqual([
      "http://example.com",
      "http://www.example.com",
    ]);
  });

  it("returns nothing for unrecognised prefixes", () => {
    // `blog.acme.com` is plausibly the public face itself; we don't
    // want to suggest stripping `blog.`.
    expect(suggestPublicUrls("https://blog.acme.com")).toEqual([]);
    expect(suggestPublicUrls("https://acme.com")).toEqual([]);
  });

  it("returns nothing for dev-loop hosts with no dot in the stripped form", () => {
    // `cms.localhost` → `localhost` would suggest a chip that points
    // at a non-routable name. Drop those.
    expect(suggestPublicUrls("http://cms.localhost")).toEqual([]);
  });

  it("does not double-prefix when the stripped form already starts with www.", () => {
    // Edge case: someone runs WP at `cms.www.example.com`. The
    // stripped form is `www.example.com`; we shouldn't offer
    // `www.www.example.com` as a second chip.
    expect(suggestPublicUrls("https://cms.www.example.com")).toEqual([
      "https://www.example.com",
    ]);
  });

  it("returns nothing on malformed input", () => {
    expect(suggestPublicUrls("")).toEqual([]);
    expect(suggestPublicUrls("not a url")).toEqual([]);
  });
});

describe("PublicSiteCard", () => {
  it("shows a loading state while the profile is being fetched", () => {
    mockProfile.mockReturnValue({ data: undefined, isLoading: true });
    render(<PublicSiteCard />);
    expect(screen.getByText(/Loading public website settings/i)).toBeInTheDocument();
  });

  it("renders the 'inherits from WP' copy in non-headless mode", () => {
    mockProfile.mockReturnValue({ data: baseProfile, isLoading: false });
    render(<PublicSiteCard />);
    expect(screen.getByText(/Inherits everything from this WordPress install/i)).toBeInTheDocument();
    // Editable form fields stay hidden until the operator opts in.
    expect(screen.queryByLabelText(/Public website URL/i)).not.toBeInTheDocument();
  });

  it("reveals the editor body when the headless toggle flips on", async () => {
    mockProfile.mockReturnValue({ data: baseProfile, isLoading: false });
    render(<PublicSiteCard />);

    const toggle = screen.getByRole("checkbox", {
      name: /My public website lives elsewhere/i,
    });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByLabelText(/Public website URL/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
    });
  });

  it("hydrates the form fields from the saved profile", () => {
    mockProfile.mockReturnValue({
      data: {
        ...baseProfile,
        isHeadless: true,
        publicUrl: "https://www.example.com",
        description: "Existing description",
      },
      isLoading: false,
    });
    render(<PublicSiteCard />);

    expect(screen.getByDisplayValue("https://www.example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Existing description")).toBeInTheDocument();
  });

  it("sends the current draft to the save mutation on click", async () => {
    mockProfile.mockReturnValue({
      data: { ...baseProfile, isHeadless: true, publicUrl: "https://www.example.com" },
      isLoading: false,
    });
    mockMutate.mockResolvedValue({});

    render(<PublicSiteCard />);
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          isHeadless: true,
          publicUrl: "https://www.example.com",
          permalinkStrategy: "inherit",
        })
      );
    });
  });

  describe("Quick setup", () => {
    it("disables the auto-fill button when the URL field is empty", () => {
      // Without a URL the click would silently fail — the previous UX
      // surfaced a "type the URL above" toast for an input that lived
      // BELOW the button. The new flow disables the button and the
      // chips below the field do the suggesting visibly.
      mockProfile.mockReturnValue({
        data: { ...baseProfile, isHeadless: true, homeUrl: "https://customer.example.com" },
        isLoading: false,
      });
      render(<PublicSiteCard />);

      const button = screen.getByRole("button", { name: /Auto-fill from this URL/i });
      expect(button).toBeDisabled();

      fireEvent.click(button);
      expect(mockQuickSetup).not.toHaveBeenCalled();
    });

    it("renders suggestion chips for a cms.* host and fills the field on click", async () => {
      mockProfile.mockReturnValue({
        data: { ...baseProfile, isHeadless: true, homeUrl: "https://cms.xerx.io" },
        isLoading: false,
      });
      render(<PublicSiteCard />);

      // Both the bare and www. variants should be offered.
      const bareChip = screen.getByRole("button", { name: /Use xerx\.io/i });
      const wwwChip = screen.getByRole("button", { name: /Use www\.xerx\.io/i });
      expect(bareChip).toBeInTheDocument();
      expect(wwwChip).toBeInTheDocument();

      // Clicking a chip writes into the URL field, and once that
      // happens the auto-fill button enables.
      fireEvent.click(bareChip);
      const urlField = screen.getByLabelText(/Public website URL/i) as HTMLInputElement;
      expect(urlField.value).toBe("https://xerx.io");
      expect(
        screen.getByRole("button", { name: /Auto-fill from this URL/i })
      ).not.toBeDisabled();
    });

    it("does not render chips when the WP host has no recognised backend prefix", () => {
      mockProfile.mockReturnValue({
        data: { ...baseProfile, isHeadless: true, homeUrl: "https://blog.acme.com" },
        isLoading: false,
      });
      render(<PublicSiteCard />);
      // `blog.` is not in the BACKEND_PREFIXES list — operators on
      // those installs type their public URL by hand. The "Try:"
      // label stays out of the DOM so we don't render an empty chip
      // row.
      expect(screen.queryByText(/^Try:$/)).not.toBeInTheDocument();
    });

    it("scrapes the URL currently in the field on click (no silent auto-derive)", async () => {
      // Operator sets the URL explicitly — Quick setup acts on
      // exactly that, no surprise rewrites. Pinning this asserts the
      // 2026-04-30 UX revision: the click handler reads from
      // `draft.publicUrl` only.
      mockProfile.mockReturnValue({
        data: {
          ...baseProfile,
          isHeadless: true,
          homeUrl: "https://cms.xerx.io",
          publicUrl: "https://www.xerx.io",
        },
        isLoading: false,
      });
      const proposal: QuickSetupProposal = {
        description: "Scraped description.",
        keyPages: [{ url: "https://www.xerx.io/about", label: "About", role: "about" }],
      };
      mockQuickSetup.mockResolvedValue({ success: true, proposed: proposal, cached: false });

      render(<PublicSiteCard />);
      fireEvent.click(screen.getByRole("button", { name: /Auto-fill from this URL/i }));

      await waitFor(() => {
        // The click MUST scrape the user-set URL, not a cms-stripped
        // alternative — even though both chips are still on screen.
        expect(mockQuickSetup).toHaveBeenCalledWith("https://www.xerx.io");
      });
    });

    it("opens the confirmation modal with the scraped proposals", async () => {
      mockProfile.mockReturnValue({
        data: {
          ...baseProfile,
          isHeadless: true,
          publicUrl: "https://example.com",
        },
        isLoading: false,
      });
      const proposal: QuickSetupProposal = {
        description: "Scraped description that's long enough to be meaningful.",
        keyPages: [
          { url: "https://example.com/about", label: "About", role: "about" },
          { url: "https://example.com/pricing", label: "Pricing", role: "pricing" },
        ],
      };
      mockQuickSetup.mockResolvedValue({ success: true, proposed: proposal, cached: false });

      render(<PublicSiteCard />);
      fireEvent.click(screen.getByRole("button", { name: /Auto-fill from this URL/i }));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText(/Scraped description/)).toBeInTheDocument();
        expect(screen.getByText("About")).toBeInTheDocument();
        expect(screen.getByText("Pricing")).toBeInTheDocument();
      });
    });

    it("merges proposals into the draft only on Apply (not silently)", async () => {
      mockProfile.mockReturnValue({
        data: {
          ...baseProfile,
          isHeadless: true,
          publicUrl: "https://example.com",
        },
        isLoading: false,
      });
      const proposal: QuickSetupProposal = {
        description: "New scraped description.",
        keyPages: [{ url: "https://example.com/about", label: "About", role: "about" }],
      };
      mockQuickSetup.mockResolvedValue({ success: true, proposed: proposal, cached: false });
      mockMutate.mockResolvedValue({});

      render(<PublicSiteCard />);

      // Description starts empty; even after the modal opens, the
      // form state should NOT have been mutated yet.
      fireEvent.click(screen.getByRole("button", { name: /Auto-fill from this URL/i }));
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
      const description = screen.getByLabelText(/Description/i) as HTMLTextAreaElement;
      expect(description.value).toBe("");

      // Click Apply → description merges in.
      fireEvent.click(screen.getByRole("button", { name: /Apply proposals/i }));
      await waitFor(() => {
        expect(description.value).toBe("New scraped description.");
      });
    });

    it("preserves the prior draft when the operator cancels", async () => {
      mockProfile.mockReturnValue({
        data: {
          ...baseProfile,
          isHeadless: true,
          publicUrl: "https://example.com",
          description: "I wrote this myself.",
        },
        isLoading: false,
      });
      const proposal: QuickSetupProposal = {
        description: "Auto-generated description.",
        keyPages: [],
      };
      mockQuickSetup.mockResolvedValue({ success: true, proposed: proposal, cached: false });

      render(<PublicSiteCard />);
      fireEvent.click(screen.getByRole("button", { name: /Auto-fill from this URL/i }));
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
      const description = screen.getByLabelText(/Description/i) as HTMLTextAreaElement;
      expect(description.value).toBe("I wrote this myself.");
    });
  });
});
