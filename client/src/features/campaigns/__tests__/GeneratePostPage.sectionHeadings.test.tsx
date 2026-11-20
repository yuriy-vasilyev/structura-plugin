/**
 * GeneratePostPage — section headings in wp-admin (2026-11-20).
 *
 * wp-admin's `common.css` sets `h1`-`h6 { font-weight: 600 }` and
 * `h2, h3 { color: #1d2327; font-size: 1.3em }` outside any cascade layer, so
 * it beats the layered Tailwind utilities: the section headings rendered
 * near-black at 17px, 1.12:1 on the dark card. Only `!` utilities win. jsdom
 * applies no stylesheets, so this pins the classes the way the Dialog title
 * fix did (packages/ui ConfirmDialog test); the contrast itself was measured in
 * Chromium with wp-admin's stylesheet loaded.
 *
 * The headings use the design guide's overline label (10px, black, widest
 * tracking, uppercase) in neutral-500 / dark neutral-400: 4.83:1 on the white
 * card and 6.99:1 on the dark one. The guide's neutral-400 / dark neutral-500
 * is under AA (2.54:1, 3.67:1).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

vi.mock("@wordpress/i18n", () => ({
  __: (t: string) => t,
  _x: (t: string) => t,
  _n: (single: string, plural: string, n: number) => (n === 1 ? single : plural),
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

vi.mock("@wordpress/api-fetch", () => ({ default: vi.fn(async () => ({})) }));

vi.mock("@/features/settings", () => ({
  useLicense: () => ({ isPaidLicense: true, isLicensed: true, plan: "cloud" }),
  usePublicSiteProfile: () => ({ data: { language: "en-US" }, isLoading: false }),
  useAiConnections: () => ({
    activeProviders: [],
    textProviders: [],
    imageProviders: [],
    incompleteProviders: [],
    isProviderIncomplete: () => false,
    isLoading: false,
    isFetching: false,
  }),
  useDefaultProviders: () => ({
    defaultTextProvider: "gemini",
    defaultImageProvider: "gemini",
    availableProviders: ["gemini", "openai", "anthropic"],
    availableImageProviders: ["gemini", "openai"],
    incompleteProviders: [],
    isProviderIncomplete: () => false,
    hasExplicitDefaults: false,
    hasExplicitTextDefault: false,
    hasExplicitImageDefault: false,
    hasMultipleProviders: true,
    isAutoResolved: false,
    isFullyConfigured: true,
    isCloud: true,
  }),
}));

vi.mock("@/features/personas", () => {
  const personas = () => ({ data: [{ id: "p1", name: "House voice" }], isLoading: false });
  return { usePersonasQuery: personas, useSitePersonasQuery: personas };
});

vi.mock("@/hooks/useMagicSuggest", () => ({
  useMagicSuggest: () => ({ suggest: vi.fn(), isSuggesting: false }),
}));

vi.mock("@/features/ai-engine", () => ({ useAiSettingsQuery: () => ({ data: {} }) }));

vi.mock("@/features/settings/api/useVisualPresets", () => ({
  useVisualPresetsQuery: () => ({ data: { boundPresetId: "preset-1" }, isLoading: false }),
}));

import GeneratePostPage from "../routes/GeneratePostPage";

describe("GeneratePostPage — section headings in wp-admin", () => {
  it("carry the overline label with important color, size and weight in both modes", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <GeneratePostPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    for (const title of ["What should we write about?", "AI & Persona", "Content Options", "Content Features"]) {
      const heading = screen.getByRole("heading", { level: 3, name: title });
      expect(heading).toHaveClass(
        "text-[10px]!",
        "font-black!",
        "tracking-widest",
        "uppercase",
        "text-neutral-500!",
        "dark:text-neutral-400!"
      );
      expect(heading).not.toHaveClass("text-neutral-400", "dark:text-neutral-500");
    }
  });

  // "Research material" is the title of a `@structura/ui` card, not a
  // `Section`: the design guide's card-title token (`heading`: 20px bold,
  // snug, tight), set from this page on the card's `h3` with `!`.
  it("give the Research material card title the card-title token with important color, size and weight", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <GeneratePostPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const heading = screen.getByRole("heading", { level: 3, name: "Research material" });
    let card: HTMLElement | null = heading.parentElement;
    while (card && !card.className.includes("[&_h3]:")) card = card.parentElement;
    expect(card).not.toBeNull();
    expect(card).toHaveClass(
      "[&_h3]:text-xl!",
      "[&_h3]:leading-snug",
      "[&_h3]:font-bold!",
      "[&_h3]:text-neutral-900!",
      "dark:[&_h3]:text-white!"
    );
  });
});
