<?php

namespace Structura\Api;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Transformation helpers to convert between WP cluster shape and cloud flat shape.
 *
 * The WP-side campaign storage uses nested "cluster" post-meta keys:
 *   _cluster_identity, _cluster_intelligence, _cluster_structure, etc.
 *
 * The cloud side uses a flat CampaignDoc with all fields at the top level.
 *
 * This transformer bridges the two so campaign CRUD can proxy through the cloud
 * while keeping the SPA's REST contract unchanged.
 *
 * Spec: specs/v2/cloud-pregeneration-and-model-catalog.md §1.0b (proxy layer).
 */
class Campaign_Shape_Transformer
{
    /**
     * Convert a cloud flat CampaignDoc to WP cluster shape.
     *
     * Used when reading from cloud and returning to the SPA.
     * The returned shape matches what Campaign_Repository::get_campaign_data() produces.
     *
     * @param array $cloud Cloud flat campaign document
     * @return array WP cluster shape (matches SPA REST contract)
     */
    public static function cloud_to_wp(array $cloud): array
    {
        return [
            'id'           => $cloud['campaignId'] ?? '',
            'status'       => $cloud['status'] ?? 'active',
            // ISO 8601 creation timestamp for the SPA's campaign overview.
            // The cloud stores `createdAt` as a Firestore Timestamp; how it
            // lands here depends on the admin SDK's JSON shape, so the
            // normalizer accepts every plausible form. Omitted from the
            // response when absent/unparseable so the SPA's optional
            // `createdAt` field simply doesn't render rather than showing
            // an "Invalid Date".
            'createdAt'    => self::normalize_timestamp_iso($cloud['createdAt'] ?? null),
            'identity'     => [
                'name'         => $cloud['name'] ?? '',
                'objective'    => $cloud['objective'] ?? '',
                'campaignMode' => $cloud['campaignMode'] ?? 'traffic_magnet',
            ],
            'intelligence' => [
                'textProvider'          => $cloud['textProvider'] ?? 'gemini',
                'textModel'             => $cloud['textModel'] ?? '',
                'imageProvider'         => $cloud['imageProvider'] ?? null,
                'imageModel'            => $cloud['imageModel'] ?? '',
                'fallbackTextProvider'  => $cloud['fallbackTextProvider'] ?? null,
                'fallbackImageProvider' => $cloud['fallbackImageProvider'] ?? null,
                'personaId'             => $cloud['personaId'] ?? 1,
                'language'              => $cloud['language'] ?? 'default',
                'replaceLongDashes'     => (bool) ($cloud['replaceLongDashes'] ?? false),
                'disableEmojis'         => (bool) ($cloud['disableEmojis'] ?? false),
                'postLength'            => (int) ($cloud['postLength'] ?? 1000),
                'seoRules'              => (array) ($cloud['seoRules'] ?? []),
            ],
            'structure'    => [
                'enabledBlocks' => (array) ($cloud['enabledBlocks'] ?? []),
                'featuredImage' => (bool) ($cloud['featuredImage'] ?? false),
                'bodyImages'    => (bool) ($cloud['bodyImages'] ?? false),
                'disclosure'    => [
                    'enabled' => (bool) ($cloud['disclosureEnabled'] ?? false),
                    'text'    => $cloud['disclosureText'] ?? '',
                ],
                'referralLinks' => self::sanitize_referral_links($cloud['referralLinks'] ?? []),
                'postStatus'    => $cloud['postStatus'] ?? 'publish',
            ],
            'taxonomy'     => [
                'categories' => [
                    'mode' => $cloud['categoryMode'] ?? 'auto',
                    'list' => (array) ($cloud['allowedCategories'] ?? []),
                ],
                'tags'       => [
                    'mode' => $cloud['tagMode'] ?? 'auto',
                    'list' => (array) ($cloud['allowedTags'] ?? []),
                ],
            ],
            'schedule'     => [
                'cron'                 => $cloud['cronSchedule'] ?? '',
                'endCondition'         => [
                    'type'  => $cloud['endMode'] ?? 'infinite',
                    'value' => $cloud['endValue'] ?? null,
                ],
                // Phase 1.6 — surface the pre-generation flag on the
                // SPA's form shape so the toggle / banner reflects the
                // current campaign's state on edit. Default true for
                // back-compat: cloud docs without the field were
                // created before Phase 1.0a defaulted it to true,
                // which is the same intent ("on unless explicitly
                // disabled").
                'pregenerationEnabled' => (bool) ($cloud['pregenerationEnabled'] ?? true),
            ],
            'authority'    => [
                'domains'         => (array) ($cloud['authorityDomains'] ?? []),
                'discoveredAt'    => $cloud['authorityDiscoveredAt'] ?? null,
            ],
            'keywords'     => [
                'bank'         => (array) ($cloud['keywordBank'] ?? []),
                'discoveredAt' => $cloud['keywordsDiscoveredAt'] ?? null,
            ],
            'stats'        => [
                'postsPublished' => (int) ($cloud['postsPublished'] ?? 0),
                // Posts created (any status) — includes drafts awaiting
                // review. Absent on campaigns created before the field
                // shipped: fall back to postsPublished so the SPA shows no
                // (misleading) split for them. Always >= postsPublished.
                'postsCreated'   => (int) ($cloud['postsCreated'] ?? $cloud['postsPublished'] ?? 0),
                // Mirror Campaign_Repository::get_campaign_data() — query AS
                // for the next scheduled occurrence keyed on the cloud
                // campaign id (string nanoid post-Phase-1.0c). Without this
                // lookup the SPA renders "Not Scheduled" for every cloud
                // campaign even when Cloud_Cadence_Sync has installed the
                // recurring pulse. Falls back to the legacy "Not Scheduled"
                // string when AS isn't loaded or has no record.
                'nextRun'        => self::format_next_run((string) ($cloud['campaignId'] ?? '')),
            ],
        ];
    }

