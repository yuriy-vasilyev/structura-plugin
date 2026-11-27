/**
 * GeneratePostPage — managed plans pick no text provider and send no model
 * (2026-10-01, specs/managed-ai-lineup.md §3.3).
 *
 * Cloud writes with one AI lineup chosen by Structura. The page
 * hides the text provider picker but keeps the text provider on the form:
 * the plugin's `/post/generate` refuses a request without one and the cloud
 * keeps it for utility calls. The concrete model is never seeded or sent on a
 * managed plan; the cloud resolves it (the pre-2026-10-01 cloud from plan +
 * provider, the current one from the managed lineup). The image provider
 * picker stays on every plan.
 *
 * Only the network edge (`@wordpress/api-fetch`) and the settings / persona
 * data hooks are mocked; the page, its seed effect, ProviderToggle and the
 * REAL mutation + flattenCampaign run for real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

vi.mock("@wordpress/i18n", () => ({
  __: (t: string) => t,
  // The provider advice and "Recommended" labels use `_x` (context "ai advice").
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

// Plan state, swapped per test: managed (no keys, all providers run by
// Structura) or BYOK (one connected OpenAI key).
const planMock = vi.hoisted(() => ({ managed: true, byokGemini: false, byokNoKeys: false, noImageProvider: false }));

vi.mock("@/features/settings", () => ({
  useLicense: () => ({
    isPaidLicense: true,
    isLicensed: true,
    plan: planMock.managed ? "cloud" : "byok",
  }),
  usePublicSiteProfile: () => ({ data: { language: "en-US" }, isLoading: false }),
  useAiConnections: () => {
    const active =
      planMock.managed || planMock.byokNoKeys
        ? []
        : planMock.byokGemini
          ? ["gemini", "openai"]
          : ["openai"];
    return {
      activeProviders: active,
      textProviders: active,
      imageProviders: active,
      isLoading: false,
      isFetching: false,
    };
  },
  useDefaultProviders: () => ({
    // The real hook falls back to "gemini" when no key is connected.
    defaultTextProvider:
      planMock.managed || planMock.byokGemini || planMock.byokNoKeys ? "gemini" : "openai",
    defaultImageProvider: planMock.managed ? "gemini" : "openai",
    availableProviders: planMock.managed
      ? ["gemini", "openai", "anthropic"]
      : planMock.byokGemini
        ? ["gemini", "openai"]
        : ["openai"],
    availableImageProviders: planMock.managed ? ["gemini", "openai"] : ["openai"],
    hasExplicitDefaults: !planMock.managed,
    hasExplicitTextDefault: !planMock.managed,
    hasExplicitImageDefault: !planMock.managed,
    hasMultipleProviders: planMock.managed,
    isAutoResolved: false,
    isFullyConfigured: true,
    isCloud: planMock.managed,
    noImageProvider: planMock.noImageProvider,
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
  useMagicSuggest: () => ({ suggest: vi.fn(), isSuggesting: false }),
}));

// Truthy settings so the provider seed effect runs.
vi.mock("@/features/ai-engine", () => ({
  useAiSettingsQuery: () => ({ data: {} }),
}));

vi.mock("@/features/settings/api/useVisualPresets", () => ({
  useVisualPresetsQuery: () => ({
    data: { boundPresetId: "preset-1" },
    isLoading: false,
  }),
}));

import GeneratePostPage from "../routes/GeneratePostPage";

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={["/generate"]}>
        <Routes>
          <Route path="/generate" element={<GeneratePostPage />} />
          <Route path="*" element={<div>elsewhere</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

/** Fill a valid objective, submit, and return the `/post/generate` body. */
const submitAndReadWire = async (): Promise<Record<string, unknown>> => {
  fireEvent.change(screen.getByPlaceholderText(/Write an in-depth guide/), {
    target: { value: "How to choose the right grind size for pour-over coffee." },
  });
  fireEvent.click(screen.getByRole("button", { name: /Generate Now/ }));

  let data: Record<string, unknown> = {};
  await waitFor(() => {
    const genCall = apiFetchMock.mock.calls.find(
      (c) => (c[0] as { path?: string }).path === "/structura/v1/post/generate"
    );
    expect(genCall).toBeDefined();
    data = (genCall?.[0] as { data?: Record<string, unknown> }).data ?? {};
  });
  return data;
};

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (opts: { path?: string }) => {
    if (opts.path === "/structura/v1/post/generate") {
      return { success: true, run_id: "run-9" };
    }
    return {};
  });
  planMock.managed = true;
  planMock.byokGemini = false;
  planMock.byokNoKeys = false;
  planMock.noImageProvider = false;
});

