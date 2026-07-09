/**
 * ConfigureConnectionModal — LinkedIn posting-target picker.
 *
 * Focuses on the new "Posting target" Select:
 *   - It renders only when the connection can post to a Page (i.e.
 *     externalAccountMeta.availableOrganizations is non-empty).
 *   - Saving forwards the chosen target as `selected_organization_urn`.
 *   - Personal-only / non-LinkedIn connections never see it and never send
 *     the field.
 *
 * The campaign-bindings and cadence pickers are stubbed so the test stays
 * scoped to the target control and the save wire shape.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
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

// Stub the child pickers — they pull in the campaigns query + license hook
// and aren't what these tests exercise. The cadence stub surfaces its
// label/helper so the video-specific overrides stay assertable.
vi.mock("../components/CampaignBindingsPicker", () => ({
  CampaignBindingsPicker: () => null,
}));
vi.mock("../components/CadencePicker", () => ({
  CadencePicker: ({ label, helper }: { label?: string; helper?: string }) => (
    <div data-testid="cadence-picker">
      <span>{label}</span>
      <span>{helper}</span>
    </div>
  ),
}));

import { MemoryRouter } from "react-router";
import { ConfigureConnectionModal } from "../components/ConfigureConnectionModal";
import type { BoundVisualPresetSummary, ConnectionSummary } from "../types";

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function makeConnection(
  overrides: Partial<ConnectionSummary> = {},
): ConnectionSummary {
  return {
    connectionId: "conn-1",
    integrationId: "linkedin",
    status: "connected",
    displayName: "Acme Corp",
    externalAccountId: "urn:li:person:abc",
    connectedAt: "2026-05-26T12:00:00Z",
    lastUsedAt: null,
    lastError: null,
    ...overrides,
  };
}

const orgMeta = {
  personUrn: "urn:li:person:abc",
  displayName: "Jane Admin",
  organizationUrn: "urn:li:organization:99999",
  organizationName: "Acme Corp",
  availableOrganizations: [
    { organizationUrn: "urn:li:organization:99999", name: "Acme Corp" },
    { organizationUrn: "urn:li:organization:88888", name: "Beta Inc" },
  ],
};

beforeEach(() => {
  apiFetchMock.mockReset();
  toastSuccess.mockReset();
});

describe("ConfigureConnectionModal — LinkedIn posting target", () => {
  it("renders the target picker for a company-capable LinkedIn connection", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={makeConnection({ externalAccountMeta: orgMeta })}
        open
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Posting target")).toBeInTheDocument();
  });

  it("hides the notification-language select for LinkedIn (publishes in the post's own language)", () => {
    // LinkedIn is a publishing channel — the cloud ignores notificationLocale
    // for it, so the control must not render (mirrors the video hide).
    renderWithClient(
      <ConfigureConnectionModal
        connection={makeConnection({ externalAccountMeta: orgMeta })}
        open
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText("Notification language")).toBeNull();
  });

  it("forwards the current target as selected_organization_urn on save", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: makeConnection({ externalAccountMeta: orgMeta }),
    });
    const onClose = vi.fn();
    renderWithClient(
      <ConfigureConnectionModal
        connection={makeConnection({ externalAccountMeta: orgMeta })}
        open
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/structura/v1/channels/connections/settings",
          method: "POST",
          data: expect.objectContaining({
            connection_id: "conn-1",
            // Defaults to the connection's current Page target.
            selected_organization_urn: "urn:li:organization:99999",
          }),
        }),
      );
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("hides the picker and omits the field for a personal-only LinkedIn connection", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: makeConnection(),
    });
    renderWithClient(
      <ConfigureConnectionModal
        connection={makeConnection({
          externalAccountMeta: { personUrn: "urn:li:person:abc", displayName: "Jane" },
        })}
        open
        onClose={() => {}}
      />,
    );

    expect(screen.queryByText("Posting target")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() => {
      const call = apiFetchMock.mock.calls.find(
        (c) =>
          (c[0] as { path?: string })?.path ===
          "/structura/v1/channels/connections/settings",
      );
      expect(call).toBeTruthy();
      const data = (call![0] as { data: Record<string, unknown> }).data;
      expect(data.selected_organization_urn).toBeUndefined();
    });
  });

  it("hides Personal profile and defaults to the Page for a company-only (org app) connection", async () => {
    // Org-app connection: no person URN (Pages app has no openid/profile), so
    // personal posting is impossible — the picker shows Pages only.
    const orgOnlyMeta = {
      organizationUrn: "urn:li:organization:99999",
      organizationName: "Acme Corp",
      availableOrganizations: [
        { organizationUrn: "urn:li:organization:99999", name: "Acme Corp" },
        { organizationUrn: "urn:li:organization:88888", name: "Beta Inc" },
      ],
    };
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: makeConnection({ externalAccountMeta: orgOnlyMeta }),
    });
    renderWithClient(
      <ConfigureConnectionModal
        connection={makeConnection({ externalAccountMeta: orgOnlyMeta })}
        open
        onClose={() => {}}
      />,
    );

    // Picker is shown (Pages exist) but the dead personal option is gone.
    expect(screen.getByText("Posting target")).toBeInTheDocument();
    expect(screen.queryByText("Personal profile")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            // Defaults to the administered Page — never the "personal" sentinel.
            selected_organization_urn: "urn:li:organization:99999",
          }),
        }),
      );
    });
  });

  it("does not render the picker for a non-LinkedIn connection", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={makeConnection({
          integrationId: "slack-webhook",
          externalAccountMeta: orgMeta,
        })}
        open
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText("Posting target")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Video channel — voice / style sections + wire payload (handoff §2)
// ---------------------------------------------------------------------------

describe("ConfigureConnectionModal — video channel", () => {
  const videoConnection = (
    overrides: Partial<ConnectionSummary> = {},
  ): ConnectionSummary =>
    makeConnection({
      connectionId: "conn-video",
      integrationId: "video",
      displayName: "Vertical video",
      externalAccountId: null,
      externalAccountMeta: undefined,
      ...overrides,
    });

  it("renders the Voice and Visual style sections for a video connection", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection()}
        open
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("Voice")).toBeInTheDocument();
    // Radiogroup with the three preset cards.
    expect(
      screen.getByRole("radiogroup", { name: /visual style/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /clean/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /bold/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /kinetic/i })).toBeInTheDocument();
    // Helper copy under each new section.
    expect(
      screen.getByText("Voiceover and captions follow each post’s language."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Presets set caption typography and transition feel. Fine-tuning arrives in a later release.",
      ),
    ).toBeInTheDocument();
    // Fixed-format expectation lives in the dialog description.
    expect(
      screen.getByText(
        "Every published post becomes a 30–60 second vertical video (9:16) — ready to upload to YouTube Shorts or TikTok.",
      ),
    ).toBeInTheDocument();
  });

  it("hides the notification-language select for video (not a notifier)", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection()}
        open
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText("Notification language")).toBeNull();
  });

  it("overrides the cadence label + helper for video", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection()}
        open
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByText("Render a video every Nth post"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Every published post gets a video while your monthly quota lasts.",
      ),
    ).toBeInTheDocument();
  });

  it("saves the defaults (gemini:Zephyr / clean) and omits notification_locale", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: videoConnection(),
    });
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection()}
        open
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/structura/v1/channels/connections/settings",
          method: "POST",
          data: expect.objectContaining({
            connection_id: "conn-video",
            // New-connection default (no stored voice) — the shared
            // catalog's DEFAULT_VIDEO_VOICE, already canonical.
            video_voice: "gemini:Zephyr",
            video_style: "clean",
          }),
        }),
      );
    });
    const data = (apiFetchMock.mock.calls[0][0] as { data: Record<string, unknown> })
      .data;
    expect(data.notification_locale).toBeUndefined();
  });

  it("seeds voice/style from the connection summary and saves a changed preset", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: videoConnection(),
    });
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection({ videoVoice: "lena", videoStyle: "kinetic" })}
        open
        onClose={() => {}}
      />,
    );

    // Switch the visual style via the radio card.
    fireEvent.click(screen.getByRole("radio", { name: /bold/i }));
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            // Legacy persona "lena" resolves to its real voice and the
            // save writes the CANONICAL id (the cloud canonicalizes too).
            video_voice: "openai:shimmer",
            video_style: "bold",
          }),
        }),
      );
    });
  });

  it("never sends video fields for a non-video connection", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: makeConnection({ integrationId: "slack-webhook" }),
    });
    renderWithClient(
      <ConfigureConnectionModal
        connection={makeConnection({
          integrationId: "slack-webhook",
          externalAccountMeta: undefined,
        })}
        open
        onClose={() => {}}
      />,
    );

    // Non-video connections keep the notifier controls…
    expect(screen.getByText("Notification language")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: /visual style/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() => {
      const call = apiFetchMock.mock.calls.find(
        (c) =>
          (c[0] as { path?: string })?.path ===
          "/structura/v1/channels/connections/settings",
      );
      expect(call).toBeTruthy();
      const data = (call![0] as { data: Record<string, unknown> }).data;
      expect(data.video_voice).toBeUndefined();
      expect(data.video_style).toBeUndefined();
    });
  });

  it("renders the footer quota meter when videoQuota is provided", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection()}
        open
        onClose={() => {}}
        videoQuota={{ used: 12, cap: 20 }}
      />,
    );
    expect(screen.getByText("12 of 20 videos this month")).toBeInTheDocument();
    const meter = screen.getByRole("progressbar");
    expect(meter).toHaveAttribute("aria-valuenow", "12");
    expect(meter).toHaveAttribute("aria-valuemax", "20");
  });

  it("lets the user preview a voice sample inline (one at a time, silent failure)", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection()}
        open
        onClose={() => {}}
      />,
    );

    // The trigger adornment plays the currently selected voice (the
    // Zephyr default for a fresh connection).
    const play = screen.getByRole("button", { name: /play sample of Zephyr/i });
    expect(play).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(play);
    // Playing state flips the affordance to a stop control. jsdom can't
    // actually play audio — the component must treat that silently (no
    // toast, no crash) and keep the optimistic playing state until the
    // element reports back.
    expect(
      screen.getByRole("button", { name: /stop voice preview/i }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /stop voice preview/i }));
    expect(
      screen.getByRole("button", { name: /play sample of Zephyr/i }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});

// ---------------------------------------------------------------------------
// Video channel — bound-preset style summary (video-visuals handoff §3)
// ---------------------------------------------------------------------------
//
// Video styling moved onto the visual preset; the dialog's radio cards are
// replaced by a read-only summary of the bound preset fed by the
// `boundVisualPreset` digest on `channelsListConnections`. Contract:
//
//   - digest object  → summary row (name · style · placement · palette) with
//     an "Edit in Visuals" deep link; the radio cards are gone, the old
//     "fine-tuning later" footnote is deleted, and `video_style` no longer
//     rides the save payload (the preset owns it now).
//   - `null`         → "no preset bound yet" edge state with an Open Visuals
//     CTA and the stock-Clean helper.
//   - absent (older cloud, one-release back-compat window) → today's radio
//     section renders unchanged and `video_style` still saves.

describe("ConfigureConnectionModal — video bound-preset summary", () => {
  const videoConnection = (
    overrides: Partial<ConnectionSummary> = {},
  ): ConnectionSummary =>
    makeConnection({
      connectionId: "conn-video",
      integrationId: "video",
      displayName: "Vertical video",
      externalAccountId: null,
      externalAccountMeta: undefined,
      ...overrides,
    });

  const digest = (
    overrides: Partial<BoundVisualPresetSummary> = {},
  ): BoundVisualPresetSummary => ({
    presetId: "p1",
    label: "Default",
    videoStyle: "kinetic",
    captionPlacement: "bottom",
    hasPalette: true,
    ...overrides,
  });

  it("replaces the radio cards with the read-only summary row", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection()}
        boundVisualPreset={digest()}
        open
        onClose={() => {}}
      />,
    );

    // Preset name + "— visual preset" suffix.
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("— visual preset")).toBeInTheDocument();
    // Meta line: style · placement · palette.
    expect(
      screen.getByText("Kinetic · Captions bottom · Brand palette"),
    ).toBeInTheDocument();
    // Deep link into the Visuals surface's video section.
    const edit = screen.getByRole("link", { name: /edit in visuals/i });
    expect(edit).toHaveAttribute("href", expect.stringContaining("/visuals"));
    expect(edit).toHaveAttribute("href", expect.stringContaining("video"));
    expect(
      screen.getByText("Video styling follows the visual preset bound to this site."),
    ).toBeInTheDocument();

    // The old radio section + footnote are gone.
    expect(
      screen.queryByRole("radiogroup", { name: /visual style/i }),
    ).toBeNull();
    expect(
      screen.queryByText(
        "Presets set caption typography and transition feel. Fine-tuning arrives in a later release.",
      ),
    ).toBeNull();
  });

  it("drops the palette segment when the preset has no palette", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection()}
        boundVisualPreset={digest({ videoStyle: "clean", captionPlacement: "middle", hasPalette: false })}
        open
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Clean · Captions middle")).toBeInTheDocument();
    expect(screen.queryByText(/Brand palette/)).toBeNull();
  });

  it("omits video_style from the save payload once the preset owns styling (voice stays)", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: videoConnection(),
    });
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection({ videoVoice: "lena", videoStyle: "bold" })}
        boundVisualPreset={digest()}
        open
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => {
      const call = apiFetchMock.mock.calls.find(
        (c) =>
          (c[0] as { path?: string })?.path ===
          "/structura/v1/channels/connections/settings",
      );
      expect(call).toBeTruthy();
      const data = (call![0] as { data: Record<string, unknown> }).data;
      // Legacy "lena" resolves to its real voice; the wire is canonical.
      expect(data.video_voice).toBe("openai:shimmer");
      expect(data.video_style).toBeUndefined();
    });
  });

  it("renders the edge state when no preset is bound (digest === null)", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection()}
        boundVisualPreset={null}
        open
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("No visual preset bound yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Bind a preset in Visuals to control how this site's videos look.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /open visuals/i }),
    ).toHaveAttribute("href", expect.stringContaining("/visuals"));
    expect(
      screen.getByText("Until then, videos render with the stock Clean style."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radiogroup", { name: /visual style/i }),
    ).toBeNull();
  });

  it("keeps today's radio section (and video_style on save) when the digest is absent — older cloud", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: videoConnection(),
    });
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection({ videoStyle: "kinetic" })}
        open
        onClose={() => {}}
      />,
    );

    // Back-compat: absent field = pre-digest cloud → unchanged radio UI.
    expect(
      screen.getByRole("radiogroup", { name: /visual style/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("— visual preset")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ video_style: "kinetic" }),
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Video channel — grouped voice picker (voice-picker handoff, 2026-07)
// ---------------------------------------------------------------------------
//
// The flat 6-persona Select is replaced by the @structura/ui Combobox fed
// from the shared VIDEO_VOICE_CATALOG (packages/types): OpenAI (9) +
// Gemini (30) groups, legacy-persona resolution, canonical save wire, and
// BYOK provider gating via the `videoTts` field on channelsListConnections.

describe("ConfigureConnectionModal — video voice picker", () => {
  const videoConnection = (
    overrides: Partial<ConnectionSummary> = {},
  ): ConnectionSummary =>
    makeConnection({
      connectionId: "conn-video",
      integrationId: "video",
      displayName: "Vertical video",
      externalAccountId: null,
      externalAccountMeta: undefined,
      ...overrides,
    });

  const openVoicePicker = () => {
    fireEvent.click(screen.getByRole("combobox"));
    return screen.getByRole("listbox");
  };

  it("renders all 39 catalog voices in two provider groups", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection()}
        open
        onClose={() => {}}
      />,
    );

    const listbox = openVoicePicker();
    const openai = within(listbox).getByRole("group", { name: "OpenAI" });
    const gemini = within(listbox).getByRole("group", { name: "Gemini" });
    expect(within(openai).getAllByRole("option")).toHaveLength(9);
    expect(within(gemini).getAllByRole("option")).toHaveLength(30);
    expect(within(listbox).getAllByRole("option")).toHaveLength(39);
    // Zephyr (the platform default) carries the "Default" chip.
    expect(
      within(gemini).getByRole("option", { name: /Zephyr/ }),
    ).toHaveTextContent("Default");
    // Search placeholder interpolates the unlocked count (all 39 here).
    expect(screen.getByPlaceholderText("Search 39 voices…")).toBeInTheDocument();
    // Footnote pinned under the list.
    expect(
      screen.getByText("Samples are English; videos follow your post language."),
    ).toBeInTheDocument();
  });

  it("preselects the Zephyr default (with provider badge) on a new connection", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection()} // no stored videoVoice
        open
        onClose={() => {}}
      />,
    );
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("Zephyr");
    expect(trigger).toHaveTextContent("Bright · Energetic");
    // Provider mini-badge rides the trigger as a leading adornment.
    expect(screen.getByText("Gemini")).toBeInTheDocument();
    // No legacy helper for a canonical/absent stored value.
    expect(screen.queryByText(/now appears under its real name/)).toBeNull();
  });

  it("resolves a legacy persona value to its real voice and shows the one-time helper", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection({ videoVoice: "ava" })}
        open
        onClose={() => {}}
      />,
    );
    // The picker never shows persona names — "ava" renders as Nova.
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("Nova");
    expect(trigger).toHaveTextContent("Warm · Conversational");
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    // Reassurance helper interpolates persona + real voice names.
    expect(
      screen.getByText(/now appears under its real name, Nova/),
    ).toHaveTextContent(
      "Your voice ‘Ava’ now appears under its real name, Nova. It’s the same voice — nothing about your videos changes.",
    );
  });

  it("keeps the helper hidden for a canonical stored value", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection({ videoVoice: "gemini:Puck" })}
        open
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Puck");
    expect(screen.queryByText(/now appears under its real name/)).toBeNull();
  });

  it("saves the canonical id for a legacy persona connection (video_voice wire)", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: videoConnection(),
    });
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection({ videoVoice: "ava" })}
        open
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/structura/v1/channels/connections/settings",
          method: "POST",
          data: expect.objectContaining({
            connection_id: "conn-video",
            video_voice: "openai:nova",
          }),
        }),
      );
    });
  });

  it("saves a picked voice's canonical id", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: videoConnection(),
    });
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection()}
        open
        onClose={() => {}}
      />,
    );

    openVoicePicker();
    fireEvent.click(screen.getByRole("option", { name: /Onyx/ }));
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ video_voice: "openai:onyx" }),
        }),
      );
    });
  });

  it("builds sample URLs per provider extension (openai mp3, gemini wav)", () => {
    // Capture Audio construction so the CDN URL contract is pinned:
    // v2 path, `{provider}-{id}` file, wav for Gemini / mp3 for OpenAI.
    const sources: string[] = [];
    class FakeAudio {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(src: string) {
        sources.push(src);
      }
      play() {
        return Promise.resolve();
      }
      pause() {}
    }
    vi.stubGlobal("Audio", FakeAudio);
    try {
      renderWithClient(
        <ConfigureConnectionModal
          connection={videoConnection()}
          open
          onClose={() => {}}
        />,
      );
      openVoicePicker();
      fireEvent.click(screen.getByRole("button", { name: /play sample of Puck/i }));
      fireEvent.click(screen.getByRole("button", { name: /play sample of Nova/i }));
      expect(sources).toEqual([
        "https://storage.googleapis.com/structura-releases/assets/voice-samples/v2/gemini-Puck.wav",
        "https://storage.googleapis.com/structura-releases/assets/voice-samples/v2/openai-nova.mp3",
      ]);
      // Row playback stays a sample action: the selection didn't change.
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("gates a missing BYOK provider with the teaser row instead of its options", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection()}
        videoTts={{ managed: false, providers: { openai: true, gemini: false } }}
        open
        onClose={() => {}}
      />,
    );

    const listbox = openVoicePicker();
    // Unlocked OpenAI options render; gated Gemini ones don't.
    expect(within(listbox).getAllByRole("option")).toHaveLength(9);
    const gemini = within(listbox).getByRole("group", { name: "Gemini" });
    expect(within(gemini).queryAllByRole("option")).toHaveLength(0);
    expect(gemini).toHaveTextContent(
      "Connect a Gemini API key to unlock 30 more voices.",
    );
    // CTA deep-links to the AI-keys surface (hash-routed SPA).
    expect(
      within(gemini).getByRole("link", { name: "Open AI keys" }),
    ).toHaveAttribute("href", "#/ai-engine");
    // Placeholder counts only the unlocked voices.
    expect(screen.getByPlaceholderText("Search 9 voices…")).toBeInTheDocument();
  });

  it("gates a missing OpenAI key symmetrically", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection()}
        videoTts={{ managed: false, providers: { openai: false, gemini: true } }}
        open
        onClose={() => {}}
      />,
    );
    const listbox = openVoicePicker();
    expect(within(listbox).getAllByRole("option")).toHaveLength(30);
    expect(
      within(listbox).getByRole("group", { name: "OpenAI" }),
    ).toHaveTextContent("Connect a OpenAI API key to unlock 9 more voices.");
    expect(screen.getByPlaceholderText("Search 30 voices…")).toBeInTheDocument();
  });

  it("shows no gate UI on managed plans regardless of provider flags", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection()}
        videoTts={{ managed: true, providers: { openai: false, gemini: false } }}
        open
        onClose={() => {}}
      />,
    );
    const listbox = openVoicePicker();
    expect(within(listbox).getAllByRole("option")).toHaveLength(39);
    expect(screen.queryByText(/API key to unlock/)).toBeNull();
  });

  it("replaces the combobox with the blocking gate panel when NO provider key exists", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection()}
        videoTts={{ managed: false, providers: { openai: false, gemini: false } }}
        open
        onClose={() => {}}
      />,
    );

    // No dropdown to dead-end in…
    expect(screen.queryByRole("combobox")).toBeNull();
    // …the blocking panel takes the Voice slot…
    expect(screen.getByText("Voiceover needs an AI key")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Videos are narrated with OpenAI or Gemini text-to-speech. Connect either key to choose from 39 voices — video rendering stays paused until then.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /connect an ai key/i }),
    ).toHaveAttribute("href", "/ai-engine");
    // …and the rest of the modal stays intact (cadence + save footer).
    expect(screen.getByTestId("cadence-picker")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save settings/i }),
    ).toBeInTheDocument();
  });

  it("treats an absent videoTts field as unlocked (older cloud back-compat)", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={videoConnection()}
        open
        onClose={() => {}}
      />,
    );
    const listbox = openVoicePicker();
    expect(within(listbox).getAllByRole("option")).toHaveLength(39);
    expect(screen.queryByText(/API key to unlock/)).toBeNull();
    expect(screen.queryByText("Voiceover needs an AI key")).toBeNull();
  });
});
