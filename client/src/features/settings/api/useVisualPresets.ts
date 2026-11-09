/**
 * Visual presets — library + per-activation binding hooks.
 *
 * Mirrors `useCredentials` (portal) and `useProviderBindings` (plugin
 * AI Engine page) in shape: one query for the workspace library +
 * the calling site's binding, one mutation per write operation. The
 * `legacy` `useVisualQuery` / `useVisualMutations` stay for back-
 * compat with surfaces that still consume the flat singleton (the
 * magic-suggest section pulls `logo_url` off it, for example).
 */

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { __ } from "@wordpress/i18n";
import { isSupportedLocale } from "@structura/i18n-contracts";
import { toast } from "@structura/ui";
import {
  isSignatureId,
  normaliseHex,
  type SignatureId,
  type VisualSignatureChoice,
} from "@structura/visual-signatures";

import { useLicense } from "@/features/settings/api/useLicense";
import { visualKeys } from "./keys";

/** Rendering medium for generated images (picked on the Visuals page). */
export type VisualMedium = "photography" | "illustration" | "3d_render";

/** Video caption/motion style for the Video channel renderer. */
export type VideoStyleWire = "clean" | "bold" | "kinetic";

/** Vertical band the rendered video's captions occupy on the 9:16 canvas. */
export type CaptionPlacementWire = "top" | "middle" | "bottom";

export interface VisualPresetWire {
  presetId: string;
  workspaceId: string;
  label: string;
  globalArtDirection: string;
  aspectRatio: string;
  format: string;
  optimizeOnUpload: boolean;
  /** Rendering medium; cloud defaults an absent value to photography. */
  medium: VisualMedium;
  /**
   * Stamp the EU "AI GENERATED" pill on generated images
   * (specs/ai-image-label.md). The cloud sends `false` when unset; optional
   * because functions deployed before 2026-10-05 do not send it.
   */
  aiLabel?: boolean;
  /**
   * Video style (video-visuals handoff, 2026-07). Optional for at least
   * one release window: presets written before the move carry no video
   * fields, and the renderer defaults an absent value to `"clean"`.
   */
  videoStyle?: VideoStyleWire;
  /**
   * Motion/footage/pacing art direction for rendered videos. Sibling of
   * `globalArtDirection` — the two are NEVER merged. Optional on read
   * (same rollout window as {@link videoStyle}).
   */
  videoArtDirection?: string;
  /** Caption band position; renderer defaults an absent value to `"bottom"`. */
  captionPlacement?: CaptionPlacementWire;
  /**
   * Caption-accent colour mode. Reserved enum — only `"auto"` ships
   * (accents derive from {@link palette}); absent means `"auto"`.
   */
  paletteCaptions?: "auto";
  /**
   * Brand palette extracted by the visual suggest pass — `#RRGGBB`
   * strings, FIRST entry is the accent caption art uses. Absent on
   * presets saved before the suggest pass learned to extract it.
   */
  palette?: string[];
  /**
   * Visual signature (specs/visual-signatures.md §4): a library style or the
   * user's own. Absent on a free-prompt preset, and from functions deployed
   * before 2026-11-09.
   */
  signature?: VisualSignatureChoice;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Number of activations under the workspace bound to this preset. */
  boundActivationCount: number;
}

export interface VisualPresetsResponse {
  success: true;
  boundPresetId: string | null;
  presets: VisualPresetWire[];
  /**
   * The activation's stored thin-pass result (specs/visual-signatures.md §6).
   * Absent until a pass has run for the site, and from functions deployed
   * before 2026-11-09; the plugin proxy forwards it as the cloud sends it.
   */
  visualSuggestion?: StoredVisualSuggestionWire;
}

/** The thin pass's last result as the preset list carries it, stored on the activation. */
export interface StoredVisualSuggestionWire {
  /** Library id of the pick. */
  pick: string;
  /** Library id of the next best. */
  runnerUp: string;
  /** One sentence on why the pick suits the brand. */
  reason: string;
  /** Brand colours, accent first. */
  palette: string[];
  /** When the pass ran, ISO 8601. */
  at: string;
}

