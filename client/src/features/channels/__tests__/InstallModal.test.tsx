/**
 * InstallModal auth-type branching test.
 *
 * Exercises the four `entry.authType` branches so a regression in the
 * switch statement gets caught:
 *   - "webhook" → renders AddWebhookForm and POSTs to the WP REST proxy
 *   - "oauth2"  → renders the "OAuth setup is coming soon" placeholder
 *   - "apikey"  → renders AddCredentialForm with per-integration fields
 *   - "none"    → renders AddCredentialForm with per-integration fields
 *
 * Dialog is rendered inside a portal by Headless UI; the Testing Library
 * queries all use document.body as the root, so they pick up portal content
 * without extra configuration.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const apiFetchMock = vi.fn();
vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => apiFetchMock(...args),
}));
vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%[sd]/g, () => String(args[i++]));
  },
}));

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }));
vi.mock("@structura/ui", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    toast: { success: toastSuccess, error: vi.fn() },
  };
});

// InstallModal embeds CampaignBindingsPicker + (for IndexNow) the
// site-indexing-status query, both of which now consult
// `useLicense().hasUsableLicense`. Stub to "bound" so the existing
// auth-type branching assertions still trip.
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({ hasUsableLicense: true, hasWorkspace: true }),
}));

// Video installs hand off to the connections page's `?configure=` flow after
// saving — spy on useNavigate so the redirect target is assertable.
const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useNavigate: () => navigateMock,
}));

import { MemoryRouter } from "react-router";
import { InstallModal } from "../components/InstallModal";
import type {
  IntegrationAuthType,
  IntegrationCatalogEntry,
} from "../types";

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // MemoryRouter: the modal calls useNavigate for the post-install
  // configure hand-off (video), which needs a router context.
  return render(
    <MemoryRouter initialEntries={["/channels/store"]}>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </MemoryRouter>,
  );
}

function makeEntry(
  authType: IntegrationAuthType,
  overrides: Partial<IntegrationCatalogEntry> = {},
): IntegrationCatalogEntry {
  return {
    id: authType === "webhook" ? "slack-webhook" : `test-${authType}`,
    name:
      authType === "webhook"
        ? "Slack"
        : authType === "oauth2"
          ? "LinkedIn"
          : authType === "apikey"
            ? "WhatsApp"
            : "IndexNow",
    description: "A test integration for the install modal.",
    category: "notify",
    capabilities: ["notify"],
    authType,
    iconUrl: "",
    gating: { requiredPlan: "byok", requiredAddon: null },
    entitlement: { canInstall: true, blocker: null },
    ...overrides,
  };
}

beforeEach(() => {
  apiFetchMock.mockReset();
  toastSuccess.mockReset();
  navigateMock.mockReset();
});

describe("InstallModal", () => {
  it("renders the entry name and description in the header", () => {
    renderWithClient(
      <InstallModal entry={makeEntry("webhook")} open onClose={() => {}} />,
    );
    expect(screen.getByText("Install Slack")).toBeInTheDocument();
    expect(
      screen.getByText("A test integration for the install modal."),
    ).toBeInTheDocument();
  });

  it("renders nothing when open=false", () => {
    renderWithClient(
      <InstallModal entry={makeEntry("webhook")} open={false} onClose={() => {}} />,
    );
    expect(screen.queryByText("Install Slack")).toBeNull();
  });

  it("renders the webhook form for authType=webhook and submits to the REST proxy", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: {
        integrationId: "slack-webhook",
        status: "connected",
        displayName: null,
        externalAccountId: "hooks.slack.com",
        connectedAt: "2026-04-15T12:00:00Z",
        lastUsedAt: null,
        lastError: null,
      },
    });

    const onClose = vi.fn();
    renderWithClient(
      <InstallModal entry={makeEntry("webhook")} open onClose={onClose} />,
    );

    fireEvent.change(screen.getByLabelText(/webhook url/i), {
      target: { value: "https://hooks.slack.com/services/T/B/abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /connect channel/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/structura/v1/channels/connections/webhook",
          method: "POST",
          data: expect.objectContaining({
            integration_id: "slack-webhook",
            webhook_url: "https://hooks.slack.com/services/T/B/abc",
          }),
        }),
      );
    });
    // onSuccess closes the modal.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("renders the OAuth connect panel for authType=oauth2", () => {
    renderWithClient(
      <InstallModal entry={makeEntry("oauth2")} open onClose={() => {}} />,
    );
    // The OAuth panel shows a "Connect <name>" button instead of a coming-soon notice.
    expect(screen.getByRole("button", { name: /connect/i })).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    // Webhook form must not render on this branch.
    expect(screen.queryByLabelText(/webhook url/i)).toBeNull();
  });

  it("renders the credential form for authType=apikey (e.g. WhatsApp)", () => {
    renderWithClient(
      <InstallModal
        entry={makeEntry("apikey", { id: "whatsapp", name: "WhatsApp" })}
        open
        onClose={() => {}}
      />,
    );
    // Credential form renders per-integration fields, not a "coming soon" panel.
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    expect(screen.queryByLabelText(/webhook url/i)).toBeNull();
    // WhatsApp should show its three credential fields.
    expect(screen.getByLabelText(/phone number id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/access token/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/recipient phone/i)).toBeInTheDocument();
  });

  it("renders the credential form for authType=none (e.g. email-owner)", () => {
    renderWithClient(
      <InstallModal
        entry={makeEntry("none", { id: "email-owner", name: "Email the owner" })}
        open
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    expect(screen.queryByLabelText(/webhook url/i)).toBeNull();
    // Email-owner should show the recipient email field.
    expect(screen.getByLabelText(/recipient email/i)).toBeInTheDocument();
  });

  it("cancel button on OAuth panel invokes onClose", () => {
    const onClose = vi.fn();
    renderWithClient(
      <InstallModal entry={makeEntry("oauth2")} open onClose={onClose} />,
    );
    // The OAuth panel has a "Cancel" button and a "Connect" button.
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    expect(cancelButton).toBeTruthy();
    fireEvent.click(cancelButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("X close button in the modal header invokes onClose on every auth type", () => {
    for (const authType of ["webhook", "oauth2", "apikey", "none"] as const) {
      const onClose = vi.fn();
      const { unmount } = renderWithClient(
        <InstallModal entry={makeEntry(authType)} open onClose={onClose} />,
      );
      // The X is the only "Close"-named button without text content (icon-only).
      const xButton = screen
        .getAllByRole("button", { name: /^close$/i })
        .find((el) => !el.textContent || el.textContent.trim() === "");
      expect(xButton).toBeTruthy();
      fireEvent.click(xButton!);
      expect(onClose).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it("Cancel button in the webhook form invokes onClose", () => {
    const onClose = vi.fn();
    renderWithClient(
      <InstallModal entry={makeEntry("webhook")} open onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses Slack-shaped placeholders when installing the Slack webhook", () => {
    renderWithClient(
      <InstallModal entry={makeEntry("webhook")} open onClose={() => {}} />,
    );
    const url = screen.getByLabelText(/webhook url/i) as HTMLInputElement;
    expect(url.placeholder).toMatch(/hooks\.slack\.com/);
    const name = screen.getByLabelText(/display name/i) as HTMLInputElement;
    expect(name.placeholder).toMatch(/deploys/i);
  });

  it("uses Discord-shaped placeholders when installing the Discord webhook", () => {
    renderWithClient(
      <InstallModal
        entry={makeEntry("webhook", { id: "discord-webhook", name: "Discord" })}
        open
        onClose={() => {}}
      />,
    );
    const url = screen.getByLabelText(/webhook url/i) as HTMLInputElement;
    expect(url.placeholder).toMatch(/discord\.com\/api\/webhooks/);
    expect(url.placeholder).not.toMatch(/slack/i);
    const name = screen.getByLabelText(/display name/i) as HTMLInputElement;
    expect(name.placeholder).toMatch(/general/i);
  });

  // -------------------------------------------------------------------------
  // LinkedIn company-page target choice
  //
  // The personal-vs-company-Page radio controls whether the OAuth init
  // requests the company-page scopes (`post_as: "organization"`). It's
  // LinkedIn-specific — gated on the integration id — because LinkedIn is the
  // only OAuth integration that can post to a Page, and the scope must be
  // chosen before the redirect (the *specific* Page is picked afterward in the
  // Configure modal).
  // -------------------------------------------------------------------------
  describe("LinkedIn company-page target", () => {
    const linkedinEntry = makeEntry("oauth2", { id: "linkedin", name: "LinkedIn" });

    it("shows the company-page choice only for LinkedIn, personal by default", () => {
      // Generic oauth2 entry (id "test-oauth2") → no choice.
      const { unmount } = renderWithClient(
        <InstallModal entry={makeEntry("oauth2")} open onClose={() => {}} />,
      );
      expect(screen.queryByRole("radiogroup")).toBeNull();
      unmount();

      renderWithClient(
        <InstallModal entry={linkedinEntry} open onClose={() => {}} />,
      );
      expect(screen.getByRole("radiogroup")).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: /personal profile/i }),
      ).toBeChecked();
      expect(
        screen.getByRole("radio", { name: /company page/i }),
      ).not.toBeChecked();
    });

    it("requests company-page scopes (post_as=organization) when the Page option is chosen", async () => {
      apiFetchMock.mockResolvedValueOnce({
        success: true,
        authorizeUrl: "https://provider.example/auth",
      });
      renderWithClient(
        <InstallModal entry={linkedinEntry} open onClose={() => {}} />,
      );

      fireEvent.click(screen.getByRole("radio", { name: /company page/i }));
      fireEvent.click(screen.getByRole("button", { name: /connect linkedin/i }));

      await waitFor(() => {
        expect(apiFetchMock).toHaveBeenCalledWith(
          expect.objectContaining({
            path: "/structura/v1/channels/oauth/init",
            method: "POST",
            data: expect.objectContaining({
              integration_id: "linkedin",
              post_as: "organization",
            }),
          }),
        );
      });
    });

    it("omits post_as when the toggle stays off (personal profile)", async () => {
      apiFetchMock.mockResolvedValueOnce({
        success: true,
        authorizeUrl: "https://provider.example/auth",
      });
      renderWithClient(
        <InstallModal entry={linkedinEntry} open onClose={() => {}} />,
      );

      fireEvent.click(screen.getByRole("button", { name: /connect linkedin/i }));

      await waitFor(() => {
        const call = apiFetchMock.mock.calls.find(
          (c) =>
            (c[0] as { path?: string })?.path ===
            "/structura/v1/channels/oauth/init",
        );
        expect(call).toBeTruthy();
        const data = (call![0] as { data: Record<string, unknown> }).data;
        expect(data.integration_id).toBe("linkedin");
        expect(data.post_as).toBeUndefined();
      });
    });
  });

  // -------------------------------------------------------------------------
  // IndexNow visibility warning
  //
  // The warning is configuration-aware. Two distinct misconfigurations
  // surface a warning, each pointing at the right fix; the two happy
  // paths render nothing. See the InstallModal source for the four-case
  // matrix. Pre-2026-05-01 the warning fired on every site that
  // discouraged indexing — but for headless customers that's the
  // expected setup, so the alert was alarmist (Yurii feedback).
  // -------------------------------------------------------------------------
  describe("IndexNow visibility warning", () => {
    /** Helper: wire path-aware mock for indexing-status + site-profile. */
    function mockSite({
      isHeadless,
      discourageSearchEngines,
    }: {
      isHeadless: boolean;
      discourageSearchEngines: boolean;
    }) {
      apiFetchMock.mockImplementation((args: { path: string }) => {
        if (args.path === "/structura/v1/site/indexing-status") {
          return Promise.resolve({
            success: true,
            blogPublic: !discourageSearchEngines,
            discourageSearchEngines,
          });
        }
        if (args.path === "/structura/v1/site-profile") {
          return Promise.resolve({
            name: "Test",
            tagline: "",
            language: "en",
            logoUrl: "",
            homeUrl: "https://example.test",
            publicUrl: isHeadless
              ? "https://www.example.test"
              : "https://example.test",
            isHeadless,
            description: "",
            keyPages: [],
            permalinkStrategy: "inherit",
            permalinkTemplate: "",
            defaultPermalinkLang: "",
          });
        }
        return Promise.reject(new Error(`unexpected path ${args.path}`));
      });
    }

    it("renders the original warning when non-headless + WP discourages indexing", async () => {
      mockSite({ isHeadless: false, discourageSearchEngines: true });

      renderWithClient(
        <InstallModal
          entry={makeEntry("none", { id: "indexnow", name: "IndexNow" })}
          open
          onClose={() => {}}
        />,
      );

      await waitFor(() =>
        expect(
          screen.getByText(/This site is hidden from search engines/i),
        ).toBeInTheDocument(),
      );
      expect(
        screen.getByText(/WordPress is currently set to discourage/i),
      ).toBeInTheDocument();
    });

    it("does not render the warning when non-headless + WP is indexable (happy path)", async () => {
      mockSite({ isHeadless: false, discourageSearchEngines: false });

      renderWithClient(
        <InstallModal
          entry={makeEntry("none", { id: "indexnow", name: "IndexNow" })}
          open
          onClose={() => {}}
        />,
      );

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenCalledWith(
          expect.objectContaining({
            path: "/structura/v1/site/indexing-status",
          }),
        ),
      );
      expect(
        screen.queryByText(/hidden from search engines/i),
      ).toBeNull();
      expect(
        screen.queryByText(/exposed to search engines/i),
      ).toBeNull();
    });

    it("does not render the warning when headless + WP is hidden (happy path — pre-fix this used to alarm headless customers)", async () => {
      mockSite({ isHeadless: true, discourageSearchEngines: true });

      renderWithClient(
        <InstallModal
          entry={makeEntry("none", { id: "indexnow", name: "IndexNow" })}
          open
          onClose={() => {}}
        />,
      );

      // Wait for both queries to settle.
      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenCalledWith(
          expect.objectContaining({ path: "/structura/v1/site-profile" }),
        ),
      );
      expect(
        screen.queryByText(/hidden from search engines/i),
      ).toBeNull();
      expect(
        screen.queryByText(/exposed to search engines/i),
      ).toBeNull();
    });

    it("renders the new headless-exposure warning when headless + WP indexable", async () => {
      mockSite({ isHeadless: true, discourageSearchEngines: false });

      renderWithClient(
        <InstallModal
          entry={makeEntry("none", { id: "indexnow", name: "IndexNow" })}
          open
          onClose={() => {}}
        />,
      );

      await waitFor(() =>
        expect(
          screen.getByText(
            /Your WordPress install is exposed to search engines/i,
          ),
        ).toBeInTheDocument(),
      );
      // The fix-it copy points to checking (not unchecking) the WP
      // setting — opposite of the non-headless branch.
      expect(
        screen.getByText(/and check .*Discourage search engines/i),
      ).toBeInTheDocument();
    });

    it("does not consult the indexing-status endpoint for non-IndexNow entries", () => {
      // email-owner also uses authType="none", but IndexNow's noindex warning
      // is IndexNow-specific — wiring it to every "none" entry would fire a
      // REST round-trip on irrelevant installs.
      renderWithClient(
        <InstallModal
          entry={makeEntry("none", { id: "email-owner", name: "Email the owner" })}
          open
          onClose={() => {}}
        />,
      );
      expect(apiFetchMock).not.toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/structura/v1/site/indexing-status",
        }),
      );
      expect(
        screen.queryByText(/hidden from search engines/i),
      ).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Video channel — zero-credential install + post-install configure hand-off
