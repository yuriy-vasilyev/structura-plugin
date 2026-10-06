/**
 * New campaign — the Setup step drafts only on request (spec
 * `campaign-language-and-smart-setup.md` §4.4).
 *
 * Rewritten 2026-10-02: the step used to run a deterministic draft the moment
 * it mounted, and only paid plans had Magic suggest. It now mirrors the
 * customer portal (2026-09-29): it opens empty, and one Magic suggest on
 * every plan is one cloud call — `ai` on every plan since 2026-10-06
 * (`deterministic` on Free until then). What this pins:
 *
 *   1. Mount makes no draft call, shows empty fields, no skeletons and no
 *      rationale strip; the Magic suggest button is there on Free too.
 *   2. One click is one call with the plan's stage, and its draft lands
 *      under the matching pill.
 *   3. A gated AI pass lands the templated draft and shows the inline error
 *      with Try again; a failed call keeps whatever is in the fields.
 *   4. The AI call limit refusal shows its own message and keeps the fields.
 *   5. Edited fields get a confirmation before Magic suggest replaces them.
 *   6. A language pick before any draft makes no call; after a draft it
 *      asks "Redraft the campaign in X?" and then drafts in that language.
 *   7. The overlap notice and the rationale sentences come with a draft.
 *   8. The language seeds from the WP site language (`de-AT` → `de_AT`,
 *      `fa-IR` → `fa_IR`) and the first suggestion is drafted in it.
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
  _x: (t: string) => t,
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
  /** `useDefaultProviders` overrides for the inline provider block cases. */
  providers: {} as Record<string, unknown>,
  /** Text providers with a key behind them (`useAiConnections`). */
  textProviders: ["openai"] as string[],
}));

