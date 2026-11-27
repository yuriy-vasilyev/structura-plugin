/**
 * The warning on a site that can draw no images, and the check behind it
 * (`useNoImageProvider`). 2026-11-27: with only a Claude key connected the
 * image switches stayed live and the Visuals preview failed with "Try again
 * in a moment".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({ __: (t: string) => t }));
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }));

const state = vi.hoisted(() => ({
  imageProviders: [] as string[],
  isLoading: false,
  isFetching: false,
  plan: "byok",
}));
vi.mock("@/features/settings/api/useAiConnections", () => ({
  useAiConnections: () => ({
    textProviders: ["anthropic"],
    activeProviders: ["anthropic", ...state.imageProviders],
    imageProviders: state.imageProviders,
    isLoading: state.isLoading,
    isFetching: state.isFetching,
  }),
}));
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({ plan: state.plan, isLicensed: state.plan !== "none" }),
}));
vi.mock("@/features/ai-engine", () => ({ useAiSettingsQuery: () => ({ data: undefined }) }));
vi.mock("@structura/ui", () => {
  const pass = ({ children }: { children?: unknown }) => <div>{children as never}</div>;
  const Alert: any = ({ children }: { children?: unknown }) => <div role="status">{children as never}</div>;
  Alert.Title = pass;
  Alert.Description = pass;
  Alert.Action = pass;
  return { Alert, Button: ({ children }: { children?: unknown }) => <button>{children as never}</button> };
});

import { NoImageProviderNotice } from "../components/NoImageProviderNotice";
import { useDefaultProviders } from "@/features/settings/api/useDefaultProviders";

const TITLE = "No images on this site yet";

/** The warning as every screen shows it: only when the hook says so. */
const Probe = () => (useDefaultProviders().noImageProvider ? <NoImageProviderNotice /> : null);

beforeEach(() => {
  Object.assign(state, { imageProviders: [], isLoading: false, isFetching: false, plan: "byok" });
});

describe("no image provider on the site", () => {
  it.each(["byok", "free"])("%s with no OpenAI or Gemini key: warns and offers to connect one", (plan) => {
    state.plan = plan;
    render(<Probe />);
    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect a key" })).toBeInTheDocument();
  });

  it("says nothing once an image provider is connected", () => {
    state.imageProviders = ["openai"];
    render(<Probe />);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("says nothing on a managed plan, without a license, or while connections load", () => {
    for (const patch of [{ plan: "cloud" }, { plan: "none" }, { isLoading: true }, { isFetching: true }]) {
      Object.assign(state, { imageProviders: [], isLoading: false, isFetching: false, plan: "byok" }, patch);
      const { unmount } = render(<Probe />);
      expect(screen.queryByText(TITLE)).toBeNull();
      unmount();
    }
  });
});
