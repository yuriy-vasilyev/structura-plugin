/**
 * The positioning read and save hooks behind the Site → Info card.
 *
 * 2026-11-13 (specs/site-reading.md §11, wp-admin positioning round two):
 * the read now carries the site's stored pages beside the positioning, and
 * the card lists them before any draft. The save answers with the
 * positioning alone, so writing that answer over the cached read dropped the
 * list on every Save. Real hooks on a real TanStack cache; only `apiFetch`
 * (the network edge) is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@wordpress/api-fetch", () => ({ default: apiFetchMock }));

import { useSaveWizardPositioningMutation, useWizardPositioningQuery } from "../api/useWizardSeo";

const PAGES = [
  { url: "https://knives.test", label: "knives.test", role: "home" },
  { url: "https://knives.test/sharpening", label: "Sharpening", role: "service" },
];
const LOADED = {
  what: "Hand-forged kitchen knives.",
  who: "Home cooks.",
  problem: "Dull blades.",
  source: "ai_draft",
  capturedAt: "2026-11-01T00:00:00.000Z",
};

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("useSaveWizardPositioningMutation", () => {
  it("keeps the stored pages of the read when it writes the saved positioning", async () => {
    const saved = {
      ...LOADED,
      who: "Home cooks and chefs.",
      source: "edited",
      capturedAt: "2026-11-13T00:00:00.000Z",
    };
    apiFetchMock.mockImplementation(async ({ path }: { path: string }) =>
      path === "/structura/v1/wizard/positioning/save"
        ? { positioning: saved }
        : { positioning: LOADED, pages: PAGES },
    );
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({ read: useWizardPositioningQuery(), save: useSaveWizardPositioningMutation() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.read.data?.pages).toEqual(PAGES));

    await act(async () => {
      await result.current.save.mutateAsync({
        what: saved.what,
        who: saved.who,
        problem: saved.problem,
        source: "edited",
      });
    });

    await waitFor(() => expect(result.current.read.data?.positioning).toEqual(saved));
    expect(result.current.read.data).toEqual({ positioning: saved, pages: PAGES });
  });
});