export interface VisualContent {
  global_art_direction: string;
  aspect_ratio: string;
  format: string;
  optimize_on_upload: boolean;
  /** Rendering medium; absent ⇒ photography. */
  medium?: VisualMedium;
  /**
   * EU AI label switch. The plugin proxy (`sanitize_visual_content`)
   * forwards it to the cloud as `aiLabel`, only when it is a real boolean.
   * Absent: the preset keeps its stored value.
   */
  ai_label?: boolean;
  /**
   * Video styling (video-visuals handoff, 2026-07). All four keys are
   * optional AND omitted entirely when the caller has nothing to say —
   * the plugin proxy + cloud only touch keys that are present, so an
   * older build (or an ineligible plan whose Video section never
   * rendered) can't clobber a preset's saved video styling with
   * defaults during the rollout window.
   */
  video_style?: VideoStyleWire;
  video_art_direction?: string;
  caption_placement?: CaptionPlacementWire;
  /** `#RRGGBB` strings; first entry is the caption accent. */
  palette?: string[];
  /**
   * Visual signature (specs/visual-signatures.md §4). `null` clears it back to
   * the free prompt on update; omitted keeps the stored one. The plugin proxy
   * forwards it only when sent, so builds before 2026-11-09 never touch it.
   */
  signature?: VisualSignatureChoice | null;
}

const presetsKey = ["visual-presets"] as const;

export function useVisualPresetsQuery() {
  const { hasUsableLicense, isLicensed } = useLicense();
  return useQuery({
    queryKey: presetsKey,
    queryFn: () =>
      apiFetch<VisualPresetsResponse>({ path: "/structura/v1/visual-presets" }),
    // `isLicensed` (plan !== "none") mirrors the VisualsPage locked-teaser
    // gate so a plan-"none" install that still carries a license_key
    // doesn't fire this fetch under the teaser and surface a stray
    // "Cookie check failed" toast (Yurii 2026-07-09). See useVisualQuery.
    enabled: hasUsableLicense === true && isLicensed,
    staleTime: 1000 * 60 * 2,
  });
}

interface CreatePresetInput {
  label: string;
  content: VisualContent;
  bind_to_activation?: boolean;
}

interface UpdatePresetInput {
  preset_id: string;
  label?: string;
  content?: VisualContent;
}

interface ForkPresetInput {
  preset_id: string;
  label?: string;
  bind_to_activation?: boolean;
}

interface BindPresetInput {
  preset_id: string | null;
}

/**
 * Whether a REST error is the cloud refusing a visual signature the plan
 * doesn't include: 403 `plan_gated` from a preset save, 403
 * `permission-denied` from a preview. The plugin proxy forwards the cloud's
 * code under `data.code`.
 */
export function isPlanGatedError(err: unknown): boolean {
  const data = (err as { data?: { status?: unknown; code?: unknown } } | null)?.data;
  return data?.status === 403 && (data.code === "plan_gated" || data.code === "permission-denied");
}

/** The toast for a failed preset save: the plan gate's own line, else the generic one. */
function saveErrorToast(err: unknown) {
  if (isPlanGatedError(err)) {
    toast.error(__("That style comes with paid plans.", "structura"));
    return;
  }
  const message =
    err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? err);
  toast.error(`${__("Action Failed:", "structura")} ${message}`);
}

