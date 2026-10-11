<?php

namespace Structura\Core;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Source check notes on a WordPress post: the review notes the cloud ships
 * with a delivered post (`source_check` on the delivery payload), stored as
 * private post meta and shown in the Structura meta box.
 *
 * Pure helpers: sanitising the wire object, counting, applying a status
 * patch, labels. Spec: specs/source-check.md §9.3.
 */
class Source_Check
{
    public const META_KEY = '_structura_source_check';

    public const NOTE_STATUSES   = ['open', 'accepted', 'edited', 'dismissed', 'outdated'];
    public const CHANGE_STATUSES = ['applied', 'reverted'];
    public const WHERE           = ['excerpt', 'metaDescription', 'body'];

    private const CATEGORIES = [
        'UNSUPPORTED_SPECIFIC',
        'CONTRADICTED',
        'UNSUPPORTED_CATEGORICAL',
        'OVERCLAIM',
        'BRIEF_VIOLATION',
    ];

    /**
     * Returns the wire object as stored, or null when it carries no notes
     * array (nothing to store). Unknown statuses fall back to `open`,
     * unknown areas and categories to the safe default, entries without an
     * id are dropped.
     *
     * @param mixed $raw The `source_check` value from the delivery payload.
     */
    public static function sanitize($raw): ?array
    {
        if ( ! is_array($raw) || ! isset($raw['notes']) || ! is_array($raw['notes'])) {
            return null;
        }

        $notes = [];
        foreach ($raw['notes'] as $note) {
            if ( ! is_array($note) || empty($note['id']) || ! is_string($note['id'])) {
                continue;
            }
            $suggestion = $note['suggestion'] ?? null;
            $entry      = [
                'id'         => sanitize_text_field($note['id']),
                'n'          => max(0, (int) ($note['n'] ?? 0)),
                'where'      => self::one_of($note['where'] ?? '', self::WHERE, 'body'),
                'quote'      => wp_kses_post((string) ($note['quote'] ?? '')),
                'category'   => self::one_of($note['category'] ?? '', self::CATEGORIES, 'UNSUPPORTED_SPECIFIC'),
                'reason'     => sanitize_textarea_field((string) ($note['reason'] ?? '')),
                // null = no suggestion; "" = remove this sentence. Both are kept apart.
                'suggestion' => is_string($suggestion) ? wp_kses_post($suggestion) : null,
                'status'     => self::one_of($note['status'] ?? '', self::NOTE_STATUSES, 'open'),
            ];
            $source = self::sanitize_source($note['source'] ?? null);
            if ($source !== null) {
                $entry['source'] = $source;
            }
            if ( ! empty($note['resolvedAt']) && is_string($note['resolvedAt'])) {
                $entry['resolvedAt'] = sanitize_text_field($note['resolvedAt']);
            }
            if (isset($note['resolvedBy'])) {
                $entry['resolvedBy'] = (int) $note['resolvedBy'];
            }
            $notes[] = $entry;
        }

        $changes = [];
        foreach ((isset($raw['changes']) && is_array($raw['changes'])) ? $raw['changes'] : [] as $change) {
            if ( ! is_array($change) || empty($change['id']) || ! is_string($change['id'])) {
                continue;
            }
            $entry = [
                'id'       => sanitize_text_field($change['id']),
                'where'    => self::one_of($change['where'] ?? '', self::WHERE, 'body'),
                'before'   => wp_kses_post((string) ($change['before'] ?? '')),
                'after'    => wp_kses_post((string) ($change['after'] ?? '')),
                'category' => self::one_of($change['category'] ?? '', self::CATEGORIES, 'UNSUPPORTED_SPECIFIC'),
                'reason'   => sanitize_textarea_field((string) ($change['reason'] ?? '')),
                'status'   => self::one_of($change['status'] ?? '', self::CHANGE_STATUSES, 'applied'),
            ];
            if ( ! empty($change['contextBefore']) && is_string($change['contextBefore'])) {
                $entry['contextBefore'] = wp_kses_post($change['contextBefore']);
            }
            $source = self::sanitize_source($change['source'] ?? null);
            if ($source !== null) {
                $entry['source'] = $source;
            }
            $changes[] = $entry;
        }

        return [
            'checkedAt'   => sanitize_text_field((string) ($raw['checkedAt'] ?? '')),
            'sourceCount' => max(0, (int) ($raw['sourceCount'] ?? 0)),
            'hasBrief'    => ! empty($raw['hasBrief']),
            'notes'       => $notes,
            'changes'     => $changes,
        ];
    }

