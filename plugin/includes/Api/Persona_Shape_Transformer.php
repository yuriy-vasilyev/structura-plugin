<?php

namespace Structura\Api;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Transformation helpers to convert between WP persona shape and cloud flat shape.
 *
 * The WP-side persona storage uses post-meta keys:
 *   _role, _tone, _reading_level, _author_id
 *
 * The cloud side uses a flat PersonaDoc with all fields at the top level.
 *
 * This transformer bridges the two so persona CRUD can proxy through the cloud
 * while keeping the SPA's REST contract unchanged.
 *
 * Spec: specs/v2/cloud-pregeneration-and-model-catalog.md (migration section).
 */
class Persona_Shape_Transformer
{
    /**
     * Convert a cloud flat PersonaDoc to WP shape.
     *
     * Used when reading from cloud and returning to the SPA.
     * The returned shape matches what the WP REST handler originally produced.
     *
     * @param array $cloud Cloud flat persona document
     * @return array WP shape (matches SPA REST contract)
     */
    public static function cloud_to_wp(array $cloud): array
    {
        // Cloud personaId is a nanoid string (e.g. "4r9TBGo0Pj_RDioJQGyib").
        // Casting to int would yield 0 for non-numeric strings — preserve
        // the raw value. SPA hooks accept `string | number` after the
        // cloud-IDs sweep.
        //
        // 2026-05-22 Phase 2b: prefer the per-activation `binding.wpAuthorId`
        // for the `author_id` field surfaced to the SPA. The library
        // `authorId` field is per-PERSONA but author attribution is
        // per-SITE — the same persona on two activations needs different
        // WP user ids. When the binding is absent (pre-migration personas,
        // or `authorId === null` at migration time), fall back to the
        // library `authorId`. Spec: `specs/personas-library-binding.md` §3.
        $binding = $cloud['binding'] ?? null;
        $author_id = is_array($binding)
            && ($binding['surface'] ?? null) === 'wp'
            && is_numeric($binding['wpAuthorId'] ?? null)
                ? (int) $binding['wpAuthorId']
                : (int) ($cloud['authorId'] ?? 1);

        return [
            'id'            => $cloud['personaId'] ?? '',
            'name'          => $cloud['name'] ?? '',
            'system_prompt' => $cloud['systemPrompt'] ?? '',
            'tone'          => $cloud['tone'] ?? 'professional',
            'reading_level' => $cloud['readingLevel'] ?? 'grade_12',
            'author_id'     => $author_id,
        ];
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
            'name'          => sanitize_text_field($wp_input['name'] ?? ''),
            'systemPrompt'  => sanitize_textarea_field($wp_input['system_prompt'] ?? ''),
            'tone'          => sanitize_key($wp_input['tone'] ?? 'professional'),
            'readingLevel'  => sanitize_key($wp_input['reading_level'] ?? 'grade_12'),
            'authorId'      => (int) ($wp_input['author_id'] ?? 1),
        ];
    }

    /**
     * Convert WP post meta shape to cloud flat shape.
     *
     * Used during migration when reading directly from post meta.
     * Input shape is what Rest_Api::get_personas() returns.
     *
     * @param array $wp_persona The WP persona object from post meta
     * @return array Cloud flat shape
     */
    public static function wp_cluster_to_cloud(array $wp_persona): array
    {
        return [
            'personaId'     => (string) ($wp_persona['id'] ?? ''),
            'name'          => $wp_persona['name'] ?? '',
            'systemPrompt'  => $wp_persona['system_prompt'] ?? '',
            'tone'          => $wp_persona['tone'] ?? 'professional',
            'readingLevel'  => $wp_persona['reading_level'] ?? 'grade_12',
            'authorId'      => (int) ($wp_persona['author_id'] ?? 1),
        ];
    }
}
