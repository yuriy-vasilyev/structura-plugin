/**
 * SiteNotConnectedBanner tests.
 *
 * Coverage priorities:
 *   - Banner is invisible while `hasUsableLicense` is `null` (settings
 *     still loading) — pre-fix this flashed in/out on every mount.
 *   - Banner is invisible when `hasUsableLicense` is `true` (license
 *     bound) — the most common steady state.
 *   - Banner is invisible on truly fresh installs:
 *     `hasUsableLicense === false` AND
 *     `structuraConfig.had_prior_activation === false`. There's nothing
 *     to "reconnect" to and the dashboard already runs onboarding.
 *   - Banner IS rendered on previously-connected installs:
 *     `hasUsableLicense === false` AND
 *     `structuraConfig.had_prior_activation === true`.
 *   - Back-compat: when `had_prior_activation` is missing on the
 *     bootstrap (older plugin builds), default to "show banner" rather
 *     than silently suppressing — better to over-show on legacy PHP
 *     than to strand a genuinely-disconnected install.
 *   - "Forget this site" submits the typed license key to the cloud,
 *     mutates `structuraConfig.had_prior_activation` so the banner
 *     self-hides, and surfaces a success toast on success.
 *   - "Forget this site" surfaces a failure toast and keeps the dialog
 *     open if the cloud rejects (e.g. wrong key).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
}));

const h = vi.hoisted(() => ({
  hasUsableLicense: null as boolean | null,
  apiFetchImpl: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => h.apiFetchImpl(...args),
}));

vi.mock("@/features/settings", () => ({
  useLicense: () => ({ hasUsableLicense: h.hasUsableLicense }),
}));

vi.mock("@structura/ui", async () => {
  const actual =
    await vi.importActual<typeof import("@structura/ui")>("@structura/ui");
  return {
    ...actual,
    toast: {
      success: (...args: unknown[]) => h.toastSuccess(...args),
      error: (...args: unknown[]) => h.toastError(...args),
    },
  };
});

import { SiteNotConnectedBanner } from "../SiteNotConnectedBanner";

function setBootstrapFlag(value: boolean | undefined) {
  // Approximate the PHP-side `wp_localize_script` boot — the SPA reads
  // `window.structuraConfig` synchronously on first render. Tests
  // mutate the object directly because the production code path is a
  // plain property access, not a hook.
  const existing =
    (window as unknown as { structuraConfig?: Record<string, unknown> })
      .structuraConfig ?? {};
  if (value === undefined) {
    delete (existing as { had_prior_activation?: unknown }).had_prior_activation;
  } else {
    (existing as { had_prior_activation?: boolean }).had_prior_activation = value;
  }
  (window as unknown as { structuraConfig?: Record<string, unknown> }).structuraConfig =
    existing;
}

function renderBanner() {
  // QueryClientProvider is required because the banner uses
  // `useQueryClient()` to invalidate caches after a successful forget.
  // A fresh client per test isolates query state.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SiteNotConnectedBanner />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.hasUsableLicense = null;
  setBootstrapFlag(undefined);
  h.apiFetchImpl.mockReset();
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

describe("SiteNotConnectedBanner", () => {
  it("renders nothing while license state is still loading", () => {
    h.hasUsableLicense = null;
    setBootstrapFlag(true);
    const { container } = renderBanner();
    // Two children: an empty fragment + the unrendered Dialog Transition
    // wrapper. The visible banner shouldn't be there.
    expect(
      screen.queryByText("This site isn't connected"),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".bg-warning, [role='alert']")).toBeNull();
  });

  it("renders nothing when the site has a usable license", () => {
    h.hasUsableLicense = true;
    setBootstrapFlag(true);
    renderBanner();
    expect(
      screen.queryByText("This site isn't connected"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing on a truly fresh install (no license, never activated)", () => {
    // Wp.org-fresh: settings have loaded, no key bound, and the plugin
    // has never recorded a successful activation. Pre-fix this showed
    // an alarming "reconnect" CTA with nothing to reconnect to.
    h.hasUsableLicense = false;
    setBootstrapFlag(false);
    renderBanner();
    expect(
      screen.queryByText("This site isn't connected"),
    ).not.toBeInTheDocument();
  });

  it("renders the banner on a disconnected install that was previously activated", () => {
    h.hasUsableLicense = false;
    setBootstrapFlag(true);
    renderBanner();
    expect(
      screen.getByText("This site isn't connected"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Connect this site" }),
    ).toHaveAttribute("href", "/account");
    expect(
      screen.getByRole("button", { name: "Forget this site" }),
    ).toBeInTheDocument();
  });

  it("defaults to showing the banner when had_prior_activation is missing (back-compat)", () => {
    // Plugin builds predating the flag don't emit it. We'd rather
    // over-show on a legacy install than silently strand someone who
    // genuinely needs to reconnect.
    h.hasUsableLicense = false;
    setBootstrapFlag(undefined);
    renderBanner();
    expect(
      screen.getByText("This site isn't connected"),
    ).toBeInTheDocument();
  });

  describe("Forget this site flow", () => {
    // Repo doesn't ship `@testing-library/user-event`; the form is
    // simple enough that `fireEvent` exercises the same paths.
    function openForgetDialog() {
      fireEvent.click(screen.getByRole("button", { name: "Forget this site" }));
    }

    async function submitForgetForm(key: string) {
      const input = (await screen.findByLabelText(/license key/i)) as HTMLInputElement;
      fireEvent.change(input, { target: { value: key } });
      // The submit button shares its label with the banner CTA — pick
      // the dialog one (last in DOM order) explicitly.
      const submits = screen.getAllByRole("button", {
        name: /forget this site/i,
      });
      fireEvent.click(submits[submits.length - 1]);
    }

    it("submits the typed license key, hides the banner, and toasts on success", async () => {
      h.hasUsableLicense = false;
      setBootstrapFlag(true);
      h.apiFetchImpl.mockResolvedValue({ success: true });

      renderBanner();

      openForgetDialog();
      await submitForgetForm("STRUCT-TEST-KEY-12345");

      await waitFor(() => {
        expect(h.apiFetchImpl).toHaveBeenCalledWith({
          path: "/structura/v1/license/forget-site",
          method: "POST",
          data: { key: "STRUCT-TEST-KEY-12345" },
        });
      });
      expect(h.toastSuccess).toHaveBeenCalledTimes(1);
      // Server-side flag is mirrored client-side so the next render
      // sees fresh-install state without a hard reload.
      expect(window.structuraConfig?.had_prior_activation).toBe(false);
    });

    it("surfaces a failure toast and keeps the dialog open when the cloud rejects", async () => {
      h.hasUsableLicense = false;
      setBootstrapFlag(true);
      h.apiFetchImpl.mockRejectedValue(
        new Error("Could not authenticate this license."),
      );

      renderBanner();

      openForgetDialog();
      await submitForgetForm("WRONG");

      await waitFor(() => {
        expect(h.toastError).toHaveBeenCalledWith(
          "Could not authenticate this license.",
        );
      });
      expect(h.toastSuccess).not.toHaveBeenCalled();
      // Banner stays visible so the user can retry.
      expect(
        screen.getByText("This site isn't connected"),
      ).toBeInTheDocument();
    });
  });
});
