/**
 * New campaign — the Setup step drafts itself (spec
 * `campaign-language-and-smart-setup.md` §4.4).
 *
 * The Interview step is gone: the step runs a deterministic draft the moment
 * it mounts, and the AI pass runs only when a paid user presses Magic
 * suggest. What this pins:
 *
 *   1. The deterministic call goes out on mount, in the SITE's language, and
 *      its fields land on the form under the neutral "drafted from your site"
 *      pill.
 *   2. Nothing fires the `ai` stage on mount, on any tier. Pressing Magic
 *      suggest does, and swaps to the purple pill.
 *   3. A failed Magic suggest leaves the deterministic draft standing behind
 *      an Alert with Try again; free licenses never see the button at all.
 *   4. Edited fields get a confirmation before Magic suggest overwrites them.
 *   5. A failed draft is never a dead end — an error Alert with Try again
 *      over a form the user can still fill in themselves.
 *   6. The overlap notice names the sibling campaign and dismisses.
 *   7. The language seeds from the WP site language, including a regional
 *      variant (`de-AT` → `de_AT`) and an unsupported locale (`fa-IR` →
 *      `fa_IR`, which keeps writing through the "Other…" catalogue).
 *   8. Coded rationale renders as sentences, never as raw codes.
 *
 * Only the network edge (`@wordpress/api-fetch`) and the settings / personas
 * data hooks are mocked. The real page, the real draft hook, the real form
 * context and the real rationale labels all run (repo rule: never mock the
 * unit under test).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { ToastProvider } from "@structura/ui";

vi.mock("@wordpress/i18n", () => ({
  __: (t: string) => t,
  _n: (single: string, plural: string, n: number) => (n === 1 ? single : plural),
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

const apiFetchMock = vi.fn();
vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => apiFetchMock(...args),
}));

const h = vi.hoisted(() => ({
  license: { isPaidLicense: false, isLicensed: true, plan: "free" } as Record<
    string,
    unknown
  >,
  /** What `get_bloginfo('language')` reports for this install. */
  siteLanguage: "de-DE",
}));

vi.mock("@/features/settings", () => ({
  useLicense: () => h.license,
  usePublicSiteProfile: () => ({
    data: { language: h.siteLanguage },
    isLoading: false,
  }),
  useSeoRules: () => ({ rules: null, isLoading: false }),
  useDefaultProviders: () => ({
    defaultTextProvider: "openai",
    defaultImageProvider: "openai",
    availableProviders: ["openai"],
    availableImageProviders: ["openai"],
    incompleteProviders: [],
    isProviderIncomplete: () => false,
    hasExplicitDefaults: true,
    hasMultipleProviders: false,
    isFullyConfigured: true,
    isCloud: false,
  }),
}));

vi.mock("@/features/personas", () => {
  const personas = () => ({
    data: [{ id: "p1", name: "House voice" }],
    isLoading: false,
  });
  return { usePersonasQuery: personas, useSitePersonasQuery: personas };
});

vi.mock("@/features/ai-engine", () => ({ useAiSettingsQuery: () => ({ data: {} }) }));
vi.mock("@/features/ai-engine/api/useAvailableModelsQuery", () => ({
  useAvailableModelsQuery: () => ({ data: undefined }),
}));

import CreateCampaignPage from "../routes/CreateCampaignPage";
import { useCampaignDraftStore } from "../context/draftStore";

const DRAFT_PATH = "/structura/v1/campaigns/draft-setup";

/** The deterministic pass: templated, honest, instant. */
const deterministicDraft = (overrides: Record<string, unknown> = {}) => ({
  language: {
    code: "de",
    source: "wp",
    support: "full",
    additionalLanguages: ["en"],
  },
  name: "Balkongarten auf kleinem Raum",
  objective:
    "Gartenblog veröffentlicht praxisnahe Artikel über Balkongärten für Stadtbewohner und führt sie zum Angebot der Seite.",
  topics: ["balkongarten", "kräuter im topf"],
  campaignMode: "authority",
  discoveryMode: "winnable",
  suggestedPostsPerWeek: 2,
  siblingCampaigns: [],
  sitePostsPerWeek: 2,
  rationale: [
    { code: "language_from_site", params: { language: "de" } },
    { code: "approach_authority_low_footprint" },
  ],
  stage: "deterministic",
  ...overrides,
});