    /** Notes a reviewer still has to look at: status `open` only. */
    public static function open_count(array $source_check): int
    {
        $count = 0;
        foreach ($source_check['notes'] ?? [] as $note) {
            if (($note['status'] ?? '') === 'open') {
                $count++;
            }
        }
        return $count;
    }

    /**
     * Applies `{ notes: [{ id, status }] }` from the editor. Known ids and
     * enum statuses only; everything else is ignored without error. A
     * resolution stamps who and when; a return to `open` or `outdated`
     * clears the stamp (that is how Undo works).
     *
     * @param array  $patch   Decoded request body.
     * @param int    $user_id Acting user.
     * @param string $now_iso Resolution time, ISO 8601.
     */
    public static function apply_status_patch(array $source_check, array $patch, int $user_id, string $now_iso): array
    {
        $wanted = [];
        foreach ((isset($patch['notes']) && is_array($patch['notes'])) ? $patch['notes'] : [] as $item) {
            if ( ! is_array($item) || ! isset($item['id'], $item['status']) || ! is_string($item['id'])) {
                continue;
            }
            if ( ! in_array($item['status'], self::NOTE_STATUSES, true)) {
                continue;
            }
            $wanted[$item['id']] = $item['status'];
        }

        foreach ($source_check['notes'] ?? [] as $i => $note) {
            $id = $note['id'] ?? '';
            if ( ! isset($wanted[$id])) {
                continue;
            }
            $status                              = $wanted[$id];
            $source_check['notes'][$i]['status'] = $status;
            if ($status === 'open' || $status === 'outdated') {
                unset($source_check['notes'][$i]['resolvedAt'], $source_check['notes'][$i]['resolvedBy']);
            } else {
                $source_check['notes'][$i]['resolvedAt'] = $now_iso;
                $source_check['notes'][$i]['resolvedBy'] = $user_id;
            }
        }

        return $source_check;
    }

    /** Short type label for an audit category, as the portal shows it. */
    public static function type_label(string $category): string
    {
        switch ($category) {
            case 'CONTRADICTED':
                return __('Contradicts a source', 'structura');
            case 'UNSUPPORTED_CATEGORICAL':
                return __('Too absolute', 'structura');
            case 'OVERCLAIM':
                return __('Overpromises', 'structura');
            case 'BRIEF_VIOLATION':
                return __('Against your brief', 'structura');
            default:
                return __('Unsourced detail', 'structura');
        }
    }

    /** Where in the post a note sits. */
    public static function where_label(string $where): string
    {
        switch ($where) {
            case 'excerpt':
                return __('Excerpt', 'structura');
            case 'metaDescription':
                return __('Meta description', 'structura');
            default:
                return __('Post body', 'structura');
        }
    }

    /** `$value` when it is one of `$allowed`, else `$default`. */
    private static function one_of($value, array $allowed, string $default): string
    {
        return (is_string($value) && in_array($value, $allowed, true)) ? $value : $default;
    }

    /**
     * One of the three source shapes (official page, the brief, none of N
     * sources), or null for anything else.
     *
     * @param mixed $raw
     */
    private static function sanitize_source($raw): ?array
    {
        if ( ! is_array($raw)) {
            return null;
        }
        if ( ! empty($raw['url']) && is_string($raw['url'])) {
            return [
                'url'    => esc_url_raw($raw['url']),
                'site'   => sanitize_text_field((string) ($raw['site'] ?? '')),
                'title'  => sanitize_text_field((string) ($raw['title'] ?? '')),
                'readAt' => sanitize_text_field((string) ($raw['readAt'] ?? '')),
            ];
        }
        if ( ! empty($raw['brief'])) {
            return ['brief' => true];
        }
        if (isset($raw['notFoundIn'])) {
            return ['notFoundIn' => max(0, (int) $raw['notFoundIn'])];
        }
        return null;
    }
}