    /**
     * Look up the next-firing time for `structura_run_campaign_step` keyed on
     * the given campaign id and format it for the SPA. Returns the
     * historical "Not Scheduled" placeholder string when:
     *
     *   - Action Scheduler isn't loaded (very early bootstrap).
     *   - No pending action matches that campaign id.
     *   - The id is empty (defensive — should not happen on a real read).
     *
     * Behaviour intentionally mirrors `Campaign_Repository::get_campaign_data`
     * line-for-line so the WP-auth and cloud-auth paths produce identical
     * `stats.nextRun` strings — anything else and the SPA card text shifts
     * the moment the activation flag flips.
     */
    private static function format_next_run(string $campaign_id): string
    {
        if ($campaign_id === '' || ! function_exists('as_next_scheduled_action')) {
            return __('Not Scheduled', 'structura');
        }

        $next_run_timestamp = as_next_scheduled_action(
            'structura_run_campaign_step',
            ['campaign_id' => $campaign_id]
        );

        if ( ! $next_run_timestamp) {
            return __('Not Scheduled', 'structura');
        }

        return date_i18n(
            get_option('date_format') . ' ' . get_option('time_format'),
            $next_run_timestamp
        );
    }

    /**
     * Convert WP-side flat input (from SPA POST/PUT) to cloud flat shape.
     *
     * The SPA sends snake_case flat keys directly. This converts them to camelCase
     * cloud shape for write operations.
     *
     * @param array $wp_input Flat input from SPA (snake_case keys)
     * @return array Cloud flat shape (camelCase, ready to POST to cloud)
     */
    public static function wp_input_to_cloud(array $wp_input): array
    {
        return [
            'name'                  => sanitize_text_field($wp_input['name'] ?? ''),
            'objective'             => sanitize_textarea_field($wp_input['objective'] ?? $wp_input['topic'] ?? ''),
            'campaignMode'          => sanitize_key($wp_input['campaign_mode'] ?? 'traffic_magnet'),
            'textProvider'          => sanitize_key($wp_input['text_provider'] ?? $wp_input['provider'] ?? ''),
            'textModel'             => sanitize_text_field($wp_input['text_model'] ?? ''),
            'imageProvider'         => self::normalize_nullable($wp_input['image_provider'] ?? null),
            'imageModel'            => sanitize_text_field($wp_input['image_model'] ?? ''),
            'fallbackTextProvider'  => self::normalize_nullable($wp_input['fallback_text_provider'] ?? null),
            'fallbackImageProvider' => self::normalize_nullable($wp_input['fallback_image_provider'] ?? null),
            'personaId'             => self::normalize_persona_id($wp_input['persona_id'] ?? 1),
            'language'              => sanitize_text_field($wp_input['language'] ?? 'default'),
            'replaceLongDashes'     => (bool) ($wp_input['replace_long_dashes'] ?? false),
            'disableEmojis'         => (bool) ($wp_input['disable_emojis'] ?? false),
            'postLength'            => (int) ($wp_input['post_length'] ?? 1000),
            'seoRules'              => (array) ($wp_input['seo_optimization_rules'] ?? []),
            'enabledBlocks'         => (array) ($wp_input['enabled_blocks'] ?? []),
            'featuredImage'         => (bool) ($wp_input['featured_image'] ?? false),
            'bodyImages'            => (bool) ($wp_input['body_images'] ?? false),
            'disclosureEnabled'     => (bool) ($wp_input['enable_disclosure'] ?? false),
            'disclosureText'        => sanitize_textarea_field($wp_input['disclosure_text'] ?? ''),
            'referralLinks'         => self::sanitize_referral_links($wp_input['referral_links'] ?? []),
            'postStatus'            => sanitize_key($wp_input['post_status'] ?? 'publish'),
            'categoryMode'          => sanitize_key($wp_input['category_mode'] ?? 'auto'),
            'allowedCategories'     => array_map('intval', (array) ($wp_input['allowed_categories'] ?? [])),
            'tagMode'               => sanitize_key($wp_input['tag_mode'] ?? 'auto'),
            'allowedTags'           => array_map('intval', (array) ($wp_input['allowed_tags'] ?? [])),
            'cronSchedule'          => sanitize_text_field($wp_input['cron_schedule'] ?? ''),
            'endMode'               => sanitize_key($wp_input['end_mode'] ?? 'infinite'),
            'endValue'              => self::normalize_end_value($wp_input['end_mode'] ?? 'infinite', $wp_input),
            'authorityDomains'      => (array) ($wp_input['authority_domains'] ?? []),
            'authorityDiscoveredAt' => $wp_input['authority_discovered_at'] ?? null,
            'keywordBank'           => (array) ($wp_input['keyword_bank'] ?? []),
            'keywordsDiscoveredAt'  => $wp_input['keywords_discovered_at'] ?? null,
            'keywordQueueIndex'     => (int) ($wp_input['keyword_queue_index'] ?? 0),
            'pregenerationEnabled'  => (bool) ($wp_input['pregeneration_enabled'] ?? true),
            'status'                => sanitize_key($wp_input['status'] ?? 'active'),
            'postsPublished'        => (int) ($wp_input['posts_published'] ?? 0),
            'lastRunTimestamp'      => $wp_input['last_run_timestamp'] ?? null,
        ];
    }

