/**
 * Settings-only edit modal for an existing connection.
 *
 * Surfaces the user-managed fields — campaign bindings, notification
 * locale, and "every Nth post" cadence — without touching tokens,
 * webhook URLs, or credentials. Works across every auth type, which
 * matters most for OAuth (LinkedIn, X) where the install flow has no
 * other "save settings" hop and the regular AddWebhookForm /
 * AddCredentialForm would try to re-write secrets that don't apply.
 *
 * Two surfaces open this modal:
 *
 *   1. Post-OAuth landing — the OAuth callback redirects back to
 *      `/wp-admin/admin.php?page=structura-channels&connected=<id>&
 *      configure=<connectionId>`. The connections page detects the
 *      param and pops this modal automatically so the user sees their
 *      settings on first land. The connection is already saved with
 *      defaults (all campaigns, every post) so closing the modal
 *      without changes keeps the wiring functional. Video installs
 *      reuse the same `?configure=` hand-off after the zero-credential
 *      install, so their defaults (voice Zephyr, preset-driven styling)
 *      get the same first-land treatment.
 *
 *   2. Edit affordance on a connection row — same component, opened
 *      explicitly from the Edit button. Replaces the install-flow
 *      modal for OAuth rows (which couldn't show one before because
 *      AddWebhookForm asks for a webhook URL OAuth doesn't have).
 *
 * Video channel (integrationId === "video") swaps the section stack per
 * the design handoffs (marketing/design_handoff_video_channel/README.md §2
 * + marketing/design_handoff_voice_picker/README.md): a grouped
 * two-provider voice combobox (39 voices, sample playback, BYOK provider
 * gating via the `videoTts` wire field, legacy-persona resolution), then
 * the shared bindings/cadence pair with a video-specific cadence label,
 * and a monthly quota meter in the footer. Video is not a notifier, so
 * the notification-language select is hidden and no `notification_locale`
 * rides its save payload — instead `video_voice` does (always the
 * canonical `provider:id`).
 *
 * Visual style (video-visuals handoff §3, 2026-07): styling moved onto
 * the site's bound visual preset. When the cloud sends the
 * `boundVisualPreset` digest, this dialog renders a read-only summary
 * with an "Edit in Visuals" deep link and stops writing `video_style`;
 * when the digest is absent (older cloud, one-release back-compat
 * window) the legacy per-connection style radio section still renders
 * and saves.
 *
 * Spec: specs/integrations-store-spec.md §5.2 + the 2026-05-20 product
 * ask to give LinkedIn/X connections explicit per-campaign + cadence
 * control.
 */

