/**
 * GeneratePostPage — owner review of 2026-10-06 (anonymous site).
 *
 *   - The Writing approach selector is gone; the request still carries the
 *     default mode, so the prompt's strategic-priority block is unchanged.
 *   - No locked rows or upsells inside the form. One card above the
 *     actions says what a free account and a paid plan add, built from the
 *     plan gates the form itself uses.
 *   - The AI provider block shows only a choice the site can make: the
 *     provider when several are connected, the model only for a provider
 *     whose "Use recommended model" switch is off (a stored model, no
 *     stored tier).
 *
 * Only the network edge (`@wordpress/api-fetch`) and the settings / persona
 * data hooks are mocked; the page, ProviderToggle, the ai-engine helpers
 * and the REAL mutation + flattenCampaign run for real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { getRegistryModelId } from "@structura/model-catalog";

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

type ProviderSettings = Record<
  string,
  { connected: boolean; capabilities: Array<"text" | "image">; text_model: string; image_model: string; text_tier?: string; image_tier?: string }
>;

const state = vi.hoisted(() => ({
  plan: "none" as "none" | "free" | "byok",
  providers: {} as ProviderSettings,
  suggestion: null as Record<string, unknown> | null,
}));

const connected = () => Object.keys(state.providers).filter((p) => state.providers[p].connected);
const withCapability = (cap: "text" | "image") =>
  connected().filter((p) => state.providers[p].capabilities.includes(cap));

vi.mock("@/features/settings", () => ({
  useLicense: () => ({
    isPaidLicense: state.plan === "byok",
    isLicensed: state.plan !== "none",
    plan: state.plan,
  }),
  usePublicSiteProfile: () => ({ data: { language: "en-US" }, isLoading: false }),
  useAiConnections: () => ({
    activeProviders: connected(),
    textProviders: withCapability("text"),
    imageProviders: withCapability("image"),
    incompleteProviders: [],
    isProviderIncomplete: () => false,
    isLoading: false,
    isFetching: false,
  }),
  useDefaultProviders: () => ({
    defaultTextProvider: withCapability("text")[0] ?? "gemini",
    defaultImageProvider: withCapability("image")[0] ?? "gemini",
    availableProviders: connected(),
    availableImageProviders: withCapability("image"),
    incompleteProviders: [],
    isProviderIncomplete: () => false,
    hasExplicitDefaults: true,
    hasExplicitTextDefault: true,
    hasExplicitImageDefault: true,
    hasMultipleProviders: connected().length > 1,
    isAutoResolved: false,
    isFullyConfigured: true,
    isCloud: false,
  }),
}));

vi.mock("@/features/personas", () => {
  const personas = () => ({
    data: [
      { id: "p1", name: "House voice" },
      { id: "p2", name: "Casual expert" },
    ],
    isLoading: false,
  });
  return { usePersonasQuery: personas, useSitePersonasQuery: personas };
});

vi.mock("@/hooks/useMagicSuggest", () => ({
  useMagicSuggest: () => ({
    suggest: vi.fn(async () => state.suggestion),
    isSuggesting: false,
  }),
}));

vi.mock("@/features/ai-engine", () => ({
  useAiSettingsQuery: () => ({ data: { providers: state.providers } }),
}));

vi.mock("@/features/settings/api/useVisualPresets", () => ({
  useVisualPresetsQuery: () => ({ data: { boundPresetId: "preset-1" }, isLoading: false }),
}));

import GeneratePostPage from "../routes/GeneratePostPage";

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/generate"]}>
        <Routes>
          <Route path="/generate" element={<GeneratePostPage />} />
          <Route path="*" element={<div>elsewhere</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

const submitAndReadWire = async (): Promise<Record<string, unknown>> => {
  fireEvent.change(screen.getByPlaceholderText(/Write an in-depth guide/), {
    target: { value: "How to choose the right grind size for pour-over coffee." },
  });
  fireEvent.click(screen.getByRole("button", { name: /Generate Now/ }));
  let data: Record<string, unknown> = {};
  await waitFor(() => {
    const call = apiFetchMock.mock.calls.find(
      (c) => (c[0] as { path?: string }).path === "/structura/v1/post/generate"
    );
    expect(call).toBeDefined();
    data = (call?.[0] as { data?: Record<string, unknown> }).data ?? {};
  });
  return data;
};

/** A connected provider that keeps the recommended model (the switch's default). */
const recommended = (caps: Array<"text" | "image">) => ({
  connected: true,
  capabilities: caps,
  text_model: "",
  image_model: "",
  text_tier: caps.includes("text") ? "mid" : "",
  image_tier: caps.includes("image") ? "mid" : "",
});

