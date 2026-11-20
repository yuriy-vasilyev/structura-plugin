/**
 * Campaign editors — the References list rule (specs/study-lookup.md §12.3).
 *
 * The new-campaign and edit pages render SEO rules from the plugin registry
 * (`/structura/v1/settings/seo-rules`). The References list carries
 * `placement: "content"`, so it sits with the always-visible content
 * settings, not in SEO Directives (owner, 2026-11-20); SEO Directives neither
 * lists nor counts it. It is held back with a hint naming where authority
 * links are while they are off, and turning authority links off turns it
 * off. A campaign saved before the rule existed has no key: it reads as off
 * and a save leaves it absent.
 *
 * Only the network edge (`@wordpress/api-fetch`) and the settings / persona
 * data hooks are mocked; the pages, the form context and the REAL mutation +
 * flattenCampaign run.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { ToastProvider } from "@structura/ui";
import type { Campaign } from "../types";

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
  license: { isPaidLicense: true, isLicensed: true, plan: "byok" } as Record<string, unknown>,
}));

/** The rules as `SEO_Rules_Registry::get_all()` serves them, in its order. */
const REGISTRY = vi.hoisted(() => ({
  include_faq_section: { label: "Include FAQ section", description: "FAQ.", plan: "byok" },
  outbound_link_authority: { label: "Outbound link authority", description: "Links.", plan: "byok" },
  references_list: { label: "References list", description: "Studies.", plan: "byok", placement: "content" },
}));

// The campaign query reads the license from its own module path.
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({ ...h.license, hasUsableLicense: true, hasWorkspace: true }),
}));

vi.mock("@/features/settings", () => ({
  useLicense: () => ({ ...h.license, hasUsableLicense: true, hasWorkspace: true }),
  usePublicSiteProfile: () => ({ data: { language: "en-US" }, isLoading: false }),
  useSeoRules: () => ({ rules: REGISTRY, isLoading: false }),
  useAiConnections: () => ({ textProviders: ["openai"] }),
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
  const personas = () => ({ data: [{ id: "p1", name: "House voice" }], isLoading: false });
  return { usePersonasQuery: personas, useSitePersonasQuery: personas };
});

vi.mock("@/features/ai-engine", () => ({ useAiSettingsQuery: () => ({ data: {} }) }));
vi.mock("@/features/ai-engine/api/useAvailableModelsQuery", () => ({
  useAvailableModelsQuery: () => ({ data: undefined }),
}));
vi.mock("@/features/settings/api/useVisualPresets", () => ({
  useVisualPresetsQuery: () => ({ data: { boundPresetId: "preset-1" }, isLoading: false }),
}));

import CreateCampaignPage from "../routes/CreateCampaignPage";
import EditCampaignPage from "../routes/EditCampaignPage";
import { useCampaignDraftStore } from "../context/draftStore";

const HINT = "Turn on Outbound link authority under Advanced Settings > SEO Directives to use this.";

/** A campaign saved before the References list existed: its rules lack the key. */
const STORED_RULES = {
  include_faq_section: true,
  include_action_steps: true,
  include_statistics: true,
  internal_link_optimization: true,
  outbound_link_authority: true,
  eeat_signals: true,
  entity_coverage: true,
};

const storedCampaign = (seoRules: Record<string, boolean>): Campaign => ({
  id: 42,
  status: "active",
  identity: {
    name: "Sleep on shifts",
    objective: "Help shift workers sleep better with practical, research-backed routines.",
    campaignMode: "traffic_magnet",
  },
  intelligence: {
    textProvider: "openai",
    imageProvider: "openai",
    textModel: "",
    imageModel: "",
    personaId: "p1",
    language: "en",
    postLength: 1200,
    replaceLongDashes: true,
    disableEmojis: true,
    seoRules: seoRules as Campaign["intelligence"]["seoRules"],
  },
  structure: {
    enabledBlocks: ["core/paragraph", "core/heading"],
    featuredImage: false,
    bodyImages: false,
    disclosure: { enabled: false, text: "" },
    postStatus: "draft",
  },
  taxonomy: {
    categories: { mode: "auto", list: [] },
    tags: { mode: "auto", list: [] },
  },
  schedule: {
    cron: "0 9 * * 1",
    endCondition: { type: "infinite", value: 0 },
    pregenerationEnabled: false,
  },
  stats: { postsPublished: 0, nextRun: "2026-11-23T09:00:00.000Z" },
});

let stored: Campaign;

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/campaigns/new" element={<CreateCampaignPage />} />
            <Route path="/campaigns/:id/edit" element={<EditCampaignPage />} />
            <Route path="*" element={<div>elsewhere</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );

/** Open Advanced Settings, then its SEO Directives group. */
const openSeoDirectives = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /Advanced Settings/ }));
  fireEvent.click(screen.getByRole("button", { name: /SEO Directives/ }));
};

