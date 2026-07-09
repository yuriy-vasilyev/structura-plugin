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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { __ } from "@wordpress/i18n";
import { toast } from "@structura/ui";

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
}

export interface VisualContent {
  global_art_direction: string;
  aspect_ratio: string;
  format: string;
  optimize_on_upload: boolean;
  /** Rendering medium; absent ⇒ photography. */
  medium?: VisualMedium;
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

export function useVisualPresetMutations() {
  const queryClient = useQueryClient();

  // Re-fetch both the new presets query AND the legacy visual config
  // query — pages still rendering the legacy hook (e.g., logo helper)
  // need the cache to refresh after a mutation.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: presetsKey });
    queryClient.invalidateQueries({ queryKey: visualKeys.config() });
  };

  const create = useMutation({
    mutationFn: (data: CreatePresetInput) =>
      apiFetch<{ success: true; preset: VisualPresetWire; boundPresetId: string | null }>({
        path: "/structura/v1/visual-presets",
        method: "POST",
        data,
      }),
    onSuccess: () => {
      toast.success(__("Visual preset created.", "structura"));
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ preset_id, ...rest }: UpdatePresetInput) =>
      apiFetch<{ success: true; preset: VisualPresetWire }>({
        path: `/structura/v1/visual-presets/${encodeURIComponent(preset_id)}`,
        method: "POST",
        data: rest,
      }),
    onSuccess: () => {
      toast.success(__("Visual preset updated.", "structura"));
      invalidate();
    },
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