export function useVisualPresetMutations() {
  const queryClient = useQueryClient();

  // Re-fetch both the new presets query AND the legacy visual config
  // query — pages still rendering the legacy hook (e.g., logo helper)
  // need the cache to refresh after a mutation.
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: presetsKey }),
      queryClient.invalidateQueries({ queryKey: visualKeys.config() }),
    ]);

  // Saves toast their own errors: a refused signature (the plan gate, spec
  // §7) gets its own line instead of the global "Action Failed: …".
  const create = useMutation({
    mutationFn: (data: CreatePresetInput) =>
      apiFetch<{ success: true; preset: VisualPresetWire; boundPresetId: string | null }>({
        path: "/structura/v1/visual-presets",
        method: "POST",
        data,
      }),
    meta: { silentError: true },
    // Returned, so `create()` resolves after the refetch: the Visuals page
    // re-seeds its draft right after a save and must read the saved preset.
    onSuccess: () => {
      toast.success(__("Visual preset created.", "structura"));
      return invalidate();
    },
    onError: saveErrorToast,
  });

  const update = useMutation({
    mutationFn: ({ preset_id, ...rest }: UpdatePresetInput) =>
      apiFetch<{ success: true; preset: VisualPresetWire }>({
        path: `/structura/v1/visual-presets/${encodeURIComponent(preset_id)}`,
        method: "POST",
        data: rest,
      }),
    meta: { silentError: true },
    onSuccess: () => {
      toast.success(__("Visual preset updated.", "structura"));
      return invalidate();
    },
    onError: saveErrorToast,
  });

  const fork = useMutation({
    mutationFn: ({ preset_id, ...rest }: ForkPresetInput) =>
      apiFetch<{ success: true; preset: VisualPresetWire; boundPresetId: string | null }>({
        path: `/structura/v1/visual-presets/${encodeURIComponent(preset_id)}/fork`,
        method: "POST",
        data: rest,
      }),
    onSuccess: () => {
      toast.success(__("Preset forked for this site.", "structura"));
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (preset_id: string) =>
      apiFetch<{ success: true }>({
        path: `/structura/v1/visual-presets/${encodeURIComponent(preset_id)}`,
        method: "DELETE",
      }),
    onSuccess: () => {
      toast.success(__("Visual preset deleted.", "structura"));
      invalidate();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    },
  });

  const bind = useMutation({
    mutationFn: (data: BindPresetInput) =>
      apiFetch<{ success: true; boundPresetId: string | null }>({
        path: "/structura/v1/visual-presets/bind",
        method: "POST",
        data,
      }),
    onSuccess: () => {
      toast.success(__("Bound visual preset for this site.", "structura"));
      invalidate();
    },
  });

  return {
    create: create.mutateAsync,
    update: update.mutateAsync,
    fork: fork.mutateAsync,
    remove: remove.mutateAsync,
    bind: bind.mutateAsync,
    isCreating: create.isPending,
    isUpdating: update.isPending,
    isForking: fork.isPending,
    isRemoving: remove.isPending,
    isBinding: bind.isPending,
  };
}

// ─── Visual signatures: thin suggest pass and preview ─────────────────────

/** A thin-pass result (specs/visual-signatures.md §6), checked: library ids, `#RRGGBB` colours. */
export interface VisualSignatureSuggestion {
  /** The library signature picked for the brand. */
  pick: SignatureId;
  /** The next best one, when the cloud sent a valid id. */
  runnerUp: SignatureId | null;
  /** One sentence in the admin's language on why the pick suits the brand. */
  reason: string;
  /** Brand colours read from the homepage, accent first; may be empty. */
  palette: string[];
}

/** `POST /structura/v1/visual-signature/suggest` as the cloud answers it. */
interface SuggestVisualSignatureWire {
  suggestion: { pick?: unknown; runnerUp?: unknown; reason?: unknown; palette?: unknown } | null;
  homepageRead?: boolean;
  reason?: string;
}

/** Most colours the thin pass returns, and the palette field holds (handoff §3.4). */
const SUGGESTION_PALETTE_MAX = 6;

const suggestionKey = ["visual-signature-suggestion"] as const;

