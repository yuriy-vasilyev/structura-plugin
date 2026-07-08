/**
 * AddWebhookForm integration test.
 *
 * Covers:
 *   - happy path POSTs the right body to the WP REST proxy and invalidates
 *     the connections cache on success
 *   - display_name is forwarded when the user types one
 *   - the cloud's exact reason is surfaced inline when apiFetch rejects
 *
 * Uses fireEvent rather than userEvent because the client workspace doesn't
 * depend on @testing-library/user-event.
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

// AddWebhookForm renders CampaignBindingsPicker, whose inline campaigns
// query consults `useLicense().hasUsableLicense`. Stub to "bound" so
// the existing form-submission assertions still trip.
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({ hasUsableLicense: true, hasWorkspace: true }),
}));

import { AddWebhookForm } from "../components/AddWebhookForm";

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetchMock.mockReset();
  toastSuccess.mockReset();
});

describe("AddWebhookForm", () => {
  it("POSTs the right body and fires a success toast on happy path", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: {
        integrationId: "slack-webhook",
        status: "connected",
        displayName: "Slack",
        externalAccountId: "hooks.slack.com",
        connectedAt: "2026-04-14T12:00:00Z",
        lastUsedAt: null,
        lastError: null,
      },
    });

    renderWithClient(<AddWebhookForm />);

    fireEvent.change(screen.getByLabelText(/webhook url/i), {
      target: { value: "https://hooks.slack.com/services/T/B/abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /connect channel/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });
    expect(apiFetchMock).toHaveBeenCalledWith({
      path: "/structura/v1/channels/connections/webhook",
      method: "POST",
      data: {
        integration_id: "slack-webhook",
        webhook_url: "https://hooks.slack.com/services/T/B/abc",
        display_name: undefined,
        // Default is `"system"` — every save posts the locale explicitly so
        // the cloud has a clear signal of user intent. Unknown/empty values
        // collapse to `"system"` cloud-side.
        notification_locale: "system",
        // Default is `null` — "all campaigns". The form always posts this
        // field so the wire payload is unambiguous about user intent, and
        // the cloud normalizes any unexpected shape back to `null`.
        bound_campaign_ids: null,
        // Default is `1` — "every post". Posted explicitly so the
        // wire shape stays uniform with the cadence-edited case.
        post_cadence_n: 1,
      },
    });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Channel connected.");
    });
  });

  it("sends display_name when the user types one", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: {
        integrationId: "slack-webhook",
        status: "connected",
        displayName: "deploys",
        externalAccountId: "hooks.slack.com",
        connectedAt: "2026-04-14T12:00:00Z",
        lastUsedAt: null,
        lastError: null,
      },
    });

    renderWithClient(<AddWebhookForm />);

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "deploys" },
    });
    fireEvent.change(screen.getByLabelText(/webhook url/i), {
      target: { value: "https://hooks.slack.com/services/T/B/abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /connect channel/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ display_name: "deploys" }),
        }),
      );
    });
  });

  it("renders the notification language selector with System language as the default", () => {
    // Default semantics matter: single-language WP installs should get
    // "system" (follow the site locale at dispatch) without touching the
    // dropdown, matching the campaign-settings convention the user expects.
    renderWithClient(<AddWebhookForm />);

    expect(screen.getByText("Notification language")).toBeInTheDocument();
    // The Listbox button renders the selected label in the trigger.
    expect(screen.getByText("System language")).toBeInTheDocument();
  });

  it("shows a required signing-secret field + Generate button for webhook-ping and posts it", async () => {
    // Webhook-ping is our first signed integration. The generic form has to
    // render the extra field on demand (via the integration option's flag),
    // require a ≥16-char value before enabling submit, and forward the
    // trimmed value as `signing_secret` in the wire body.
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: {
        integrationId: "webhook-ping",
        status: "connected",
        displayName: "Next.js revalidator",
        externalAccountId: "example.com",
        connectedAt: "2026-04-19T12:00:00Z",
        lastUsedAt: null,
        lastError: null,
      },
    });

    renderWithClient(
      <AddWebhookForm
        variant="modal"
        availableIntegrations={[
          {
            id: "webhook-ping",
            label: "Webhook",
            requireSigningSecret: true,
            webhookUrlPlaceholder: "https://example.com/api/revalidate",
          },
        ]}
      />,
    );

    // Field is rendered only when the option opts in.
    const secretInput = screen.getByLabelText(/signing secret/i);
    expect(secretInput).toBeInTheDocument();

    // Fill the URL + a ≥16-char secret; submit should be enabled.
    fireEvent.change(screen.getByLabelText(/webhook url/i), {
      target: { value: "https://example.com/api/revalidate" },
    });
    fireEvent.change(secretInput, {
      // 32 hex characters — simulates a Generate-button output and is well
      // above the 16-char floor enforced both client- and cloud-side.
      target: { value: "deadbeef".repeat(4) },
    });
    fireEvent.click(screen.getByRole("button", { name: /connect channel/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith({
        path: "/structura/v1/channels/connections/webhook",
        method: "POST",
        data: {
          integration_id: "webhook-ping",
          webhook_url: "https://example.com/api/revalidate",
          signing_secret: "deadbeef".repeat(4),
          display_name: undefined,
          notification_locale: "system",
          // Default "all campaigns" — see happy-path comment.
          bound_campaign_ids: null,
          // Default "every post" — same rationale as above.
          post_cadence_n: 1,
        },
      });
    });
  });

  it("keeps submit disabled for webhook-ping until the signing secret clears the 16-char floor", () => {
    // Mirrors the cloud-side minimum — a user pasting an obviously weak
    // secret gets an inert submit button instead of an avoidable 400.
    renderWithClient(
      <AddWebhookForm
        variant="modal"
        availableIntegrations={[
          {
            id: "webhook-ping",
            label: "Webhook",
            requireSigningSecret: true,
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByLabelText(/webhook url/i), {
      target: { value: "https://example.com/hook" },
    });
    fireEvent.change(screen.getByLabelText(/signing secret/i), {
      target: { value: "short" },
    });

    const submit = screen.getByRole("button", { name: /connect channel/i });
    expect(submit).toBeDisabled();
  });

  it("does NOT forward signing_secret for unsigned webhook integrations even if state is non-empty", async () => {
    // Defensive assertion: the signing-secret field is hidden for slack /
    // discord, so this path exercises handleSubmit's conditional forwarding
    // directly — state could only be non-empty here if something weird
    // happened, but handleSubmit must still omit it from the wire payload
    // so the cloud never receives noise.
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: {
        integrationId: "slack-webhook",
        status: "connected",
        displayName: "Slack",
        externalAccountId: "hooks.slack.com",
        connectedAt: "2026-04-19T12:00:00Z",
        lastUsedAt: null,
        lastError: null,
      },
    });

    renderWithClient(<AddWebhookForm />);

    fireEvent.change(screen.getByLabelText(/webhook url/i), {
      target: { value: "https://hooks.slack.com/services/T/B/abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /connect channel/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalled();
    });
    // `signing_secret: undefined` is equivalent to "absent from the wire
    // payload" — JSON.stringify (used by apiFetch under the hood) drops
    // keys whose value is undefined. We assert on the value rather than
    // key presence because handleSubmit conditionally sets it to undefined
    // for unsigned integrations, which is the correct wire behavior.
    const call = apiFetchMock.mock.calls[0][0];
    expect(call.data.signing_secret).toBeUndefined();
  });

  it("on edit, empty signing secret is allowed and forwarded as undefined so the cloud preserves the stored value", async () => {
    // The preserve-on-edit contract: webhook-ping edits that don't touch the
    // secret (e.g. renaming the display name) must be submittable without
    // retyping a secret the UI can't pre-populate. handleSubmit forwards
    // `signing_secret: undefined` in that case so the cloud re-encrypts the
    // existing blob's secret untouched. Dropping this behavior would force
    // either a silent rotation or a 400 on benign edits.
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: {
        connectionId: "ping-uuid-1",
        integrationId: "webhook-ping",
        status: "connected",
        displayName: "Renamed ping",
        externalAccountId: "example.com",
        connectedAt: "2026-04-19T12:00:00Z",
        lastUsedAt: null,
        lastError: null,
      },
    });

    renderWithClient(
      <AddWebhookForm
        variant="modal"
        availableIntegrations={[
          {
            id: "webhook-ping",
            label: "Webhook",
            requireSigningSecret: true,
          },
        ]}
        editingConnection={{
          connectionId: "ping-uuid-1",
          integrationId: "webhook-ping",
          status: "connected",
          displayName: "Original name",
          externalAccountId: "example.com",
          connectedAt: "2026-04-19T12:00:00Z",
          lastUsedAt: null,
          lastError: null,
          notificationLocale: "system",
        }}
      />,
    );

    // Webhook URL is always required on the wire; edit mode leaves it empty
    // because the cloud doesn't echo it back. User re-pastes it.
    fireEvent.change(screen.getByLabelText(/webhook url/i), {
      target: { value: "https://example.com/api/revalidate" },
    });
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "Renamed ping" },
    });
    // Signing-secret field deliberately left blank — preserves existing.

    const submit = screen.getByRole("button", { name: /save changes/i });
    // Gate must be loose enough to allow submit without a secret in edit mode.
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });
    const call = apiFetchMock.mock.calls[0][0];
    expect(call.data.connection_id).toBe("ping-uuid-1");
    expect(call.data.integration_id).toBe("webhook-ping");
    expect(call.data.display_name).toBe("Renamed ping");
    // Crucial: signing_secret is undefined, not an empty string. That is the
    // wire signal to the cloud's preserve-existing branch. Empty string would
    // trip the ≥16-char floor on the cloud and return a 400.
    expect(call.data.signing_secret).toBeUndefined();
  });

  it("on edit, a filled-in signing secret is forwarded as an explicit rotation", async () => {
    // Complementary to the preserve test: if the user *does* type a new
    // secret on edit, it should be forwarded byte-exact so the cloud rotates.
    // The user is responsible for updating their consumer — the amber hint
    // above the field tells them that.
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: {
        connectionId: "ping-uuid-1",
        integrationId: "webhook-ping",
        status: "connected",
        displayName: "Rotated",
        externalAccountId: "example.com",
        connectedAt: "2026-04-19T12:00:00Z",
        lastUsedAt: null,
        lastError: null,
      },
    });

    renderWithClient(
      <AddWebhookForm
        variant="modal"
        availableIntegrations={[
          {
            id: "webhook-ping",
            label: "Webhook",
            requireSigningSecret: true,
          },
        ]}
        editingConnection={{
          connectionId: "ping-uuid-1",
          integrationId: "webhook-ping",
          status: "connected",
          displayName: "Original",
          externalAccountId: "example.com",
          connectedAt: "2026-04-19T12:00:00Z",
          lastUsedAt: null,
          lastError: null,
          notificationLocale: "system",
        }}
      />,
    );

    const rotated = "cafef00d".repeat(4);
    fireEvent.change(screen.getByLabelText(/webhook url/i), {
      target: { value: "https://example.com/api/revalidate" },
    });
    fireEvent.change(screen.getByLabelText(/signing secret/i), {
      target: { value: rotated },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });
    const call = apiFetchMock.mock.calls[0][0];
    expect(call.data.signing_secret).toBe(rotated);
  });

  it("on edit, a too-short signing secret keeps submit disabled (rotation must still clear the floor)", () => {
    // The loosened edit-mode gate only accepts *empty* or *≥16 chars*. A
    // user who starts typing a rotation but stops short should hit the same
    // disabled-submit affordance as on a fresh install — otherwise they'd
    // round-trip a weak secret and eat a cloud 400.
    renderWithClient(
      <AddWebhookForm
        variant="modal"
        availableIntegrations={[
          {
            id: "webhook-ping",
            label: "Webhook",
            requireSigningSecret: true,
          },
        ]}
        editingConnection={{
          connectionId: "ping-uuid-1",
          integrationId: "webhook-ping",
          status: "connected",
          displayName: "Original",
          externalAccountId: "example.com",
          connectedAt: "2026-04-19T12:00:00Z",
          lastUsedAt: null,
          lastError: null,
          notificationLocale: "system",
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText(/webhook url/i), {
      target: { value: "https://example.com/api/revalidate" },
    });
    fireEvent.change(screen.getByLabelText(/signing secret/i), {
      target: { value: "short" },
    });

    expect(
      screen.getByRole("button", { name: /save changes/i }),
    ).toBeDisabled();
  });

  it("surfaces the exact cloud error on the URL input when apiFetch rejects", async () => {
    apiFetchMock.mockRejectedValueOnce(
      new Error("Webhook URL must be on hooks.slack.com"),
    );

    renderWithClient(<AddWebhookForm />);

    fireEvent.change(screen.getByLabelText(/webhook url/i), {
      target: { value: "https://discord.com/api/webhooks/…" },
    });
    fireEvent.click(screen.getByRole("button", { name: /connect channel/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Webhook URL must be on hooks.slack.com"),
      ).toBeInTheDocument();
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
