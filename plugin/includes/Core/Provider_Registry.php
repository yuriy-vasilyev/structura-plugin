<?php

namespace Structura\Core;

use Structura\Core\Cloud_Client;
use Structura\Core\License_Manager;
use Structura\Core\Log_Service;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Central registry for AI providers, their capabilities, tier access,
 * and curated model lists.
 *
 * Replaces Model_Registry. Model data is fetched from a remote endpoint
 * (served by Structura Cloud) and cached locally with a fallback to
 * bundled defaults if the remote is unreachable.
 *
 * Tier handling:
 * - Providers have a `min_tier` that gates access.
 * - On tier downgrades (e.g. pro → free), providers above the new tier
 *   become unavailable. Campaigns referencing them will gracefully skip
 *   those capabilities rather than fail outright.
 * - The `validate_provider_access()` method is the single checkpoint
 *   used by Rest_Api, Task_Runner, and campaign validation.
 */
class Provider_Registry
{
    /**
     * Transient key for cached remote model data.
     */
    private const MODELS_CACHE_KEY = 'structura_remote_models';

    /**
     * How long to cache remote model data (in seconds). 12 hours.
     */
    private const MODELS_CACHE_TTL = 43200;

    /**
     * In-memory cache so multiple calls within a single PHP request
     * (e.g., get_default_model for each provider) don't repeat the fetch.
     */
    private static ?array $models_memo = null;

    /**
     * Whether the model catalog is using the bundled fallback
     * because the remote endpoint was unreachable.
     * Exposed via get_settings() so the UI can show a notice.
     */
    private static bool $using_fallback = false;

    /**
     * Tier hierarchy — index determines access level.
     * A user at tier index N can access providers with min_tier at index ≤ N.
     */
    private const TIER_HIERARCHY = [
        'none'   => 0,
        'free'   => 1,
        'byok'    => 2,
        'cloud'  => 2,    // Same access as pro (pro features + managed keys)
        'cloud_pro' => 3,
    ];

    /**
     * Provider catalog — structural metadata that rarely changes.
     * This IS hardcoded because it defines what adapters exist in the codebase.
     * Adding a new provider means adding code (adapter classes) anyway,
     * so a catalog entry here is part of that same change.
     *
     * Model lists (what changes often) come from the remote endpoint.
     */
    private static function get_catalog(): array
    {
        return [
            'openai' => [
                'id'           => 'openai',
                'name'         => 'OpenAI',
                'capabilities' => ['text', 'image'],
                'min_tier'     => 'none',
                'key_prefix'   => 'sk-',
                'key_url'      => 'https://platform.openai.com/api-keys',
                'description'  => 'GPT models for text generation, DALL-E and GPT Image for images.',
                'schema_mode'  => 'strict',
            ],
            'gemini' => [
                'id'           => 'gemini',
                'name'         => 'Google Gemini',
                'capabilities' => ['text', 'image'],
                // Phase 1.8: Gemini becomes pickable at `none` tier
                // alongside OpenAI. The SPA enforces a count cap of 1
                // for `none` users (only one provider active at a
                // time; user picks which) so this isn't a free
                // upgrade — just gives anonymous users the same
                // OpenAI-or-Gemini choice free users get, capped to 1.
                // Spec: `specs/v2/multi-tenant-and-public-api.md`
                // §Phase 1.8 feature matrix.
                'min_tier'     => 'none',
                'key_url'      => 'https://aistudio.google.com/apikey',
                'description'  => 'Gemini models for text generation, Imagen for images.',
                'schema_mode'  => 'strict',
            ],
            'anthropic' => [
                'id'           => 'anthropic',
                'name'         => 'Anthropic Claude',
                'capabilities' => ['text'],
                'min_tier'     => 'byok',
                'key_prefix'   => 'sk-ant-',
                'key_url'      => 'https://console.anthropic.com/settings/keys',
                'description'  => 'Claude models for nuanced, high-quality text generation.',
                'schema_mode'  => 'strict',
            ],
        ];
    }

    // ─── Provider Catalog Queries ──────────────────────────────────

    /**
     * All registered providers with full metadata.
     */
    public static function get_all_providers(): array
    {
        return self::get_catalog();
    }

