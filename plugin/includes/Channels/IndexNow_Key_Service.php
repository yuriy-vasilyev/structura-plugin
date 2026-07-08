<?php

namespace Structura\Channels;

use Structura\Core\Public_Site_Profile;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * IndexNow key lifecycle: minting, persistence, and `/key.txt` serving.
 *
 * IndexNow (v1.0 §2) requires the publishing site to:
 *   1. Pick a random key per host (8–128 chars, [A-Za-z0-9-]).
 *   2. Serve the key verbatim at `https://{host}/{key}.txt` so the
 *      aggregator can verify ownership before crawling submitted URLs.
 *   3. Include `{ key, keyLocation }` in every submission body.
 *
 * Plugin-side responsibility split
 * --------------------------------
 * Structura's cloud dispatcher does the actual aggregator submission,
 * but the protocol's prerequisites (the key itself + a reachable
 * keyfile) are the plugin's job:
 *
 *   - {@see ensure_key} mints the key once per install and persists it
 *     in `structura_indexnow_key`. The key is regenerated only on an
 *     operator-driven rotation; reusing one key per host is the
 *     IndexNow-recommended pattern.
 *   - {@see serve_key_file} hooks `init` and emits the keyfile body
 *     when the front-end is ALSO this WordPress install (non-headless
 *     deployments). For headless installs the operator uploads the
 *     keyfile to their public site manually — no `init` work.
 *   - The cloud holds the key in two places after a connection save:
 *     in `connectionSecrets/{id}` (encrypted, read by the dispatcher)
 *     and on the connection summary's `externalAccountMeta` (public,
 *     read by the SPA to render the "Download keyfile" + "Verify"
 *     affordances).
 *
 * Why store the key in a plain WP option
 * --------------------------------------
 * The IndexNow key is public by spec — every visitor can fetch
 * `/{key}.txt` and read it. There's nothing sensitive to encrypt; a
 * regular option is the right granularity. We use a string option
 * (rather than an array of keys) because the protocol pairs ONE key
 * per host, and the per-connection persistence on the cloud side is
 * what supports the "rotate without losing history" workflow.
 *
 * Spec: `specs/site-identity-headless.md` §6.
 */
final class IndexNow_Key_Service
{
    /** Site-level option holding the active IndexNow key for this host. */
    public const OPTION_KEY = 'structura_indexnow_key';

    /**
     * IndexNow §2 key shape — 8–128 of [A-Za-z0-9-]. Mirrors the cloud
     * `INDEXNOW_KEY_RE` and the integration's own `KEY_RE`. Keep all
     * three in lockstep; the aggregator rejects anything else with a
     * 422 that looks like a generic "bad request" until you trace it.
     */
    private const KEY_REGEX = '/^[A-Za-z0-9-]{8,128}$/';

    public static function init(): void
    {
        // Hook the key-file rewrite. Bound to `init` (priority 1) so we
        // run before any rewrite-rule resolution: by the time
        // `template_redirect` fires, WP has already started routing
        // toward a 404 for `/abc123.txt` paths that don't match a
        // known post.
        add_action('init', [self::class, 'serve_key_file'], 1);
    }

    /**
     * Read the current key, or mint a fresh one if none exists yet.
     *
     * Idempotent — every successive call after the first returns the
     * same value until {@see rotate_key} is invoked. Safe to call on
     * cold paths (REST handler entry, init bootstrap) without worrying
     * about thrash.
     *
     * @return string A valid IndexNow key.
     */
    public static function ensure_key(): string
    {
        $existing = (string)get_option(self::OPTION_KEY, '');
        if ($existing !== '' && self::is_valid_key($existing)) {
            return $existing;
        }

        // Fresh-mint. 16 random bytes (128 bits) → 32 hex chars sits
        // comfortably inside the spec's 8–128 range and matches the
        // entropy ceiling Bing's reference implementation uses.
        $bytes = random_bytes(16);
        $key   = bin2hex($bytes);
        update_option(self::OPTION_KEY, $key);
        return $key;
    }

