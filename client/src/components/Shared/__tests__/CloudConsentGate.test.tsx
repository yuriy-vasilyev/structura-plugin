/**
 * CloudConsentGate tests — wp.org guidelines 7 & 9 (review 2026-08-27).
 *
 *   - `needsCloudConsent` only fires on an explicit `false` (older plugin
 *     builds omit the flag and must NOT see the gate).
 *   - Accepting POSTs to /privacy/cloud-consent with the REST nonce and
 *     then hands off (page reload in production) — the wire contract PHP
 *     depends on to record consent + bootstrap.
 *   - A failed POST surfaces an error instead of pretending it worked.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
}));

import { CloudConsentGate, needsCloudConsent } from "../CloudConsentGate";

function renderGate(onGranted: () => void) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CloudConsentGate onGranted={onGranted} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  (window as unknown as { structuraConfig: Record<string, unknown> }).structuraConfig = {
    rest_url: "https://example.test/wp-json/",
    nonce: "nonce-123",
    cloud_consent: false,
  };
});

describe("needsCloudConsent", () => {
  it("is true only for an explicit false", () => {
    expect(needsCloudConsent({ cloud_consent: false })).toBe(true);
    expect(needsCloudConsent({ cloud_consent: true })).toBe(false);
    expect(needsCloudConsent({})).toBe(false);
    expect(needsCloudConsent(undefined)).toBe(false);
  });
});

describe("CloudConsentGate", () => {
  it("lists what is shared and links the policies", () => {
    renderGate(() => {});
    expect(screen.getByText("Connect this site to Structura Cloud")).toBeInTheDocument();
    expect(screen.getByText(/random install ID/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Privacy policy/ })).toHaveAttribute(
      "href",
      "https://www.structurawp.com/privacy",
    );
    expect(screen.getByRole("link", { name: /Terms of service/ })).toHaveAttribute(
      "href",
      "https://www.structurawp.com/terms",
    );
  });

  it("POSTs consent with the REST nonce and hands off on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cloudConsent: true, hasWorkspace: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onGranted = vi.fn();
    renderGate(onGranted);

    fireEvent.click(screen.getByRole("button", { name: "Connect to Structura Cloud" }));

    await waitFor(() => expect(onGranted).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/wp-json/structura/v1/privacy/cloud-consent",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-WP-Nonce": "nonce-123" }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("shows an error and does not hand off when the POST fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const onGranted = vi.fn();
    renderGate(onGranted);

    fireEvent.click(screen.getByRole("button", { name: "Connect to Structura Cloud" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onGranted).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