/** A wire or stored suggestion as a {@link VisualSignatureSuggestion}, or null when it names no library pick. */
export function readVisualSuggestion(
  raw: SuggestVisualSignatureWire["suggestion"] | StoredVisualSuggestionWire | undefined
): VisualSignatureSuggestion | null {
  if (!raw || !isSignatureId(raw.pick)) return null;
  const palette = Array.isArray(raw.palette)
    ? raw.palette
        .map(normaliseHex)
        .filter((hex): hex is string => hex !== null)
        .slice(0, SUGGESTION_PALETTE_MAX)
    : [];
  return {
    pick: raw.pick,
    runnerUp: isSignatureId(raw.runnerUp) ? raw.runnerUp : null,
    reason: typeof raw.reason === "string" ? raw.reason : "",
    palette,
  };
}

/** The admin's language for the reason sentence, when the cloud supports it. */
function suggestionLocale(): string | undefined {
  const lang = typeof document === "undefined" ? "" : document.documentElement.lang;
  const base = lang.toLowerCase().split(/[-_]/)[0];
  return isSupportedLocale(base) ? base : undefined;
}

/**
 * Runs the thin suggest pass (pick, reason, palette), which the cloud also
 * stores on the activation. The result is cached for this page load, and the
 * preset list is refetched before the call resolves, so the stored value
 * {@link useVisualSignatureSuggestion} prefers is the new one. Callers show
 * their own errors.
 */
export function useSuggestVisualSignatureMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const locale = suggestionLocale();
      const response = await apiFetch<SuggestVisualSignatureWire>({
        path: "/structura/v1/visual-signature/suggest",
        method: "POST",
        data: locale ? { locale } : {},
      });
      return readVisualSuggestion(response?.suggestion);
    },
    meta: { silentError: true },
    onSuccess: (suggestion) => {
      queryClient.setQueryData(suggestionKey, suggestion);
      // Returned, so a Re-scan resolves once the list carries the new pick.
      return queryClient.invalidateQueries({ queryKey: presetsKey });
    },
    // A failed pass counts as "nothing found", so the auto-run doesn't repeat
    // on every visit within the page load.
    onError: () => {
      if (queryClient.getQueryData(suggestionKey) === undefined) {
        queryClient.setQueryData(suggestionKey, null);
      }
    },
  });
}

/**
 * The suggestion known for this site: the one stored on the activation when
 * the preset list carries it (`stored`), else the last pass this page load
 * ran. `undefined` when there is neither, `null` when the last pass found no
 * pick. The result keeps its identity while its source does.
 */
export function useVisualSignatureSuggestion(
  stored: StoredVisualSuggestionWire | undefined
): VisualSignatureSuggestion | null | undefined {
  const { data } = useQuery<VisualSignatureSuggestion | null>({
    queryKey: suggestionKey,
    // Never fetched: only a suggest call writes this entry.
    queryFn: () => Promise.resolve(null),
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const fromList = useMemo(() => readVisualSuggestion(stored), [stored]);
  return fromList ?? data;
}

/** Body of `POST /structura/v1/visual-signature/preview`: the unsaved choice and palette. */
export interface PreviewVisualSignatureInput {
  /** The choice as a save sends it; `null` previews the free prompt. */
  signature: VisualSignatureChoice | null;
  /** The free prompt, read only when `signature` is null. */
  global_art_direction?: string;
  /** The free prompt's stored medium. */
  medium?: VisualMedium;
  /** `#RRGGBB` brand colours, accent first; empty renders the neutral set. */
  palette: string[];
}

/** A rendered preview: the image and the concept it shows. */
export interface PreviewVisualSignatureResult {
  /** The rendered sample, rehosted by the cloud. */
  imageUrl: string;
  /** The test-board concept the sample shows; also its alt text. */
  concept: string;
}

/**
 * "Preview with my colours": renders one sample image of the unsaved choice
 * (counts one image). Paid plans only; failures are shown inline by the caller.
 */
export function usePreviewVisualSignatureMutation() {
  return useMutation({
    mutationFn: (input: PreviewVisualSignatureInput) =>
      apiFetch<{ success: true } & PreviewVisualSignatureResult>({
        path: "/structura/v1/visual-signature/preview",
        method: "POST",
        data: input,
      }),
    meta: { silentError: true },
  });
}
