<?php

namespace Structura\Ui;

if ( ! defined('ABSPATH')) {
    exit;
}

use Structura\Core\License_Manager;
use Structura\Core\Log_Service;

/**
 * Structura post-editor meta box.
 *
 * Shows generation metadata (keyword, keyphrase, model, tokens) and
 * provides actions like "Regenerate Featured Image" for paid users.
 * Uses add_meta_box() so it works in both Gutenberg and Classic Editor.
 */
class Post_Meta_Box
{
    public function init(): void
    {
        add_action('add_meta_boxes', [$this, 'register_meta_box']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('enqueue_block_editor_assets', [$this, 'enqueue_block_editor_assets']);
        add_action('init', [$this, 'register_attachment_meta']);
        add_action('wp_ajax_structura_regenerate_image', [$this, 'ajax_regenerate_image']);
        add_action('wp_ajax_structura_apply_generated_image', [$this, 'ajax_apply_generated_image']);
        add_action('wp_ajax_structura_cleanup_unused_attachment', [$this, 'ajax_cleanup_unused_attachment']);
        // 2026-05-02 — body-image regen happens in the same meta-box
        // sidebar as featured. The earlier Gutenberg-toolbar approach
        // (assets-static/block-extensions.js) was retired because the
        // in-block toolbar can't show progress / preview cleanly; the
        // sidebar's existing modal already does both. The apply step
        // mutates `post_content` server-side and the JS reloads the
        // editor's post entity so the swap appears live.
        add_action('wp_ajax_structura_regenerate_body_image', [$this, 'ajax_regenerate_body_image']);
        add_action('wp_ajax_structura_apply_body_image', [$this, 'ajax_apply_body_image']);
    }

    /**
     * Expose the Structura attachment provenance fields via REST so
     * Gutenberg's `core` data store (`getMedia(id)`) returns them
     * alongside the standard attachment metadata. The block-editor
     * extension reads these to decide whether to render the
     * "Regenerate with Structura" toolbar button on a `core/image`
     * block.
     *
     * `_structura_image_slot` carries `featured` / `body` /
     * `body-N`; `_structura_image_topic` carries the AI-proposed
     * neutral topic the editor pre-fills the regen prompt with.
     *
     * `auth_callback` requires `edit_post` on the attachment — the
     * post author or an editor — which matches the existing
     * permission gate on `ajax_regenerate_image`.
     */
    /**
     * Resolve a campaign-shaped object suitable for handing to
     * `Task_Runner::generate_post_images`. Two paths:
     *
     *   1. Registered campaign (campaign_id present) — fetch the
     *      live cloud doc. Same behaviour as the pre-2026-05-02
     *      regen path. Returns null when the campaign was deleted
     *      after the post landed (rare but possible).
     *   2. Ephemeral single-post run (no campaign_id, or campaign
     *      doc missing) — synthesise a minimal stub from the
     *      `_structura_image_*` post meta we stamp on every post
     *      at insert time. Just enough fields for
     *      `delegate_image_to_cloud` to route the request and for
     *      `executeCloudImageStep` to attach the right metadata
     *      to the resulting generations doc.
     *
     * Returns null when both paths fail — the post genuinely has
     * no resolvable image-gen settings.
     */
    public static function resolve_campaign_for_regen(int $post_id, $campaign_id): ?array
    {
        // Path 1: registered campaign.
        if ($campaign_id && $campaign_id !== '0' && $campaign_id !== 0) {
            $campaign = \Structura\Scheduler\Campaign_Cloud_Reader::get_campaign_data((string) $campaign_id);
            if ($campaign) {
                return $campaign;
            }
            // Fall through to the stub path when the doc is gone —
            // better to regen with stamped settings than refuse.
        }

        // Path 2: synthesise from post meta. The fields we care
        // about for image gen all live in `intelligence`; the
        // outer `id` / `identity` / `structure` shape is included
        // because downstream callers spread the campaign across
        // payloads and missing keys throw PHP notices.
        $image_provider          = (string) get_post_meta($post_id, '_structura_image_provider', true);
        $image_model             = (string) get_post_meta($post_id, '_structura_image_model', true);
        $image_fallback_provider = (string) get_post_meta($post_id, '_structura_image_fallback_provider', true);
        $persona_id              = get_post_meta($post_id, '_structura_persona_id', true);

        // Path 3 — back-compat fallback for posts that pre-date
        // 2026-05-02 (when the per-post image-provenance meta
        // started landing). Without a stamped provider, we
        // synthesise one from the license's managed-tier default
        // (Cloud → gemini, Agency → openai). For BYOK Pro we
        // can't reach here without a stamped value because the
        // local-gen path also stamps these now; the no-tier-
        // default branch is what surfaces the error in that case
        // (and is the right outcome — there's literally no way
        // to know which provider the user wants on regen).
        if ($image_provider === '') {
            $license_data = \Structura\Core\License_Manager::get_license_data();
            $tier         = $license_data['plan'] ?? 'free';
            $managed_default = \Structura\Scheduler\Task_Runner::get_managed_image_default($tier);
            if ($managed_default) {
                $image_provider = $managed_default;
            }
        }

        if ($image_provider === '') {
            return null;
        }

        return [
            'id'        => 0,
            'identity'  => [
                'name'      => get_the_title($post_id),
                'objective' => '',
            ],
            'intelligence' => array_filter([
                'imageProvider'           => $image_provider,
                'imageModel'              => $image_model !== '' ? $image_model : null,
                'fallbackImageProvider'   => $image_fallback_provider !== '' ? $image_fallback_provider : null,
                'personaId'               => $persona_id !== '' ? $persona_id : null,
            ], static fn ($v) => $v !== null),
            'structure' => [
                'featuredImage' => true,
                'bodyImages'    => true,
                'postStatus'    => 'publish',
            ],
        ];
    }

    /**
     * Build a map of {old_url ⇒ new_url} covering every size variant
     * that WordPress generated for the old attachment, paired with
     * its corresponding variant on the new attachment. Used by the
     * body-image apply handler to rewrite `<img src>` and `srcset`
     * — both can reference any size, not just `full`.
     *
     * Falls back to the new attachment's `full` URL when a specific
     * size isn't available on the new attachment (e.g. the new image
     * has different dimensions and didn't generate the same size
     * variant). Better to render full-size than to leave a broken
     * link to a non-existent file.
     */
    public static function build_attachment_url_swap_map(int $old_id, int $new_id): array
    {
        $swaps = [];

        $old_meta = wp_get_attachment_metadata($old_id);
        $new_meta = wp_get_attachment_metadata($new_id);
        if ( ! is_array($old_meta) || ! is_array($new_meta)) {
            return $swaps;
        }

        $upload   = wp_upload_dir();
        $base_url = trailingslashit($upload['baseurl'] ?? '');

        // 2026-05-02 — `wp_upload_dir()['baseurl']` can return an
        // HTTP URL on installs behind a reverse proxy (Cloudflare,
        // ngrok, anything that terminates TLS upstream of WP). The
        // editor page itself is served over HTTPS, so the browser
        // refuses to load the new image and reports a Mixed Content
        // warning — the apply succeeds server-side but the user
        // sees the old image because the new src 404s. Force the
        // upload URL scheme to match the request scheme; the file
        // is reachable on both schemes when the proxy auto-redirects.
        if (is_ssl()) {
            $base_url = set_url_scheme($base_url, 'https');
        }

        $old_dir_url = $base_url . trailingslashit(dirname($old_meta['file']));
        $new_dir_url = $base_url . trailingslashit(dirname($new_meta['file']));
        $new_full    = $new_dir_url . basename($new_meta['file']);

        // Helper: register both http:// and https:// variants of
        // each old URL in the swap map. Old post_content may have
        // been written when the site was on a different scheme
        // (HTTP local dev → HTTPS production). The browser-side
        // mismatch shows up as a stuck old image; ensuring both
        // variants resolve in our swap fixes it.
        $register = static function (string $old_url, string $new_url) use (&$swaps): void {
            $http_old  = set_url_scheme($old_url, 'http');
            $https_old = set_url_scheme($old_url, 'https');
            $swaps[$http_old]  = $new_url;
            $swaps[$https_old] = $new_url;
        };

        // Full-size first.
        $register($base_url . $old_meta['file'], $base_url . $new_meta['file']);
        $register($old_dir_url . basename($old_meta['file']), $new_full);

        // Size variants. WP stores each size's filename in
        // `$meta['sizes'][$size_name]['file']` (basename only — the
        // directory is shared with the parent attachment).
        $old_sizes = $old_meta['sizes'] ?? [];
        $new_sizes = $new_meta['sizes'] ?? [];
        foreach ($old_sizes as $size_name => $size_meta) {
            if (empty($size_meta['file'])) {
                continue;
            }
            $old_size_url = $old_dir_url . $size_meta['file'];
            $new_size_url = isset($new_sizes[$size_name]['file'])
                ? $new_dir_url . $new_sizes[$size_name]['file']
                : $new_full;
            $register($old_size_url, $new_size_url);
        }

        return $swaps;
    }

    /**
     * Walk the post's parsed block tree, find every `core/image`
     * block whose `attrs.id` matches the old attachment, and
     * rewrite ALL references to the old image:
     *
     *   - `attrs.id`     → new id
     *   - `<img src>`    → mapped via `$url_swaps`
     *   - `<img class>`  → `wp-image-OLD` → `wp-image-NEW`
     *   - `<img srcset>` → each comma-separated URL mapped via
     *                     `$url_swaps`, falling back to the full
     *                     URL when the specific size isn't mapped.
     *
     * Returns the re-serialised post_content. When no matching
     * block was found, returns the input unchanged so the caller
     * can detect "no-op" via strict equality.
     */
    public static function swap_image_block_attachment(
        string $content,
        int $old_id,
        int $new_id,
        array $url_swaps
    ): string {
        if ( ! function_exists('parse_blocks') || ! function_exists('serialize_blocks')) {
            return $content;
        }

        $blocks = parse_blocks($content);
        $changed = false;

        $walker = function (array &$blocks) use (&$walker, &$changed, $old_id, $new_id, $url_swaps) {
            foreach ($blocks as &$block) {
                if (
                    isset($block['blockName'], $block['attrs']['id'])
                    && $block['blockName'] === 'core/image'
                    && (int) $block['attrs']['id'] === $old_id
                ) {
                    $block['attrs']['id'] = $new_id;

                    $rewrite = static function (string $html) use ($old_id, $new_id, $url_swaps): string {
                        // CSS class — both the leading class form
                        // (`class="wp-image-N"`) and the
                        // space-separated form (`class="foo wp-image-N bar"`).
                        $html = str_replace('wp-image-' . $old_id, 'wp-image-' . $new_id, $html);

                        // src + every URL in srcset. We do this by
                        // running each old URL through str_replace
                        // — naive but correct for non-overlapping
                        // URLs. Sort by length DESC so longer
                        // matches (size variants) win over the
                        // shorter base URL prefix.
                        $keys = array_keys($url_swaps);
                        usort($keys, static fn ($a, $b) => strlen($b) <=> strlen($a));
                        foreach ($keys as $old_url) {
                            $html = str_replace($old_url, $url_swaps[$old_url], $html);
                        }
                        return $html;
                    };

                    $block['innerHTML']    = $rewrite($block['innerHTML']);
                    $block['innerContent'] = array_map(
                        static function ($chunk) use ($rewrite) {
                            return is_string($chunk) ? $rewrite($chunk) : $chunk;
                        },
                        $block['innerContent']
                    );

                    $changed = true;
                }

                if ( ! empty($block['innerBlocks'])) {
                    $walker($block['innerBlocks']);
                }
            }
        };
        $walker($blocks);

        if ( ! $changed) {
            return $content;
        }

        return serialize_blocks($blocks);
    }

    public function register_attachment_meta(): void
    {
        $auth = static function ($allowed, $meta_key, $object_id) {
            return current_user_can('edit_post', (int) $object_id);
        };

        foreach (['_structura_image_slot', '_structura_image_topic'] as $meta_key) {
            register_post_meta('attachment', $meta_key, [
                'single'        => true,
                'type'          => 'string',
                'show_in_rest'  => true,
                'auth_callback' => $auth,
            ]);
        }
    }

    /**
     * Only register the meta box on posts that were generated by Structura.
     *
     * Gate: post carries any Structura provenance — campaign id (registered
     * campaign) OR campaign run id (ephemeral single-post run). The
     * 2026-05-02 single-post flow doesn't stamp `_structura_campaign_id`
     * because there's no registered campaign behind it; pre-fix the
     * meta box silently disappeared on those posts and users had no
     * way to regenerate the image.
     */
    public function register_meta_box(): void
    {
        // Must be a paid (licensed) user
        if ( ! License_Manager::is_licensed()) {
            return;
        }

        global $post;

        if ( ! $post || ! self::post_is_structura_generated($post->ID)) {
            return;
        }

        add_meta_box(
                'structura-post-info',
                'Structura',
                [$this, 'render'],
                'post',
                'side',
                'high',
        );
    }

    /**
     * True when a post has any Structura provenance — registered campaign
     * id OR ephemeral run id. Centralised so the meta-box gate, asset
     * enqueue gate, and the regen handlers all agree on what counts as
     * "ours."
     */
    /**
     * Wrapper around `Task_Runner::get_managed_image_default` that
     * tolerates the class not being loaded — defensive for the
     * `enqueue_assets` path which runs early in the admin lifecycle.
     */
    private static function get_managed_image_default_safe(string $tier): ?string
    {
        if ( ! class_exists(\Structura\Scheduler\Task_Runner::class)) {
            return null;
        }
        return \Structura\Scheduler\Task_Runner::get_managed_image_default($tier);
    }

    /**
     * Validate a per-regen image provider override before forwarding
     * it to the cloud. Returns the provider id when the user has it
     * connected (i.e. it appears in `Provider_Registry::get_connected_providers`
     * for the user's tier AND advertises image capability), otherwise
     * null.
     *
     * Why a connected-providers gate rather than a catalog-membership
     * check: the cloud's image-resolver throws on managed-tier requests
     * for image-incapable providers and on BYOK requests without a
     * matching workspace credential. By rejecting unknown / unconnected
     * providers here, the user gets a clean "use the campaign default"
     * fallback instead of a generic Cloud 500 — and we don't burn a
     * cloud round-trip on a request that was always going to fail.
     */
    private static function sanitize_image_provider_override($raw): ?string
    {
        if ( ! is_string($raw) || $raw === '') {
            return null;
        }
        // Truncate at the first non-id character (rather than stripping
        // them inline). Provider ids are always `[A-Za-z0-9._-]+`, so
        // " openai " trims down to "openai", and a hostile
        // "openai\n<script>..." stops at the newline. Stripping inline
        // would leave the leftover word characters fused onto the
        // candidate ("openaiscriptalert"), which never matches a real
        // provider — same outcome, but harder to read in logs and
        // brittle if a future provider id happens to share a prefix
        // with garbage input.
        if ( ! preg_match('/^[A-Za-z0-9._\-]+/', trim($raw), $matches)) {
            return null;
        }
        $candidate = $matches[0];
        if ($candidate === '' || ! class_exists(\Structura\Core\Provider_Registry::class)) {
            return null;
        }
        $tier      = License_Manager::get_license_data()['plan'] ?? 'free';
        $connected = \Structura\Core\Provider_Registry::get_connected_providers($tier);
        foreach ($connected as $provider) {
            if (($provider['id'] ?? '') !== $candidate) {
                continue;
            }
            $caps = (array) ($provider['capabilities'] ?? []);
            return in_array('image', $caps, true) ? $candidate : null;
        }
        return null;
    }

    public static function post_is_structura_generated(int $post_id): bool
    {
        if (get_post_meta($post_id, '_structura_campaign_id', true)) {
            return true;
        }
        if (get_post_meta($post_id, '_structura_campaign_run_id', true)) {
            return true;
        }
        return false;
    }

    /**
     * Enqueue the small JS file only on the post editor for Structura posts.
     */
    public function enqueue_assets(string $hook): void
    {
        if ( ! in_array($hook, ['post.php', 'post-new.php'], true)) {
            return;
        }

        if ( ! License_Manager::is_licensed()) {
            return;
        }

        global $post;

        if ( ! $post || ! self::post_is_structura_generated($post->ID)) {
            return;
        }

        wp_enqueue_script(
                'structura-post-meta-box',
                STRUCTURA_URL . 'assets-static/post-meta-box.js',
                ['jquery'],
                STRUCTURA_VERSION,
                true,
        );

        // 2026-05-02 — image model picker. We pre-resolve the
        // catalog server-side and pass it to the modal so the user
        // gets an instantly-populated dropdown on first open. The
        // catalog comes from `Provider_Registry::get_models($pid,
        // 'image')` — same source the "Add Provider" SPA dropdown
        // uses, so any catalog changes (new model, deprecated
        // model) flow through both surfaces consistently.
        //
        // Tier rules applied client-side:
        //   - free / pro: full non-fast catalog for the user's
        //     image provider.
        //   - cloud (managed mid): only `default: true` entries
        //     (mid-tier); top entries appear DISABLED with an
        //     "Agency only" hint.
        //   - agency (managed top): full non-fast catalog (master
        //     keys, full access).
        $license_data = License_Manager::get_license_data();
        $tier         = $license_data['plan'] ?? 'free';

        // 2026-05-07 — the picker now lists models from EVERY connected
        // image-capable provider, not just the post's stamped one.
        // Pre-fix the picker was scoped to `_structura_image_provider`
        // (the campaign's provider at insert time), which made the
        // dropdown stale the moment the user changed their default
        // provider in the AI Engine settings — they'd see only the
        // original provider's models with no obvious way to switch
        // even though they had another provider connected. Now we
        // enumerate `get_connected_providers()` and build a flat
        // catalog tagged with `provider`/`providerName` so the JS
        // can group models by provider in `<optgroup>`s. The post's
        // stamped provider (or the tier-managed default) is still
        // surfaced as `preferredProvider` so the JS can put its
        // mid-tier model at the top of the list as the implicit
        // "Use default" entry — preserving the no-click happy path
        // while giving multi-provider users real choice.
        $stamped_image_provider = (string) get_post_meta($post->ID, '_structura_image_provider', true);
        $preferred_provider     = $stamped_image_provider !== ''
            ? $stamped_image_provider
            : (self::get_managed_image_default_safe($tier) ?? '');

        $image_models_catalog = [];
        if (class_exists(\Structura\Core\Provider_Registry::class)) {
            $connected = \Structura\Core\Provider_Registry::get_connected_providers($tier);
            foreach ($connected as $provider) {
                $provider_id = (string) ($provider['id'] ?? '');
                $caps        = $provider['capabilities'] ?? [];
                if ($provider_id === '' || ! in_array('image', (array) $caps, true)) {
                    continue;
                }
                $catalog = \Structura\Core\Provider_Registry::get_models($provider_id, 'image');
                foreach ($catalog as $m) {
                    $image_models_catalog[] = [
                        'id'           => $m['id'] ?? '',
                        'name'         => $m['name'] ?? ($m['id'] ?? ''),
                        'provider'     => $provider_id,
                        'providerName' => (string) ($provider['name'] ?? $provider_id),
                        'fast'         => ! empty($m['fast']),
                        'recommended'  => ! empty($m['recommended']),
                        'default'      => ! empty($m['default']),
                    ];
                }
            }
        }

        wp_localize_script('structura-post-meta-box', 'structuraMetaBox', [
                'ajaxUrl'           => admin_url('admin-ajax.php'),
                'nonce'             => wp_create_nonce('structura_regenerate_image'),
                'postId'            => $post->ID,
                'tier'              => $tier,
                // Kept for back-compat with any third-party code that
                // reads `imageProvider` off the localized object.
                'imageProvider'     => $preferred_provider,
                'preferredProvider' => $preferred_provider,
                'imageModels'       => $image_models_catalog,
        ]);

        wp_enqueue_style(
                'structura-post-meta-box',
                STRUCTURA_URL . 'assets-static/post-meta-box.css',
                [],
                STRUCTURA_VERSION,
        );
    }

    /**
     * Enqueue the Gutenberg block-editor extension that adds a
     * branded "Regenerate with Structura" button to the toolbar of
     * every `core/image` block whose attachment we generated.
     *
     * 2026-05-02 design note (post-redesign): the toolbar button is
     * NOT a self-contained regen surface — it just **opens the same
     * modal** the post-meta-box sidebar uses, with the right slot +
     * attachment id pre-selected. This keeps preview, progress bar,
     * and apply behaviour in one place; the button is a shortcut for
     * users who are reading a body image inline and want to act on
     * THAT specific image without scrolling to the sidebar.
     *
     * Gated by `can_generate_body_images()` so free-tier editors
     * don't see the affordance — they have featured-only via the
     * sidebar and no body images to act on.
     */
    public function enqueue_block_editor_assets(): void
    {
        if ( ! License_Manager::is_licensed()) {
            return;
        }
        if ( ! License_Manager::can_generate_body_images()) {
            return;
        }

        global $post;
        if ( ! $post || ! self::post_is_structura_generated($post->ID)) {
            return;
        }

        wp_enqueue_script(
            'structura-block-extensions',
            STRUCTURA_URL . 'assets-static/block-extensions.js',
            ['wp-blocks', 'wp-element', 'wp-components', 'wp-data', 'wp-i18n', 'wp-hooks', 'wp-block-editor', 'wp-compose'],
            STRUCTURA_VERSION,
            true,
        );
    }


    /**
     * Render the meta box content.
     */
    public function render(\WP_Post $post): void
    {
        // `_structura_campaign_id` is mixed type — int post id for legacy
        // WP-authoritative installs, nanoid string for cloud-authoritative.
        // Casting to int silently zeroes nanoids, which made every cloud-
        // auth post look unlinked to its campaign. Read raw and let
        // downstream code handle both shapes.
        $campaign_id   = get_post_meta($post->ID, '_structura_campaign_id', true);
        $keyword       = get_post_meta($post->ID, '_structura_target_keyword', true);
        $gen_meta      = get_post_meta($post->ID, '_structura_generation_meta', true);
        $campaign_name = ! empty($gen_meta['campaign_name']) ? $gen_meta['campaign_name'] : '';
        // Generation run id — links the post back to the cloud run
        // doc that produced it. Drives the "View generation run"
        // link in the meta box (deep-links to /generate/runs/:runId
        // for ephemeral runs, /campaigns/{id}/runs/:runId for
        // registered campaigns — the SPA route disambiguates).
        $campaign_run_id = (string) get_post_meta($post->ID, '_structura_campaign_run_id', true);

        // Keyphrase — check Yoast first, then RankMath
        $keyphrase = get_post_meta($post->ID, '_yoast_wpseo_focuskw', true);
        if (empty($keyphrase)) {
            $keyphrase = get_post_meta($post->ID, 'rank_math_focus_keyword', true);
        }

        // Token usage — pre-compute for the badge
        $tokens_total = 0;
        if (is_array($gen_meta) && ! empty($gen_meta['usage']) && is_array($gen_meta['usage'])) {
            $u            = $gen_meta['usage'];
            $tokens_in    = (int)($u['inputTokens'] ?? $u['promptTokens'] ?? 0);
            $tokens_out   = (int)($u['outputTokens'] ?? $u['completionTokens'] ?? 0);
            $tokens_total = $tokens_in + $tokens_out;
        }

        // Model — friendly short name
        $model_raw = is_array($gen_meta) ? ($gen_meta['model'] ?? '') : '';

        ?>
        <div class="structura-mb">

            <?php
            if ($campaign_name): ?>
                <a href="<?php
                echo esc_url(admin_url('admin.php?page=structura#/campaigns/' . $campaign_id)); ?>"
                   class="structura-mb__campaign">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                    <?php
                    echo esc_html($campaign_name); ?>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                         stroke-linecap="round" stroke-linejoin="round" class="structura-mb__arrow">
                        <polyline points="9 18 15 12 9 6"/>
                    </svg>
                </a>
            <?php
            endif; ?>

            <?php
            // "View generation run" — links to the SPA's run-detail
            // surface that shows what the AI was asked for, the
            // status timeline, and (eventually) the model usage +
            // token counts. For posts produced by the SPA's
            // "Generate Post" form, that's `/generate/runs/:runId`;
            // for posts produced by a scheduled campaign, the same
            // route works because the SPA disambiguates by the
            // run doc's `isEphemeral` flag.
            //
            // Surface only when we have the run id stamped — pre-1.20
            // posts (before `_structura_campaign_run_id` was added)
            // simply skip this row.
            if ($campaign_run_id !== ''): ?>
                <a href="<?php
                echo esc_url(admin_url('admin.php?page=structura#/generate/runs/' . $campaign_run_id)); ?>"
                   class="structura-mb__campaign">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                    <?php esc_html_e('View generation run', 'structura'); ?>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="structura-mb__arrow">
                        <polyline points="9 18 15 12 9 6"/>
                    </svg>
                </a>
            <?php
            endif; ?>

            <!-- Keyword / Keyphrase pills -->
            <?php
            if ($keyword || $keyphrase): ?>
                <div class="structura-mb__pills">
                    <?php
                    if ($keyword): ?>
                        <div class="structura-mb__pill">
                            <span class="structura-mb__pill-label"><?php
                                esc_html_e('Keyword', 'structura'); ?></span>
                            <span class="structura-mb__pill-value"><?php
                                echo esc_html($keyword); ?></span>
                        </div>
                    <?php
                    endif; ?>
                    <?php
                    if ($keyphrase): ?>
                        <div class="structura-mb__pill">
                            <span class="structura-mb__pill-label"><?php
                                esc_html_e('Keyphrase', 'structura'); ?></span>
                            <span class="structura-mb__pill-value"><?php
                                echo esc_html($keyphrase); ?></span>
                        </div>
                    <?php
                    endif; ?>
                </div>
            <?php
            endif; ?>

            <!-- Generation Stats -->
            <?php
            if (is_array($gen_meta) && ($model_raw || $tokens_total)): ?>
                <div class="structura-mb__stats">
                    <?php
                    if ($model_raw): ?>
                        <div class="structura-mb__stat">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93L12 22"/>
                                <path d="M12 2a4 4 0 0 0-4 4c0 1.95 1.4 3.58 3.25 3.93"/>
                                <path d="M8.56 13a10.1 10.1 0 0 0-.6 3.36c0 2.36 1.27 4.64 3.04 4.64"/>
                                <path d="M15.44 13a10.1 10.1 0 0 1 .6 3.36c0 2.36-1.27 4.64-3.04 4.64"/>
                            </svg>
                            <span><?php
                                echo esc_html($model_raw); ?></span>
                        </div>
                    <?php
                    endif; ?>
                    <?php
                    if ($tokens_total): ?>
                        <div class="structura-mb__stat">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-3-3.87"/>
                                <path d="M4 21v-2a4 4 0 0 1 3-3.87"/>
                                <circle cx="12" cy="7" r="4"/>
                            </svg>
                            <span><?php
                                echo esc_html(number_format($tokens_total)); ?><?php
                                esc_html_e('tokens used', 'structura'); ?></span>
                        </div>
                    <?php
                    endif; ?>
                    <?php
                    if ( ! empty($gen_meta['generated_at'])): ?>
                        <div class="structura-mb__stat">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                                <line x1="16" y1="2" x2="16" y2="6"/>
                                <line x1="8" y1="2" x2="8" y2="6"/>
                                <line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                            <?php
                            $ts = strtotime($gen_meta['generated_at']); ?>
                            <span><?php
                                echo $ts ? esc_html(wp_date('M j, Y \a\t g:i A', $ts)) : '—'; ?></span>
                        </div>
                    <?php
                    endif; ?>
                </div>
            <?php
            endif; ?>

            <!-- Naturalness note -->
            <?php
            // Structura deliberately varies cadence, titles, and transitions
            // post-to-post so the blog doesn't read as mass-produced. That can
            // leave one Yoast/Rank Math readability check at orange by design.
            // Users read "not 100/100" as broken, so we explain it once here
            // and link to the full rationale rather than let it generate a
            // support ticket. Always shown — it's true of every generated post.
            $readability_docs_url = 'https://docs.structurawp.com/en/troubleshooting/readability-score'; ?>
            <p class="structura-mb__note">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <span>
                    <?php esc_html_e(
                        'Structura varies wording and titles so your content reads human, so an occasional non-perfect readability score is by design.',
                        'structura'
                    ); ?>
                    <a href="<?php echo esc_url($readability_docs_url); ?>" target="_blank" rel="noopener noreferrer">
                        <?php esc_html_e('Why?', 'structura'); ?>
                    </a>
                </span>
            </p>

            <!-- Featured Image -->
            <?php
            if (License_Manager::can_generate_featured_image()): ?>
                <div class="structura-mb__divider"></div>

                <div class="structura-mb__image-section">
                    <?php
                    $thumb_id = get_post_thumbnail_id($post->ID);
                    if ($thumb_id):
                        $thumb_url = wp_get_attachment_image_url($thumb_id, 'medium');
                        ?>
                        <div class="structura-mb__thumb" id="structura-thumb-wrap">
                            <img src="<?php
                            echo esc_url($thumb_url); ?>" alt=""/>
                            <div class="structura-mb__thumb-overlay">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                    <circle cx="8.5" cy="8.5" r="1.5"/>
                                    <polyline points="21 15 16 10 5 21"/>
                                </svg>
                            </div>
                        </div>
                    <?php
                    endif; ?>

                    <button type="button" id="structura-regen-image" class="structura-mb__btn"
                            data-slot="featured" data-attachment-id="<?php echo esc_attr((string) $thumb_id); ?>">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                             class="structura-mb__btn-icon">
                            <polyline points="23 4 23 10 17 10"/>
                            <polyline points="1 20 1 14 7 14"/>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                        </svg>
                        <span><?php
                            esc_html_e('Regenerate Featured Image', 'structura'); ?></span>
                    </button>
                </div>
            <?php
            endif; ?>

            <?php
            // Body images — paid tiers only (License_Manager::is_pro()
            // returns false on free). Free-tier license has access to
            // featured-image regen above but body images aren't part
            // of the free generation surface, so the regen affordance
            // would be confusing — there's no body image to act on.
            if (License_Manager::can_generate_body_images()):
                $body_attachments = get_posts([
                    'post_type'      => 'attachment',
                    'post_parent'    => $post->ID,
                    'posts_per_page' => -1,
                    'orderby'        => 'ID',
                    'order'          => 'ASC',
                    'fields'         => 'ids',
                    // 2026-05-02 — registered post-meta lets us
                    // filter via meta_query without listing every
                    // attachment first. The slot is stamped at
                    // sideload time (Task_Runner) for cloud-inline
                    // and AS-chain paths alike.
                    'meta_query'     => [
                        [
                            'key'     => '_structura_image_slot',
                            'value'   => 'featured',
                            'compare' => '!=',
                        ],
                    ],
                ]);
                if ( ! empty($body_attachments)):
                    ?>
                <div class="structura-mb__divider"></div>
                <div class="structura-mb__image-section">
                    <div class="structura-mb__section-label">
                        <?php esc_html_e('Body images', 'structura'); ?>
                    </div>
                    <?php foreach ($body_attachments as $body_attachment_id):
                        $body_thumb_url = wp_get_attachment_image_url((int) $body_attachment_id, 'thumbnail');
                        if ( ! $body_thumb_url) continue;
                        $body_slot = (string) get_post_meta((int) $body_attachment_id, '_structura_image_slot', true);
                        ?>
                        <div class="structura-mb__body-row">
                            <div class="structura-mb__body-thumb">
                                <img src="<?php echo esc_url($body_thumb_url); ?>" alt=""/>
                            </div>
                            <button type="button"
                                    class="structura-mb__btn structura-mb__btn--body"
                                    data-slot="<?php echo esc_attr($body_slot); ?>"
                                    data-attachment-id="<?php echo esc_attr((string) $body_attachment_id); ?>">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                                     class="structura-mb__btn-icon">
                                    <polyline points="23 4 23 10 17 10"/>
                                    <polyline points="1 20 1 14 7 14"/>
                                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                                </svg>
                                <span><?php esc_html_e('Regenerate', 'structura'); ?></span>
                            </button>
                        </div>
                    <?php endforeach; ?>
                </div>
            <?php
                endif;

                // Unfilled body-image placeholder. The cloud emits
                // `<!-- structura:image -->` markers in the post body
                // and `Task_Runner::inject_image_into_content` swaps
                // them for rendered Image blocks during a normal run.
                // A placeholder still in the content here means the
                // image step didn't deliver — provider failure, expired
                // stock URL (Yurii incident 2026-05-08), or a manual
                // paste from elsewhere. Surface a CTA so the user can
                // recover without opening the block editor.
                $post_obj_for_placeholder = get_post($post->ID);
                $has_unfilled_placeholder  = $post_obj_for_placeholder
                    && strpos((string) $post_obj_for_placeholder->post_content, '<!-- structura:image -->') !== false;
                if ($has_unfilled_placeholder):
                    ?>
                <div class="structura-mb__divider"></div>
                <div class="structura-mb__image-section">
                    <div class="structura-mb__section-label">
                        <?php esc_html_e('Body image (missing)', 'structura'); ?>
                    </div>
                    <p class="structura-mb__placeholder-msg">
                        <?php esc_html_e('A body image was scheduled here but never delivered. Generate one now to fill the placeholder.', 'structura'); ?>
                    </p>
                    <button type="button"
                            class="structura-mb__btn structura-mb__btn--body"
                            data-slot="body-0"
                            data-attachment-id="0">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                             class="structura-mb__btn-icon">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <span><?php esc_html_e('Generate body image', 'structura'); ?></span>
                    </button>
                </div>
            <?php
                endif;
            endif; ?>
        </div>

        <!-- Modal: Image Generation Studio -->
        <div id="structura-modal-backdrop" class="structura-modal-backdrop" style="display:none;">
            <div class="structura-modal">
                <div class="structura-modal__header">
                    <h3><?php
                        esc_html_e('Generate Featured Image', 'structura'); ?></h3>
                    <button type="button" id="structura-modal-close" class="structura-modal__close" aria-label="<?php
                    esc_attr_e('Close', 'structura'); ?>">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>

                <div class="structura-modal__body">
                    <!-- Prompt input -->
                    <div class="structura-modal__prompt-section">
                        <label for="structura-modal-prompt" class="structura-modal__label">
                            <?php
                            esc_html_e('Describe the image', 'structura'); ?>
                            <span class="structura-modal__label-hint"><?php
                                esc_html_e('(optional)', 'structura'); ?></span>
                        </label>
                        <textarea
                                id="structura-modal-prompt"
                                class="structura-modal__textarea"
                                rows="2"
                                placeholder="<?php
                                esc_attr_e('Leave blank to reuse the previous topic. Omit style guidelines — your global art direction is applied automatically.',
                                        'structura'); ?>"
                        ></textarea>
                    </div>

                    <!-- Image model picker (2026-05-02) — populated
                         by post-meta-box.js based on tier + provider.
                         Hidden by JS for free tier (local adapter
                         doesn't support per-post model overrides). -->
                    <div class="structura-modal__model-section" id="structura-modal-model-section" style="display:none;">
                        <label for="structura-modal-model" class="structura-modal__label">
                            <?php esc_html_e('Image model', 'structura'); ?>
                            <span class="structura-modal__label-hint" id="structura-modal-model-hint"></span>
                        </label>
                        <select id="structura-modal-model" class="structura-modal__select"></select>
                    </div>

                    <!-- Preview area: states = idle / loading / preview / error -->
                    <div id="structura-modal-preview" class="structura-modal__preview">
                        <div class="structura-modal__preview-idle" id="structura-preview-idle">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <polyline points="21 15 16 10 5 21"/>
                            </svg>
                            <p><?php
                                esc_html_e('Click "Generate" to create a new image', 'structura'); ?></p>
                        </div>
                        <div class="structura-modal__preview-loading" id="structura-preview-loading"
                             style="display:none;">
                            <p><?php
                                esc_html_e('Generating your image…', 'structura'); ?></p>
                            <div class="structura-modal__progress-bar">
                                <div class="structura-modal__progress-fill" id="structura-progress-fill"></div>
                            </div>
                        </div>
                        <div class="structura-modal__preview-result" id="structura-preview-result"
                             style="display:none;">
                            <img id="structura-preview-img" src="" alt=""/>
                        </div>
                        <div class="structura-modal__preview-error" id="structura-preview-error" style="display:none;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="15" y1="9" x2="9" y2="15"/>
                                <line x1="9" y1="9" x2="15" y2="15"/>
                            </svg>
                            <p id="structura-preview-error-msg"></p>
                        </div>
                    </div>
                </div>

                <div class="structura-modal__footer">
                    <button type="button" id="structura-modal-generate" class="structura-modal__btn-generate">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                             class="structura-modal__btn-icon">
                            <polyline points="23 4 23 10 17 10"/>
                            <polyline points="1 20 1 14 7 14"/>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                        </svg>
                        <span><?php
                            esc_html_e('Generate', 'structura'); ?></span>
                    </button>
                    <button type="button" id="structura-modal-apply" class="structura-modal__btn-apply"
                            style="display:none;">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                            <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        <span><?php
                            esc_html_e('Use this image', 'structura'); ?></span>
                    </button>
                </div>
            </div>
        </div>
        <?php
    }

    /**
     * AJAX: Generate a new featured image candidate (does NOT replace the current one).
     *
     * Returns a preview URL and attachment ID. The user decides whether to apply it.
     */
    public function ajax_regenerate_image(): void
    {
        check_ajax_referer('structura_regenerate_image', 'nonce');

        if ( ! current_user_can('edit_posts')) {
            wp_send_json_error(['message' => __('Permission denied.', 'structura')]);
        }

        // 2026-05-07 — top-tier image models (gpt-image-2, Imagen) can
        // take 60-120s end-to-end; the cloud HTTP call's wp_remote_post
        // timeout is 300s (Task_Runner::delegate_image_to_cloud) but
        // PHP's max_execution_time on admin-ajax often defaults to
        // 30-60s. Without this bump the PHP process gets reaped before
        // wp_remote_post returns and the user sees a generic "Request
        // failed" instead of the actual generated image. set_time_limit
        // is silently a no-op when safe-mode / disable_functions blocks
        // it, which is fine — falls back to the host default.
        // phpcs:ignore Squiz.PHP.DiscouragedFunctions.Discouraged -- intentional; image gen outlives the default 30-60s on admin-ajax.
        @set_time_limit(360);

        $post_id = isset($_POST['post_id']) ? absint(wp_unslash($_POST['post_id'])) : 0;

        if ( ! $post_id || ! get_post($post_id)) {
            wp_send_json_error(['message' => __('Invalid post.', 'structura')]);
        }

        // 2026-05-02 — also accept ephemeral single-post runs. The
        // gate moved to "post has any Structura provenance" so the
        // meta box (and the regen affordances) surface on
        // /generate-form posts that don't carry a campaign id.
        if ( ! self::post_is_structura_generated($post_id)) {
            wp_send_json_error(['message' => __('This post was not generated by Structura.', 'structura')]);
        }

        // Mixed type — int (WP-auth post id) or string (cloud-auth nanoid).
        // Cast-to-int silently zeroed nanoids, which is what made every
        // cloud-auth post show "No campaign linked to this post" in the
        // editor's Regenerate Image dialog. Read raw and route the
        // campaign lookup through the cloud-auth flag below.
        $campaign_id = get_post_meta($post_id, '_structura_campaign_id', true);

        // Topic resolution chain — in priority order:
        //   1. User's custom prompt from the textarea (explicit override)
        //   2. The CURRENT featured attachment's stored generation topic
        //      (Phase B — most accurate; survives regens)
        //   3. The run's original featured_image.topic from the text
        //      blueprint (Phase A — works even for posts that pre-date
        //      Phase B, as long as the run's text gen still exists)
        //   4. The post title (last-resort generic fallback)
        //
        // 2026-04-30 cms.xerx.io regression: regen used the post title
        // and produced a generic image. Phase A used the run's original
        // topic. Phase B narrows further to per-attachment lookup so
        // multiple consecutive regens each chain off the previous
        // attempt's actual prompt rather than re-using the original.
        $custom_prompt = isset($_POST['custom_prompt']) ? sanitize_textarea_field(wp_unslash($_POST['custom_prompt'])) : '';
        if (! empty($custom_prompt)) {
            $topic = $custom_prompt;
        } else {
            $topic = $this->resolve_attachment_image_topic($post_id, 'featured')
                ?: ($this->resolve_original_image_topic($post_id, 'featured')
                    ?: get_the_title($post_id));
        }

        $image_data = [
                'topic'     => $topic,
                'alt'       => get_the_title($post_id),
                'file_name' => sanitize_file_name(sanitize_title(get_the_title($post_id))) . '-preview',
        ];

        // 2026-05-01 v2 — cloud is the single source of truth.
        // 2026-05-02 — fall through to a stub-from-post-meta when
        // the campaign no longer exists or this is an ephemeral
        // single-post run. resolve_campaign_for_regen returns the
        // saved cloud doc when available, else builds a minimal
        // shape from the image-provenance meta we stamp at insert
        // time. Either path produces something
        // `Task_Runner::generate_post_images` can route through
        // `delegate_image_to_cloud`.
        $campaign = self::resolve_campaign_for_regen($post_id, $campaign_id);
        if ( ! $campaign) {
            wp_send_json_error(['message' => __('Cannot resolve image generation settings for this post.', 'structura')]);
        }

        try {
            // Generate the image but DON'T set it as featured thumbnail yet.
            // We intercept the _thumbnail_id meta update so generate_post_images()
            // runs the full pipeline (generate → sideload → process) but the
            // set_post_thumbnail() call at the end is silently blocked.
            $block_thumb = function ($check, $object_id, $meta_key) use ($post_id) {
                if ((int)$object_id === $post_id && $meta_key === '_thumbnail_id') {
                    return true; // Short-circuit — don't actually set the thumbnail
                }

                return $check;
            };

            add_filter('update_post_metadata', $block_thumb, 10, 3);

            // 2026-05-02 — accept per-regen image model override
            // from the modal's model picker. Sanitised aggressively
            // (alnum + hyphen + dot only — every catalog id matches
            // that shape) so we can hand it through to cloud
            // without a separate validate-and-throw round-trip.
            $override_model = isset($_POST['image_model']) && is_string($_POST['image_model'])
                ? preg_replace('/[^A-Za-z0-9._\-]/', '', sanitize_text_field(wp_unslash($_POST['image_model'])))
                : '';

            // 2026-05-07 — accept per-regen image provider override.
            // The picker now lists every connected image-capable
            // provider, so the user can switch (e.g. campaign was
            // generated with OpenAI, but they want to try Gemini for
            // this regen). Validate against connected providers so
            // an attacker can't spoof a provider the user hasn't
            // configured — `get_connected_providers` is what the
            // picker itself reads, so a valid client never sends
            // anything outside that set.
            $override_provider = self::sanitize_image_provider_override(
                isset($_POST['image_provider']) ? sanitize_text_field(wp_unslash($_POST['image_provider'])) : null
            );

            $task_runner = new \Structura\Scheduler\Task_Runner();
            $task_runner->generate_post_images(
                $post_id,
                'featured',
                $image_data,
                $campaign,
                $override_model !== '' ? $override_model : null,
                $override_provider
            );

            remove_filter('update_post_metadata', $block_thumb, 10);

            // Find the most recently added attachment for this post
            $attachments = get_posts([
                    'post_type'      => 'attachment',
                    'post_parent'    => $post_id,
                    'posts_per_page' => 1,
                    'orderby'        => 'ID',
                    'order'          => 'DESC',
                    'fields'         => 'ids',
            ]);

            $new_attachment_id = ! empty($attachments) ? $attachments[0] : 0;

            if ( ! $new_attachment_id) {
                wp_send_json_error(['message' => __('Image was generated but could not be found.', 'structura')]);
            }

            // Phase B — tag the regenerated attachment with the topic
            // and slot we used. Without this, the chain breaks: the next
            // regen click would resolve to an attachment with no
            // Structura meta and fall all the way back to the run's
            // original topic, losing any custom prompt the user typed
            // on this regen. Stamping these here keeps each successive
            // regen's default tied to the previous attempt's prompt.
            //
            // We DON'T stamp `_structura_generation_id` because this
            // local-AS regen path doesn't write to the cloud's
            // generations collection — there's no cloud doc to
            // reference. A future enhancement: route regen through
            // the cloud's executeCloudImageStep so it writes a fresh
            // generation doc per regen and we can stamp the id here.
            update_post_meta(
                $new_attachment_id,
                '_structura_image_topic',
                sanitize_text_field((string) $topic)
            );
            update_post_meta(
                $new_attachment_id,
                '_structura_image_slot',
                'featured'
            );

            $preview_url = wp_get_attachment_image_url($new_attachment_id, 'medium');

            wp_send_json_success([
                    'attachment_id' => $new_attachment_id,
                    'preview_url'   => $preview_url,
            ]);
        } catch (\Exception $e) {
            Log_Service::add('error', 'Image regeneration failed: ' . $e->getMessage(), $campaign_id, 'visuals');

            wp_send_json_error([
                    'message' => __('Image generation failed. Check the Structura log for details.', 'structura'),
            ]);
        }
    }

    /**
     * AJAX: Generate a fresh body-image candidate for a `core/image`
     * block embedded in the post content. Mirrors the featured-image
     * regen flow with two differences:
     *
     *   1. Slot is read from the *attachment's* `_structura_image_slot`
     *      meta — body images can be `body`, `body-0`, `body-1`, …,
     *      and the editor sends along the attachment id of the block
     *      the user clicked.
     *   2. There's no "apply" handler. Apply is purely client-side:
     *      the editor JS receives the new attachment id + URL and
     *      dispatches `updateBlockAttributes(clientId, { id, url })`
     *      against `core/block-editor`. Persisting happens when the
     *      user clicks Save (or on autosave).
     *
     * Why no server-side apply: the block sits in `post_content` next
     * to whatever else the user is editing. A server-side
     * `wp_update_post` here would clobber unsaved editor state.
     * Client-side dispatch keeps the editor's mental model intact and
     * matches the featured-image preview pattern (which also doesn't
     * touch the post until the user confirms).
     */
    public function ajax_regenerate_body_image(): void
    {
        check_ajax_referer('structura_regenerate_image', 'nonce');

        if ( ! current_user_can('edit_posts')) {
            wp_send_json_error(['message' => __('Permission denied.', 'structura')]);
        }

        // 2026-05-07 — see ajax_regenerate_image for rationale; image
        // gen can outlive the host's default max_execution_time.
        // phpcs:ignore Squiz.PHP.DiscouragedFunctions.Discouraged -- intentional; image gen outlives the default 30-60s on admin-ajax.
        @set_time_limit(360);

        $post_id       = isset($_POST['post_id']) ? absint(wp_unslash($_POST['post_id'])) : 0;
        $attachment_id = isset($_POST['attachment_id']) ? absint(wp_unslash($_POST['attachment_id'])) : 0;

        if ( ! $post_id || ! get_post($post_id)) {
            wp_send_json_error(['message' => __('Invalid post.', 'structura')]);
        }

        // Two modes: REGENERATE (replace an existing body attachment)
        // and CREATE (fill an unfilled `<!-- structura:image -->`
        // placeholder when no body attachment exists yet — recovers
        // posts whose original image step didn't deliver). The CREATE
        // mode is signalled by `attachment_id: 0` from the meta box's
        // "Generate body image" CTA.
        $is_create_mode = ($attachment_id === 0);
        if ( ! $is_create_mode && get_post_type($attachment_id) !== 'attachment') {
            wp_send_json_error(['message' => __('Invalid attachment.', 'structura')]);
        }

        if ( ! self::post_is_structura_generated($post_id)) {
            wp_send_json_error(['message' => __('This post was not generated by Structura.', 'structura')]);
        }
        $campaign_id = get_post_meta($post_id, '_structura_campaign_id', true);

        if ($is_create_mode) {
            // Create mode — slot defaults to body-0. The JS click
            // handler can pass an explicit slot via `data-slot` if
            // future callers need multi-body support, but the meta
            // box's CTA always emits "body-0" today.
            $raw_slot = isset($_POST['slot']) ? sanitize_text_field(wp_unslash((string) $_POST['slot'])) : 'body-0';
            $slot     = strpos($raw_slot, 'body') === 0 ? $raw_slot : 'body-0';
        } else {
            // Slot id stamped on the attachment at sideload time.
            // Required — without it we can't tell the cloud which
            // slot we're regenerating, and the resulting generations
            // record would come back without a routable slot field.
            $slot = get_post_meta($attachment_id, '_structura_image_slot', true);
            if ( ! $slot || ! is_string($slot) || $slot === 'featured') {
                // `featured` is the dedicated meta-box flow; this
                // handler is body-only. Refuse rather than silently
                // doing the wrong thing.
                wp_send_json_error(['message' => __('This image is not a body image.', 'structura')]);
            }
        }

        // Topic resolution chain — same shape as the featured handler:
        //   1. User's custom prompt (explicit override).
        //   2. The CURRENT attachment's stored topic (Phase B style —
        //      lets repeated regens chain off the previous attempt's
        //      prompt instead of resetting to the original). Skipped
        //      in CREATE mode (no prior attachment to inherit from).
        //   3. The post title (last-resort generic).
        $custom_prompt = isset($_POST['custom_prompt']) ? sanitize_textarea_field(wp_unslash($_POST['custom_prompt'])) : '';
        if (! empty($custom_prompt)) {
            $topic = $custom_prompt;
        } elseif ($is_create_mode) {
            $topic = get_the_title($post_id);
        } else {
            $topic = (string) get_post_meta($attachment_id, '_structura_image_topic', true);
            if ($topic === '') {
                $topic = get_the_title($post_id);
            }
        }

        // Reuse the existing alt / file_name conventions — same shape
        // the AS chain emits. file_name is suffixed `-regen` so the
        // media library lists the new attachment distinctly from the
        // original.
        $image_data = [
            'topic'     => $topic,
            'alt'       => $is_create_mode
                ? get_the_title($post_id)
                : ((string) get_post_meta($attachment_id, '_wp_attachment_image_alt', true) ?: get_the_title($post_id)),
            'file_name' => sanitize_file_name(sanitize_title(get_the_title($post_id))) . '-' . $slot . '-regen',
        ];

        // 2026-05-02 — same campaign-or-stub resolution as the
        // featured handler so ephemeral single-post runs can regen
        // body images too.
        $campaign = self::resolve_campaign_for_regen($post_id, $campaign_id);
        if ( ! $campaign) {
            wp_send_json_error(['message' => __('Cannot resolve image generation settings for this post.', 'structura')]);
        }

        try {
            // Block both the thumbnail write AND the
            // `inject_image_into_content` path (which would shove an
            // extra duplicate image block into the post content).
            // generate_post_images sideloads + processes for us, then
            // hits the inject step we're suppressing — we want JUST
            // the new attachment, not a content mutation.
            //
            // The thumbnail filter is the same defensive guard as the
            // featured handler in case generate_post_images re-routes
            // through set_post_thumbnail for any future code path.
            $block_thumb = function ($check, $object_id, $meta_key) use ($post_id) {
                if ((int) $object_id === $post_id && $meta_key === '_thumbnail_id') {
                    return true;
                }
                return $check;
            };
            add_filter('update_post_metadata', $block_thumb, 10, 3);

            // `inject_image_into_content` runs inside generate_post_images
            // when image_type !== 'featured'. The `structura/post/inject_image`
            // filter gives us a hook to short-circuit — if it doesn't
            // exist (older plugin code paths), we fall back to scanning
            // and reverting the post-content write below. Today's
            // simplest stable approach: pass image_type='featured' so
            // the inject branch is skipped; the thumbnail filter above
            // catches the set_post_thumbnail attempt. Net effect: only
            // the new attachment is created.
            //
            // We DON'T pass the real slot to generate_post_images
            // because that would hit inject_image_into_content; we
            // restore the slot on the resulting attachment's meta
            // immediately after.
            // 2026-05-02 — same per-regen model override path as
            // the featured handler.
            $override_model = isset($_POST['image_model']) && is_string($_POST['image_model'])
                ? preg_replace('/[^A-Za-z0-9._\-]/', '', sanitize_text_field(wp_unslash($_POST['image_model'])))
                : '';

            // 2026-05-07 — same per-regen provider override path as
            // the featured handler. See its docblock for rationale.
            $override_provider = self::sanitize_image_provider_override(
                isset($_POST['image_provider']) ? sanitize_text_field(wp_unslash($_POST['image_provider'])) : null
            );

            $task_runner = new \Structura\Scheduler\Task_Runner();
            $task_runner->generate_post_images(
                $post_id,
                'featured',
                $image_data,
                $campaign,
                $override_model !== '' ? $override_model : null,
                $override_provider
            );

            remove_filter('update_post_metadata', $block_thumb, 10);

            // The newest attachment parented to this post is the one
            // we just minted (matches the featured-handler pattern).
            $attachments = get_posts([
                'post_type'      => 'attachment',
                'post_parent'    => $post_id,
                'posts_per_page' => 1,
                'orderby'        => 'ID',
                'order'          => 'DESC',
                'fields'         => 'ids',
            ]);
            $new_attachment_id = ! empty($attachments) ? (int) $attachments[0] : 0;

            if ( ! $new_attachment_id) {
                wp_send_json_error(['message' => __('Image was generated but could not be found.', 'structura')]);
            }

            // Restore the body slot on the new attachment (we passed
            // 'featured' to generate_post_images for inject-skip
            // reasons, so generate_post_images stamped 'featured' on
            // the meta — overwrite back to the actual body slot so
            // the next regen click reads the right value).
            update_post_meta(
                $new_attachment_id,
                '_structura_image_slot',
                sanitize_text_field((string) $slot)
            );
            update_post_meta(
                $new_attachment_id,
                '_structura_image_topic',
                sanitize_text_field((string) $topic)
            );

            $preview_url = wp_get_attachment_image_url($new_attachment_id, 'large');
            $full_url    = wp_get_attachment_image_url($new_attachment_id, 'full');

            wp_send_json_success([
                'attachment_id'    => $new_attachment_id,
                'preview_url'      => $preview_url,
                'full_url'         => $full_url,
                'old_attachment_id' => $attachment_id,
                'slot'             => $slot,
            ]);
        } catch (\Exception $e) {
            Log_Service::add('error', 'Body image regeneration failed: ' . $e->getMessage(), $campaign_id, 'visuals');

            wp_send_json_error([
                'message' => __('Image generation failed. Check the Structura log for details.', 'structura'),
            ]);
        }
    }

    /**
     * AJAX: Apply a body-image regen by swapping the old attachment's
     * id + url for the new one inside `post_content`. Run after the
     * user clicks "Use this image" in the modal.
     *
     * Why server-side rather than client dispatch (the previous
     * Gutenberg-toolbar approach): the meta-box modal lives outside
     * the block tree, so `wp.data.dispatch('core/block-editor')` is
     * not reachable from the modal's vanilla-jQuery context without
     * pulling the Gutenberg runtime into the meta box. The
     * server-side rewrite is the cleaner cut.
     *
     * Race condition with unsaved editor edits: the user has
     * explicitly opted into a regen that mutates `post_content`. We
     * accept that any unsaved edits in flight are clobbered — it's a
     * single targeted swap (one attachment id + URL string) and the
     * post will be re-rendered immediately by the editor's
     * post-entity refetch in the JS apply handler.
     */
    public function ajax_apply_body_image(): void
    {
        check_ajax_referer('structura_regenerate_image', 'nonce');

        if ( ! current_user_can('edit_posts')) {
            wp_send_json_error(['message' => __('Permission denied.', 'structura')]);
        }

        $post_id        = isset($_POST['post_id']) ? absint(wp_unslash($_POST['post_id'])) : 0;
        $old_attachment = isset($_POST['old_attachment_id']) ? absint(wp_unslash($_POST['old_attachment_id'])) : 0;
        $new_attachment = isset($_POST['new_attachment_id']) ? absint(wp_unslash($_POST['new_attachment_id'])) : 0;

        if ( ! $post_id || ! $new_attachment) {
            wp_send_json_error(['message' => __('Invalid request.', 'structura')]);
        }

        $post = get_post($post_id);
        if ( ! $post) {
            wp_send_json_error(['message' => __('Post not found.', 'structura')]);
        }

        // CREATE mode (paired with `ajax_regenerate_body_image`'s
        // `attachment_id: 0` path) — there's no existing attachment
        // to swap in/out of post_content; instead the post body has
        // a `<!-- structura:image -->` placeholder we replace with
        // the new image's rendered Image block. Same source of truth
        // (post_content) as the regen path, just a different write.
        if ($old_attachment === 0) {
            $url      = wp_get_attachment_image_url($new_attachment, 'large');
            $alt      = (string) get_post_meta($new_attachment, '_wp_attachment_image_alt', true);
            $image_html = \Structura\Generator\Block_Serializer::generate_image_block(
                $new_attachment,
                $url,
                $alt,
                ''
            );
            $placeholder = '<!-- structura:image -->';
            $content     = (string) $post->post_content;
            if (strpos($content, $placeholder) === false) {
                wp_send_json_error([
                    'message' => __('Could not locate the placeholder in the post content.', 'structura'),
                ]);
            }
            // Replace JUST THE FIRST occurrence — preserves any other
            // unfilled placeholders for follow-up regen flows. PHP's
            // `str_replace` would replace all; `preg_replace` with a
            // count of 1 keeps the surgery scoped. `addcslashes` on
            // the replacement guards against `$0`/`$1` backreference
            // interpretation if the image block ever contains those
            // sequences.
            $new_content = preg_replace(
                '/<!-- structura:image -->/',
                addcslashes($image_html, '\\$'),
                $content,
                1
            );

            wp_update_post([
                'ID'           => $post_id,
                'post_content' => $new_content,
            ]);

            wp_send_json_success([
                'post_id'           => $post_id,
                'new_attachment_id' => $new_attachment,
                'new_url'           => wp_get_attachment_image_url($new_attachment, 'full'),
            ]);
        }

        if ( ! $old_attachment) {
            wp_send_json_error(['message' => __('Invalid request.', 'structura')]);
        }

        // Gutenberg's `core/image` block embeds the attachment in
        // FOUR places, each of which has to be rewritten or the
        // saved HTML still renders the old image:
        //
        //   1. `<!-- wp:image {"id":N,...} -->` — the block-comment
        //      attributes (Gutenberg reads this on load).
        //   2. `<img src="...">` — the rendered HTML, often the
        //      `large` size (`...-1024x683.jpg`), NOT the `full`.
        //   3. `<img class="wp-image-N">` — the CSS hook used for
        //      caption styling and lazy-load tooling.
        //   4. `<img srcset="... 300w, ... 1024w, ...">` — every
        //      generated size variant.
        //
        // 2026-05-02 — pre-fix we only caught (1) and the full-size
        // form of (2). The other three were left pointing at the
        // old attachment, so the editor re-rendered the saved post
        // and showed the old image. Yurii report 2026-05-02.
        //
        // Approach: parse_blocks + walk + targeted rewrite. Block-
        // aware so we don't accidentally rewrite an image of the
        // same id that lives inside a different block (gallery,
        // cover, etc.) — those have their own apply paths.
        $content = (string) $post->post_content;
        $url_swaps = self::build_attachment_url_swap_map($old_attachment, $new_attachment);
        $new_content = self::swap_image_block_attachment(
            $content,
            $old_attachment,
            $new_attachment,
            $url_swaps
        );

        if ($new_content === $content) {
            wp_send_json_error([
                'message' => __('Could not locate the body image in the post content.', 'structura'),
            ]);
        }

        wp_update_post([
            'ID'           => $post_id,
            'post_content' => $new_content,
        ]);

        // Mark the old attachment for cleanup if it isn't referenced
        // anywhere else (matches the featured-image apply behaviour).
        // Best-effort — failure to delete is fine; bucket TTL on the
        // cloud handoff sweeps within 7 days regardless.
        if ($old_attachment !== $new_attachment) {
            $still_used = strpos($new_content, (string) $old_attachment) !== false;
            if ( ! $still_used) {
                wp_delete_attachment($old_attachment, true);
            }
        }

        wp_send_json_success([
            'post_id'          => $post_id,
            'new_attachment_id' => $new_attachment,
            'new_url'          => wp_get_attachment_image_url($new_attachment, 'full'),
        ]);
    }

    /**
     * AJAX: Apply a previously generated image as the featured image.
     *
     * Optionally deletes the old featured image to keep the media library clean.
     */
    public function ajax_apply_generated_image(): void
    {
        check_ajax_referer('structura_regenerate_image', 'nonce');

        if ( ! current_user_can('edit_posts')) {
            wp_send_json_error(['message' => __('Permission denied.', 'structura')]);
        }

        $post_id       = isset($_POST['post_id']) ? absint(wp_unslash($_POST['post_id'])) : 0;
        $attachment_id = isset($_POST['attachment_id']) ? absint(wp_unslash($_POST['attachment_id'])) : 0;

        if ( ! $post_id || ! $attachment_id || ! get_post($attachment_id)) {
            wp_send_json_error(['message' => __('Invalid request.', 'structura')]);
        }

        // Delete old featured image
        $old_thumb_id = get_post_thumbnail_id($post_id);
        if ($old_thumb_id && $old_thumb_id !== $attachment_id) {
            wp_delete_attachment($old_thumb_id, true);
        }

        // Set the new one
        set_post_thumbnail($post_id, $attachment_id);

        $thumb_url = wp_get_attachment_image_url($attachment_id, 'medium');

        // Bump stats
        $total = (int)get_option('structura_stat_generated_images', 0);
        update_option('structura_stat_generated_images', $total + 1);

        wp_send_json_success([
                'message'   => __('Featured image updated.', 'structura'),
                'thumb_url' => $thumb_url,
        ]);
    }

    /**
     * Phase B — resolve the topic for the CURRENT attachment in this
     * post's `$slot`, using the attachment's stored generation id.
     *
     * Lookup order:
     *   1. Read `_structura_image_topic` from the attachment directly —
     *      that's what the sideload helper stamped at insert time, and
     *      it's the cheapest path (no cloud round-trip).
     *   2. If absent (older attachment, or `topic` wasn't set on the
     *      bundle), read `_structura_generation_id` and fetch the
     *      generation doc from the cloud — its `topic` field is what
     *      we want.
     *
     * Returns null when:
     *   - The post has no featured attachment (slot=featured) or no
     *     body image attachments (slot=body)
     *   - The attachment has no Structura meta (e.g. uploaded by a
     *     human after the cloud-generated one was deleted)
     *   - The cloud lookup fails / endpoint returns 404
     *
     * Caller falls back to the run-level Phase A lookup, then post title.
     */
    private function resolve_attachment_image_topic(int $post_id, string $slot): ?string
    {
        // Find the attachment for this slot. Featured is straightforward;
        // body is harder (no canonical "featured-equivalent" relation),
        // so for body we walk the post's image children and pick the
        // first that carries our slot meta. v1 supports one body image
        // per post; multi-body posts are a separate enhancement.
        $attachment_id = 0;
        if ($slot === 'featured') {
            $attachment_id = (int) get_post_thumbnail_id($post_id);
        } else {
            // Find the first attachment on this post whose Structura
            // slot meta matches. `get_attached_media` walks attachments
            // parented to the post, which is what `process_and_import_image`
            // produces. Cheap enough — most posts have <5 attachments.
            $attachments = get_attached_media('image', $post_id);
            foreach ($attachments as $att) {
                if (! ($att instanceof \WP_Post)) continue;
                $att_slot = (string) get_post_meta($att->ID, '_structura_image_slot', true);
                if ($att_slot === $slot || strpos($att_slot, $slot . '-') === 0) {
                    $attachment_id = (int) $att->ID;
                    break;
                }
            }
        }

        if ($attachment_id <= 0) {
            return null;
        }

        // Cheap path — sideload-time topic is enough.
        $topic = (string) get_post_meta($attachment_id, '_structura_image_topic', true);
        if ($topic !== '') {
            return $topic;
        }

        // Fallback — fetch from cloud by generation id. This path also
        // handles future regens whose attachment-meta was stamped but
        // whose topic was deferred (none today; defensive).
        $generation_id = (string) get_post_meta($attachment_id, '_structura_generation_id', true);
        if ($generation_id === '') {
            return null;
        }

        try {
            $license = \Structura\Core\Key_Manager::get_license_payload();
            $license_key = is_array($license) && isset($license['key']) ? (string) $license['key'] : '';
            $secret      = is_array($license) && isset($license['secret']) ? (string) $license['secret'] : '';
            if ($license_key === '' || $secret === '') {
                return null;
            }

            $result = \Structura\Core\Cloud_Client::post('/getGenerationById', [
                'license_key'       => $license_key,
                'site_url'          => home_url(),
                'activation_secret' => $secret,
                'generation_id'     => $generation_id,
            ]);

            if (is_wp_error($result)) {
                return null;
            }
            $body = is_array($result) ? ($result['body'] ?? null) : null;
            if (! is_array($body) || empty($body['success']) || empty($body['generation'])) {
                return null;
            }

            $gen = $body['generation'];
            $topic = $gen['topic'] ?? null;
            return is_string($topic) && $topic !== '' ? $topic : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Fetch the AI's original image topic for `$slot` (featured / body) by
     * looking up the post's text generation in the cloud.
     *
     * Why on-demand instead of post meta: the cloud's `generations` collection
     * is the single source of truth for AI output. Duplicating image topics
     * to WP post meta would mean two writers and a back-compat surface to
     * worry about per release. The post already carries
     * `_structura_campaign_run_id`, which is enough to find the matching
     * text gen on the cloud (one text record per run; multiple image
     * records share the same runId).
     *
     * Returns the topic string on success, null on any failure (no run id,
     * cloud miss, parse error, license problem). Caller falls back to the
     * post title.
     *
     * Note: this currently only resolves the topic the run STARTED with.
     * If the user has previously regenerated this slot with a custom
     * prompt, that prompt isn't in the text gen blueprint — it's in a
     * later image generation record. Phase B (per-attachment generation
     * id) lets us read the most recent prompt for THIS attachment; until
     * that lands, we surface the run's original topic which is still
     * better than the post title.
     */
    private function resolve_original_image_topic(int $post_id, string $slot): ?string
    {
        $run_id = (string) get_post_meta($post_id, '_structura_campaign_run_id', true);
        if (empty($run_id)) {
            return null;
        }

        try {
            $license = \Structura\Core\Key_Manager::get_license_payload();
            $license_key = is_array($license) && isset($license['key']) ? (string) $license['key'] : '';
            $secret      = is_array($license) && isset($license['secret']) ? (string) $license['secret'] : '';
            if ($license_key === '' || $secret === '') {
                return null;
            }

            // `Cloud_Client::post` returns ['code' => int, 'body' => decoded
            // array, 'raw' => WP response]. The body is already decoded —
            // don't double-decode. WP_Error means transport failure.
            $result = \Structura\Core\Cloud_Client::post('/getGenerationByRunId', [
                'license_key'       => $license_key,
                'site_url'          => home_url(),
                'activation_secret' => $secret,
                'campaign_run_id'   => $run_id,
            ]);

            if (is_wp_error($result)) {
                return null;
            }

            $body = is_array($result) ? ($result['body'] ?? null) : null;
            if (! is_array($body) || empty($body['success']) || empty($body['blueprint'])) {
                return null;
            }

            $key = $slot === 'featured' ? 'featured_image' : 'body_image';
            $topic = $body['blueprint'][$key]['topic'] ?? null;
            return is_string($topic) && $topic !== '' ? $topic : null;
        } catch (\Throwable $e) {
            // Best-effort — any failure here just degrades to the
            // post-title fallback, which is the pre-fix behavior.
            return null;
        }
    }

    /**
     * AJAX: Delete an unused generated attachment (user closed modal without applying).
     */
    public function ajax_cleanup_unused_attachment(): void
    {
        check_ajax_referer('structura_regenerate_image', 'nonce');

        if ( ! current_user_can('edit_posts')) {
            wp_send_json_error();
        }

        $attachment_id = isset($_POST['attachment_id']) ? absint(wp_unslash($_POST['attachment_id'])) : 0;

        if ($attachment_id && get_post($attachment_id) && get_post_type($attachment_id) === 'attachment') {
            wp_delete_attachment($attachment_id, true);
        }

        wp_send_json_success();
    }
}
