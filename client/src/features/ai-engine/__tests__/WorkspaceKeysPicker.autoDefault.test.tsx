/**
 * Binding a workspace key that leaves the site with one provider fills only
 * the image default (2026-10-02). It no longer writes a text default: an
 * absent one resolves to the best connected provider, and a written one
 * read as the customer's choice (specs/byok-ai-guidance.md §9).
 *
 * The real picker runs; the workspace-key queries, connections and the
 * settings write are the mocked edges.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({ __: (t: string) => t }));

const h = vi.hoisted(() => ({ connected: [] as string[], updateMutate: vi.fn() }));

vi.mock("../api/useWorkspaceKeys", () => ({
  useWorkspaceKeysQuery: () => ({
    isLoading: false,
    data: {
      credentials: [
        { credId: "c1", provider: "openai", label: "Other site", boundActivationCount: 1, boundToCallingActivation: false },
      ],
    },
  }),
  useBindWorkspaceKey: () => ({
    isPending: false,
    variables: undefined,
    mutate: (_v: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.(),
  }),
}));
vi.mock("../api/useUpdateAiSettings", () => ({
  useUpdateAiSettings: () => ({ mutate: h.updateMutate }),
}));
vi.mock("@/features/settings/api/useAiConnections", () => ({
  useAiConnections: () => ({ activeProviders: h.connected, imageProviders: h.connected }),
}));
vi.mock("@/features/settings/api/useDefaultProviders", () => ({
  useDefaultProviders: () => ({ hasExplicitTextDefault: false, hasExplicitImageDefault: false }),
}));

import { WorkspaceKeysPicker } from "../components/WorkspaceKeysPicker";

describe("<WorkspaceKeysPicker> auto default after binding the only key", () => {
  it("fills the image default and writes no text default", () => {
    const { rerender } = render(<WorkspaceKeysPicker />);
    fireEvent.click(screen.getByRole("button", { name: /Use here/ }));

    // The refetched settings now show the bound provider as connected.
    h.connected = ["openai"];
    rerender(<WorkspaceKeysPicker />);

    expect(h.updateMutate).toHaveBeenCalledWith({ ai: { defaults: { image_provider: "openai" } } });
  });
});