vi.mock("@/features/settings", () => ({
  useLicense: () => h.license,
  usePublicSiteProfile: () => ({
    data: { language: h.siteLanguage },
    isLoading: false,
  }),
  useSeoRules: () => ({ rules: null, isLoading: false }),
  useAiConnections: () => ({ textProviders: h.textProviders }),
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
    ...h.providers,
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
  h.providers = {};
  h.textProviders = ["openai"];
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

const nameField = () => screen.getByLabelText("Campaign Name") as HTMLInputElement;
const magicSuggest = () => screen.getByRole("button", { name: /Magic suggest/ });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("New campaign — Setup step (no draft on mount, 2026-10-02)", () => {
  it("opens empty with no draft call, no skeletons and no rationale strip", async () => {
    renderWizard();

    expect(await screen.findByRole("button", { name: /Magic suggest/ })).toBeTruthy();
    await wait(50);
    expect(calls()).toEqual([]);
    expect(nameField().value).toBe("");
    expect(screen.queryByTestId("setup-name-skeleton")).toBeNull();
    expect(screen.queryByTestId("setup-objective-skeleton")).toBeNull();
    expect(screen.queryByText("Why these settings")).toBeNull();
    expect(screen.queryByText("Drafted from your site")).toBeNull();
  });

  // Magic suggest on every plan (2026-10-06, specs/open-providers.md §8):
  // Free and anonymous sites asked for the templated draft until then.
  it.each(["free", "none"])("%s: one click is one AI call; the draft lands under the AI pill", async (plan) => {
    h.license = { isPaidLicense: false, isLicensed: plan !== "none", plan };
    renderWizard();

    fireEvent.click(await screen.findByRole("button", { name: /Magic suggest/ }));
    expect(await screen.findByText("Drafted for you")).toBeTruthy();
    expect(calls().map((c) => c.data)).toEqual([{ stage: "ai", language: "de" }]);
    expect(nameField().value).toBe("Balkongarten-Guide");
    expect(screen.queryByText("Drafted from your site")).toBeNull();
  });

  it("paid: one click is one AI call; the draft lands under the AI pill", async () => {
    h.license = { isPaidLicense: true, isLicensed: true, plan: "byok" };
    renderWizard();

    fireEvent.click(await screen.findByRole("button", { name: /Magic suggest/ }));
    expect(await screen.findByText("Drafted for you")).toBeTruthy();
    expect(calls().map((c) => c.data)).toEqual([{ stage: "ai", language: "de" }]);
    expect(nameField().value).toBe("Balkongarten-Guide");
  });

  it("a gated AI pass lands the templated draft and offers Try again", async () => {
    h.license = { isPaidLicense: true, isLicensed: true, plan: "byok" };
    apiFetchMock.mockImplementation(async (opts: { path?: string }) => {
      if (opts?.path === DRAFT_PATH) {
        return { success: true, draft: deterministicDraft({ aiReason: "plan_gated" }) };
      }
      return [];
    });
    renderWizard();

    fireEvent.click(await screen.findByRole("button", { name: /Magic suggest/ }));
    expect(await screen.findByText("Couldn't refine this campaign — try again")).toBeTruthy();
    expect(nameField().value).toBe("Balkongarten auf kleinem Raum");
    expect(screen.getByText("Drafted from your site")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(calls().length).toBe(2));
    expect(calls()[1].data).toEqual({ stage: "ai", language: "de" });
  });

  it("a failed call keeps the drafted fields and the inline error", async () => {
    renderWizard();
    fireEvent.click(await screen.findByRole("button", { name: /Magic suggest/ }));
    expect(await screen.findByText("Drafted for you")).toBeTruthy();

    apiFetchMock.mockImplementation(async (opts: { path?: string }) => {
      if (opts?.path === DRAFT_PATH) throw { code: "draft_failed", message: "Could not draft the campaign." };
      return [];
    });
    fireEvent.click(magicSuggest());

    expect(await screen.findByText("Couldn't refine this campaign — try again")).toBeTruthy();
    expect(nameField().value).toBe("Balkongarten-Guide");
  });

  it("the AI call limit refusal shows its own message and keeps the fields", async () => {
    apiFetchMock.mockImplementation(async (opts: { path?: string }) => {
      if (opts?.path === DRAFT_PATH) {
        // What the plugin's draft-setup route forwards for the cloud's 429.
        throw {
          code: "draft_failed",
          message: "Too many AI requests.",
          data: { status: 429, code: "ai_rate_limited" },
        };
      }
      return [];
    });
    renderWizard();

    fireEvent.change(await screen.findByLabelText("Campaign Name"), {
      target: { value: "Hand-written campaign" },
    });
    fireEvent.click(magicSuggest());
    fireEvent.click(await screen.findByRole("button", { name: "Replace" }));

    expect(
      await screen.findByText(
        "Too many AI requests from this workspace. Try again in a minute, or tomorrow if you have made a lot of requests today.",
      ),
    ).toBeTruthy();
    expect(nameField().value).toBe("Hand-written campaign");
  });

  it("asks before Magic suggest replaces fields the user edited", async () => {
    h.license = { isPaidLicense: true, isLicensed: true, plan: "byok" };
    renderWizard();

    fireEvent.change(await screen.findByLabelText("Campaign Name"), {
      target: { value: "My own name" },
    });
    fireEvent.click(magicSuggest());
    expect(await screen.findByText("Replace your edits?")).toBeTruthy();
    expect(calls()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(nameField().value).toBe("Balkongarten-Guide"));
    expect(calls().length).toBe(1);
  });

  it("keeps the user's edits when the Magic suggest confirmation is declined", async () => {
    renderWizard();

    fireEvent.change(await screen.findByLabelText("Campaign Name"), {
      target: { value: "My own name" },
    });
    fireEvent.click(magicSuggest());
    fireEvent.click(await screen.findByRole("button", { name: "Keep mine" }));

    expect(calls()).toEqual([]);
    expect(nameField().value).toBe("My own name");
  });

  it("a language pick before any draft makes no call", async () => {
    renderWizard();
    await screen.findByRole("button", { name: /Magic suggest/ });

    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click((await screen.findAllByRole("option", { name: /^English/ }))[0]);

    await wait(50);
    expect(calls()).toEqual([]);
    expect(screen.queryByText(/Redraft the campaign in/)).toBeNull();
  });

  it("a language pick after a draft asks to redraft, then drafts in that language", async () => {
    renderWizard();
    fireEvent.click(await screen.findByRole("button", { name: /Magic suggest/ }));
    expect(await screen.findByText("Drafted for you")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click((await screen.findAllByRole("option", { name: /^English/ }))[0]);
    expect(await screen.findByText("Redraft the campaign in English?")).toBeTruthy();
    expect(calls().length).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Redraft" }));
    await waitFor(() => expect(calls().length).toBe(2));
    expect(calls()[1].data).toEqual({ stage: "ai", language: "en" });
  });

  it("names the overlapping campaign after a draft and dismisses the notice", async () => {
    apiFetchMock.mockImplementation(async (opts: { path?: string }) => {
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
          }),
        };
      }
      return [];
    });
    renderWizard();
    fireEvent.click(await screen.findByRole("button", { name: /Magic suggest/ }));

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
    fireEvent.click(await screen.findByRole("button", { name: /Magic suggest/ }));

    await waitFor(() => expect(calls().length).toBe(1));
    // The Austrian variant is its own picker option, not collapsed to `de`.
    expect(calls()[0].data).toEqual({ stage: "ai", language: "de_AT" });
  });

  it("keeps an unsupported site language as its WordPress locale", async () => {
    // Persian has no search data, so it is not a picker option — but the
    // campaign still writes in it rather than silently falling back to
    // English (spec §3.3, `ai_only`).
    h.siteLanguage = "fa-IR";
    renderWizard();
    fireEvent.click(await screen.findByRole("button", { name: /Magic suggest/ }));

    await waitFor(() => expect(calls().length).toBe(1));
    expect(calls()[0].data).toEqual({ stage: "ai", language: "fa_IR" });
  });

  it("renders the rationale codes as sentences after a draft, never as codes", async () => {
    renderWizard();
    fireEvent.click(await screen.findByRole("button", { name: /Magic suggest/ }));

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

describe("New campaign — provider advice under the inline provider block (2026-10-02)", () => {
  // Without explicit plugin defaults the Setup step shows the provider block
  // inline; picking Gemini there shows the same advice as the campaign form,
  // with no hide control (specs/byok-ai-guidance.md §5, setup wizard).
  const inlineByok = (overrides: Record<string, unknown> = {}) => {
    h.license = { isPaidLicense: true, isLicensed: true, plan: "byok" };
    h.textProviders = ["openai", "gemini"];
    h.providers = {
      availableProviders: ["openai", "gemini"],
      availableImageProviders: ["openai", "gemini"],
      hasExplicitDefaults: false,
      hasMultipleProviders: true,
      isFullyConfigured: false,
      ...overrides,
    };
  };
  const LEAD = "Gemini isn’t recommended for writing.";

  it("shows no advice on the best provider; picking Gemini shows it with Switch and no hide", async () => {
    inlineByok();
    renderWizard();

    const gemini = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-text-provider="gemini"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(screen.queryByText(LEAD)).toBeNull();

    fireEvent.click(gemini);
    expect(await screen.findAllByText(LEAD)).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: "Switch to OpenAI" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect Claude for the best results" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /hide/i })).toBeNull();
  });

  it("Switch moves back to OpenAI and Undo restores Gemini", async () => {
    inlineByok({ defaultTextProvider: "gemini" });
    renderWizard();

    fireEvent.click(await screen.findByRole("button", { name: "Switch to OpenAI" }));
    const undo = await screen.findByRole("button", { name: /Undo/ });
    expect(
      document.querySelector('[data-text-provider="openai"]')!.className,
    ).toContain("ring-2");

    fireEvent.click(undo);
    await waitFor(() =>
      expect(document.querySelector('[data-text-provider="gemini"]')!.className).toContain("ring-2"),
    );
    expect(document.activeElement).toBe(document.querySelector('[data-text-provider="gemini"]'));
  });

  it("no advice for a Gemini default with no key behind it", async () => {
    inlineByok({ defaultTextProvider: "gemini", availableProviders: ["openai"] });
    h.textProviders = ["openai"];
    renderWizard();

    expect(await screen.findByText("Text Provider")).toBeTruthy();
    expect(screen.queryByText(LEAD)).toBeNull();
  });
});
