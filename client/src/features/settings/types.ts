export interface LicenseData {
  is_pro: boolean;
  is_licensed: boolean;
  plan: string;
  /**
   * Workspace audience ("individual" / "agency") cached by the plugin
   * at activation / heartbeat time so the plan badge can compose its
   * full label ("Cloud Individual") on first paint — before this the
   * audience only arrived with the cloud heartbeat, flashing the
   * name-only label for a few seconds on every load. Optional for one
   * release window (plugin builds predating 2026-06-07 omit it) and
   * null until a cloud that ships the field has been heard from; the
   * cloud heartbeat stays authoritative client-side.
   */
  audience?: string | null;
  license_key: string;
  upgrade_url: string;
  /**
   * Per-activation campaign cap as cached by the plugin from the
   * cloud's activation / heartbeat responses. `null` = unlimited.
   * Absent on older plugin builds (pre-rollout) — consumers fall
   * back to `getMaxCampaignsForTier(plan)` in that case.
   */
  max_campaigns?: number | null;
  /**
   * Tier-derived provider count cap (1 none / 2 free / 3 paid).
   * Mirrors `structuraConfig.provider_count_cap`, but unlike that
   * page-render snapshot it travels on the settings query — so it
   * re-derives reactively after an in-SPA license activation.
   * Optional for one release window (plugin builds predating
   * 2026-06-06 omit it); `useLicense` falls back to the
   * `structuraConfig` snapshot when absent.
   */
  provider_count_cap?: number;
  /**
   * True when the workspace is anonymous (post-bootstrap, pre-claim).
   * Same reactive-vs-snapshot story as `provider_count_cap` above —
   * mirrors `structuraConfig.is_anonymous` with the same fallback.
   */
  is_anonymous?: boolean;
}

/**
 * Unified Settings Schema to match Structura_REST_API
 */
export interface UnifiedSettings {
  license: LicenseData | null;
  general: {
    delete_data_on_uninstall: boolean;
    // `log_retention_enabled` / `log_retention_days` removed in Phase 3b
    // (spec/v2/notification-center.md §8.1). The cloud-canonical
    // Notification Center replaces the user-facing role of the
    // retired wp_structura_logs table.
    // Debug mode field retired post-Phase-3b — the toggle had no
    // remaining job between admin incidents (staff) + the user-
    // facing Notification Center + per-failure emails. Older
    // plugin builds may still emit `debug_mode` on the wire; the
    // SPA simply ignores it now.
  };
  ai: {
    /** Per-provider status, keyed by provider ID (openai, gemini, etc.) */
    providers: {
      [providerId: string]: {
        connected: boolean;
        masked_key: string;
        capabilities: Array<"text" | "image">;
        text_model: string;
        image_model: string;
      };
    };
    /** Provider catalog — structural metadata (capabilities, min_tier, key_url, etc.) */
    catalog: {
      [providerId: string]: {
        id: string;
        name: string;
        capabilities: Array<"text" | "image">;
        min_tier: string;
        key_prefix?: string;
        key_url: string;
        description: string;
        schema_mode: "strict" | "prompt_guided";
      };
    };
    /** Default provider selections for new campaigns. */
    defaults: {
      text_provider: string;
      image_provider: string;
    };
    /** Whether the user has at least one connected text provider. */
    has_text: boolean;
    /** Whether the user has at least one connected image provider. */
    has_image: boolean;
    /** True when the model catalog came from the bundled fallback (cloud unreachable). */
    models_fallback: boolean;
  };
  onboarding_dismissed: boolean;
  free_banner_dismissed: boolean;
  scheduler_simple_mode: boolean;
}

/**
 * The user-toggleable subset of SEO rules.
 *
 * Almost all SEO optimisations (readability, keyphrase placement, SERP
 * analysis, meta generation, link validation) are now always-on server-side,
 * driven by license tier. The rules that remain toggleable here are the ones
 * that change the *shape* of the post — FAQ, Action Steps, statistics,
 * numbers in titles, and link strategy — where user choice is meaningful.
 *
 * The authoritative list lives in
 * `plugin/includes/Core/SEO_Rules_Registry.php` and is fetched via
 * `/structura/v1/settings/seo-rules`. This union must stay in sync with it.
 */
export type SeoRuleName =
  | "include_faq_section"
  | "include_action_steps"
  | "include_statistics"
  | "number_in_title"
  | "internal_link_optimization"
  | "outbound_link_authority"
  | "eeat_signals"
  | "entity_coverage";

export type SeoOptimizationRules = {
  [key in SeoRuleName]: boolean;
};

/**
 * UNIFIED SCHEMA INTERFACES
 */
export interface GeneralSettings {
  delete_data_on_uninstall: boolean;
  // log_retention_* + debug_mode_enabled removed alongside the
  // Notification Center work — the in-memory log buffer the
  // Debug-mode toggle previously gated is no longer needed.
}

export interface VisualConfig {
  global_art_direction: string;
  aspect_ratio: string;
  format: string;
  optimize_on_upload: boolean;
  logo_url?: string;
}

export type SUPPORTED_BLOCK_TYPE =
  | "core/paragraph"
  | "core/heading"
  | "core/list"
  | "core/quote"
  | "core/table"
  | "core/code"
  | "core/pullquote"
  | "core/details";

export interface ContentBlock {
  name: SUPPORTED_BLOCK_TYPE;
  label: string;
  isPro: boolean;
  isRequired?: boolean;
  /**
   * Excluded from the default `enabledBlocks` of a new campaign — the user
   * opts in instead. For niche blocks (code) most blogs can't fill by
   * nature; defaulting them on makes the AI force-fit content.
   */
  defaultOff?: boolean;
  description?: string;
}