    /**
     * Convert WP cluster meta shape to cloud flat shape.
     *
     * Used during migration when reading directly from post-meta clusters.
     * Input shape is from Campaign_Repository::get_campaign_data() which pulls
     * the clusters; this normalizes it to cloud shape.
     *
     * @param array $wp_cluster The WP campaign object with 'identity', 'intelligence', etc. clusters
     * @return array Cloud flat shape
     */
    public static function wp_cluster_to_cloud(array $wp_cluster): array
    {
        $identity     = $wp_cluster['identity'] ?? [];
        $intelligence = $wp_cluster['intelligence'] ?? [];
        $structure    = $wp_cluster['structure'] ?? [];
        $taxonomy     = $wp_cluster['taxonomy'] ?? [];
        $schedule     = $wp_cluster['schedule'] ?? [];
        $authority    = $wp_cluster['authority'] ?? [];
        $keywords     = $wp_cluster['keywords'] ?? [];
        $stats        = $wp_cluster['stats'] ?? [];

        return [
            'campaignId'            => (string) ($wp_cluster['id'] ?? ''),
            'name'                  => $identity['name'] ?? '',
            'objective'             => $identity['objective'] ?? '',
            'campaignMode'          => $identity['campaignMode'] ?? 'traffic_magnet',
            'textProvider'          => $intelligence['textProvider'] ?? 'gemini',
            'textModel'             => $intelligence['textModel'] ?? '',
            'imageProvider'         => $intelligence['imageProvider'] ?? null,
            'imageModel'            => $intelligence['imageModel'] ?? '',
            'fallbackTextProvider'  => $intelligence['fallbackTextProvider'] ?? null,
            'fallbackImageProvider' => $intelligence['fallbackImageProvider'] ?? null,
            'personaId'             => $intelligence['personaId'] ?? 1,
            'language'              => $intelligence['language'] ?? 'default',
            'replaceLongDashes'     => (bool) ($intelligence['replaceLongDashes'] ?? false),
            'disableEmojis'         => (bool) ($intelligence['disableEmojis'] ?? false),
            'postLength'            => (int) ($intelligence['postLength'] ?? 1000),
            'seoRules'              => (array) ($intelligence['seoRules'] ?? []),
            'enabledBlocks'         => (array) ($structure['enabledBlocks'] ?? []),
            'featuredImage'         => (bool) ($structure['featuredImage'] ?? false),
            'bodyImages'            => (bool) ($structure['bodyImages'] ?? false),
            'disclosureEnabled'     => (bool) (($structure['disclosure'] ?? [])['enabled'] ?? false),
            'disclosureText'        => ($structure['disclosure'] ?? [])['text'] ?? '',
            'referralLinks'         => self::sanitize_referral_links($structure['referralLinks'] ?? []),
            'postStatus'            => $structure['postStatus'] ?? 'publish',
            'categoryMode'          => (($taxonomy['categories'] ?? [])['mode'] ?? 'auto'),
            'allowedCategories'     => (array) ((($taxonomy['categories'] ?? [])['list'] ?? [])),
            'tagMode'               => (($taxonomy['tags'] ?? [])['mode'] ?? 'auto'),
            'allowedTags'           => (array) ((($taxonomy['tags'] ?? [])['list'] ?? [])),
            'cronSchedule'          => ($schedule['cron'] ?? ''),
            'endMode'               => (($schedule['endCondition'] ?? [])['type'] ?? 'infinite'),
            'endValue'              => (($schedule['endCondition'] ?? [])['value'] ?? null),
            'authorityDomains'      => (array) ($authority['domains'] ?? []),
            'authorityDiscoveredAt' => $authority['discoveredAt'] ?? null,
            'keywordBank'           => (array) ($keywords['bank'] ?? []),
            'keywordsDiscoveredAt'  => $keywords['discoveredAt'] ?? null,
            'keywordQueueIndex'     => 0,
            'pregenerationEnabled'  => true,
            'status'                => $wp_cluster['status'] ?? 'active',
            'postsPublished'        => (int) ($stats['postsPublished'] ?? 0),
            'lastRunTimestamp'      => null,
        ];
    }