import { useEffect, useRef, useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { Link } from "react-router";
import {
  Button,
  Combobox,
  Dialog,
  PresetRadioCard,
  PresetRadioCardGroup,
  QuotaMeter,
  Select,
  Switch,
  toast,
} from "@structura/ui";
import type { ComboboxGroup } from "@structura/ui";
import {
  ArrowRight,
  Info,
  KeyRound,
  Palette,
  Play,
  Square,
  X,
} from "lucide-react";
import {
  VIDEO_VOICE_CATALOG,
  resolveStoredVideoVoice,
  videoVoiceSampleUrl,
  DEFAULT_VIDEO_VOICE,
} from "@structura/types";
import type { VideoTtsProvider } from "@structura/types";
import { useChannelConnectionMutations } from "../api/useChannelConnectionMutations";
import { CadencePicker } from "./CadencePicker";
import { CampaignBindingsPicker } from "./CampaignBindingsPicker";
import type {
  BoundVisualPresetSummary,
  ConnectionSummary,
  LinkedInMeta,
  VideoQuota,
  VideoTtsAvailability,
} from "../types";
import {
  DEFAULT_VIDEO_STYLE,
  VIDEO_INTEGRATION_ID,
  VIDEO_STYLE_PRESETS,
  videoStyleById,
} from "../videoChannel";

/**
 * The Visuals surface's video section — the deep-link target of "Edit in
 * Visuals" / "Open Visuals". Query param (not a location hash) because
 * the SPA is hash-routed; the Visuals page scrolls + highlights on it.
 */
const VISUALS_VIDEO_ROUTE = "/visuals?section=video";

// Mirrors the option list AddCredentialForm + AddWebhookForm render —
// kept literal here (not imported) because the source list lives inside
// those forms as a module-private const and the surface area is small.
const NOTIFICATION_LOCALE_OPTIONS = [
  { value: "system", labelKey: "System (use post locale)" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
] as const;

interface ConfigureConnectionModalProps {
  connection: ConnectionSummary;
  open: boolean;
  onClose: () => void;
  /**
   * Monthly video-render quota (top-level field on
   * `channelsListConnections`). Only meaningful for video connections;
   * passed as a prop (rather than re-queried here) because the opening
   * page already holds the connections response. Omitted → the footer
   * meter simply doesn't render, which is also the right degradation
   * for older clouds that don't send the field yet.
   */
  videoQuota?: VideoQuota;
  /**
   * Bound-visual-preset digest (top-level on `channelsListConnections`),
   * video connections only — video styling moved onto the visual preset
   * (video-visuals handoff §3). Tri-state, and the `undefined` branch is
   * load-bearing back-compat: an older cloud that doesn't send the field
   * yet must keep rendering the legacy per-connection style radios (and
   * keep saving `video_style`) for at least one release window, so a
   * plugin that ships ahead of the cloud doesn't strand style editing.
   * `null` = the "no preset bound yet" edge state.
   */
  boundVisualPreset?: BoundVisualPresetSummary | null;
  /**
   * TTS provider availability (top-level on `channelsListConnections`),
   * video connections only — drives the voice picker's BYOK gating.
   * Absent (older cloud, one-release back-compat window) is treated like
   * `managed`: both provider groups selectable, no gate UI. A wire gap
   * must never lock voices away.
   */
  videoTts?: VideoTtsAvailability;
}

export const ConfigureConnectionModal = ({
  connection,
  open,
  onClose,
  videoQuota,
  boundVisualPreset,
  videoTts,
}: ConfigureConnectionModalProps) => {
  const isVideo = connection.integrationId === VIDEO_INTEGRATION_ID;
  // Once the cloud sends the digest (object OR null), the preset owns
  // video styling and this dialog goes read-only on it.
  const presetOwnsStyle = boundVisualPreset !== undefined;

  const [notificationLocale, setNotificationLocale] = useState<string>(
    connection.notificationLocale ?? "system",
  );
  const [boundCampaignIds, setBoundCampaignIds] = useState<
    (string | number)[] | null
  >(connection.boundCampaignIds ?? null);
  const [postCadenceN, setPostCadenceN] = useState<number>(
    connection.postCadenceN ?? 1,
  );
  // "Attach featured image" toggle — defaults to `true` for any
  // connection whose summary doc doesn't carry the field yet
  // (pre-2026-05-22 connections, fresh installs). Server normalizer
  // applies the same default on save, so the wire shape matches.
  const [attachFeaturedImage, setAttachFeaturedImage] = useState<boolean>(
    connection.attachFeaturedImage ?? true,
  );

  // Video voice — the stored value may be a legacy persona id ("ava"), a
  // bare OpenAI id, or canonical `provider:id`; resolve it so the picker
  // always holds a canonical catalog id (falling back to the Zephyr
  // default for pre-field docs / just-installed connections). The persona
  // label, when present, drives the one-time "Ava is now Nova" helper
  // under the field — it keys off the STORED value, so it stays visible
  // until the first save canonicalizes the doc (handoff §Closed trigger).
  const storedVoice = resolveStoredVideoVoice(connection.videoVoice);
  const [videoVoice, setVideoVoice] = useState<string>(storedVoice.option.id);
  const [videoStyle, setVideoStyle] = useState<string>(
    connection.videoStyle ?? DEFAULT_VIDEO_STYLE,
  );

  // The toggle only applies to integrations that actually upload an
  // image alongside the post (LinkedIn today). For everything
  // else — webhook-driven notifiers like Slack, Discord, IndexNow,
  // generic webhooks — the field is ignored on the cloud side too,
  // so we hide it here rather than render a control that does
  // nothing.
  const supportsFeaturedImage = connection.integrationId === "linkedin";

  // Notification language sets the copy language for NOTIFIER channels
  // (Slack/Discord/Telegram/email). A publishing channel like LinkedIn
  // renders the post in its own content language and ignores the field on the
  // cloud side ("notificationLocale is only meaningful on the webhook/notify
  // side today"), and video is generative — so neither shows the control.
  const supportsNotificationLocale =
    !isVideo && connection.integrationId !== "linkedin";

  // LinkedIn posting target. `availableOrganizations` is populated at connect
  // time only when the user granted company access — so the picker shows up
  // exclusively for connections that *can* post to a Page. Personal-only
  // connections (or any other integration) never see it.
  const linkedInMeta =
    connection.integrationId === "linkedin"
      ? (connection.externalAccountMeta as LinkedInMeta | undefined)
      : undefined;
  const availableOrgs = linkedInMeta?.availableOrganizations ?? [];
  const supportsTargetPicker = availableOrgs.length > 0;
  // Sentinel the cloud reads as "post to the personal profile". Kept in lockstep
  // with LINKEDIN_PERSONAL_TARGET in functions/.../connections.ts.
  const PERSONAL_TARGET = "personal";
  // "Personal profile" is only reachable when the connection carries a person
  // identity. Company-Page ("for page") connections come from the org OAuth
  // app, which isn't provisioned for openid/profile, so there's no person URN
  // and personal posting is impossible — hide the dead option and show a
  // Pages-only picker. Personal-app connections that also granted org access
  // keep both targets.
  const canPostPersonal = Boolean(linkedInMeta?.personUrn);
  const [postingTarget, setPostingTarget] = useState<string>(
    linkedInMeta?.organizationUrn ||
      (canPostPersonal
        ? PERSONAL_TARGET
        : (availableOrgs[0]?.organizationUrn ?? PERSONAL_TARGET)),
  );

  const { updateSettings, isSaving } = useChannelConnectionMutations();

  const handleSave = async () => {
    // ConnectionSummary.connectionId is optional on the wire to cover
    // pre-migration rows (no UUID). The modal is only opened for rows
    // with a real UUID — callers gate on `connection.connectionId` —
    // but TS doesn't know that, so the narrow lives here.
    if (!connection.connectionId) return;
    try {
      await updateSettings({
        connection_id: connection.connectionId,
        // Video isn't a notifier — it never renders the locale select, so
        // sending the untouched default would be noise on the wire (and
        // the cloud ignores it for video anyway). Omission = "leave
        // untouched" per the settings endpoint contract.
        ...(isVideo ? {} : { notification_locale: notificationLocale }),
        // Pass the bindings array verbatim — including an empty list
        // (which the cloud normalizes back to `null` = unbound). The
        // settings endpoint treats `undefined` as "leave untouched"
        // and `null` / `[]` as "clear binding," so being explicit
        // here makes the wire intent unambiguous.
        bound_campaign_ids: boundCampaignIds,
        post_cadence_n: postCadenceN,
        // Voice rides the wire ONLY for video connections — always the
        // canonical `provider:id` (the picker resolves legacy persona
        // values on open, and the cloud canonicalizes too); the cloud
        // validates the id against its own catalog. Style is only sent
        // while an older cloud still owns it per-connection — once the
        // boundVisualPreset digest arrives, styling lives on the visual
        // preset and this dialog stops writing it (handoff §3).
        ...(isVideo
          ? {
              video_voice: videoVoice,
              ...(presetOwnsStyle ? {} : { video_style: videoStyle }),
            }
          : {}),
        // Only forward the toggle for integrations that actually
        // use it. Omitting on others keeps the wire shape unchanged
        // for Slack/Discord/IndexNow/webhook-ping connections.
        ...(supportsFeaturedImage
          ? { attach_featured_image: attachFeaturedImage }
          : {}),
        // LinkedIn posting target — only forward when the picker is shown
        // (i.e. the connection can post to a Page). The cloud reads the
        // "personal" sentinel as "post to the personal profile" and any other
        // value as an org URN it validates against the administered Pages.
        ...(supportsTargetPicker
          ? { selected_organization_urn: postingTarget }
          : {}),
      });
      onClose();
    } catch (err) {
      // The mutation hook already toasts on failure; this is the
      // belt-and-braces path for callers that swallow the promise.
      if (err instanceof Error) toast.error(err.message);
    }
  };

  const localeOptions = NOTIFICATION_LOCALE_OPTIONS.map((opt) =>
    "labelKey" in opt
      ? { value: opt.value, label: __(opt.labelKey, "structura") }
      : { value: opt.value, label: opt.label },
  );

  // "Personal profile" first (only when the connection can actually post
  // there), then each Page the member administers. Page names come straight
  // from LinkedIn (not translatable); the personal option is our own label.
  const targetOptions = [
    ...(canPostPersonal
      ? [{ value: PERSONAL_TARGET, label: __("Personal profile", "structura") }]
      : []),
    ...availableOrgs.map((org) => ({
      value: org.organizationUrn,
      label: org.name || org.organizationUrn,
    })),
  ];

  const footerButtons = (
    <div className="flex shrink-0 flex-col-reverse gap-3 sm:flex-row">
      <Button
        variant="secondary"
        size="sm"
        onClick={onClose}
        disabled={isSaving}
      >
        {__("Cancel", "structura")}
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={() => {
          void handleSave();
        }}
        disabled={isSaving}
      >
        {isSaving
          ? __("Saving…", "structura")
          : __("Save settings", "structura")}
      </Button>
    </div>
  );

  return (
    <Dialog.Root open={open} onClose={onClose} size="md">
      <Dialog.Content>
        <button
          type="button"
          onClick={onClose}
          aria-label={__("Close", "structura")}
          className="absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-200"
        >
          <X size={16} />
        </button>
        <Dialog.Header>
          <Dialog.Title>
            {sprintf(
              /* translators: %s = integration display name, e.g. "LinkedIn". */
              __("Configure %s", "structura"),
              connection.displayName || connection.integrationId,
            )}
          </Dialog.Title>
          <Dialog.Description>
            {isVideo
              ? // Sets the fixed-format expectation up front — there is no
                // aspect-ratio control anywhere in the modal (handoff §2).
                __(
                  "Every published post becomes a 30–60 second vertical video (9:16) — ready to upload to YouTube Shorts or TikTok.",
                  "structura",
                )
              : __(
                  "Choose which campaigns this channel posts for and how often you’d like it to share. Changes apply to your next published post.",
                  "structura",
                )}
          </Dialog.Description>
        </Dialog.Header>
        <Dialog.Body>
          <div className="space-y-5">
            {isVideo && (
              <>
                <VideoVoiceSection
                  value={videoVoice}
                  onChange={setVideoVoice}
                  legacyPersonaLabel={storedVoice.legacyPersonaLabel}
                  legacyResolvedName={storedVoice.option.name}
                  videoTts={videoTts}
                />
                {presetOwnsStyle ? (
                  <BoundPresetStyleSummary digest={boundVisualPreset ?? null} />
                ) : (
                  // Back-compat (one release window): the cloud hasn't
                  // shipped the boundVisualPreset digest yet, so styling
                  // is still a per-connection setting — render today's
                  // radio section unchanged.
                  <VideoStyleSection value={videoStyle} onChange={setVideoStyle} />
                )}
              </>
            )}

            {supportsTargetPicker && (
              <Select
                value={postingTarget}
                onValueChange={(val) => setPostingTarget(String(val))}
                options={targetOptions}
              >
                <Select.Label>
                  {__("Posting target", "structura")}
                </Select.Label>
                <Select.Trigger
                  placeholder={__("Choose where to post…", "structura")}
                />
                <Select.Content className="w-(--button-width)">
                  {targetOptions.map((opt) => (
                    <Select.Item key={opt.value} value={opt.value}>
                      {opt.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            )}

            {/* Only notifier channels have a notification to localize. Video
                is a renderer (voiceover + captions follow each post's own
                language) and LinkedIn publishes the post verbatim in its own
                language, so the select is hidden for both. */}
            {supportsNotificationLocale && (
              <Select
                value={notificationLocale}
                onValueChange={(val) => setNotificationLocale(String(val))}
                options={localeOptions}
              >
                <Select.Label>
                  {__("Notification language", "structura")}
                </Select.Label>
                <Select.Trigger
                  placeholder={__("Choose a language…", "structura")}
                />
                <Select.Content className="w-(--button-width)">
                  {localeOptions.map((opt) => (
                    <Select.Item key={opt.value} value={opt.value}>
                      {opt.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            )}

            <div
              className={
                isVideo
                  ? "space-y-5 border-t border-neutral-200 pt-5 dark:border-neutral-700"
                  : "space-y-5"
              }
            >
              <CampaignBindingsPicker
                value={boundCampaignIds}
                onChange={setBoundCampaignIds}
              />

              <CadencePicker
                value={postCadenceN}
                onChange={setPostCadenceN}
                {...(isVideo
                  ? {
                      label: __("Render a video every Nth post", "structura"),
                      helper: __(
                        "Every published post gets a video while your monthly quota lasts.",
                        "structura",
                      ),
                    }
                  : {})}
              />
            </div>

            {supportsFeaturedImage && (
              <Switch
                label={__("Attach featured image", "structura")}
                description={__(
                  "When on, your post's featured image is uploaded alongside the social post. Turn this off to share a text-only update.",
                  "structura",
                )}
                checked={attachFeaturedImage}
                onChange={setAttachFeaturedImage}
              />
            )}
          </div>
        </Dialog.Body>
        {isVideo && videoQuota ? (
          // Video footer: quota meter left (decision context — "do I have
          // renders left this month?"), actions right. `items-end` keeps
          // the buttons baseline-aligned with the meter's bar; flex-wrap
          // lets the pair stack under German text expansion (<420px).
          <Dialog.Footer className="flex-wrap items-end sm:justify-between">
            <QuotaMeter
              used={videoQuota.used}
              total={videoQuota.cap}
              label={sprintf(
                /* translators: %1$d = videos used, %2$d = monthly cap. */
                __("%1$d of %2$d videos this month", "structura"),
                videoQuota.used,
                videoQuota.cap,
              )}
              barClassName="w-44"
            />
            {footerButtons}
          </Dialog.Footer>
        ) : (
          <Dialog.Footer>{footerButtons}</Dialog.Footer>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
};

// ---------------------------------------------------------------------------
// Video sections — grouped voice combobox with sample playback + style
// summary. Voice picker handoff: marketing/design_handoff_voice_picker.
// ---------------------------------------------------------------------------

/**
 * Owns the "one sample plays at a time" invariant for the whole modal:
 * starting any preview stops the previous one; a failed load/play stops
 * silently (samples may 404 until they're generated — that must never
 * toast or crash the modal, handoff decision #1).
 *
 * `voiceId` is the canonical `provider:id`; the sample URL's extension
 * follows the provider (OpenAI mp3, Gemini wav) via videoVoiceSampleUrl.
 */
function useVoicePreview() {
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = () => {
    const audio = audioRef.current;
    audioRef.current = null;
    setPlayingVoiceId(null);
    if (audio) {
      try {
        audio.pause();
      } catch {
        // jsdom / detached element — nothing to clean up.
      }
    }
  };

  // Stop playback when the modal unmounts so a 2s sample can't outlive
  // its UI (e.g. user saves mid-preview).
  useEffect(() => stop, []);

  const toggle = (voiceId: string) => {
    if (playingVoiceId === voiceId) {
      stop();
      return;
    }
    stop();
    const audio = new Audio(videoVoiceSampleUrl(voiceId));
    audioRef.current = audio;
    setPlayingVoiceId(voiceId);
    const clear = () => {
      // Only clear if this audio element is still the active one — a
      // stale onended from a superseded sample must not stop its successor.
      if (audioRef.current === audio) {
        audioRef.current = null;
        setPlayingVoiceId(null);
      }
    };
    audio.onended = clear;
    audio.onerror = clear;
    try {
      const maybePromise = audio.play();
      // Browsers return a promise; jsdom returns undefined. A rejection
      // (404 sample, autoplay policy) fails silently per the handoff.
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(clear);
      }
    } catch {
      clear();
    }
  };

  return { playingVoiceId, toggle };
}

/**
 * The 28px play/stop circle used on the voice trigger and in every menu
 * row. Rendered as a real sibling button (never inside the Select
 * trigger's a11y tree — `Select.Trigger`'s `trailingAdornment` handles
 * the positioning contract).
 */
function VoicePreviewButton({
  voiceName,
  playing,
  onToggle,
}: {
  voiceName: string;
  playing: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={playing}
      aria-label={
        playing
          ? __("Stop voice preview", "structura")
          : sprintf(
              /* translators: %s = voice name, e.g. "Ava". */
              __("Play sample of %s", "structura"),
              voiceName,
            )
      }
      onClick={(event) => {
        // Inside the listbox menu the row itself selects on click — the
        // preview must not change the selection or close the menu.
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      className={
        playing
          ? "flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition-all duration-fast ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:bg-brand-500"
          : "flex size-7 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 shadow-sm transition-all duration-fast ease-out hover:border-brand-300 hover:text-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:text-brand-300"
      }
    >
      {playing ? (
        <Square size={11} className="fill-current" aria-hidden />
      ) : (
        <Play size={11} className="ml-px fill-current" aria-hidden />
      )}
    </button>
  );
}

/**
 * Decorative 4-bar waveform beside the currently-previewing voice.
 * Pure ornament: `aria-hidden`, and the pulse is disabled under
 * `prefers-reduced-motion` (the bars stay visible, static).
 */
function VoiceWaveform() {
  return (
    <span className="ml-1 inline-flex items-end gap-[2px]" aria-hidden="true">
      {[7, 12, 9, 13].map((height, i) => (
        <span
          key={i}
          className="w-[3px] animate-pulse rounded-full bg-brand-500 motion-reduce:animate-none dark:bg-brand-400"
          style={{ height: `${height}px`, animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </span>
  );
}

/**
 * Provider display names for group headers and the trigger's mini-badge.
 * Proper nouns — deliberately untranslated (voice-picker handoff §i18n).
 */
const VIDEO_TTS_PROVIDER_LABELS: Record<VideoTtsProvider, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
};

/**
 * The wp-admin SPA is hash-routed, so the AI-keys surface (where BYOK
 * users connect OpenAI / Gemini credentials) lives at `#/ai-engine`.
 */
const AI_KEYS_ROUTE = "/ai-engine";

/**
 * Voice section — grouped two-provider combobox (voice-picker handoff).
 *
 * Gating (BYOK): `videoTts` absent (older cloud, one-release back-compat
 * window) or `managed` → both groups selectable, no gate UI. BYOK with
 * one provider missing → that group renders the locked header + teaser
 * row. BYOK with NO TTS-capable key → the whole field is replaced by the
 * blocking gate panel (no disabled dropdown to dead-end in); the rest of
 * the modal stays intact.
 *
 * `legacyPersonaLabel` / `legacyResolvedName` come from the STORED value
 * (not the live selection): while the connection still stores a persona
 * id ("ava"), the one-time reassurance helper renders under the field —
 * the first save canonicalizes the doc and the helper never comes back.
 */
function VideoVoiceSection({
  value,
  onChange,
  legacyPersonaLabel,
  legacyResolvedName,
  videoTts,
}: {
  value: string;
  onChange: (voiceId: string) => void;
  legacyPersonaLabel?: string;
  legacyResolvedName: string;
  videoTts?: VideoTtsAvailability;
}) {
  const { playingVoiceId, toggle } = useVoicePreview();
  // `value` is canonical by construction, but resolve defensively so an
  // unknown id from a newer cloud never blanks the trigger.
  const selected = resolveStoredVideoVoice(value).option;

  const providerUnlocked = (provider: VideoTtsProvider): boolean =>
    videoTts === undefined || videoTts.managed || videoTts.providers[provider];
  const fullyBlocked =
    !providerUnlocked("openai") && !providerUnlocked("gemini");

  const overline = (
    <span className="mb-2 block text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
      {__("Voice", "structura")}
    </span>
  );
  const helper = (
    <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
      {__("Voiceover and captions follow each post’s language.", "structura")}
    </p>
  );

  if (fullyBlocked) {
    // BYOK with no TTS-capable key: blocking gate panel instead of a
    // disabled dropdown a user could dead-end in (handoff §Tier gating).
    // The rest of the section stack renders unchanged around it.
    return (
      <div className="space-y-1.5">
        {overline}
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-neutral-300 px-3.5 py-3 dark:border-neutral-600">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400 dark:bg-white/[.06] dark:text-neutral-500">
            <KeyRound size={16} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="m-0! text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {__("Voiceover needs an AI key", "structura")}
            </p>
            <p className="m-0! mt-0.5! text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
              {sprintf(
                /* translators: %d = total number of available voices. "OpenAI" / "Gemini" are product names — do not translate them. */
                __(
                  "Videos are narrated with OpenAI or Gemini text-to-speech. Connect either key to choose from %d voices — video rendering stays paused until then.",
                  "structura",
                ),
                VIDEO_VOICE_CATALOG.length,
              )}
            </p>
          </div>
          <Button asChild variant="secondary" size="sm" className="shrink-0">
            {/* Link, not button — it navigates (same pattern as the
                visual-preset summary row). */}
            <Link to={AI_KEYS_ROUTE}>
              {__("Connect an AI key", "structura")}
              <ArrowRight size={13} className="ml-1" aria-hidden />
            </Link>
          </Button>
        </div>
        {helper}
      </div>
    );
  }

  const groups: ComboboxGroup[] = (["openai", "gemini"] as const).map(
    (provider) => {
      const voices = VIDEO_VOICE_CATALOG.filter((v) => v.provider === provider);
      const unlocked = providerUnlocked(provider);
      return {
        id: provider,
        label: VIDEO_TTS_PROVIDER_LABELS[provider],
        options: voices.map((voice) => ({
          id: voice.id,
          label: voice.name,
          // Descriptors are tone words — untranslated by the same rule as
          // the voice names (see @structura/types videoVoices.ts).
          description: voice.descriptor,
          ...(voice.id === DEFAULT_VIDEO_VOICE
            ? { badge: __("Default", "structura") }
            : {}),
          trailing: (
            <>
              {playingVoiceId === voice.id && <VoiceWaveform />}
              <VoicePreviewButton
                voiceName={voice.name}
                playing={playingVoiceId === voice.id}
                onToggle={() => toggle(voice.id)}
              />
            </>
          ),
        })),
        // Locked group: header (lock icon + full count) + teaser row
        // instead of options — never hidden (discovery), never selectable.
        ...(unlocked
          ? {}
          : {
              gate: {
                text: sprintf(
                  /* translators: %1$s = TTS provider name ("OpenAI" / "Gemini" — do not translate), %2$d = number of voices it unlocks. */
                  __(
                    "Connect a %1$s API key to unlock %2$d more voices.",
                    "structura",
                  ),
                  VIDEO_TTS_PROVIDER_LABELS[provider],
                  voices.length,
                ),
                cta: {
                  label: __("Open AI keys", "structura"),
                  // Plain href (the SPA is hash-routed) — the Combobox
                  // gate CTA is an anchor, not a router Link.
                  href: `#${AI_KEYS_ROUTE}`,
                },
              },
            }),
      };
    },
  );

  // Search placeholder counts only what the user can actually pick —
  // gated options are excluded from search anyway.
  const unlockedCount = groups.reduce(
    (n, group) => n + (group.gate ? 0 : group.options.length),
    0,
  );

  return (
    <div className="space-y-1.5">
      {overline}
      <Combobox
        value={selected.id}
        onChange={onChange}
        groups={groups}
        placeholder={sprintf(
          /* translators: %d = number of selectable voices. */
          __("Search %d voices…", "structura"),
          unlockedCount,
        )}
        footnote={__(
          "Samples are English; videos follow your post language.",
          "structura",
        )}
        noMatchesLabel={(query) =>
          sprintf(
            /* translators: %s = the search text that matched no voices. */
            __("No voices match “%s”", "structura"),
            query,
          )
        }
        clearSearchLabel={__("Clear search", "structura")}
        searchCountLabel={(matched, total) =>
          sprintf(
            /* translators: group-header count while searching. %1$d = matching voices, %2$d = total voices in the group. */
            __("%1$d of %2$d", "structura"),
            matched,
            total,
          )
        }
        leadingAdornment={
          <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-white/10 dark:text-neutral-400">
            {VIDEO_TTS_PROVIDER_LABELS[selected.provider]}
          </span>
        }
        trailingAdornment={
          <VoicePreviewButton
            voiceName={selected.name}
            playing={playingVoiceId === selected.id}
            onToggle={() => toggle(selected.id)}
          />
        }
        // Space on the keyboard-focused row toggles its sample (handoff
        // §A11y) — same one-at-a-time mechanics as the click path.
        onOptionAction={toggle}
      />
      {legacyPersonaLabel != null && (
        <p className="m-0! flex items-start gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          <Info
            size={13}
            className="mt-0.5 shrink-0 text-brand-500 dark:text-brand-400"
            aria-hidden
          />
          <span>
            {sprintf(
              /* translators: %1$s = the retired persona name (e.g. "Ava"), %2$s = the real voice name it maps to (e.g. "Nova"). */
              __(
                "Your voice ‘%1$s’ now appears under its real name, %2$s. It’s the same voice — nothing about your videos changes.",
                "structura",
              ),
              legacyPersonaLabel,
              legacyResolvedName,
            )}
          </span>
        </p>
      )}
      {helper}
    </div>
  );
}

/**
 * CSS-drawn mini 9:16 caption samples for the three presets — no image
 * assets, so they render crisp at any DPI in both modes and cost zero
 * bytes. Markup mirrors the handoff's `presetThumb()` snippets
 * (boards-modal.js); the prototype's striped placeholder texture becomes
 * a quiet neutral gradient standing in for the video frame.
 */
function PresetThumb({ presetId }: { presetId: string }) {
  if (presetId === "bold") {
    return (
      <span className="relative block h-full w-full bg-neutral-950">
        <span className="absolute inset-0 bg-gradient-to-b from-neutral-500/20 to-neutral-800/20" />
        <span className="absolute inset-x-1 bottom-2 text-center">
          {/* Caption samples are illustrative typography, not copy — kept
              untranslated on purpose (they preview a visual treatment). */}
          <span className="text-[10px] leading-none font-black tracking-tight text-amber-300 uppercase">
            GROWS
            <br />
            3× FASTER
          </span>
        </span>
      </span>
    );
  }
  if (presetId === "kinetic") {
    return (
      <span className="relative block h-full w-full bg-gradient-to-b from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800">
        <span className="absolute inset-x-1 bottom-2 flex flex-wrap justify-center gap-[3px]">
          <span className="rounded-sm bg-brand-600 px-1 py-0.5 text-[8px] leading-none font-extrabold text-white">
            3×
          </span>
          <span className="rounded-sm bg-neutral-950/80 px-1 py-0.5 text-[8px] leading-none font-bold text-white">
            faster
          </span>
        </span>
      </span>
    );
  }
  // clean (default)
  return (
    <span className="relative block h-full w-full bg-gradient-to-b from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800">
      <span className="absolute inset-x-2 bottom-2 flex justify-center">
        <span className="rounded-md bg-white/95 px-1.5 py-1 text-center text-[8px] leading-tight font-semibold text-neutral-900 shadow-sm">
          grows 3× faster
        </span>
      </span>
    </span>
  );
}

/**
 * Read-only "Visual style" summary fed by the bound-preset digest
 * (video-visuals handoff §3): palette tile · preset name + "— visual
 * preset" suffix · "Kinetic · Captions bottom · Brand palette" meta ·
 * "Edit in Visuals" deep link. Style/placement labels arrive
 * pre-resolved to effective render values, so what reads here is what
 * renders. `digest === null` = the dashed "no preset bound yet" edge
 * state (videos fall back to stock Clean until one is bound).
 */
function BoundPresetStyleSummary({
  digest,
}: {
  digest: BoundVisualPresetSummary | null;
}) {
  const overline = (
    <span className="mb-2 block text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
      {__("Visual style", "structura")}
    </span>
  );

  if (digest === null) {
    return (
      <div className="space-y-1.5">
        {overline}
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-neutral-300 px-3.5 py-3 dark:border-neutral-600">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400 dark:bg-white/[.06] dark:text-neutral-500">
            <Palette size={16} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="m-0! text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {__("No visual preset bound yet", "structura")}
            </p>
            <p className="m-0! mt-0.5! text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
              {__(
                "Bind a preset in Visuals to control how this site's videos look.",
                "structura",
              )}
            </p>
          </div>
          <Button asChild variant="secondary" size="sm" className="shrink-0">
            {/* Links, not buttons — they navigate (handoff a11y note). */}
            <Link to={VISUALS_VIDEO_ROUTE}>
              {__("Open Visuals", "structura")}
              <ArrowRight size={13} className="ml-1" aria-hidden />
            </Link>
          </Button>
        </div>
        <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
          {__("Until then, videos render with the stock Clean style.", "structura")}
        </p>
      </div>
    );
  }

  // Style names (Clean/Bold/Kinetic) are deliberately untranslated —
  // they're the preset's proper names (see videoChannel.ts i18n note);
  // the placement + palette segments translate.
  const placementLabel = {
    top: __("Captions top", "structura"),
    middle: __("Captions middle", "structura"),
    bottom: __("Captions bottom", "structura"),
  }[digest.captionPlacement];
  const meta = [
    videoStyleById(digest.videoStyle).name,
    placementLabel,
    digest.hasPalette ? __("Brand palette", "structura") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-1.5">
      {overline}
      <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50/70 px-3.5 py-3 dark:border-neutral-700 dark:bg-neutral-800/40">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Palette size={16} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="m-0! truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {digest.label}{" "}
            <span className="font-normal text-neutral-400 dark:text-neutral-500">
              {__("— visual preset", "structura")}
            </span>
          </p>
          <p className="m-0! mt-0.5! truncate text-xs text-neutral-500 dark:text-neutral-400">
            {meta}
          </p>
        </div>
        <Link
          to={VISUALS_VIDEO_ROUTE}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
        >
          {__("Edit in Visuals", "structura")}
          <ArrowRight size={13} aria-hidden />
        </Link>
      </div>
      <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
        {__("Video styling follows the visual preset bound to this site.", "structura")}
      </p>
    </div>
  );
}

function VideoStyleSection({
  value,
  onChange,
}: {
  value: string;
  onChange: (styleId: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="mb-2 block text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
        {__("Visual style", "structura")}
      </span>
      <PresetRadioCardGroup
        aria-label={__("Visual style", "structura")}
        value={value}
        onValueChange={onChange}
      >
        {VIDEO_STYLE_PRESETS.map((preset) => (
          <PresetRadioCard
            key={preset.id}
            value={preset.id}
            name={preset.name}
            description={preset.descriptor}
            thumbnail={<PresetThumb presetId={preset.id} />}
          />
        ))}
      </PresetRadioCardGroup>
      <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
        {__(
          "Presets set caption typography and transition feel. Fine-tuning arrives in a later release.",
          "structura",
        )}
      </p>
    </div>
  );
}
