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
  _n: (single: string, plural: string, n: number) => (n === 1 ? single : plural),
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

// ---------------------------------------------------------------------------
// Google Search Console — four-state connect flow (design handoff:
// marketing/design_handoff_gsc_connect_flow, spec: gsc-integration.md §4)
// ---------------------------------------------------------------------------
//
// GSC is the first `insights` channel: a read-only data source the
// dispatcher never fans out to. Its configure surface is the dedicated
// connect-flow modal (GscConnectFlow.tsx) with four states derived from
// the property-match result:
//
//   auto_matched → confirm panel · picker → radio list with Best match ·
//   no_property → verify guidance + refresh retry ·
//   insufficient_permission → amber ask + copyable owner request.
//
// Saving still rides `selected_gsc_property`; retries hit the new
// `/gsc/refresh-properties` proxy on the stored token (no OAuth).

describe("ConfigureConnectionModal — Google Search Console connect flow", () => {
  const SITE_HOST = "example.com";

  const ownerDomain = {
    siteUrl: "sc-domain:example.com",
    permissionLevel: "siteOwner",
  };
  const fullPrefix = {
    siteUrl: "https://example.com/",
    permissionLevel: "siteFullUser",
  };
  const restrictedShop = {
    siteUrl: "https://shop.example.com/",
    permissionLevel: "siteRestrictedUser",
  };
  const unverifiedDomain = {
    siteUrl: "sc-domain:example.com",
    permissionLevel: "siteUnverifiedUser",
  };

  const gscConnection = (
    overrides: Partial<ConnectionSummary> = {},
  ): ConnectionSummary =>
    makeConnection({
      connectionId: "conn-gsc",
      integrationId: "google-search-console",
      displayName: "owner@example.com",
      externalAccountId: "sc-domain:example.com",
      externalAccountMeta: {
        googleEmail: "owner@example.com",
        property: "sc-domain:example.com",
        availableProperties: [ownerDomain, fullPrefix],
      },
      ...overrides,
    });

  /** Picker-state connection: OAuth done, nothing auto-matched yet. */
  const unmatchedConnection = (
    availableProperties: { siteUrl: string; permissionLevel: string }[],
  ) =>
    gscConnection({
      externalAccountId: "",
      externalAccountMeta: {
        googleEmail: "owner@example.com",
        property: null,
        availableProperties,
      },
    });

  beforeEach(() => {
    // The modal derives its "matches your site" host from the SPA's
    // bootstrap config (window.structuraConfig.domain).
    window.structuraConfig = {
      rest_url: "",
      webhook_url: "",
      nonce: "",
      domain: SITE_HOST,
    };
  });

  it("renders the auto-matched confirm state (Board 02) with no dispatch controls", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={gscConnection()}
        open
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("Connect Search Console")).toBeInTheDocument();
    expect(
      screen.getByText("We found the Search Console property for this site."),
    ).toBeInTheDocument();
    // Matched panel: property id verbatim in mono (sc-domain: prefix kept)
    // + the plain-language type line naming the site host.
    expect(screen.getByText("sc-domain:example.com")).toBeInTheDocument();
    expect(screen.getByText("Domain property.")).toBeInTheDocument();
    expect(
      screen.getByText(/Covers the whole domain — every subdomain and protocol\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/It matches your site/)).toBeInTheDocument();
    expect(screen.getByText(SITE_HOST)).toBeInTheDocument();
    // Account row: email verbatim + Switch account.
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Switch account" }),
    ).toBeInTheDocument();
    // Reassurance caption.
    expect(
      screen.getByText(
        "Read-only — Structura can see search stats, and nothing else. Disconnect anytime.",
      ),
    ).toBeInTheDocument();
    // Footer pair.
    expect(
      screen.getByRole("button", { name: /choose a different property/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /confirm & connect/i }),
    ).toBeInTheDocument();
    // Read-only source: none of the dispatch-oriented settings render.
    expect(screen.queryByTestId("cadence-picker")).toBeNull();
    expect(screen.queryByText("Notification language")).toBeNull();
    expect(screen.queryByText("Attach featured image")).toBeNull();
    expect(screen.queryByText("Posting target")).toBeNull();
    expect(screen.queryByRole("button", { name: /save settings/i })).toBeNull();
  });

  it("labels a URL-prefix auto-match with the prefix explainer", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={gscConnection({
          externalAccountId: "https://example.com/",
          externalAccountMeta: {
            googleEmail: "owner@example.com",
            property: "https://example.com/",
            availableProperties: [fullPrefix],
          },
        })}
        open
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("URL-prefix property.")).toBeInTheDocument();
    expect(
      screen.getByText(/Covers only pages under this exact address\./),
    ).toBeInTheDocument();
  });

  it("Confirm & connect saves the matched property and closes (dispatch fields stay off the wire)", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: gscConnection(),
    });
    const onClose = vi.fn();
    renderWithClient(
      <ConfigureConnectionModal
        connection={gscConnection()}
        open
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /confirm & connect/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/structura/v1/channels/connections/settings",
          method: "POST",
          data: expect.objectContaining({
            connection_id: "conn-gsc",
            selected_gsc_property: "sc-domain:example.com",
          }),
        }),
      );
    });
    const data = (
      apiFetchMock.mock.calls[0][0] as { data: Record<string, unknown> }
    ).data;
    expect(data.notification_locale).toBeUndefined();
    expect(data.bound_campaign_ids).toBeUndefined();
    expect(data.post_cadence_n).toBeUndefined();
    expect(data.video_voice).toBeUndefined();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("Choose a different property drops into the picker pre-selected on the match, Cancel returns", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={gscConnection()}
        open
        onClose={() => {}}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /choose a different property/i }),
    );

    expect(screen.getByText("Choose your property")).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: /search console property/i }),
    ).toBeInTheDocument();
    // The confirmed property is the pre-selected radio.
    expect(
      screen.getByRole("radio", { name: /sc-domain:example\.com/ }),
    ).toBeChecked();

    // Back-link behavior: Cancel returns to the confirm view rather than
    // closing, because the picker was entered from it.
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.getByText("Connect Search Console")).toBeInTheDocument();
  });

  it("renders the picker (Board 03) with mono ids, type lines, permission badges, and the Best match pre-selection", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={unmatchedConnection([
          ownerDomain,
          fullPrefix,
          restrictedShop,
        ])}
        open
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("Choose your property")).toBeInTheDocument();
    // Count + host in the description.
    expect(
      screen.getByText(/Your Google account has 3 properties that could match/),
    ).toBeInTheDocument();
    // Property ids render verbatim in mono — including sc-domain:.
    expect(screen.getByText("sc-domain:example.com")).toBeInTheDocument();
    expect(screen.getByText("https://example.com/")).toBeInTheDocument();
    expect(screen.getByText("https://shop.example.com/")).toBeInTheDocument();
    // Type explainers (bold lead-in + plain sentence).
    expect(screen.getByText("Domain property.")).toBeInTheDocument();
    expect(screen.getAllByText("URL-prefix property.")).toHaveLength(2);
    // Permission badges — Restricted framed as sufficient, never a push
    // toward Owner.
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Full access")).toBeInTheDocument();
    expect(
      screen.getByText("Restricted — read-only, enough for Structura"),
    ).toBeInTheDocument();
    // Best match: the exact URL-prefix hit beats the covering domain
    // property (spec §4.2 order) and is pre-selected.
    expect(screen.getByText("Best match")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /https:\/\/example\.com\/.*Best match/ }),
    ).toBeChecked();
  });

  it("Connect property saves the picked property", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connection: gscConnection(),
    });
    const onClose = vi.fn();
    renderWithClient(
      <ConfigureConnectionModal
        connection={unmatchedConnection([ownerDomain, fullPrefix])}
        open
        onClose={onClose}
      />,
    );

    fireEvent.click(
      screen.getByRole("radio", { name: /sc-domain:example\.com/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /connect property/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/structura/v1/channels/connections/settings",
          method: "POST",
          data: expect.objectContaining({
            connection_id: "conn-gsc",
            selected_gsc_property: "sc-domain:example.com",
          }),
        }),
      );
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("surfaces the server's unverified-selection reject inline and keeps the modal open", async () => {
    // The wire contract: the cloud REJECTS a selection whose permission is
    // unverified with a user-facing message — it must render inline, not
    // as a toast, and the picker must survive for a retry.
    apiFetchMock.mockRejectedValueOnce(
      new Error("That property is still unverified for this account."),
    );
    const onClose = vi.fn();
    renderWithClient(
      <ConfigureConnectionModal
        connection={unmatchedConnection([ownerDomain, fullPrefix])}
        open
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /connect property/i }));

    expect(
      await screen.findByText(
        "That property is still unverified for this account.",
      ),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /connect property/i }),
    ).toBeInTheDocument();
  });

  it("renders insufficient_permission (Board 05) for an unverified-only list", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={unmatchedConnection([unverifiedDomain])}
        open
        onClose={() => {}}
      />,
    );

    expect(
      screen.getByText("You need more access to this property"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This property exists, but your account can't read its data yet.",
      ),
    ).toBeInTheDocument();
    // The amber panel names BOTH sides: the account and the property.
    expect(screen.getAllByText("owner@example.com").length).toBeGreaterThan(1);
    expect(screen.getByText("sc-domain:example.com")).toBeInTheDocument();
    // The exact ask, with the Restricted-is-enough framing.
    expect(screen.getByText("“Restricted” is enough")).toBeInTheDocument();
    expect(
      screen.getByText("Settings → Users and permissions"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Or connect with a Google account that already has access.",
      ),
    ).toBeInTheDocument();
    // Footer: copy request + cancel + retry.
    expect(
      screen.getByRole("button", { name: /copy request for the owner/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("Copy request for the owner writes the template to the clipboard and toasts", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderWithClient(
      <ConfigureConnectionModal
        connection={unmatchedConnection([unverifiedDomain])}
        open
        onClose={() => {}}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /copy request for the owner/i }),
    );

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const request = writeText.mock.calls[0][0] as string;
    // Ready-to-paste message names the property, the requester, and the
    // Restricted-user ask.
    expect(request).toContain("sc-domain:example.com");
    expect(request).toContain("owner@example.com");
    expect(request).toContain('"Restricted" permission is enough');
    expect(request).toContain("Settings → Users and permissions");
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        "Request copied to your clipboard.",
      ),
    );
  });

  it("Try again re-lists on the stored token via the refresh proxy", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      ok: true,
      properties: [unverifiedDomain],
      selected: null,
      googleEmail: "owner@example.com",
    });
    renderWithClient(
      <ConfigureConnectionModal
        connection={unmatchedConnection([unverifiedDomain])}
        open
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/structura/v1/gsc/refresh-properties",
          method: "POST",
        }),
      );
    });
    // Still unverified-only → the state stays put.
    expect(
      await screen.findByText("You need more access to this property"),
    ).toBeInTheDocument();
  });

  it("renders no_property guidance (Board 04) for an empty list", () => {
    renderWithClient(
      <ConfigureConnectionModal
        connection={unmatchedConnection([])}
        open
        onClose={() => {}}
      />,
    );

    expect(
      screen.getByText("One step first: verify your site with Google"),
    ).toBeInTheDocument();
    // Description names the account and defines verification in owner
    // language.
    expect(
      screen.getByText(/has no verified Search Console property for/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/it takes about 5 minutes, and only Google can do it\./),
    ).toBeInTheDocument();
    // Numbered steps.
    expect(screen.getByText("Google Search Console")).toBeInTheDocument();
    expect(screen.getByText(/and add/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Follow Google's steps to verify — for most sites, adding one DNS record where you bought your domain.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Come back here — we'll find it automatically."),
    ).toBeInTheDocument();
    // Wrong-account caption + account row.
    expect(
      screen.getByText(
        "Wrong Google account? Properties belong to accounts — verify with this one, or switch.",
      ),
    ).toBeInTheDocument();
    // Email renders twice: named in the description AND in the account row.
    expect(screen.getAllByText("owner@example.com").length).toBeGreaterThan(0);
    // Footer: new-tab link into GSC's add-property flow + the retry.
    const openLink = screen.getByRole("link", {
      name: /open search console/i,
    });
    expect(openLink).toHaveAttribute(
      "href",
      "https://search.google.com/search-console/welcome",
    );
    expect(openLink).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("button", { name: /I've verified — check again/i }),
    ).toBeInTheDocument();
  });

  it("check again → fresh match lands on the confirm state (Board 02)", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      ok: true,
      properties: [ownerDomain],
      selected: "sc-domain:example.com",
      googleEmail: "owner@example.com",
    });
    renderWithClient(
      <ConfigureConnectionModal
        connection={unmatchedConnection([])}
        open
        onClose={() => {}}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /I've verified — check again/i }),
    );

    // The server auto-selected the fresh match → success path: the
    // auto-matched confirm renders with the property panel.
    expect(
      await screen.findByText("Connect Search Console"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("We found the Search Console property for this site."),
    ).toBeInTheDocument();
    expect(screen.getByText("sc-domain:example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /confirm & connect/i }),
    ).toBeInTheDocument();
  });

  it("check again → still nothing shows the verification-propagation line", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      ok: true,
      properties: [],
      selected: null,
      googleEmail: "owner@example.com",
    });
    renderWithClient(
      <ConfigureConnectionModal
        connection={unmatchedConnection([])}
        open
        onClose={() => {}}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /I've verified — check again/i }),
    );

    expect(
      await screen.findByText(
        "Not found yet — Google verification can take a few minutes to propagate.",
      ),
    ).toBeInTheDocument();
    // Still the guidance state, ready for another round.
    expect(
      screen.getByText("One step first: verify your site with Google"),
    ).toBeInTheDocument();
  });

  it("shows the checking spinner only while a refresh call is in flight", async () => {
    let resolveRefresh!: (value: unknown) => void;
    apiFetchMock.mockImplementationOnce(
      () => new Promise((resolve) => (resolveRefresh = resolve)),
    );
    renderWithClient(
      <ConfigureConnectionModal
        connection={unmatchedConnection([])}
        open
        onClose={() => {}}
      />,
    );

    expect(
      screen.queryByText("Checking your Search Console properties…"),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /I've verified — check again/i }),
    );
    expect(
      await screen.findByText("Checking your Search Console properties…"),
    ).toBeInTheDocument();

    resolveRefresh({
      success: true,
      ok: true,
      properties: [],
      selected: null,
      googleEmail: "owner@example.com",
    });
    await waitFor(() =>
      expect(
        screen.queryByText("Checking your Search Console properties…"),
      ).toBeNull(),
    );
  });

  it("surfaces a failed refresh (ok: false) inline", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      ok: false,
      properties: [],
      selected: null,
      googleEmail: null,
      error: "Google said no — token revoked.",
    });
    renderWithClient(
      <ConfigureConnectionModal
        connection={unmatchedConnection([])}
        open
        onClose={() => {}}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /I've verified — check again/i }),
    );

    expect(
      await screen.findByText("Google said no — token revoked."),
    ).toBeInTheDocument();
  });

  it("Switch account restarts OAuth for google-search-console", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      // Relative URL keeps jsdom's navigation stub quiet while still
      // exercising the redirect assignment.
      authorizeUrl: "#authorize",
    });
    renderWithClient(
      <ConfigureConnectionModal
        connection={gscConnection()}
        open
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch account" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/structura/v1/channels/oauth/init",
          method: "POST",
          data: expect.objectContaining({
            integration_id: "google-search-console",
          }),
        }),
      );
    });
  });
});
