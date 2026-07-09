<?php

namespace Structura\Scheduler;

use WP_Error;

class Campaign_Validator
{
    public static function validate(array $params)
    {
        $clean  = [];
        $errors = [];

        // 1. Identity Sanitization
        $clean['name']  = sanitize_text_field($params['name'] ?? '');
        $clean['topic'] = sanitize_textarea_field($params['topic'] ?? '');

        if (empty($clean['name'])) {
            $errors['name'] = __('Name is required.', 'structura');
        }
        if (strlen($clean['topic']) < 20) {
            $errors['topic'] = __('Objective too short.', 'structura');
        }

        // Campaign Mode (Strategic objective — optional, defaults to traffic_magnet)
        $allowed_modes        = ['traffic_magnet', 'quick_wins', 'conversion', 'authority'];
        $clean['campaign_mode'] = in_array($params['campaign_mode'] ?? '', $allowed_modes, true)
            ? $params['campaign_mode']
            : 'traffic_magnet';

        // 2. Intelligence & Architecture (Aligned with React flattenCampaign)
        //
        // Provider contract (split text/image fields). Rules:
        //   - text_provider is MANDATORY. Campaigns always generate text,
        //     so a missing text provider is a configuration error, not a
        //     default-to-openai situation. Silent fallbacks here were the
        //     exact cause of Claude+Gemini campaigns running on OpenAI.
        //   - image_provider is OPTIONAL (null allowed). If images are
        //     disabled in this campaign (featured + body both off) we
        //     store null and Task_Runner::generate_post_images gracefully
        //     skips image tasks. If a provider IS specified but lacks the
        //     'image' capability (e.g. someone passed Anthropic), that is
        //     a user-visible validation error — do not paper over it.
        //
        // `provider` (legacy) is still read from the payload as a
        // back-compat read for older React clients that haven't been
        // redeployed, but it is NEVER written back to storage.
        $raw_text_provider = sanitize_key($params['text_provider'] ?? $params['provider'] ?? '');
        if ($raw_text_provider === '') {
            $errors['text_provider'] = __('A text provider is required.', 'structura');
        } else {
            $clean['text_provider'] = $raw_text_provider;
        }

        $raw_image_provider = sanitize_key($params['image_provider'] ?? '');
        if ($raw_image_provider === '') {
            // Null = no image generation for this campaign. Downstream
            // Task_Runner::generate_post_images logs a warning and skips.
            $clean['image_provider'] = null;
        } else {
            $img_meta = \Structura\Core\Provider_Registry::get_provider($raw_image_provider);
            if ( ! $img_meta || ! in_array('image', $img_meta['capabilities'] ?? [], true)) {
                $errors['image_provider'] = sprintf(
                    /* translators: %s: provider slug (e.g. "anthropic") */
                    __('Provider "%s" does not support image generation.', 'structura'),
                    $raw_image_provider
                );
            } else {
                $clean['image_provider'] = $raw_image_provider;
            }
        }

        $clean['text_model']  = sanitize_text_field($params['text_model'] ?? '');
        $clean['image_model'] = sanitize_text_field($params['image_model'] ?? '');

        // Fallback provider (OPTIONAL — per-campaign safety net for transient
        // errors like 429/5xx/timeouts on the primary provider).
        //
        // Design rules (see specs / provider_fallback memo 2026-04-21):
        //   - Empty / missing  → null. No fallback attempted; a primary
        //     failure propagates as-is. This is the default — we do not
        //     opt users in silently.
        //   - Same as primary  → validation error. Fallback must route to a
        //     *different* provider or it cannot recover from a
        //     provider-wide outage (the scenario that motivated the feature).
        //   - Image-fallback capability → enforced exactly like the primary
        //     image provider: text-only providers (Anthropic) cannot be
        //     selected as the image fallback.
        //
        // Eligibility (Pro vs. managed, disabled for Free) is enforced in
        // the UI and at the cloud boundary — the validator stays
        // plan-agnostic so a managed-tier user who later downgrades doesn't
        // lose the campaign config on save.
        $raw_fallback_text = sanitize_key($params['fallback_text_provider'] ?? '');
        if ($raw_fallback_text === '') {
            $clean['fallback_text_provider'] = null;
        } elseif ($raw_fallback_text === ($clean['text_provider'] ?? '')) {
            $errors['fallback_text_provider'] = __(
                'The fallback text provider must be different from the primary.',
                'structura'
            );
        } else {
            $clean['fallback_text_provider'] = $raw_fallback_text;
        }

        $raw_fallback_image = sanitize_key($params['fallback_image_provider'] ?? '');
        if ($raw_fallback_image === '') {
            $clean['fallback_image_provider'] = null;
        } elseif ($raw_fallback_image === ($clean['image_provider'] ?? '')) {
            $errors['fallback_image_provider'] = __(
                'The fallback image provider must be different from the primary.',
                'structura'
            );
        } else {
            $img_meta = \Structura\Core\Provider_Registry::get_provider($raw_fallback_image);
            if ( ! $img_meta || ! in_array('image', $img_meta['capabilities'] ?? [], true)) {
                $errors['fallback_image_provider'] = sprintf(
                    /* translators: %s: provider slug (e.g. "anthropic") */
                    __('Fallback provider "%s" does not support image generation.', 'structura'),
                    $raw_fallback_image
                );
            } else {
                $clean['fallback_image_provider'] = $raw_fallback_image;
            }
        }

        // Preserve string nanoids; only cast to int when the value
        // is actually numeric (legacy WP post id path). A blind
        // `(int)$nanoid` returns 0 because nanoids start with
        // letters — which silently nuked the persona binding on
        // every cloud-personas campaign save
        // (cms.formulafoundry.io 2026-05-22). The cloud's
        // `pickPersonaId` requires `typeof === "string"` for the
        // nanoid path, so preserving string-ness end-to-end is
        // load-bearing, not stylistic.
        $clean['persona_id'] = self::normalize_persona_id($params['persona_id'] ?? null);
        $clean['language']    = sanitize_text_field($params['language'] ?? 'default');
        $clean['post_length'] = max(300, (int)($params['post_length'] ?? 1000));

        // SEO Rules & Images
        $clean['seo_optimization_rules'] = self::sanitize_rules($params['seo_optimization_rules'] ?? []);
        $clean['featured_image']         = filter_var($params['featured_image'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $clean['body_images']            = filter_var($params['body_images'] ?? false, FILTER_VALIDATE_BOOLEAN);

        // 3. Structure & Taxonomy (New Fields from your update)
        $clean['enabled_blocks']      = array_map('sanitize_text_field', (array)($params['enabled_blocks'] ?? []));
        $clean['replace_long_dashes'] = filter_var($params['replace_long_dashes'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $clean['disable_emojis']      = filter_var($params['disable_emojis'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $clean['enable_disclosure']   = (bool)($params['enable_disclosure'] ?? true);
        $clean['disclosure_text']     = sanitize_text_field($params['disclosure_text'] ?? '');

        // Pre-generation toggle (§1.7). Without an explicit pass-through
        // here the field falls off the cleaned shape — the transformer
        // downstream then `?? true`s it back on regardless of what the
        // user actually saved, so toggling OFF in the UI silently
        // didn't persist (Yurii incident 2026-05-08). Default `true`
        // matches Phase 1.0a's create-side default.
        $clean['pregeneration_enabled'] = filter_var(
            $params['pregeneration_enabled'] ?? true,
            FILTER_VALIDATE_BOOLEAN,
        );

        // Per-campaign post_status — whitelist against the WP states
        // Task_Runner accepts. 'pending' was removed 2026-07-09 (WP treated
        // it as a draft); anything else (or missing) falls back to 'draft',
        // the safe default now that surprise-publishing is the worst case.
        $allowed_post_statuses = ['publish', 'draft'];
        $clean['post_status']  = in_array($params['post_status'] ?? '', $allowed_post_statuses, true)
            ? $params['post_status']
            : 'draft';

        $clean['category_mode']      = sanitize_key($params['category_mode'] ?? 'auto');
        $clean['allowed_categories'] = array_map('intval', (array)($params['allowed_categories'] ?? []));
        $clean['tag_mode']           = sanitize_key($params['tag_mode'] ?? 'auto');
        $clean['allowed_tags']       = array_map('intval', (array)($params['allowed_tags'] ?? []));

        // 4. Deployment (Cron)
        $clean['cron_schedule'] = sanitize_text_field($params['cron_schedule'] ?? '');
        if ( ! self::is_valid_cron($clean['cron_schedule'])) {
            $errors['cron_schedule'] = __('Invalid deployment pulse format.', 'structura');
        }

        // 5. Termination Logic
        $clean['end_mode']  = in_array($params['end_mode'] ?? '',
            ['infinite', 'quota', 'date']) ? $params['end_mode'] : 'infinite';
        $clean['end_posts'] = (int)($params['end_posts'] ?? 0);
        $clean['end_date']  = sanitize_text_field($params['end_date'] ?? '');

        if ($clean['end_mode'] === 'quota' && $clean['end_posts'] <= 0) {
            $errors['end_posts'] = __('Quota must be positive.', 'structura');
        }

        // 6. Authority Domains (pass-through — sanitized in Campaign_Repository)
        if (isset($params['authority_domains']) && is_array($params['authority_domains'])) {
            $clean['authority_domains'] = $params['authority_domains'];
        }

        // 7. Keyword Bank (pass-through — sanitized in Campaign_Repository)
        if (isset($params['keyword_bank']) && is_array($params['keyword_bank'])) {
            $clean['keyword_bank'] = $params['keyword_bank'];
        }

        // 8. Referral / partner links. Pass through here; the URL + free-text
        // fields are escaped in Campaign_Shape_Transformer::sanitize_referral_links
        // (esc_url_raw preserves tracking params) on the way to the cloud.
        if (isset($params['referral_links']) && is_array($params['referral_links'])) {
            $clean['referral_links'] = $params['referral_links'];
        }

        if ( ! empty($errors)) {
            return new WP_Error('validation_failed', __('Configuration errors.', 'structura'), [
                'status' => 422,
                'fields' => $errors,
            ]);
        }

        return $clean;
    }

    /**
     * Normalize a persona_id wire value.
     *
     * Three accepted shapes:
     *   - `'random'` — campaign-time random pick sentinel; preserved verbatim.
     *   - A non-empty string that isn't fully numeric — treated as a v2
     *     Firestore nanoid (e.g. `Oz2kGf44rt1v6vKEW7kD5`) and preserved
     *     as a string. The cloud's `pickPersonaId` requires
     *     `typeof === "string"` for the nanoid resolution path; coercing
     *     to int here would store the value as Firestore int64, and the
     *     cloud's type check would reject it on the next read.
     *   - Numeric (int, float, or numeric string) — legacy WP post id;
     *     cast to int for the legacy resolution path.
     *
     * Anything else (null, array, etc.) collapses to `0`, the legacy
     * "no persona assigned" sentinel — matches the pre-fix fallback
     * for malformed payloads.
     *
     * Public so Rest_Api's campaign-payload assembly can call it
     * directly without duplicating the type-discrimination logic.
     */
    public static function normalize_persona_id_public($value)
    {
        return self::normalize_persona_id($value);
    }

    private static function normalize_persona_id($value)
    {
        if ($value === 'random') {
            return 'random';
        }
        if (is_string($value) && $value !== '' && ! is_numeric($value)) {
            return $value;
        }
        if (is_numeric($value)) {
            return (int)$value;
        }
        return 0;
    }

    private static function sanitize_rules($rules): array
    {
        if ( ! is_array($rules)) {
            return [];
        }

        return array_map(function ($val) {
            return (bool)$val;
        }, $rules);
    }

    private static function is_valid_cron($cron): bool
    {
        return count(explode(' ', trim($cron))) === 5;
    }
}