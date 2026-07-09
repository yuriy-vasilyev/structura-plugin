/**
 * ChannelConnectionRow component tests.
 *
 * Pure presentational — no react-query wiring. Verifies that:
 *   - the wire-side `status` drives the badge colour (not derived from the
 *     presence/absence of a lastError)
 *   - lastError.message renders in an alert region so screen readers pick it up
 *   - the Disconnect button opens the confirmation dialog, and only the
 *     Confirm action actually fires `onDelete` (so a stray click can't sever
 *     a live Slack channel)
 *   - the row renders the per-connection notification locale in a
 *     human-readable label
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ChannelConnectionRow } from "../components/ChannelConnectionRow";
import type { ConnectionSummary, IntegrationCatalogEntry } from "../types";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

const baseConnection: ConnectionSummary = {
  integrationId: "slack-webhook",
  status: "connected",
  displayName: "#deploys",
  externalAccountId: "hooks.slack.com",
  connectedAt: "2026-04-14T12:00:00Z",
  lastUsedAt: null,
  lastError: null,
  notificationLocale: "system",
};

const slackCatalogEntry: IntegrationCatalogEntry = {
  id: "slack-webhook",
  name: "Slack",
  description: "Test",
  category: "notify",
  capabilities: ["notify"],
  authType: "webhook",
  iconUrl: "https://cdn.simpleicons.org/slack/4A154B",
  gating: { requiredPlan: "byok", requiredAddon: null },
  entitlement: { canInstall: true, blocker: null },
};

/** Clicks the top-level "Disconnect" button on the row (not the one in the dialog). */
const clickRowDisconnect = () => {
  // There's also an "action" region; target the row item directly so we don't
  // accidentally hit the confirm button that appears after the dialog opens.
  const row = screen.getByRole("listitem");
  fireEvent.click(within(row).getByRole("button", { name: /disconnect/i }));
};