/** The AI pass: the same shape, better prose, `stage: "ai"`. */
const aiDraft = () =>
  deterministicDraft({
    name: "Balkongarten-Guide",
    objective:
      "Wir zeigen Stadtbewohnern Schritt für Schritt, wie aus zwei Quadratmetern Balkon ein tragfähiger Garten wird — und führen sie danach zu unseren Pflanzsets.",
    stage: "ai",
  });

const calls = () =>
  apiFetchMock.mock.calls
    .map(([opts]) => opts as { path?: string; data?: Record<string, unknown> })
    .filter((opts) => opts?.path === DRAFT_PATH);

const renderWizard = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/campaigns/new"]}>
          <Routes>
            <Route path="/campaigns/new" element={<CreateCampaignPage />} />
            <Route path="*" element={<div>elsewhere</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  h.license = { isPaidLicense: false, isLicensed: true, plan: "free" };
  h.siteLanguage = "de-DE";
  // The wizard resumes from localStorage; a leftover draft would pin the
  // language and short-circuit the seeding this file is about.
  useCampaignDraftStore.getState().discardDraft();
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (opts: { path?: string; data?: any }) => {
    if (opts?.path === DRAFT_PATH) {
      return {
        success: true,
        draft: opts.data?.stage === "ai" ? aiDraft() : deterministicDraft(),
      };
    }
    return [];
  });
});