/** The provider button in the Text Provider row (Magic suggest has its own provider pill). */
const textProviderButton = (provider: string) =>
  document.querySelector<HTMLButtonElement>(`button[data-text-provider="${provider}"]`)!;

/** Elements with exactly this text that are not inside the plan card. */
const outsideCard = (text: string) => {
  const card = screen.queryByRole("region", { name: /More with/ });
  return screen.queryAllByText(text).filter((el) => !card?.contains(el));
};

const upsellCard = () => screen.getByRole("region", { name: /More with a free account|More with a paid plan/ });

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (opts: { path?: string }) =>
    opts.path === "/structura/v1/post/generate" ? { success: true, run_id: "run-9" } : {}
  );
  state.plan = "none";
  state.providers = { openai: recommended(["text", "image"]) };
  state.suggestion = null;
});

describe("Writing approach (owner review 2026-10-06)", () => {
  it("is not on the page", () => {
    renderPage();
    expect(screen.queryByText("Writing approach")).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Writing approach" })).toBeNull();
    expect(screen.queryByText("Traffic Magnet")).toBeNull();
  });

  it("sends the default mode, also after Magic suggest proposed another", async () => {
    state.suggestion = { strategy: "A focused guide to grind sizes for pour-over brewing.", campaign_mode: "authority" };
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Generate post strategy/ }));
    await screen.findByDisplayValue("A focused guide to grind sizes for pour-over brewing.");

    fireEvent.click(screen.getByRole("button", { name: /Generate Now/ }));
    await waitFor(() => {
      const call = apiFetchMock.mock.calls.find(
        (c) => (c[0] as { path?: string }).path === "/structura/v1/post/generate"
      );
      expect((call?.[0] as { data?: Record<string, unknown> })?.data?.campaign_mode).toBe("traffic_magnet");
    });
  });
});

describe("No locked rows or upsells in the form (owner review 2026-10-06)", () => {
  it("anonymous: no Pro or Free licence rows, no gated sections, no automate card", () => {
    renderPage();

    for (const gone of [
      "Research material",
      "SEO Targeting",
      "Pro / Cloud Feature",
      "Create account",
      "Featured image",
      "Body images",
      "Content Blocks",
      "Content Features",
      "Unlock full SEO optimisation with Pro",
      "Want to automate this?",
      "Free License",
      "Upgrade plan",
    ]) {
      expect(outsideCard(gone), gone).toEqual([]);
    }
    expect(screen.queryByText("Pro", { exact: true })).toBeNull();
    // What the plan can use stays.
    expect(screen.getByRole("switch", { name: "AI disclosure" })).toBeInTheDocument();
    expect(screen.getByText("Content Options")).toBeInTheDocument();
  });

  it("anonymous: one card above the actions lists what a free account and a paid plan add", () => {
    renderPage();
    const card = upsellCard();

    const free = within(card).getByRole("list", { name: "Free account" });
    expect(within(free).getByText("Featured images")).toBeInTheDocument();
    expect(within(free).getByText("Headings")).toBeInTheDocument();
    expect(within(free).getByText("A campaign that publishes every week")).toBeInTheDocument();

    const paid = within(card).getByRole("list", { name: "Paid plans" });
    for (const item of [
      "Body images",
      "Every content block: lists, tables, quotes and more",
      "SEO targeting with live search data",
      "Research material",
      "FAQ sections and action steps",
      "Internal and authority links",
      "E-E-A-T signals",
    ]) {
      expect(within(paid).getByText(item)).toBeInTheDocument();
    }

    const signup = within(card).getByRole("link", { name: /Get free account/ });
    expect(signup.getAttribute("href")).toContain("intent=general_upgrade");
    expect(within(card).getByRole("link", { name: /See plans/ }).getAttribute("href")).toContain(
      "/pricing?"
    );

    // Directly above Cancel / Generate Now.
    const actions = card.nextElementSibling as HTMLElement;
    expect(within(actions).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: /Generate Now/ })).toBeInTheDocument();
  });

  it("free: the plan's own switches stay, the card lists only what a paid plan adds", () => {
    state.plan = "free";
    renderPage();

    expect(screen.getByRole("switch", { name: "Featured image" })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Body images" })).toBeNull();
    expect(outsideCard("Body images")).toEqual([]);
    // Content Blocks keeps Paragraph (required) because Heading is a real switch.
    expect(screen.getByText("Content Blocks")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Heading" })).toBeInTheDocument();
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "List" })).toBeNull();
    expect(screen.queryByText("Content Features")).toBeNull();
    expect(screen.queryByText("SEO Targeting")).toBeNull();
    expect(screen.queryByText("Free License")).toBeNull();

    const card = upsellCard();
    expect(within(card).queryByRole("list", { name: "Free account" })).toBeNull();
    expect(within(card).getByRole("list", { name: "Paid plans" })).toBeInTheDocument();
    expect(within(card).queryByRole("link", { name: /Get free account/ })).toBeNull();
    expect(within(card).getByRole("link", { name: /See plans/ })).toBeInTheDocument();
  });

  it("paid: no card, every section interactive", () => {
    state.plan = "byok";
    renderPage();

    expect(screen.queryByRole("region", { name: /More with/ })).toBeNull();
    expect(screen.getByText("Click to upload")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Body images" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "FAQ section" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "List" })).toBeInTheDocument();
  });
});

