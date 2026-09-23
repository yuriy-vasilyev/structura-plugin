/**
 * Core content settings — persona picker scope (Create + Edit campaign).
 *
 * Regression net for 2026-09-22: on a workspace running several sites, the
 * campaign persona dropdown listed every voice in the shared library instead
 * of the ones bound to the site the SPA is running inside. The Personas page
 * and the onboarding wizard have split on per-site membership since
 * 2026-07-03; this picker never did. Reported against the portal, the same
 * code shape was here.
 *
 * Drives the REAL panel and the REAL `useSitePersonasQuery` against a mocked
 * `apiFetch` — stubbing the persona hook would keep passing with the
 * filtering removed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({
  /** `/structura/v1/personas` envelope the cloud would return. */
  envelope: { personas: [], defaultPersonaId: null, memberPersonaIds: [] } as {
    personas: Array<{ id: string; name: string }>;
    defaultPersonaId: string | null;
    memberPersonaIds: string[];
  },
  personaId: "random" as string,
}));

vi.mock("@wordpress/api-fetch", () => ({
  default: async ({ path }: { path: string }) => {
    if (path === "/structura/v1/personas") return h.envelope;
    return [];
  },
}));

vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({ hasWorkspace: true, isPaidLicense: true }),
}));

vi.mock("@/features/campaigns/context/CampaignContext", () => ({
  useCampaignForm: () => ({
    formData: {
      intelligence: { language: "default", postLength: 2700, personaId: h.personaId },
      structure: { postStatus: "publish" },
    },
    updateForm: vi.fn(),
  }),
}));

import { CoreContentSettings } from "../CoreContentSettings";

const persona = (id: string, name: string) => ({ id, name });

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CoreContentSettings />
    </QueryClientProvider>,
  );
}

/** Open the persona dropdown — its trigger shows the current selection. */
async function openPersonaPicker(triggerLabel: string) {
  const trigger = await screen.findByText(triggerLabel);
  fireEvent.click(trigger);
  await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
  return screen.getAllByRole("option").map((o) => o.textContent);
}

beforeEach(() => {
  h.personaId = "random";
  h.envelope = { personas: [], defaultPersonaId: null, memberPersonaIds: [] };
});

describe("CoreContentSettings — persona picker is scoped to the site", () => {
  it("offers only the voices bound to this site, not the whole workspace library", async () => {
    h.envelope.personas = [
      persona("p-mine", "The Strategic Apothecary Advisor"),
      persona("p-sibling", "The Balcony Botanist"),
      persona("p-other", "Jenna Ima"),
    ];
    h.envelope.memberPersonaIds = ["p-mine"];

    renderPanel();

    const options = await openPersonaPicker("Random persona");

    expect(options).toContain("The Strategic Apothecary Advisor");
    expect(options).not.toContain("The Balcony Botanist");
    expect(options).not.toContain("Jenna Ima");
    expect(options).toContain("Random persona");
  });

  it("keeps a persona the campaign already names after it stops being a member", async () => {
    h.envelope.personas = [
      persona("p-mine", "The Strategic Apothecary Advisor"),
      persona("p-legacy", "The Modern Alpine Herb Witch"),
    ];
    h.envelope.memberPersonaIds = ["p-mine"];
    h.personaId = "p-legacy";

    renderPanel();

    const options = await openPersonaPicker("The Modern Alpine Herb Witch");

    expect(options).toContain("The Modern Alpine Herb Witch");
    expect(options).toContain("The Strategic Apothecary Advisor");
  });

  it("falls back to the library on a site with no memberships", async () => {
    // Pre-membership activations: the cloud rotates the whole library for
    // these, so an empty picker would be the worse lie.
    h.envelope.personas = [persona("p-a", "House Voice"), persona("p-b", "Jenna Ima")];
    h.envelope.memberPersonaIds = [];

    renderPanel();

    const options = await openPersonaPicker("Random persona");

    expect(options).toContain("House Voice");
    expect(options).toContain("Jenna Ima");
  });
});