describe("GeneratePostPage — managed plan (2026-10-01)", () => {
  // Flipped 2026-10-06: the image provider picker goes too (Structura binds
  // one image model on managed plans). The seeded image provider still
  // travels hidden, so the image toggles keep working on every cloud.
  it("hides the text and the image provider pickers", () => {
    renderPage();

    expect(screen.queryByText("Text Provider")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Claude|Anthropic/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Image Provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Image Model")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(Gemini|OpenAI)$/i })).not.toBeInTheDocument();
  });

  it("sends the hidden text and image providers with no model or tier", async () => {
    renderPage();
    const data = await submitAndReadWire();

    // The plugin's /post/generate requires a text provider.
    expect(data.text_provider).toBe("gemini");
    expect(data.image_provider).toBe("gemini");
    for (const key of ["text_model", "image_model", "text_tier", "image_tier"]) {
      expect(data).not.toHaveProperty(key);
    }
  });
});

describe("GeneratePostPage — BYOK plan", () => {
  // Owner review 2026-10-06: one connected provider leaves nothing to
  // choose, so the provider block is hidden. Since 2026-11-25 the request
  // carries the provider and no model: the cloud runs its Standard model.
  it("hides the block for one provider and sends the provider with no model or tier", async () => {
    planMock.managed = false;
    renderPage();

    expect(screen.queryByText("Text Provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Text Model")).not.toBeInTheDocument();

    const data = await submitAndReadWire();
    expect(data.text_provider).toBe("openai");
    expect(data).not.toHaveProperty("text_model");
    expect(data).not.toHaveProperty("text_tier");
  });
});

// 2026-11-27: an own-key site with no OpenAI or Gemini key draws no images.
// The image switches stayed live there and the image step failed per post.
describe("GeneratePostPage — a site with no image provider", () => {
  it("warns, shows the image switches off and disabled, and asks for a text-only post", async () => {
    planMock.managed = false;
    planMock.noImageProvider = true;
    renderPage();

    expect(screen.getByText("No images on this site yet")).toBeInTheDocument();
    for (const name of ["Featured image", "Body images"]) {
      const toggle = screen.getByRole("switch", { name });
      expect(toggle).toBeDisabled();
      expect(toggle).not.toBeChecked();
    }
    const data = await submitAndReadWire();
    expect(data.featured_image).toBe(false);
    expect(data.body_images).toBe(false);
  });

  it("with an image provider: no warning and live switches", () => {
    planMock.managed = false;
    renderPage();
    expect(screen.queryByText("No images on this site yet")).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Featured image" })).toBeEnabled();
  });
});

describe("GeneratePostPage — provider advice (2026-10-02)", () => {
  // specs/byok-ai-guidance.md §5: the same advice as the campaign form, with
  // no hide control on this page; Switch sets the provider (no tier since 2026-11-25).
  it("managed plans see no advice and no Recommended label", () => {
    renderPage();
    expect(screen.queryByText("Gemini isn’t recommended for writing.")).toBeNull();
    expect(screen.queryByText("Recommended")).toBeNull();
  });

  it("BYOK writing with Gemini: advice without ×; Switch sends OpenAI with no model or tier", async () => {
    planMock.managed = false;
    planMock.byokGemini = true;
    renderPage();

    expect(await screen.findByText("Gemini isn’t recommended for writing.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hide this advice for this campaign" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Switch to OpenAI" }));
    expect(screen.getByText("Switched to OpenAI.")).toBeInTheDocument();

    const data = await submitAndReadWire();
    expect(data.text_provider).toBe("openai");
    expect(data).not.toHaveProperty("text_tier");
    expect(data).not.toHaveProperty("text_model");
  });
});

describe("GeneratePostPage — own-key plan with no key connected (2026-10-02)", () => {
  // Found on the BYOK rig: the page advised against Gemini and offered a
  // Gemini model although no key was connected. The connect banner is now
  // the only AI message.
  it("shows the connect banner and no provider row, model picker or advice", async () => {
    planMock.managed = false;
    planMock.byokNoKeys = true;
    renderPage();

    expect(
      await screen.findByText("Connect an AI provider in the AI Engine settings first.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Text Provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Text Model")).not.toBeInTheDocument();
    expect(screen.queryByText("Image Provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Gemini isn’t recommended for writing.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Gemini 3/)).not.toBeInTheDocument();
  });
});
