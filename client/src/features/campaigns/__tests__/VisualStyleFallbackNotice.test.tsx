/**
 * VisualStyleFallbackNotice — non-blocking "no visual style" nudge.
 *
 * Replaces the old hard block (2026-07-09): image generation no longer
 * requires a bound preset (the cloud falls back to a generic house
 * style), so this only makes the user aware. It shows when images are
 * enabled AND no visual preset is bound, and stays out of the way
 * otherwise.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({ __: (t: string) => t }));
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }));

const presetsMock = vi.hoisted(() => ({
  current: {
    data: { boundPresetId: null as string | null },
    isLoading: false,
  },
}));
vi.mock("@/features/settings/api/useVisualPresets", () => ({
  useVisualPresetsQuery: () => presetsMock.current,
}));

vi.mock("@structura/ui", () => {
  const pass = ({ children }: { children?: unknown }) => <div>{children as never}</div>;
  const Alert: any = ({ children }: { children?: unknown }) => (
    <div role="alert">{children as never}</div>
  );
  Alert.Title = pass;
  Alert.Description = pass;
  Alert.Action = pass;
  return {
    Alert,
    Button: ({ children }: { children?: unknown }) => <button>{children as never}</button>,
  };
});

import { VisualStyleFallbackNotice } from "../components/VisualStyleFallbackNotice";

beforeEach(() => {
  presetsMock.current = { data: { boundPresetId: null }, isLoading: false };
});

describe("VisualStyleFallbackNotice", () => {
  it("shows the nudge when images are enabled and no visual style is bound", () => {
    presetsMock.current = { data: { boundPresetId: null }, isLoading: false };
    render(<VisualStyleFallbackNotice imagesEnabled />);
    expect(screen.getByText("Images will use a generic style")).toBeInTheDocument();
    expect(screen.getByText("Set visual style")).toBeInTheDocument();
  });

  it("renders nothing when images are disabled", () => {
    const { container } = render(<VisualStyleFallbackNotice imagesEnabled={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when a visual style IS bound", () => {
    presetsMock.current = { data: { boundPresetId: "preset-1" }, isLoading: false };
    const { container } = render(<VisualStyleFallbackNotice imagesEnabled />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while the binding is loading", () => {
    presetsMock.current = { data: { boundPresetId: null }, isLoading: true };
    const { container } = render(<VisualStyleFallbackNotice imagesEnabled />);
    expect(container).toBeEmptyDOMElement();
  });
});