const toggle = (name: string) => screen.getByRole("switch", { name });

const savedRules = async (): Promise<Record<string, unknown>> => {
  let rules: Record<string, unknown> = {};
  await waitFor(() => {
    const call = apiFetchMock.mock.calls.find(
      (c) => (c[0] as { method?: string }).method === "PUT"
    );
    expect(call).toBeDefined();
    const data = (call?.[0] as { data?: { seo_optimization_rules?: Record<string, unknown> } }).data;
    rules = data?.seo_optimization_rules ?? {};
  });
  return rules;
};

beforeEach(() => {
  h.license = { isPaidLicense: true, isLicensed: true, plan: "byok" };
  stored = storedCampaign(STORED_RULES);
  useCampaignDraftStore.getState().discardDraft();
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (opts: { path?: string; method?: string }) => {
    if (opts.path === "/structura/v1/scheduler/campaigns") return [stored];
    if (opts.method === "PUT") return { success: true };
    return [];
  });
});

describe("Edit campaign — References list", () => {
  it("sits with the always-visible content settings; SEO Directives neither lists nor counts it", async () => {
    stored = storedCampaign({ ...STORED_RULES, references_list: true });
    renderAt("/campaigns/42/edit");

    // Shown before Advanced Settings is opened, with its description.
    expect(await screen.findByRole("switch", { name: "References list" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByText("Studies.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /SEO Directives/ })).toBeNull();

    await openSeoDirectives();
    expect(screen.getAllByRole("switch", { name: "References list" })).toHaveLength(1);
    // FAQ and authority links are on; the References list is not counted here.
    expect(screen.getByRole("button", { name: "SEO Directives 2" })).toBeInTheDocument();
  });

  it("reads a campaign saved before the rule as off, and a save leaves the key absent", async () => {
    renderAt("/campaigns/42/edit");
    await screen.findByRole("switch", { name: "References list" });

    expect(toggle("References list")).toHaveAttribute("aria-checked", "false");
    expect(toggle("References list")).toBeEnabled();
    expect(screen.queryByText(HINT)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
    expect(await savedRules()).toEqual(STORED_RULES);
  });

  it("is held back with a hint while the campaign's authority links are off", async () => {
    stored = storedCampaign({ ...STORED_RULES, outbound_link_authority: false });
    renderAt("/campaigns/42/edit");
    await openSeoDirectives();

    expect(toggle("References list")).toBeDisabled();
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it("turning authority links off turns it off and saves it off", async () => {
    stored = storedCampaign({ ...STORED_RULES, references_list: true });
    renderAt("/campaigns/42/edit");
    await openSeoDirectives();

    expect(toggle("References list")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle("Outbound link authority"));

    expect(toggle("References list")).toHaveAttribute("aria-checked", "false");
    expect(toggle("References list")).toBeDisabled();
    expect(screen.getByText(HINT)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
    const rules = await savedRules();
    expect(rules.outbound_link_authority).toBe(false);
    expect(rules.references_list).toBe(false);
  });

  it("saves it on once turned on", async () => {
    renderAt("/campaigns/42/edit");
    await screen.findByRole("switch", { name: "References list" });

    fireEvent.click(toggle("References list"));
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));

    expect((await savedRules()).references_list).toBe(true);
  });

  it("shows the Pro lock and no authority hint on a free plan", async () => {
    h.license = { isPaidLicense: false, isLicensed: true, plan: "free" };
    stored = storedCampaign({ ...STORED_RULES, outbound_link_authority: false });
    renderAt("/campaigns/42/edit");
    await screen.findByRole("switch", { name: "References list" });

    expect(toggle("References list")).toBeDisabled();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.queryByText(HINT)).toBeNull();
  });
});

describe("New campaign — References list", () => {
  it("starts off with the content settings, and is held back with a hint once authority links are turned off", async () => {
    renderAt("/campaigns/new");
    await screen.findByRole("switch", { name: "References list" });
    expect(screen.queryByRole("button", { name: /SEO Directives/ })).toBeNull();
    await openSeoDirectives();
    expect(screen.getAllByRole("switch", { name: "References list" })).toHaveLength(1);

    expect(toggle("References list")).toHaveAttribute("aria-checked", "false");
    expect(toggle("References list")).toBeEnabled();

    fireEvent.click(toggle("References list"));
    expect(toggle("References list")).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle("Outbound link authority"));
    expect(toggle("References list")).toHaveAttribute("aria-checked", "false");
    expect(toggle("References list")).toBeDisabled();
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });
});