    /**
     * Normalize a cloud Firestore timestamp into an ISO 8601 string (UTC).
     *
     * The cloud returns `createdAt` as a Firestore Timestamp, whose JSON
     * representation varies across firebase-admin versions — it can arrive
     * as `{_seconds, _nanoseconds}`, `{seconds, nanoseconds}`, a numeric
     * epoch (seconds or milliseconds), or an already-formatted ISO string.
     * We accept all of them so a plugin build doesn't break when the cloud
     * SDK's serialization shape shifts under it.
     *
     * Returns null for anything unrecognized/empty; the SPA treats a missing
     * timestamp as "don't render the Created row" rather than as an error.
     *
     * @param mixed $value Raw timestamp value from the cloud doc.
     * @return string|null ISO 8601 string (e.g. '2026-06-01T13:51:02+00:00'), or null.
     */
    private static function normalize_timestamp_iso($value)
    {
        if (is_array($value)) {
            $seconds = $value['_seconds'] ?? $value['seconds'] ?? null;
            if (is_numeric($seconds)) {
                return gmdate('c', (int) $seconds);
            }
            return null;
        }

        if (is_numeric($value)) {
            // Firestore wouldn't normally send a bare epoch, but be defensive:
            // values above ~year 33658 in seconds are almost certainly millis.
            $seconds = $value > 1e12 ? (int) ($value / 1000) : (int) $value;
            return gmdate('c', $seconds);
        }

        if (is_string($value) && $value !== '') {
            // Already a date string (ISO or otherwise) — pass through and let
            // the SPA's date parser handle it.
            return $value;
        }

        return null;
    }

