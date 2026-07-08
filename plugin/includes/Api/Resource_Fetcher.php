<?php

namespace Structura\Api;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Fetches a user-supplied resource URL (typically a brand logo or a
 * reference page) and splits it into signals the AI can consume.
 *
 * Three branches:
 *   1. Raster image (PNG/JPEG/WEBP/GIF) — base64-encoded so the cloud can
 *      attach it as a multimodal input to vision-capable models.
 *   2. SVG — text-parsed for hex color tokens (fill / stroke / stop-color /
 *      inline style), plus the truncated XML source so the model has
 *      structural context. We deliberately do NOT rasterize SVGs here
 *      (Imagick is unreliable across WP hosts); the extracted palette +
 *      source covers the ~95% case for logo identity cues.
 *   3. HTML / text — tag-stripped body, unchanged from the original
 *      `fetch_url_content` behavior.
 *
 * Pure helpers (color extraction, mime branching) are static so PHPUnit
 * can cover them without Brain Monkey stubs for wp_remote_get.
 *
 * @since 1.15.0
 */
class Resource_Fetcher
{
    /**
     * Hard cap on raster image size after base64 encoding. Cloud Functions
     * v2 HTTP triggers accept up to 32 MB of payload, but most Gemini
     * inlineData recommendations cap at ~20 MB; we stay well below that
     * so the enriched context doesn't crowd out the rest of the blueprint.
     */
    const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB pre-base64

    /**
     * SVG bodies are plain text but can include embedded raster data URIs
     * inside <image href="data:..."> — those balloon the payload without
     * adding color signal. Truncate to keep the prompt lean.
     */
    const MAX_SVG_CHARS = 4000;

    /**
     * Stripped HTML/text cap. Matches the pre-refactor behavior of
     * `Rest_Api::fetch_url_content()` so existing callers don't regress.
     */
    const MAX_TEXT_CHARS = 2000;

    /**
     * Fetch a URL and return a normalized resource descriptor.
     *
     * Shape of the returned array:
     *   [
     *     'content'     => string,          // human-readable snippet for prompt
     *     'colors'      => ?array<string>,  // uppercase hex codes like '#E01A4F'
     *     'image'       => ?array{mime:string, base64:string},
     *     'kind'        => 'raster'|'svg'|'text'|'empty',
     *   ]
     *
     * On any failure (network error, 4xx/5xx, oversize binary) we return
     * `kind=empty` with an empty `content` — callers keep their existing
     * graceful-degradation behavior. Errors do NOT throw because one bad
     * reference URL should not kill the whole suggestion request.
     *
     * @return array{content:string, colors:?array, image:?array, kind:string}
     */
    public static function fetch(string $url): array
    {
        $empty = ['content' => '', 'colors' => null, 'image' => null, 'kind' => 'empty'];

        if (empty($url)) {
            return $empty;
        }

        $response = wp_remote_get($url, [
            // 8s is enough for a logo on a slow host but keeps the suggest
            // request well under the WP REST default 30s ceiling.
            'timeout'    => 8,
            'user-agent' => 'Structura-AI/1.0 (+https://structurawp.com)',
            // WordPress default is to cap response body to 8 MB which is
            // fine for our 3 MB image budget; we guard again after fetch.
        ]);

        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            return $empty;
        }

        $body         = (string) wp_remote_retrieve_body($response);
        $content_type = strtolower((string) wp_remote_retrieve_header($response, 'content-type'));

        $kind = self::classify($url, $content_type, $body);

        if ($kind === 'svg') {
            return self::build_svg_descriptor($body);
        }

        if ($kind === 'raster') {
            return self::build_raster_descriptor($body, $content_type);
        }

