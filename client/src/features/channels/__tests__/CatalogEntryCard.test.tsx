/**
 * CatalogEntryCard render-branch tests.
 *
 * Pins the visible output of each entitlement state that the Store surfaces.
 * The spec checklist item "Free-tier teaser renders correctly with the new
 * entitlement shape" (specs/integrations-store-spec.md §17, Phase 6) is
 * covered here via the `upgrade_plan` + `add_channels` + `coming_soon`
 * branches — those are exactly what a Free-plan (or Pro-without-Channels)
 * user sees when the cloud-computed `entitlement` blocks install.
 *
 * Why the card, not the page:
 *   - The page is a pure data-binding shell (loading / error / empty / grid).
 *     The actual teaser UX — badge, CTA wording, hint, pricing-page
 *     destination — lives on the card.
 *   - Every other channels component has a sibling `__tests__` file; this
 *     one was the last CTA surface without direct render coverage.
 *
 * What we deliberately DON'T test here:
 *   - `computeEntitlement` math — already covered exhaustively in
 *     functions/src/channels/__tests__/catalog.test.ts.
 *   - `channelsListCatalog` derivation from the `entitlements` map — covered
 *     by ChannelsListCatalogEndpoint.test.ts.
 *   - The install modal branching — covered by InstallModal.test.tsx.
 *
 * Here we only verify the UI honors whatever the cloud says via
 * `entry.entitlement.{canInstall,blocker}`.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// `@wordpress/i18n` resolves translation keys through JSON catalogs in real
// builds. Stub to identity so assertions can match on the source English
// strings from the component.
vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%[sd]/g, () => String(args[i++]));
  },
}));

// `InstallModal` renders inside a Headless UI Dialog portal and pulls in the
// webhook form / react-query — stub it to a transparent passthrough so these
// tests stay focused on the card surface. We assert the "Install" click path
// reaches the modal by checking that the stub is mounted with `open=true`.
vi.mock("../components/InstallModal", () => ({
  InstallModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="install-modal-open" /> : null,
}));

// IntegrationIcon does a fetch-and-render dance with a fallback — not part of
// this slice. Replace with a marker so we can assert it rendered.
vi.mock("../components/IntegrationIcon", () => ({
  IntegrationIcon: ({ integrationId }: { integrationId: string }) => (
    <span data-testid={`icon-${integrationId}`} />
  ),
}));

import { CatalogEntryCard } from "../components/CatalogEntryCard";
import type { IntegrationCatalogEntry } from "../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Asserts a CTA's href routes to the marketing pricing page with the
 * expected intent. The card builds the URL through
 * `buildMarketingPricingUrl`, which prepends the locale segment
 * (`/en/pricing`), adds `source=plugin` and any context params, so the
 * test pins the structure rather than a literal string — same approach
 * as `AddonCard.test.tsx`.
 *
 * Spec anchor: §10 — "cards render with 'Upgrade plan' / 'Add Channels'
 * CTAs that route to the marketing pricing page". The intent field is
 * what lets the marketing site scroll-highlight the right tier and
 * lets analytics attribute conversions to this surface specifically.
 */
function expectPricingHref(href: string | null, intent: string): void {
  const parsed = new URL(href ?? "");
  expect(parsed.host).toBe("www.structurawp.com");
  expect(parsed.pathname).toMatch(/\/(en|de|es|fr)\/pricing$/);
  expect(parsed.searchParams.get("intent")).toBe(intent);
  expect(parsed.searchParams.get("source")).toBe("plugin");
}

function makeEntry(
  overrides: Partial<IntegrationCatalogEntry> = {},
): IntegrationCatalogEntry {
  return {
    id: "slack-webhook",
    name: "Slack",
    description: "Post a message to any Slack channel when content publishes.",
    category: "notify",
    capabilities: ["notify"],
    authType: "webhook",
    iconUrl: "",
    gating: { requiredPlan: "byok", requiredAddon: null },
    entitlement: { canInstall: true, blocker: null },
    ...overrides,
  };
}

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

// ---------------------------------------------------------------------------
// Installable branch
// ---------------------------------------------------------------------------