    /**
     * Normalize a nullable value: empty string → null, otherwise keep as-is.
     */
    private static function normalize_nullable($value)
    {
        if ($value === '' || $value === null) {
            return null;
        }
        return $value;
    }

    /**
     * Sanitize a list of client referral / partner links into the cloud's
     * `referralLinks` shape (`{ url, label, relevanceKeywords[], anchorText? }`).
     *
     * Runs in BOTH directions — sanitizing on read (cloud → SPA) as well as
     * write (SPA → cloud) — so a malformed stored doc can't inject an unescaped
     * URL into the SPA. Rows without a usable URL are dropped: a referral link
     * IS its URL, so an empty one is meaningless. `esc_url_raw` preserves the
     * query/tracking parameters (the whole point of a referral link) while
     * stripping anything that isn't a safe URL.
     *
     * @param mixed $raw The referral-link list from either wire shape.
     * @return array<int, array<string, mixed>> Clean referral-link objects.
     */
    private static function sanitize_referral_links($raw): array
    {
        if (! is_array($raw)) {
            return [];
        }

        $out = [];
        foreach ($raw as $entry) {
            if (! is_array($entry)) {
                continue;
            }

            $url = esc_url_raw((string) ($entry['url'] ?? ''));
            if ($url === '') {
                continue;
            }

            $keywords = array_values(array_filter(array_map(
                static fn($k) => sanitize_text_field((string) $k),
                (array) ($entry['relevanceKeywords'] ?? $entry['relevance_keywords'] ?? [])
            ), static fn($k) => $k !== ''));

            $link = [
                'url'              => $url,
                'label'            => sanitize_text_field((string) ($entry['label'] ?? '')),
                'relevanceKeywords' => $keywords,
            ];

            $anchor = sanitize_text_field((string) ($entry['anchorText'] ?? $entry['anchor_text'] ?? ''));
            if ($anchor !== '') {
                $link['anchorText'] = $anchor;
            }

            $out[] = $link;
        }

        return $out;
    }

    /**
     * Normalize persona_id wire value. Three accepted shapes:
     *
     *   - `'random'` — preserved verbatim.
     *   - Non-empty string that isn't `is_numeric` — preserved as a
     *     v2 Firestore nanoid (e.g. `Oz2kGf44rt1v6vKEW7kD5`). The
     *     cloud's `pickPersonaId` requires `typeof === "string"`
     *     for the nanoid resolution path; a bare `(int)$nanoid`
     *     coercion returns `0` and silently nukes the persona
     *     binding — the cms.formulafoundry.io 2026-05-22
     *     launch-blocker traced to exactly this transformer site
     *     (the SPA POSTed `persona_id: "Oz2kGf…"` and the campaign
     *     landed in Firestore with `personaId: 0`).
     *   - Numeric — legacy WP post id; cast to int.
     *
     * Anything else collapses to `0` ("no persona assigned" sentinel).
     * Mirrors `Campaign_Validator::normalize_persona_id`.
     */
    private static function normalize_persona_id($value)
    {
        if ($value === 'random') {
            return 'random';
        }
        if (is_string($value) && $value !== '' && ! is_numeric($value)) {
            return $value;
        }
        if (is_numeric($value)) {
            return (int) $value;
        }
        return 0;
    }

    /**
     * Normalize end_value based on end_mode.
     */
    private static function normalize_end_value(string $end_mode, array $input)
    {
        if ($end_mode === 'quota') {
            return (int) ($input['end_posts'] ?? 0);
        } elseif ($end_mode === 'date') {
            return sanitize_text_field($input['end_date'] ?? '');
        }
        return null;
    }
}