        return self::build_text_descriptor($body);
    }

    /**
     * Classify the resource using content-type first, URL extension as a
     * fallback (some WP hosts serve SVGs with a generic `application/xml`
     * or `text/plain` content-type), and a tiny body sniff as a last
     * resort. We return `text` rather than `empty` for unknown types so
     * stripped-HTML extraction still runs for `text/html` pages.
     *
     * @return 'raster'|'svg'|'text'|'empty'
     */
    public static function classify(string $url, string $content_type, string $body): string
    {
        // Strip the charset suffix so "image/svg+xml; charset=utf-8" still matches.
        $mime = trim(explode(';', $content_type)[0] ?? '');

        if (in_array($mime, ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'], true)) {
            return 'raster';
        }

        if ($mime === 'image/svg+xml' || $mime === 'application/svg+xml') {
            return 'svg';
        }

        // Extension fallback for hosts with mis-configured content-types.
        $path = (string) wp_parse_url($url, PHP_URL_PATH);
        $ext  = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        if (in_array($ext, ['png', 'jpg', 'jpeg', 'webp', 'gif'], true)) {
            return 'raster';
        }
        if ($ext === 'svg') {
            return 'svg';
        }

        // Body sniff: a response that starts with `<svg` or an XML prolog
        // followed by `<svg` is an SVG regardless of what the host claims.
        $head = ltrim(mb_substr($body, 0, 256));
        if (preg_match('/^(<\?xml[^>]*\?>\s*)?(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i', $head)) {
            return 'svg';
        }

        return 'text';
    }

    /**
     * Pulls unique hex colors out of SVG markup.
     *
     * Matches:
     *   - Attribute hexes: `fill="#ABC"`, `stroke='#aabbcc'`, `stop-color="#ff0000"`
     *   - Inline CSS hexes: `style="fill:#E01A4F;stroke:#F39323"`
     *   - Declared <style> block hexes: `.cls-1 { fill: #E01A4F }`
     *
     * Deliberately ignored:
     *   - `none`, `transparent`, `currentColor`, `inherit` — not colors.
     *   - Named colors (`red`, `salmon`) — too ambiguous for a brand signal
     *     and rarely used in modern logo SVGs.
     *   - `rgb()/hsl()/rgba()` — rare in hand-exported logo SVGs; we can
     *     add support later if a user reports their logo ships with them.
     *
     * Hex values are upper-cased and expanded from shorthand (`#abc` →
     * `#AABBCC`) so duplicates collapse correctly. Output preserves the
     * *first occurrence* order from the SVG source — brand logos usually
     * list the primary color first (it's the one the designer dropped
     * onto the largest shape), which is the order we want in the prompt.
     *
     * @return array<string> Uppercase 6-digit hex codes, no duplicates.
     */
    public static function extract_svg_colors(string $svg): array
    {
        $colors = [];

        $seen = function (string $hex) use (&$colors): void {
            $normalized = self::normalize_hex($hex);
            if ($normalized !== null && ! in_array($normalized, $colors, true)) {
                $colors[] = $normalized;
            }
        };

        // 1. Attribute-form hex: fill="#xxx" / fill='#xxx' on any of the
        //    three paint attributes we care about. The attribute list is
        //    deliberately narrow — catching `color=` here would sweep in
        //    `currentColor` resolutions we don't want.
        if (preg_match_all(
            '/\b(?:fill|stroke|stop-color|flood-color|lighting-color)\s*=\s*["\']\s*(#[0-9A-Fa-f]{3,8})\s*["\']/',
            $svg,
            $attr_matches
        )) {
            foreach ($attr_matches[1] as $hex) {
                $seen($hex);
            }
        }

        // 2. Inline + <style>-block form: `fill: #xxx`, `stroke:#xxx`, etc.
        //    The colon is mandatory so we don't pick up fragments from
        //    `#id` selectors.
        if (preg_match_all(
            '/\b(?:fill|stroke|stop-color|flood-color|lighting-color|color|background(?:-color)?)\s*:\s*(#[0-9A-Fa-f]{3,8})/i',
            $svg,
            $css_matches
        )) {
            foreach ($css_matches[1] as $hex) {
                $seen($hex);
            }
        }

        return $colors;
    }

    /**
     * Normalize a CSS hex token to an uppercase 6-digit form.
     *
     * Accepts `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`. Returns `null` for
     * unsupported lengths (5 or 7 chars are invalid CSS) and for values
     * that look structurally hex but resolve to a "non-color" — there's
     * none of the latter today but we keep the null return for symmetry
     * with the rgb()/hsl() branch we'll likely add later.
     */
    public static function normalize_hex(string $token): ?string
    {
        $hex = ltrim($token, '#');
        $len = strlen($hex);

        // Collapse 4-digit (RGBA) and 8-digit (RRGGBBAA) to their RGB
        // portion — the alpha channel isn't a brand signal on its own.
        if ($len === 4) {
            $hex = substr($hex, 0, 3);
            $len = 3;
        } elseif ($len === 8) {
            $hex = substr($hex, 0, 6);
            $len = 6;
        }

        if ($len === 3) {
            $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
        } elseif ($len !== 6) {
            return null;
        }

        if ( ! ctype_xdigit($hex)) {
            return null;
        }

        return '#' . strtoupper($hex);
    }

    /**
     * Build the SVG-branch descriptor: extract colors, include a
     * truncated copy of the markup so the cloud model has structural
     * context, and build a human-readable `content` line the blueprint
     * can inject as-is into the prompt.
     */
    private static function build_svg_descriptor(string $body): array
    {
        $colors = self::extract_svg_colors($body);

        // Content preamble: state the detected palette so the prompt
        // can re-surface it even if the raw SVG gets truncated away by
        // downstream summarization.
        $preamble = $colors
            ? 'Detected brand colors (extracted from logo SVG, in source order): ' . implode(', ', $colors)
            : 'Logo SVG fetched but no hex colors detected — palette should be inferred from shapes/context.';

        $truncated_source = mb_substr($body, 0, self::MAX_SVG_CHARS);

        $content = $preamble . "\n\nSVG source (truncated to " . self::MAX_SVG_CHARS . " chars):\n" . $truncated_source;

        return [
            'content' => $content,
            'colors'  => $colors ?: null,
            'image'   => null,
            'kind'    => 'svg',
        ];
    }

    /**
     * Build the raster-branch descriptor: base64-encode the bytes so the
     * cloud can attach them to a multimodal model call. Respects the
     * pre-base64 size cap so oversize hero images don't blow up the REST
     * payload.
     */
    private static function build_raster_descriptor(string $body, string $content_type): array
    {
        $length = strlen($body);
        if ($length === 0 || $length > self::MAX_IMAGE_BYTES) {
            // Oversize: fall back to a text hint. The cloud blueprint
            // will nudge the model to ask for a smaller logo rather
            // than invent a palette.
            return [
                'content' => $length > self::MAX_IMAGE_BYTES
                    ? sprintf(
                        'Logo image skipped — %d bytes exceeds the %d-byte cap for multimodal inputs.',
                        $length,
                        self::MAX_IMAGE_BYTES
                    )
                    : '',
                'colors'  => null,
                'image'   => null,
                'kind'    => 'empty',
            ];
        }

        // Normalize image/jpg → image/jpeg (some servers send the short
        // form; Gemini and OpenAI both require the canonical mime).
        $mime = trim(explode(';', $content_type)[0] ?? '') ?: 'image/png';
        if ($mime === 'image/jpg') {
            $mime = 'image/jpeg';
        }

        return [
            'content' => 'Logo image attached as multimodal input (see vision part below). Extract the brand palette from the image itself.',
            'colors'  => null,
            'image'   => [
                'mime'   => $mime,
                'base64' => base64_encode($body),
            ],
            'kind'    => 'raster',
        ];
    }

    /**
     * Build the HTML/text-branch descriptor. Behavior parity with the
     * legacy `Rest_Api::fetch_url_content()` — callers upgrading from
     * the old helper do not see a content shape change.
     */
    private static function build_text_descriptor(string $body): array
    {
        // Remove <style>, <script> blocks and all tags, then normalize whitespace.
        $body = (string) preg_replace('#<(style|script)[^>]*>.*?</\1>#si', '', $body);
        $body = wp_strip_all_tags($body);
        $body = (string) preg_replace('/\s+/', ' ', $body);
        $body = trim($body);

        return [
            'content' => mb_substr($body, 0, self::MAX_TEXT_CHARS),
            'colors'  => null,
            'image'   => null,
            'kind'    => $body === '' ? 'empty' : 'text',
        ];
    }
}