    /**
     * Single provider metadata by ID.
     */
    public static function get_provider(string $provider_id): ?array
    {
        return self::get_catalog()[$provider_id] ?? null;
    }

    /**
     * Providers accessible at the given plan tier.
     * If no tier specified, uses the current user's plan.
     */
    public static function get_providers_for_tier(?string $plan = null): array
    {
        $plan  = $plan ?? License_Manager::get_plan();
        $level = self::TIER_HIERARCHY[$plan] ?? 0;

        return array_filter(self::get_catalog(), function ($provider) use ($level) {
            $required = self::TIER_HIERARCHY[$provider['min_tier']] ?? 0;
            return $level >= $required;
        });
    }

    /**
     * Providers that support a specific capability, filtered by tier.
     *
     * @param string      $capability 'text' or 'image'
     * @param string|null $plan       Plan tier, or null for current user's plan.
     */
    public static function get_providers_by_capability(string $capability, ?string $plan = null): array
    {
        return array_filter(self::get_providers_for_tier($plan), function ($provider) use ($capability) {
            return in_array($capability, $provider['capabilities'], true);
        });
    }

    // ─── Tier Validation ───────────────────────────────────────────

    /**
     * Single checkpoint: can this user use this provider?
     *
     * Used by Rest_Api (before executing suggestions/generation),
     * Task_Runner (before running campaigns), and campaign validation
     * (before saving provider selections).
     *
     * @param string      $provider_id The provider to check.
     * @param string|null $plan        Plan tier, or null for current user's plan.
     *
     * @return bool
     */
    public static function validate_provider_access(string $provider_id, ?string $plan = null): bool
    {
        $provider = self::get_provider($provider_id);
        if ( ! $provider) {
            return false;
        }

        $plan  = $plan ?? License_Manager::get_plan();
        $level = self::TIER_HIERARCHY[$plan] ?? 0;
        $required = self::TIER_HIERARCHY[$provider['min_tier']] ?? 0;

        return $level >= $required;
    }

    /**
     * Validate a campaign's provider selections against a tier.
     * Returns an array of issues (empty = all good).
     *
     * Designed for:
     * 1. Campaign save validation — reject invalid selections.
     * 2. Tier downgrade audits — find campaigns that need attention.
     * 3. Task_Runner pre-flight — skip gracefully if provider lost.
     *
     * @param array       $intelligence Campaign intelligence config.
     * @param string|null $plan         Plan tier, or null for current.
     *
     * @return array{text_ok: bool, image_ok: bool, issues: string[]}
     */
    public static function validate_campaign_providers(array $intelligence, ?string $plan = null): array
    {
        $plan   = $plan ?? License_Manager::get_plan();
        $result = ['text_ok' => true, 'image_ok' => true, 'issues' => []];

        // Text provider check
        $text_provider = $intelligence['textProvider'] ?? null;
        if ($text_provider && ! self::validate_provider_access($text_provider, $plan)) {
            $result['text_ok']  = false;
            $provider           = self::get_provider($text_provider);
            $result['issues'][] = sprintf(
                'Text provider "%s" requires %s tier or higher.',
                $provider['name'] ?? $text_provider,
                $provider['min_tier'] ?? 'unknown'
            );
        }

        // Text provider must also be connected on this site —
        // "connected" means there's an aiBindings entry on the cloud
        // activation doc (Phase 5c of cloud-only-generation.md).
        $bindings = Cloud_Client::get_provider_bindings();
        if ($text_provider && $result['text_ok'] && ! isset($bindings[$text_provider])) {
            $result['text_ok']  = false;
            $result['issues'][] = sprintf(
                'Text provider "%s" is not connected. Please add your API key.',
                self::get_provider($text_provider)['name'] ?? $text_provider,
            );
        }

        // Image provider check (optional — campaigns can run without images)
        $image_provider = $intelligence['imageProvider'] ?? null;
        if ($image_provider) {
            if ( ! self::validate_provider_access($image_provider, $plan)) {
                $result['image_ok'] = false;
                $provider           = self::get_provider($image_provider);
                $result['issues'][] = sprintf(
                    'Image provider "%s" requires %s tier or higher. Images will be skipped.',
                    $provider['name'] ?? $image_provider,
                    $provider['min_tier'] ?? 'unknown'
                );
            } elseif ( ! isset($bindings[$image_provider])) {
                $result['image_ok'] = false;
                $result['issues'][] = sprintf(
                    'Image provider "%s" is not connected. Images will be skipped.',
                    self::get_provider($image_provider)['name'] ?? $image_provider,
                );
            }
        } else {
            $result['image_ok'] = false; // No image provider set — not an error, just disabled.
        }

        return $result;
    }