describe("ChannelConnectionRow", () => {
  it("renders the displayName and the external account id", () => {
    render(
      <ul>
        <ChannelConnectionRow
          connection={baseConnection}
          catalogEntry={slackCatalogEntry}
          onDelete={() => {}}
        />
      </ul>,
    );
    expect(screen.getByText("#deploys")).toBeInTheDocument();
    expect(screen.getByText("hooks.slack.com")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    // Provider label sits alongside the user-typed display name so multi-
    // connection setups stay unambiguous.
    expect(screen.getByText("Slack")).toBeInTheDocument();
  });

  it("falls back to the catalog name when displayName is blank", () => {
    // Empty displayName → row shows the provider name as the primary label
    // rather than the raw integration id (readable default).
    render(
      <ul>
        <ChannelConnectionRow
          connection={{ ...baseConnection, displayName: "" }}
          catalogEntry={slackCatalogEntry}
          onDelete={() => {}}
        />
      </ul>,
    );
    // "Slack" appears both as primary label (replacing empty displayName) AND
    // as the provider label chip, so we should see it at least once.
    expect(screen.getAllByText("Slack").length).toBeGreaterThan(0);
  });

  it("falls back to the integrationId when both displayName and catalogEntry are missing", () => {
    render(
      <ul>
        <ChannelConnectionRow
          connection={{ ...baseConnection, displayName: "" }}
          onDelete={() => {}}
        />
      </ul>,
    );
    // Two renders of the id — one as primary label, one as provider chip.
    expect(screen.getAllByText("slack-webhook").length).toBeGreaterThan(0);
  });

  it("renders the notification locale as a human-readable label", () => {
    render(
      <ul>
        <ChannelConnectionRow
          connection={{ ...baseConnection, notificationLocale: "de" }}
          catalogEntry={slackCatalogEntry}
          onDelete={() => {}}
        />
      </ul>,
    );
    expect(screen.getByText("Deutsch")).toBeInTheDocument();
  });

  it("surfaces lastError.message in an alert region for degraded connections", () => {
    render(
      <ul>
        <ChannelConnectionRow
          connection={{
            ...baseConnection,
            status: "error",
            lastError: {
              code: "webhook_http_404",
              message: "Webhook returned 404.",
              at: "2026-04-14T12:01:00Z",
            },
          }}
          catalogEntry={slackCatalogEntry}
          onDelete={() => {}}
        />
      </ul>,
    );
    const alerts = screen.getAllByRole("alert");
    // The row's error banner is the only alert before the dialog opens.
    expect(alerts[0]).toHaveTextContent("Webhook returned 404.");
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("opens a confirmation dialog before invoking onDelete (legacy row → integrationId fallback)", () => {
    // Legacy row: summary has no `connectionId`, so the row falls back to
    // `integrationId` when telling the parent which connection to delete. The
    // cloud REST proxy accepts either, so this keeps older activations
    // deletable through the transition window.
    const onDelete = vi.fn();
    render(
      <ul>
        <ChannelConnectionRow
          connection={baseConnection}
          catalogEntry={slackCatalogEntry}
          onDelete={onDelete}
        />
      </ul>,
    );
    // The first click only opens the dialog — onDelete must NOT be called yet.
    clickRowDisconnect();
    expect(onDelete).not.toHaveBeenCalled();

    // Dialog is open: confirm button carries the "Disconnect" label too, so
    // find it via the Dialog role to disambiguate from the row-level button.
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^disconnect$/i }));
    expect(onDelete).toHaveBeenCalledWith("slack-webhook");
  });

  it("invokes onDelete with connectionId when the row has a UUID (post-migration)", () => {
    // The whole point of the UUID migration: two siblings sharing an
    // integrationId must be deletable independently. If we routed delete by
    // integrationId, clicking Disconnect on the #alerts row would kill the
    // #deploys row too.
    const onDelete = vi.fn();
    render(
      <ul>
        <ChannelConnectionRow
          connection={{
            ...baseConnection,
            connectionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          }}
          catalogEntry={slackCatalogEntry}
          onDelete={onDelete}
        />
      </ul>,
    );
    clickRowDisconnect();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^disconnect$/i }));
    expect(onDelete).toHaveBeenCalledWith(
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );
  });

  it("cancels the delete when the user picks Keep connected", () => {
    const onDelete = vi.fn();
    render(
      <ul>
        <ChannelConnectionRow
          connection={baseConnection}
          catalogEntry={slackCatalogEntry}
          onDelete={onDelete}
        />
      </ul>,
    );
    clickRowDisconnect();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /keep connected/i }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("disables the Disconnect button while a delete is in flight", () => {
    render(
      <ul>
        <ChannelConnectionRow
          connection={baseConnection}
          catalogEntry={slackCatalogEntry}
          onDelete={() => {}}
          isDeleting
        />
      </ul>,
    );
    const row = screen.getByRole("listitem");
    expect(
      within(row).getByRole("button", { name: /disconnect/i }),
    ).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Video channel — settings summary + ambient quota meter (handoff §5)
// ---------------------------------------------------------------------------

describe("ChannelConnectionRow — video channel", () => {
  const videoCatalogEntry: IntegrationCatalogEntry = {
    id: "video",
    name: "Video: Shorts & TikTok",
    description: "Vertical videos for Shorts and TikTok.",
    category: "video",
    capabilities: ["adapt"],
    authType: "none",
    iconUrl: "",
    gating: { requiredPlan: "cloud_pro", requiredAddon: null },
    entitlement: { canInstall: true, blocker: null },
  };

  const videoConnection = (
    overrides: Partial<ConnectionSummary> = {},
  ): ConnectionSummary => ({
    connectionId: "conn-video",
    integrationId: "video",
    status: "connected",
    displayName: "Vertical video",
    externalAccountId: null,
    connectedAt: "2026-07-01T12:00:00Z",
    lastUsedAt: null,
    lastError: null,
    ...overrides,
  });

  it("replaces the notification meta with the voice/preset/cadence summary", () => {
    render(
      <ul>
        <ChannelConnectionRow
          connection={videoConnection({ videoVoice: "ava", videoStyle: "clean" })}
          catalogEntry={videoCatalogEntry}
          onDelete={() => {}}
        />
      </ul>,
    );

    // Settings summary instead of "Notifications in …".
    expect(screen.queryByText(/notifications in/i)).toBeNull();
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("Voice Nova · Clean preset · every post");
  });

  it("prefers the bound preset's style over the connection's legacy field once the digest arrives", () => {
    // Post-migration the preset owns video styling; the connection's own
    // videoStyle is frozen at its pre-migration value. The meta line must
    // reflect what actually renders — the preset's style.
    render(
      <ul>
        <ChannelConnectionRow
          connection={videoConnection({ videoVoice: "ava", videoStyle: "clean" })}
          catalogEntry={videoCatalogEntry}
          boundVisualPreset={{
            presetId: "p1",
            label: "Default",
            videoStyle: "kinetic",
            captionPlacement: "bottom",
            hasPalette: true,
          }}
          onDelete={() => {}}
        />
      </ul>,
    );
    expect(screen.getByRole("listitem")).toHaveTextContent(
      "Voice Nova · Kinetic preset · every post",
    );
  });

  it("shows the stock Clean style when the digest says no preset is bound (null)", () => {
    render(
      <ul>
        <ChannelConnectionRow
          connection={videoConnection({ videoStyle: "kinetic" })}
          catalogEntry={videoCatalogEntry}
          boundVisualPreset={null}
          onDelete={() => {}}
        />
      </ul>,
    );
    // Unbound sites render stock Clean regardless of the legacy field.
    expect(screen.getByRole("listitem")).toHaveTextContent(
      "Voice Zephyr · Clean preset · every post",
    );
  });

  it("summarizes a throttled cadence and falls back to Zephyr/Clean defaults", () => {
    render(
      <ul>
        <ChannelConnectionRow
          connection={videoConnection({ postCadenceN: 3 })}
          catalogEntry={videoCatalogEntry}
          onDelete={() => {}}
        />
      </ul>,
    );
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("Voice Zephyr · Clean preset · every 3th post");
  });

  it("renders the compact quota meter when quota data is available", () => {
    render(
      <ul>
        <ChannelConnectionRow
          connection={videoConnection()}
          catalogEntry={videoCatalogEntry}
          onDelete={() => {}}
          videoQuota={{ used: 12, cap: 20 }}
        />
      </ul>,
    );
    expect(screen.getByText("12 of 20 videos this month")).toBeInTheDocument();
    const meter = screen.getByRole("progressbar");
    expect(meter).toHaveAttribute("aria-valuenow", "12");
    expect(meter).toHaveAttribute("aria-valuemax", "20");
    // Healthy quota keeps the normal status badge.
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.queryByText("Quota reached")).toBeNull();
  });

  it("flips to the exhausted treatment when the quota is used up", () => {
    render(
      <ul>
        <ChannelConnectionRow
          connection={videoConnection()}
          catalogEntry={videoCatalogEntry}
          onDelete={() => {}}
          videoQuota={{ used: 20, cap: 20 }}
        />
      </ul>,
    );
    // Badge flips from Connected to the amber quota warning …
    expect(screen.getByText("Quota reached")).toBeInTheDocument();
    expect(screen.queryByText("Connected")).toBeNull();
    // … and an inline panel explains what happens next.
    expect(
      screen.getByText(/New posts are skipped until your quota resets/),
    ).toBeInTheDocument();
    const upgrade = screen.getByRole("link", {
      name: /upgrade for more videos/i,
    });
    const href = new URL(upgrade.getAttribute("href") ?? "");
    expect(href.searchParams.get("intent")).toBe("unlock_video");
  });

  it("keeps the quota surface off non-video rows even when quota data exists", () => {
    render(
      <ul>
        <ChannelConnectionRow
          connection={baseConnection}
          catalogEntry={slackCatalogEntry}
          onDelete={() => {}}
          videoQuota={{ used: 20, cap: 20 }}
        />
      </ul>,
    );
    expect(screen.queryByText("20 of 20 videos this month")).toBeNull();
    expect(screen.queryByText("Quota reached")).toBeNull();
  });
});