describe("AI provider block (owner review 2026-10-06)", () => {
  const fieldsRowStays = () => {
    expect(screen.getByText("Persona")).toBeInTheDocument();
    expect(screen.getByText("Language")).toBeInTheDocument();
    expect(screen.getByText("Post Length")).toBeInTheDocument();
    expect(screen.getByText("Post Status")).toBeInTheDocument();
  };

  it("one provider on its recommended model: no provider or model block", () => {
    renderPage();
    expect(screen.queryByText("Text Provider")).toBeNull();
    expect(screen.queryByText("Text Model")).toBeNull();
    expect(screen.queryByText("Engine")).toBeNull();
    fieldsRowStays();
  });

  it("one provider with a picked model: only the model dropdown, opened on that model's tier", async () => {
    state.plan = "byok";
    state.providers = {
      openai: { ...recommended(["text", "image"]), text_tier: "", text_model: getRegistryModelId("openai", "text", "top")! },
    };
    renderPage();

    expect(screen.queryByText("Text Provider")).toBeNull();
    expect(screen.getByText("Text Model")).toBeInTheDocument();
    expect(screen.queryByText("Image Model")).toBeNull();
    fieldsRowStays();

    const data = await submitAndReadWire();
    expect(data.text_tier).toBe("top");
    expect(data.text_model).toBe(getRegistryModelId("openai", "text", "top"));
  });

  it("several providers on recommended models: the provider choice only", () => {
    state.providers = {
      anthropic: recommended(["text"]),
      openai: recommended(["text", "image"]),
    };
    renderPage();

    expect(screen.getByText("Text Provider")).toBeInTheDocument();
    expect(textProviderButton("anthropic")).toBeInTheDocument();
    expect(textProviderButton("openai")).toBeInTheDocument();
    expect(screen.queryByText("Text Model")).toBeNull();
    fieldsRowStays();
  });

  it("several providers: the model dropdown follows the selected provider's switch", async () => {
    state.plan = "free";
    state.providers = {
      anthropic: recommended(["text"]),
      openai: { ...recommended(["text", "image"]), text_tier: "", text_model: getRegistryModelId("openai", "text", "top")! },
    };
    renderPage();

    // Anthropic (first connected) keeps the recommended model.
    expect(screen.queryByText("Text Model")).toBeNull();
    // A single image provider on its recommended model: no image row.
    expect(screen.queryByText("Image Provider")).toBeNull();

    fireEvent.click(textProviderButton("openai"));
    expect(screen.getByText("Text Model")).toBeInTheDocument();

    const data = await submitAndReadWire();
    expect(data.text_provider).toBe("openai");
    expect(data.text_tier).toBe("top");
  });

  it("free: an image provider with a picked model shows the image model dropdown", () => {
    state.plan = "free";
    state.providers = {
      openai: { ...recommended(["text", "image"]), image_tier: "", image_model: getRegistryModelId("openai", "image", "top")! },
    };
    renderPage();

    expect(screen.queryByText("Image Provider")).toBeNull();
    expect(screen.queryByText("Text Model")).toBeNull();
    expect(screen.getByText("Image Model")).toBeInTheDocument();
  });
});