describe("New campaign — Setup step", () => {
  it("drafts deterministically on mount and shows the neutral pill", async () => {
    renderWizard();

    await waitFor(() => expect(calls().length).toBeGreaterThan(0));
    expect(calls()[0].data).toEqual({ stage: "deterministic", language: "de" });

    expect(await screen.findByText("Drafted from your site")).toBeTruthy();
    expect(
      (screen.getByLabelText("Campaign Name") as HTMLInputElement).value,
    ).toBe("Balkongarten auf kleinem Raum");

    // Free tier stops at stage 1 — the AI pass is a paid feature, and there
    // is no locked button or upsell standing in for it.
    expect(calls().some((c) => c.data?.stage === "ai")).toBe(false);
    expect(screen.queryByText("Drafted for you")).toBeNull();
    expect(screen.queryByRole("button", { name: /Magic suggest/ })).toBeNull();
  });

  it("only runs the AI pass when Magic suggest is pressed", async () => {
    h.license = { isPaidLicense: true, isLicensed: true, plan: "byok" };
    renderWizard();

    expect(await screen.findByText("Drafted from your site")).toBeTruthy();
    // The expensive pass is opt-in — mounting the step must not spend a
    // model call on a campaign the user may never launch.
    expect(calls().map((c) => c.data?.stage)).toEqual(["deterministic"]);

    fireEvent.click(screen.getByRole("button", { name: /Magic suggest/ }));

    await waitFor(() =>
      expect(calls().map((c) => c.data?.stage)).toEqual(["deterministic", "ai"]),
    );
    expect(await screen.findByText("Drafted for you")).toBeTruthy();
    expect(
      (screen.getByLabelText("Campaign Name") as HTMLInputElement).value,
    ).toBe("Balkongarten-Guide");
    expect(screen.queryByText("Drafted from your site")).toBeNull();
  });

  it("keeps the draft and offers Try again when Magic suggest fails", async () => {
    h.license = { isPaidLicense: true, isLicensed: true, plan: "byok" };
    apiFetchMock.mockImplementation(async (opts: { path?: string; data?: any }) => {
      if (opts?.path === DRAFT_PATH) {
        if (opts.data?.stage === "ai") throw { message: "cloud_error" };
        return { success: true, draft: deterministicDraft() };
      }
      return [];
    });
    renderWizard();

    expect(await screen.findByText("Drafted from your site")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Magic suggest/ }));

    expect(
      await screen.findByText("Couldn't refine this campaign — try again"),
    ).toBeTruthy();
    // The deterministic draft is still what the user is looking at.
    expect(
      (screen.getByLabelText("Campaign Name") as HTMLInputElement).value,
    ).toBe("Balkongarten auf kleinem Raum");
    expect(screen.getByText("Drafted from your site")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    await waitFor(() =>
      expect(calls().filter((c) => c.data?.stage === "ai").length).toBe(2),
    );
  });

  it("asks before Magic suggest replaces fields the user edited", async () => {
    h.license = { isPaidLicense: true, isLicensed: true, plan: "byok" };
    renderWizard();

    expect(await screen.findByText("Drafted from your site")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Campaign Name"), {
      target: { value: "My own name" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Magic suggest/ }));
    expect(await screen.findByText("Replace your edits?")).toBeTruthy();
    expect(calls().some((c) => c.data?.stage === "ai")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() =>
      expect(calls().some((c) => c.data?.stage === "ai")).toBe(true),
    );
    // Confirmed, so the AI draft wins over the edit it was warned about.
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Campaign Name") as HTMLInputElement).value,
      ).toBe("Balkongarten-Guide"),
    );
  });

  it("keeps the user's edits when the Magic suggest confirmation is declined", async () => {
    h.license = { isPaidLicense: true, isLicensed: true, plan: "byok" };
    renderWizard();

    expect(await screen.findByText("Drafted from your site")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Campaign Name"), {
      target: { value: "My own name" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Magic suggest/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Keep mine" }));

    expect(calls().some((c) => c.data?.stage === "ai")).toBe(false);
    expect(
      (screen.getByLabelText("Campaign Name") as HTMLInputElement).value,
    ).toBe("My own name");
  });

  it("keeps the form usable behind an error alert when the draft fails", async () => {
    apiFetchMock.mockImplementation(async (opts: { path?: string }) => {
      if (opts?.path === DRAFT_PATH) throw { message: "cloud_error" };
      return [];
    });
    renderWizard();

    expect(
      await screen.findByText(
        "Couldn't draft this campaign — fill it in yourself or try again.",
      ),
    ).toBeTruthy();

    // The empty form still accepts input — the step is never a dead end.
    const nameField = screen.getByLabelText("Campaign Name") as HTMLInputElement;
    expect(nameField.value).toBe("");
    fireEvent.change(nameField, { target: { value: "Hand-written campaign" } });
    expect(
      (screen.getByLabelText("Campaign Name") as HTMLInputElement).value,
    ).toBe("Hand-written campaign");

    const before = calls().length;
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(calls().length).toBeGreaterThan(before));
  });

  it("names the overlapping campaign and dismisses the notice", async () => {
    apiFetchMock.mockImplementation(async (opts: { path?: string; data?: any }) => {
      if (opts?.path === DRAFT_PATH) {
        return {
          success: true,
          draft: deterministicDraft({
            siblingCampaigns: [
              {
                campaignId: "camp-1",
                name: "Frühlingstipps für den Garten",
                language: "de",
                postsPerWeek: 2,
              },
            ],
            rationale: [
              {
                code: "overlap_sibling_campaign",
                params: { name: "Frühlingstipps für den Garten" },
              },
            ],
          }),
        };
      }
      return [];
    });
    renderWizard();

    expect(
      await screen.findByText(/Frühlingstipps für den Garten.*already running/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue anyway" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Continue anyway" })).toBeNull(),
    );
  });

  it("seeds the campaign language from the WordPress site language", async () => {
    h.siteLanguage = "de-AT";
    renderWizard();

    await waitFor(() => expect(calls().length).toBeGreaterThan(0));
    // The Austrian variant is its own picker option, not collapsed to `de`.
    expect(calls()[0].data).toEqual({ stage: "deterministic", language: "de_AT" });
  });

  it("keeps an unsupported site language as its WordPress locale", async () => {
    // Persian has no search data, so it is not a picker option — but the
    // campaign still writes in it rather than silently falling back to
    // English (spec §3.3, `ai_only`).
    h.siteLanguage = "fa-IR";
    renderWizard();

    await waitFor(() => expect(calls().length).toBeGreaterThan(0));
    expect(calls()[0].data).toEqual({ stage: "deterministic", language: "fa_IR" });
  });

  it("renders the rationale codes as sentences, never as codes", async () => {
    renderWizard();

    expect(
      await screen.findByText("Writing in German, your site's language."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Your site ranks for few keywords so far, so this campaign builds topical authority first.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/language_from_site/)).toBeNull();
  });
});
