/**
 * WizardStep1Identity — site-info confirmation step.
 *
 * Pins the logo-upload contract (restored 2026-06-03 after a brief removal):
 *   1. On a PAID tier the logo upload renders, prefilled from WordPress's
 *      custom logo, and `logoUrl` lands on the persisted draft. The logo is
 *      in-wizard generation context (feeds Step 4's "AI suggest style").
 *   2. On a FREE/none tier the logo upload is hidden (the suggest it feeds
 *      is paid), but the step is still valid and never blocks Continue.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({ __: (text: string) => text }));
vi.mock("@wordpress/api-fetch", () => ({ default: vi.fn() }));

const profileMock = vi.hoisted(() => ({
  current: {
    name: "Acme Co",
    tagline: "We ship pixels",
    language: "en_US",
    homeUrl: "https://acme.test",
    publicUrl: "",
    isHeadless: false,
    description: "",
    logoUrl: "https://acme.test/logo.png",
  } as Record<string, unknown>,
}));
const licenseMock = vi.hoisted(() => ({ current: { isPaidLicense: true } }));
vi.mock("@/features/settings", () => ({
  usePublicSiteProfile: () => ({
    data: profileMock.current,
    isLoading: false,
  }),
  useLicense: () => licenseMock.current,
}));

import { WizardStep1Identity } from "../components/WizardStep1Identity";
import { useWizardStore } from "../state/wizardStore";

beforeEach(() => {
  useWizardStore.getState().reset();
  licenseMock.current = { isPaidLicense: true };
  profileMock.current = { ...profileMock.current, description: "" };
});

describe("WizardStep1Identity", () => {
  it("renders the synced identity and the logo upload on a paid tier", async () => {
    render(<WizardStep1Identity />);

    expect(await screen.findByText("Acme Co")).toBeInTheDocument();
    expect(screen.getByText("We ship pixels")).toBeInTheDocument();

    // The restored FileUpload's label + hint are present on paid tiers.
    expect(screen.getByText("Logo")).toBeInTheDocument();
    expect(
      screen.getByText(/match the suggested image style to your brand/i),
    ).toBeInTheDocument();
  });

  it("prefills logoUrl from the WordPress custom logo into the draft", async () => {
    render(<WizardStep1Identity />);

    await waitFor(() =>
      expect(useWizardStore.getState().stepValidity[1]).toBe(true),
    );

    const step1 = useWizardStore.getState().drafts.step1 as
      | { logoUrl?: string }
      | undefined;
    expect(step1).toBeTruthy();
    expect(step1?.logoUrl).toBe("https://acme.test/logo.png");
  });

  it("hides the logo upload on a free/none tier but stays valid", async () => {
    licenseMock.current = { isPaidLicense: false };
    render(<WizardStep1Identity />);

    expect(await screen.findByText("Acme Co")).toBeInTheDocument();
    expect(screen.queryByText("Logo")).toBeNull();

    await waitFor(() =>
      expect(useWizardStore.getState().stepValidity[1]).toBe(true),
    );
  });

  it("has no 'what does your site do?' field — that question lives on the SEO step", async () => {
    // Removed 2026-06-23 for parity with the portal's IdentityStep: "what the
    // business does" is the SEO-step positioning, which auto-drafts on its own.
    render(<WizardStep1Identity />);

    expect(await screen.findByText("Acme Co")).toBeInTheDocument();
    expect(screen.queryByText(/what does your site do/i)).toBeNull();
    expect(screen.queryByText(/Drafted from your homepage/)).toBeNull();
  });

  it("carries the WP site description into the draft (no inline field, still saved from WP)", async () => {
    profileMock.current = {
      ...profileMock.current,
      description: "Hand-written by the user.",
    };
    render(<WizardStep1Identity />);

    await waitFor(() =>
      expect(useWizardStore.getState().drafts.step1?.description).toBe(
        "Hand-written by the user.",
      ),
    );
  });
});