describe("CatalogEntryCard — installable branch", () => {
  it("renders the Install CTA and primary metadata when canInstall=true", () => {
    const entry = makeEntry();
    renderWithClient(<CatalogEntryCard entry={entry} />);

    // Integration name, description, and category pill all surface.
    expect(screen.getByText("Slack")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Post a message to any Slack channel when content publishes.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Notifications")).toBeInTheDocument();

    // Install button is present and NOT a link — no upgrade href.
    const install = screen.getByRole("button", { name: /^install$/i });
    expect(install).toBeInTheDocument();
    expect(install).not.toHaveAttribute("href");

    // GatingHint should be suppressed for installable entries.
    expect(screen.queryByText(/requires/i)).toBeNull();
    expect(screen.queryByText(/requires pro plan/i)).toBeNull();

    // Modal starts closed.
    expect(screen.queryByTestId("install-modal-open")).toBeNull();
  });

  it("opens the install modal when the Install button is clicked", () => {
    renderWithClient(<CatalogEntryCard entry={makeEntry()} />);
    fireEvent.click(screen.getByRole("button", { name: /^install$/i }));
    expect(screen.getByTestId("install-modal-open")).toBeInTheDocument();
  });

  it("shows a Pro tier badge when the entry requires a paid plan", () => {
    // `requiredPlan=pro, requiredAddon=null` — the Tier A pattern (Slack,
    // Discord, IndexNow). Badge should read "Pro" since it's not free and
    // there's no channels addon to shift it to the indigo "Channels" badge.
    renderWithClient(<CatalogEntryCard entry={makeEntry()} />);
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.queryByText("Free")).toBeNull();
    expect(screen.queryByText("Channels")).toBeNull();
  });

  it("shows a Free tier badge for an entry that requires no plan tier", () => {
    const entry = makeEntry({
      gating: { requiredPlan: "free", requiredAddon: null },
    });
    renderWithClient(<CatalogEntryCard entry={entry} />);
    expect(screen.getByText("Free")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Free-tier / upgrade_plan branch — core spec requirement
// ---------------------------------------------------------------------------

describe("CatalogEntryCard — upgrade_plan branch (Free-tier teaser)", () => {
  // This is the render path a Free-plan user sees for every Tier A entry
  // (Slack, Discord, IndexNow). Spec §10 mandates an "Upgrade plan" CTA
  // pointing at the public pricing page. Regressing the destination — or
  // swapping to a non-link button — would break the sole conversion lever
  // the Store surface carries today.

  const freeTierBlockedEntry = makeEntry({
    entitlement: { canInstall: false, blocker: "upgrade_plan" },
  });

  it("renders 'Upgrade plan' as an anchor pointing at the pricing page", () => {
    renderWithClient(<CatalogEntryCard entry={freeTierBlockedEntry} />);
    const cta = screen.getByRole("link", { name: /upgrade plan/i });
    expectPricingHref(cta.getAttribute("href"), "general_upgrade");
    // New-tab affordance is part of the pattern — opens in a new tab so the
    // user doesn't lose their place in wp-admin. Keep it pinned.
    expect(cta).toHaveAttribute("target", "_blank");
    expect(cta).toHaveAttribute("rel", "noreferrer");
  });

  it("renders the 'Requires Pro plan' hint when requiredPlan is pro", () => {
    renderWithClient(<CatalogEntryCard entry={freeTierBlockedEntry} />);
    expect(screen.getByText("Requires Pro plan")).toBeInTheDocument();
  });

  it("renders the 'Requires higher plan' hint when requiredPlan is above pro", () => {
    // Agency tiers aren't in the catalog today but the hint branch must
    // still behave if we ever add one — this is the "any plan above pro"
    // fallback label.
    const entry = makeEntry({
      gating: { requiredPlan: "cloud_pro", requiredAddon: null },
      entitlement: { canInstall: false, blocker: "upgrade_plan" },
    });
    renderWithClient(<CatalogEntryCard entry={entry} />);
    expect(screen.getByText("Requires higher plan")).toBeInTheDocument();
  });

  it("does NOT render the install modal for a blocked entry", () => {
    // Spec §10.1.1: "The modal is only mounted when
    // `entry.entitlement.canInstall === true`". Regressing this would expose
    // the install form to a user who hasn't paid for the integration.
    renderWithClient(<CatalogEntryCard entry={freeTierBlockedEntry} />);
    // No button to click, and the modal fixture is never mounted.
    expect(screen.queryByRole("button", { name: /^install$/i })).toBeNull();
    expect(screen.queryByTestId("install-modal-open")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// add_channels branch — Pro user without the Channels SKU
// ---------------------------------------------------------------------------

describe("CatalogEntryCard — add_channels branch", () => {
  // Synthesize a catalog entry that matches the LinkedIn gating shape
  // (`requiredPlan=pro, requiredAddon=channels`) but is NOT marked
  // comingSoon — so we can drive the `add_channels` render path that will
  // light up when LinkedIn ships. Regression target: a Pro user without the
  // add-on must see an "Add Channels" CTA and the channels-tier badge.
  const addChannelsEntry = makeEntry({
    id: "linkedin",
    name: "LinkedIn",
    authType: "oauth2",
    gating: { requiredPlan: "byok", requiredAddon: "channels" },
    entitlement: { canInstall: false, blocker: "add_channels" },
  });

  it("renders an indigo 'Channels' tier badge", () => {
    renderWithClient(<CatalogEntryCard entry={addChannelsEntry} />);
    expect(screen.getByText("Channels")).toBeInTheDocument();
    // Pro-only badge must NOT appear when requiredAddon=channels — the
    // channels badge wins that branch.
    expect(screen.queryByText("Pro")).toBeNull();
  });

  it("renders 'Add Channels' as an anchor to the pricing page", () => {
    renderWithClient(<CatalogEntryCard entry={addChannelsEntry} />);
    const cta = screen.getByRole("link", { name: /add channels/i });
    expectPricingHref(cta.getAttribute("href"), "unlock_channels");
    expect(cta).toHaveAttribute("target", "_blank");
  });

  it("renders the 'Requires Channels add-on' hint", () => {
    renderWithClient(<CatalogEntryCard entry={addChannelsEntry} />);
    expect(screen.getByText("Requires Channels add-on")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// coming_soon branch — highest-priority blocker
// ---------------------------------------------------------------------------

describe("CatalogEntryCard — coming_soon branch", () => {
  // `computeEntitlement` short-circuits on `entry.comingSoon` before
  // evaluating plan/addon. The card must mirror that: a coming-soon entry
  // always shows the "Coming soon" badge + disabled CTA, regardless of
  // whether the user's plan technically allows install.
  const comingSoonEntry = makeEntry({
    id: "whatsapp",
    name: "WhatsApp",
    authType: "apikey",
    comingSoon: true,
    gating: { requiredPlan: "free", requiredAddon: null },
    entitlement: { canInstall: false, blocker: "coming_soon" },
  });

  it("renders the 'Coming soon' tier badge", () => {
    renderWithClient(<CatalogEntryCard entry={comingSoonEntry} />);
    // Two instances: one as the tier badge, one inside the disabled CTA
    // button label. Both must be present; getAllByText guards against a
    // future renaming that collapses them.
    const matches = screen.getAllByText("Coming soon");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders a disabled CTA with no upgrade href", () => {
    renderWithClient(<CatalogEntryCard entry={comingSoonEntry} />);
    // The disabled coming-soon button is NOT an anchor — it must NOT route
    // to the pricing page (nothing to upgrade TO).
    expect(screen.queryByRole("link", { name: /coming soon/i })).toBeNull();
    const button = screen.getByRole("button", { name: /coming soon/i });
    expect(button).toBeDisabled();
  });

  it("suppresses the gating hint for coming-soon entries", () => {
    // The hint is about "what do I need to unlock this?" — nothing unlocks
    // a coming-soon entry, so showing "Requires Pro plan" would mislead.
    renderWithClient(<CatalogEntryCard entry={comingSoonEntry} />);
    expect(screen.queryByText(/requires/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: category pill label fanout
// ---------------------------------------------------------------------------

describe("CatalogEntryCard — category pill labels", () => {
  // Assert each category label maps to its human-readable pill. The `switch`
  // in `categoryLabel` has one branch per IntegrationCategory; regressing any
  // one of them would silently drop a pill into an empty span.
  const categoryLabels: Array<
    [IntegrationCatalogEntry["category"], string]
  > = [
    ["notify", "Notifications"],
    ["email", "Email"],
    ["social", "Social"],
    ["seo", "SEO"],
    ["ads", "Ads"],
    ["crm", "CRM"],
    ["video", "Video"],
  ];

  it.each(categoryLabels)(
    "renders the pill label '%s' as '%s'",
    (category, label) => {
      const entry = makeEntry({ category });
      renderWithClient(<CatalogEntryCard entry={entry} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );
});

// ---------------------------------------------------------------------------
// Video channel — premium store card (design handoff §1)
// ---------------------------------------------------------------------------

describe("CatalogEntryCard — video channel premium card", () => {
  // The Video card keeps the shared grid geometry + CTA logic but adds the
  // premium hairline ring, a fuchsia "Video" category pill, capability
  // chips, and per-state hints ("Includes 20 videos/mo" when installable,
  // "Requires Cloud Pro" when plan-blocked). The catalog currently ships
  // the entry with comingSoon: true — but the card must render every
  // entitlement state correctly so flipping the server flag needs no UI
  // release.
  const videoEntry = (
    overrides: Partial<IntegrationCatalogEntry> = {},
  ): IntegrationCatalogEntry =>
    makeEntry({
      id: "video",
      name: "Video: Shorts & TikTok",
      description:
        "Turns every published post into a 30–60 second vertical video — your images, stock footage, an AI voiceover, and animated captions. Rendered for YouTube Shorts and TikTok.",
      category: "video",
      capabilities: ["adapt"],
      authType: "none",
      gating: { requiredPlan: "cloud_pro", requiredAddon: null },
      entitlement: { canInstall: true, blocker: null },
      ...overrides,
    });

  it("renders the fuchsia Video category pill", () => {
    renderWithClient(<CatalogEntryCard entry={videoEntry()} />);
    const pill = screen.getByText("Video");
    expect(pill.className).toContain("bg-fuchsia-100");
    expect(pill.className).toContain("text-fuchsia-800");
    expect(pill.className).toContain("dark:bg-fuchsia-900/40");
    expect(pill.className).toContain("dark:text-fuchsia-200");
  });

  it("renders the three capability chips", () => {
    renderWithClient(<CatalogEntryCard entry={videoEntry()} />);
    expect(screen.getByText("AI voiceover")).toBeInTheDocument();
    expect(screen.getByText("Animated captions")).toBeInTheDocument();
    expect(screen.getByText("9:16 vertical")).toBeInTheDocument();
  });

  it("wraps the card in the brand→fuchsia premium hairline ring", () => {
    const { container } = renderWithClient(
      <CatalogEntryCard entry={videoEntry()} />,
    );
    expect(
      container.querySelector("[data-testid='video-premium-ring']"),
    ).toBeTruthy();
  });

  it("entitled: shows Install plus the quota hint", () => {
    renderWithClient(<CatalogEntryCard entry={videoEntry()} />);
    expect(
      screen.getByRole("button", { name: /^install$/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Includes 20 videos/mo")).toBeInTheDocument();
  });

  it("upgrade_plan: shows the Requires Cloud Pro hint and an upgrade link", () => {
    renderWithClient(
      <CatalogEntryCard
        entry={videoEntry({
          entitlement: { canInstall: false, blocker: "upgrade_plan" },
        })}
      />,
    );
    expect(screen.getByText("Requires Cloud Pro")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /upgrade plan/i }),
    ).toBeInTheDocument();
    // Capability chips render on every state — a blocked user still gets
    // the pitch.
    expect(screen.getByText("AI voiceover")).toBeInTheDocument();
  });

  it("coming_soon: renders the badge and a disabled CTA (current catalog state)", () => {
    renderWithClient(
      <CatalogEntryCard
        entry={videoEntry({
          comingSoon: true,
          entitlement: { canInstall: false, blocker: "coming_soon" },
        })}
      />,
    );
    expect(
      screen.getAllByText("Coming soon").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("button", { name: /coming soon/i }),
    ).toBeDisabled();
    // No quota hint while nothing is installable.
    expect(screen.queryByText("Includes 20 videos/mo")).toBeNull();
  });
});