    // ─── Connection State ──────────────────────────────────────────

    /**
     * All providers that are bound on this activation in the cloud.
     * Filtered by tier — a binding for a provider above the user's
     * tier doesn't count.
     *
     * Phase 5c — "connected" means the cloud's `aiBindings` map on
     * the activation doc carries an entry for the provider, not that
     * `wp_options` has a `structura_key_*` row. The plugin no longer
     * stores keys locally.
     */
    public static function get_connected_providers(?string $plan = null): array
    {
        $accessible = self::get_providers_for_tier($plan);
        $bindings   = Cloud_Client::get_provider_bindings();

        return array_filter($accessible, function ($provider) use ($bindings) {
            return isset($bindings[$provider['id']]);
        });
    }

    /**
     * Is at least one text-capable provider connected and accessible?
     */
    public static function has_text_provider(?string $plan = null): bool
    {
        $connected = self::get_connected_providers($plan);

        foreach ($connected as $provider) {
            if (in_array('text', $provider['capabilities'], true)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Is at least one image-capable provider connected and accessible?
     */
    public static function has_image_provider(?string $plan = null): bool
    {
        $connected = self::get_connected_providers($plan);

        foreach ($connected as $provider) {
            if (in_array('image', $provider['capabilities'], true)) {
                return true;
            }
        }

        return false;
    }

    // ─── Model Registry (Remote + Cache) ───────────────────────────

    /**
     * Get available models for a provider and capability.
     *
     * @param string $provider_id Provider identifier.
     * @param string $capability  'text' or 'image'.
     *
     * @return array List of model objects [{id, name, default?, fast?, warning?}]
     */
    public static function get_models(string $provider_id, string $capability): array
    {
        $all_models = self::get_remote_models();
        $provider_models = $all_models[$provider_id] ?? [];

        return $provider_models[$capability] ?? [];
    }

    /**
     * Get the default model for a provider + capability.
     *
     * @param string $provider_id Provider identifier.
     * @param string $role        'text', 'fast', or 'image'.
     *
     * @return string Model ID, or empty string if not found.
     */
    public static function get_default_model(string $provider_id, string $role): string
    {
        $all_models = self::get_remote_models();
        $provider_data = $all_models[$provider_id] ?? [];

        // Look in defaults map first
        if (isset($provider_data['defaults'][$role])) {
            return $provider_data['defaults'][$role];
        }

        // Fallback: first model in the matching capability list
        $capability = ($role === 'fast') ? 'text' : $role;
        $models = $provider_data[$capability] ?? [];

        foreach ($models as $model) {
            if ($role === 'fast' && ! empty($model['fast'])) {
                return $model['id'];
            }
            if ($role !== 'fast' && ! empty($model['default'])) {
                return $model['id'];
            }
        }

        return $models[0]['id'] ?? '';
    }

    /**
     * Get the full manifest (endpoint, sizes, etc.) for a specific model.
     * Used by adapters to know HOW to call the API for a given model.
     */
    public static function get_model_manifest(string $model_id): ?array
    {
        $all_models = self::get_remote_models();

        foreach ($all_models as $provider_data) {
            if (isset($provider_data['manifest'][$model_id])) {
                return $provider_data['manifest'][$model_id];
            }
        }

        // Fallback to bundled models.json if remote doesn't have it
        return self::get_fallback_manifest($model_id);
    }

    /**
     * Fetch the curated model catalog from Structura Cloud.
     *
     * Strategy:
     *  1. In-memory memo (same PHP request)  → instant
     *  2. WordPress transient (cross-request) → fast
     *  3. Cloud HTTP fetch                    → slow, one attempt
     *  4. Bundled models.json fallback        → offline-safe
     *
     * On cloud failure the fallback is cached for the FULL TTL so we
     * never retry automatically. The user can force a refresh via
     * invalidate_models_cache() (called on connect/disconnect).
     * A single warning is logged once, and `$using_fallback` is set
     * so the UI can surface a notice.
     */
    private static function get_remote_models(): array
    {
        // 1. In-memory cache — avoid repeated work within a single request
        if (self::$models_memo !== null) {
            return self::$models_memo;
        }

        // 2. Transient cache (persists across requests)
        $cached = get_transient(self::MODELS_CACHE_KEY);
        if (is_array($cached) && ! empty($cached)) {
            // Check if this cached data came from a fallback
            if ( ! empty($cached['__fallback'])) {
                self::$using_fallback = true;
            }
            self::$models_memo = $cached;
            return $cached;
        }

        // 3. Fetch from cloud endpoint — one attempt
        $result = Cloud_Client::post_json('/getAvailableModels');

        if ( ! is_wp_error($result) && is_array($result) && ! empty($result)) {
            set_transient(self::MODELS_CACHE_KEY, $result, self::MODELS_CACHE_TTL);
            self::$models_memo = $result;
            return $result;
        }

        // 4. Fallback to bundled models.json.
        //    Cache with full TTL — do NOT retry until the user explicitly
        //    reconnects a provider (which calls invalidate_models_cache).
        Log_Service::add(
            'warning',
            'Failed to fetch remote model catalog. Using bundled fallback. Will retry on next provider connect/disconnect.',
            0,
            'provider_registry'
        );

        $fallback = self::get_fallback_models();
        $fallback['__fallback'] = true; // Marker so we know it's fallback data
        set_transient(self::MODELS_CACHE_KEY, $fallback, self::MODELS_CACHE_TTL);

        self::$using_fallback = true;
        self::$models_memo    = $fallback;

        return $fallback;
    }

    /**
     * Whether the current model data is from the bundled fallback
     * (cloud endpoint was unreachable).
     */
    public static function is_using_fallback(): bool
    {
        // Ensure models have been loaded so the flag is set
        self::get_remote_models();
        return self::$using_fallback;
    }

    /**
     * Bundled fallback: reads models.json as a last resort.
     * This ensures the plugin works even if the cloud is down.
     */
    private static function get_fallback_models(): array
    {
        $path = STRUCTURA_PATH . 'config/models.json';

        if ( ! file_exists($path)) {
            return [];
        }

        $content = file_get_contents($path);
        $data    = json_decode($content, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            return [];
        }

        // Transform bundled format to match remote format
        $result = [];
        foreach ($data as $provider_id => $provider_data) {
            $result[$provider_id] = [
                'defaults' => $provider_data['defaults'] ?? [],
                'manifest' => $provider_data['manifest'] ?? [],
                'text'     => [],
                'image'    => [],
            ];

            foreach ($provider_data['available'] ?? [] as $model) {
                $type = $model['type'] ?? 'text';
                $entry = [
                    'id'   => $model['id'],
                    'name' => $model['name'],
                ];

                // Mark defaults
                $defaults = $provider_data['defaults'] ?? [];
                if (($defaults['text'] ?? '') === $model['id']) {
                    $entry['default'] = true;
                }
                if (($defaults['fast'] ?? '') === $model['id']) {
                    $entry['fast'] = true;
                }
                if (($defaults['image'] ?? '') === $model['id']) {
                    $entry['default'] = true;
                }

                $result[$provider_id][$type][] = $entry;
            }
        }

        return $result;
    }

    /**
     * Fallback manifest lookup from bundled models.json.
     */
    private static function get_fallback_manifest(string $model_id): ?array
    {
        $fallback = self::get_fallback_models();

        foreach ($fallback as $provider_data) {
            if (isset($provider_data['manifest'][$model_id])) {
                return $provider_data['manifest'][$model_id];
            }
        }

        return null;
    }

    /**
     * Force-refresh the cached model catalog.
     * Called when a provider is connected/disconnected, or from admin actions.
     */
    public static function invalidate_models_cache(): void
    {
        delete_transient(self::MODELS_CACHE_KEY);
        self::$models_memo = null;
    }

    // Adapter-resolution methods (`resolve_text_adapter`,
    // `resolve_image_adapter`) retired in Phase 4 of
    // `specs/v2/cloud-only-generation.md` along with the in-process
    // adapter classes they instantiated. The cloud's
    // `resolveProviderKeyForTier` is the sole resolver now —
    // generation never runs in-process on the plugin side.
}