    /**
     * Force-rotate the key. Used when the operator pushes "Rotate key"
     * (Phase 4) or when verification persistently fails because the
     * old key file was never uploaded.
     *
     * Returns the NEW key. The caller is responsible for saving the
     * cloud-side connection record with `{ key: newKey, keyLocation }`
     * so the dispatcher picks up the change on the next publish.
     */
    public static function rotate_key(): string
    {
        $bytes = random_bytes(16);
        $key   = bin2hex($bytes);
        update_option(self::OPTION_KEY, $key);
        return $key;
    }

    /**
     * Compose the canonical key file URL for the public-facing host.
     *
     * In non-headless mode this is `{home_url}/{key}.txt` and the
     * `serve_key_file` hook on this class handles the request.
     *
     * In headless mode the URL points at the front-end origin
     * (`{publicUrl}/{key}.txt`) and the operator uploads the file
     * themselves — Structura can't write to a Next.js / Astro deploy
     * from inside WordPress. Either way the URL is what gets
     * persisted on the cloud connection record.
     */
    public static function build_key_location(string $key): string
    {
        $base = self::public_origin();
        return rtrim($base, '/') . '/' . $key . '.txt';
    }

    /**
     * Resolve the public origin for keyfile-URL composition.
     * Reads through {@see Public_Site_Profile} so the URL matches
     * what every other read-path uses.
     */
    public static function public_origin(): string
    {
        $profile = Public_Site_Profile::load();
        return $profile->publicUrl !== '' ? $profile->publicUrl : $profile->homeUrl;
    }

    /**
     * `init` hook: emit the keyfile body when the request URI matches
     * `/{key}.txt`.
     *
     * Behaviour
     * ---------
     *   - Reads the request path off `$_SERVER['REQUEST_URI']`. Strips
     *     query string and resolves relative to the WP site root so
     *     mu-plugins or path-prefixed installs (rare) still match.
     *   - Compares against the stored key. Any mismatch is a no-op
     *     (lets WP's normal routing produce its 404).
     *   - On match, emits a 200 with `Content-Type: text/plain` and
     *     the key as the body, then `exit`s — bypassing the rest of
     *     the request lifecycle (template loader, output filters).
     *
     * Headless caveat
     * ---------------
     * For headless installs (operator's front-end on a separate origin)
     * this hook never matches because IndexNow asks for the keyfile at
     * the PUBLIC origin, which isn't this WP install. That's fine —
     * the operator's responsibility there is to upload the file to
     * their front-end deploy. The hook simply stays dormant.
     */
    public static function serve_key_file(): void
    {
        // Cheap pre-check before reading the option: only act on
        // requests that look like a keyfile path.
        $request_uri = isset($_SERVER['REQUEST_URI']) ? sanitize_text_field(wp_unslash((string) $_SERVER['REQUEST_URI'])) : '';
        if ($request_uri === '') {
            return;
        }

        // Strip query string + fragment for comparison.
        $path = (string)wp_parse_url($request_uri, PHP_URL_PATH);
        if ($path === '') {
            return;
        }

        // Match `/{key}.txt` only (no nested paths). The spec is
        // strict about location: §2 disallows subdirectories without
        // an explicit `keyLocation` declaration.
        if ( ! preg_match('#^/([A-Za-z0-9-]{8,128})\.txt$#', $path, $matches)) {
            return;
        }

        $stored = (string)get_option(self::OPTION_KEY, '');
        if ($stored === '' || $matches[1] !== $stored) {
            // Wrong key — let WP 404 normally so an attacker probing
            // for the key can't distinguish "no key set" from
            // "different key" via response timing or status.
            return;
        }

        // Match. Emit the key as plain text and short-circuit the
        // rest of WP. Keep the response minimal — the aggregator
        // does a substring check, no metadata is needed.
        nocache_headers();
        header('Content-Type: text/plain; charset=utf-8');
        header('X-Robots-Tag: noindex');
        // $stored is already validated by is_valid_key() above (only
        // alphanumerics and hyphens per IndexNow spec), so esc_html()
        // here is a no-op for valid input — it exists solely to satisfy
        // PCP's static analysis without weakening the contract.
        echo esc_html($stored);
        exit;
    }

    /**
     * Validate a key against the IndexNow spec shape.
     *
     * Public + static so tests + callers (the verification-failure
     * recovery path) can use it without instantiating a service.
     */
    public static function is_valid_key(string $key): bool
    {
        return (bool)preg_match(self::KEY_REGEX, $key);
    }
}