// ---------------------------------------------------------------------------

describe("InstallModal — video channel", () => {
  const videoEntry = makeEntry("none", {
    id: "video",
    name: "Video: Shorts & TikTok",
    category: "video",
  });

  it("renders a zero-field install (no credentials, no notification language)", () => {
    renderWithClient(<InstallModal entry={videoEntry} open onClose={() => {}} />);

    expect(screen.getByText("Install Video: Shorts & TikTok")).toBeInTheDocument();
    // No credential inputs, no webhook URL …
    expect(screen.queryByLabelText(/webhook url/i)).toBeNull();
    expect(screen.queryByLabelText(/recipient email/i)).toBeNull();
    // … and no notification-language select: video isn't a notifier.
    expect(screen.queryByText("Notification language")).toBeNull();
    // Submit affordance is the standard credential-form connect button.
    expect(
      screen.getByRole("button", { name: /connect channel/i }),
    ).toBeInTheDocument();
  });

  it("creates the connection with defaults and hands off to the configure flow", async () => {
    apiFetchMock.mockImplementation((args: { path?: string }) => {
      const path = (args as { path?: string })?.path ?? "";
      if (path.startsWith("/structura/v1/channels/connections/credential")) {
        return Promise.resolve({
          success: true,
          connection: {
            connectionId: "conn-video",
            integrationId: "video",
            status: "connected",
            displayName: "Vertical video",
            externalAccountId: null,
            connectedAt: "2026-07-02T09:00:00Z",
            lastUsedAt: null,
            lastError: null,
            videoVoice: "ava",
            videoStyle: "clean",
          },
        });
      }
      if (path.startsWith("/structura/v1/scheduler/campaigns")) {
        return Promise.resolve([]);
      }
      return Promise.resolve({ success: true });
    });

    const onClose = vi.fn();
    renderWithClient(<InstallModal entry={videoEntry} open onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /connect channel/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/structura/v1/channels/connections/credential",
          method: "POST",
          data: expect.objectContaining({
            integration_id: "video",
            credentials: {},
          }),
        }),
      );
    });
    // Post-install configure pattern: land the user in the settings modal
    // (voice / style / bindings / cadence) via the existing ?configure= hook.
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(
        "/channels/connections?configure=conn-video",
      );
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
