<?php

namespace Structura\Scheduler;

use Structura\Compat\Builder_Compat;
use Structura\Core\Cloud_Client;
use Structura\Core\Image_Processor;
use Structura\Core\Key_Manager;
use Structura\Core\License_Manager;
use Structura\Core\Log_Service;
use Structura\Core\Log_Steps;
use Structura\Core\Provider_Registry;
use Structura\Core\Public_Site_Profile;
use Structura\Generator\Block_Serializer;

if ( ! defined('ABSPATH')) {
    exit;
}

class Task_Runner
{

    private Context_Builder $context_builder;

    /**
     * Optional dependency injection — production callers pass nothing and
     * get the real context builder. Unit tests pass a mock so they can
     * pin context-build behaviour without spinning up a WordPress
     * database. See TaskRunnerTest for the pattern.
     *
     * 2026-05-01 v2 — Campaign_Repository (the WP-post-meta reader) is
     * retired. Cloud is the single source of truth for campaigns;
     * everywhere we used `$this->repository->get_campaign_data($id)`
     * we now call `Campaign_Cloud_Reader::get_campaign_data($id)`
     * directly. Constructor signature simplified accordingly.
     */
    public function __construct(
        ?Context_Builder $context_builder = null
    ) {
        $this->context_builder = $context_builder ?? new Context_Builder();
    }

    /**
     * Maximum jitter delay in seconds (90 minutes).
     * The actual delay is randomized between 0 and this value.
     */
    private const MAX_JITTER_SECONDS = 5400;

    /**
     * Managed-tier image-provider defaults — mirror of the cloud-side
     * `PLAN_DEFAULTS[tier].image.provider` in
     * `functions/src/ai/model-catalog.ts`.
     *
     * Used to substitute the campaign's configured imageProvider when it is
     * not image-capable (e.g. Claude, which is text-only). On managed tiers
     * we promise the user "we pick the right models for you", so we
     * substitute here rather than skip — letting `imageProvider = anthropic`
     * through would silently drop image generation in
     * `generate_post_images()`.
     *
     * Keep in lockstep with the cloud catalog. If cloud switches the
     * managed-tier image provider (say, agency moves off openai), update
     * this map in the same PR so the plugin stops forwarding the old
     * value — otherwise the cloud would silently re-route the request and
     * mask the drift.
     *
     * BYOK tiers (free, pro) intentionally have no entry here: auto-
     * substituting them would either call a provider the user hasn't
     * connected (guaranteed failure) or silently switch them to a paid
     * provider they didn't pick. Those tiers keep the graceful-skip
     * behaviour.
     */
    private const MANAGED_IMAGE_FALLBACK = [
        'cloud'  => 'gemini',
        'cloud_pro' => 'openai',
    ];

    /**
     * The plan's default image provider on managed tiers, or null for
     * BYOK / unknown tiers. Exposed as a public static so tests can pin
     * the mapping directly without spinning up the full image path.
     *
     * @param string $tier Plan identifier (free, pro, cloud, agency, none).
     *
     * @return string|null The provider id, or null if the tier has no
     *                     managed default (BYOK tiers).
     */
    public static function get_managed_image_default(string $tier): ?string
    {
        return self::MANAGED_IMAGE_FALLBACK[$tier] ?? null;
    }

    /**
     * Transient key + TTL for the cached visual-settings fetch. Keep
     * the TTL short — users editing their visual prompt expect the
     * next generation to honour it. 5 minutes is a happy compromise
     * between "no per-image cloud round-trip" and "edits feel snappy."
     *
     * The cache is invalidated by `update_visual_settings` (any time
     * the SPA writes new settings).
     */
    private const VISUAL_SETTINGS_TRANSIENT = 'structura_visual_settings_cache';
    private const VISUAL_SETTINGS_TTL = 5 * MINUTE_IN_SECONDS;

    /**
     * Resolve the activation's visual settings for use at image-gen
     * time. Reads the cloud's `visualSettings/global` doc — cloud is
     * the single source of truth as of 2026-05-01 (memory:
     * `feedback_cloud_is_single_source_of_truth_v2`). The local WP
     * options are stale on installs that saved their settings via the
     * SPA, which produced the long-running "free-tier images ignore
     * the visual prompt" regression.
     *
     * Caching: short-TTL transient so back-to-back image gens don't
     * round-trip per slot. Misses fall through to the cloud fetch;
     * fetch failures fall back to the WP-options legacy path so a
     * transient outage doesn't block image gen entirely (matches the
     * cloud's own "use saved if available, else default" pattern in
     * `scheduler/helpers.ts::resolveImageStyleSnapshot`).
     *
     * @return array{style:string, aspect_ratio:string, format:string}
     */
    public static function get_visual_settings_for_image_gen(): array
    {
        $cached = get_transient(self::VISUAL_SETTINGS_TRANSIENT);
        if (is_array($cached)
            && isset($cached['style'], $cached['aspect_ratio'], $cached['format'])
        ) {
            return $cached;
        }

        $resolved = self::fetch_visual_settings_from_cloud();
        if ($resolved === null) {
            // Transient outage / unauthenticated — fall back to local
            // WP options so a free-tier user with legacy WP-stored
            // settings still produces a styled image. New installs
            // get the historical defaults; that matches the cloud-
            // side fallback behaviour exactly.
            $resolved = [
                'style'        => (string) get_option('structura_visual_art_direction', ''),
                'aspect_ratio' => (string) get_option('structura_visual_aspect_ratio', '16:9'),
                'format'       => (string) get_option('structura_visual_format', 'webp'),
            ];
        }

        set_transient(self::VISUAL_SETTINGS_TRANSIENT, $resolved, self::VISUAL_SETTINGS_TTL);

        return $resolved;
    }

    /**
     * Invalidate the visual-settings cache. Called by the REST writer
     * after a successful save so the next image gen picks up the new
     * style without waiting for the TTL to elapse.
     */
    public static function invalidate_visual_settings_cache(): void
    {
        delete_transient(self::VISUAL_SETTINGS_TRANSIENT);
    }

    /**
     * Pull the cloud-side visual settings via Cloud_Client.
     *
     * Returns the resolved triple on success, or null on any failure
     * (auth, network, malformed response). Callers fall back to the
     * legacy WP-options path on null.
     *
     * Kept separate from `get_visual_settings_for_image_gen` for
     * testability — phpunit can stub this method without touching
     * WordPress's transient API.
     *
     * @return array{style:string, aspect_ratio:string, format:string}|null
     */
    public static function fetch_visual_settings_from_cloud(): ?array
    {
        $license = Key_Manager::get_license_payload();
        $license_key = $license['key'] ?? '';
        $secret = $license['secret'] ?? '';
        if ( ! $license_key || ! $secret) {
            return null;
        }

        $result = Cloud_Client::post('/getVisualSettings', [
            'license_key'       => $license_key,
            'site_url'          => home_url(),
            'activation_secret' => $secret,
        ]);

        if (is_wp_error($result)) {
            return null;
        }

        $body = $result['body'] ?? null;
        $settings = is_array($body) ? ($body['settings'] ?? null) : null;
        if ( ! is_array($settings)) {
            // Cloud responded but no doc exists (fresh activation
            // without saved settings yet). Honour that as a "no
            // override" signal — return the historical defaults so
            // the adapter still gets something to work with.
            return [
                'style'        => '',
                'aspect_ratio' => '16:9',
                'format'       => 'webp',
            ];
        }

        return [
            'style'        => (string) ($settings['globalArtDirection'] ?? ''),
            'aspect_ratio' => (string) ($settings['aspectRatio'] ?? '16:9'),
            'format'       => (string) ($settings['format'] ?? 'webp'),
        ];
    }

    /**
     * Initialize background hooks for Action Scheduler.
     */

    public function init(): void
    {
        add_action('structura_run_campaign_step', [$this, 'execute_campaign_step']);
        // `$accepted_args = 2` is load-bearing, not cosmetic. The manual
        // "Generate Now" path (Rest_Api::run_task) enqueues this hook with
        // `['campaign_id' => N, 'campaign_run_id' => 'uuid-...']` so the
        // wp-admin drawer has a progress doc to poll. WordPress's default
        // `$accepted_args = 1` would silently drop the second arg when AS
        // fires the hook — the callback would receive `$campaign_run_id = ''`,
        // `delegate_to_cloud` would omit `campaign_run_id` from the POST
        // body, and the cloud would mint its own UUID under
        // `/executeCloudCampaignStep`. Net effect: plugin hands the SPA one
        // run id, cloud writes the doc under another → /getCampaignRun 404
        // storm, drawer stuck on "Starting generation…" (2026-04-23 incident).
        add_action('structura_run_campaign_step_jittered', [$this, 'execute_campaign_step_jittered'], 10, 2);
        // Manual "Generate Now" runs route through a bridge handler that
        // loads the ephemeral campaign from a transient. The REST endpoint
        // stores the campaign behind a UUID key and passes only the key
        // through AS args — same reasoning as the image-task path above:
        // full-size campaign arrays (50–500 KB) silently exceed MySQL's
        // max_allowed_packet on shared hosts and the AS row never lands.
        add_action('structura_generate_single_post', [$this, 'handle_as_single_post_task']);

        // The AS image chain (`structura_generate_featured_image` /
        // `structura_generate_body_image` hooks + handle_as_image_task
        // + queue_image_tasks + enqueue_image_task) was retired in
        // Phase 1.0h (2026-05-07). Cloud's webhook delivery now ships
        // every image inline via the `payload.images` bundle for all
        // tiers (free included — the resolver applies the per-cycle
        // rate cap). Any orphaned AS rows scheduled before the upgrade
        // become no-ops on first attempted run (no handler registered)
        // and AS clears them.
    }

    /**
     * The License Guard: Halts execution if not Pro.
     */
    public function guard_generation_task(): void
    {
        if ( ! License_Manager::can_use_scheduler()) {
            $this->log('error', "Task aborted: Account registration required for background tasks.", 0,
                'security_guard');

            remove_all_actions(current_action());
        }
    }

    /**
     * Unified Logger Proxy
     *
     * `$campaign_id` accepts int (legacy WP post id) or string (cloud nanoid,
     * post-Phase-1.0c). The Log_Service column is `bigint(20)`, so cloud
     * campaigns simply log under campaign_id=0 — same as system-wide events.
     * The pre-Phase-1.0c declaration `int $campaign_id` was a silent bomb on
     * PHP 8+: passing a non-numeric string to a typed `int` parameter raises
     * a TypeError. The error fired *outside* every try/catch in the
     * execution path, surfaced as a cryptic AS-failed action with no
     * recoverable message, and made the entire jittered step look like AS
     * wasn't firing at all.
     *
     * Coercing to int via `(int)$campaign_id` INSIDE the call site keeps
     * Log_Service's signature unchanged (callers across the plugin still
     * pass int) while letting Task_Runner's nanoid-aware paths drop a
     * harmless 0 in.
     */
    private function log(
        string $level,
        string $message,
        $campaign_id = 0,
        string $step = 'task_runner',
        array $context = []
    ): void {
        Log_Service::add(
            $level,
            $message,
            is_numeric($campaign_id) ? (int) $campaign_id : 0,
            $step,
            $context
        );
    }

    // `handle_as_image_task` retired in Phase 1.0h (2026-05-07) along
    // with its `structura_generate_*_image` AS hook bindings. Cloud
    // delivers images inline via the webhook bundle for every tier
    // now; the AS chain is dead code. `generate_post_images` survives
    // because the editor's "Regenerate Image" flow (Post_Meta_Box)
    // still calls it directly to round-trip `executeCloudImageStep`.

    /**
     * @throws \Exception
     */
    public function generate_post_images(
        int $post_id,
        string $image_type,
        array $image_data,
        array $campaign,
        // 2026-05-02 — optional per-call image model override. Set
        // by the post-meta-box regen handlers when the user picks a
        // specific model in the modal. Null means "use the campaign /
        // tier default" (the legacy behaviour).
        ?string $override_image_model = null,
        // 2026-05-07 — optional per-call image provider override.
        // The post-meta-box modal now lets users pick from any of
        // their connected image providers, not just the post's
        // stamped one. The AJAX handler validates the override
        // against `Provider_Registry::get_connected_providers` before
        // forwarding it here, so by the time we see it we can trust
        // the user has a key for it. Null means "use the campaign's
        // configured provider" (the legacy behaviour).
        ?string $override_image_provider = null
    ): void {
        try {
            $license_data   = License_Manager::get_license_data();
            $tier           = $license_data['plan'] ?? 'free';

            // Apply the user's per-regen provider override BEFORE the
            // capability / accessibility checks below — those gate on
            // `$image_provider`, and we want them to gate on the
            // user's actual choice, not the campaign's stale default.
            // Stamping it onto `$campaign['intelligence']` means
            // `delegate_image_to_cloud` forwards the chosen provider
            // on the wire too. Clearing the campaign's pinned model
            // is essential — a Gemini-pinned model id forwarded with
            // an OpenAI provider would fail validation cloud-side;
            // `$override_image_model` (set by the same picker) takes
            // its place via the existing delegate path.
            if (is_string($override_image_provider) && $override_image_provider !== '') {
                $campaign['intelligence']['imageProvider'] = $override_image_provider;
                $campaign['intelligence']['imageModel']    = null;
            }

            $image_provider = $campaign['intelligence']['imageProvider'] ?? null;

            // Managed-tier substitution: a campaign whose imageProvider is
            // a text-only provider (Claude) would silently skip image
            // generation in the capability check below, and the user loses
            // images entirely despite paying for a managed tier. Swap in
            // the plan default instead and stamp it back onto the campaign
            // so delegate_image_to_cloud forwards the resolved value.
            //
            // BYOK tiers (free, pro) are intentionally excluded — see the
            // MANAGED_IMAGE_FALLBACK docblock for the reasoning.
            $managed_default = self::get_managed_image_default($tier);
            if ($managed_default) {
                $configured_meta = $image_provider ? Provider_Registry::get_provider($image_provider) : null;
                $is_image_capable = $configured_meta && in_array('image', $configured_meta['capabilities'] ?? [], true);

                if ( ! $is_image_capable) {
                    $this->log('info', sprintf(
                        'Image provider "%s" is not image-capable on %s tier. Substituting plan default "%s".',
                        $image_provider ?: 'none',
                        $tier,
                        $managed_default
                    ), $campaign['id'], Log_Steps::VISUALS, [
                        'configured_provider' => $image_provider,
                        'substituted_provider' => $managed_default,
                        'tier' => $tier,
                    ]);

                    $image_provider                            = $managed_default;
                    $campaign['intelligence']['imageProvider'] = $managed_default;
                    // Clear any text-provider-specific image model — the
                    // substituted provider has its own default model, and
                    // forwarding a Claude/Gemini model id to OpenAI would
                    // trip the cloud-side model validator.
                    if (isset($campaign['intelligence']['imageModel'])) {
                        $campaign['intelligence']['imageModel'] = null;
                    }
                }
            }

            // Graceful skip: no image provider configured or provider lost access
            if ( ! $image_provider || ! Provider_Registry::validate_provider_access($image_provider)) {
                $this->log('warning', "Skipping $image_type image: no accessible image provider.", $campaign['id'], Log_Steps::VISUALS);
                return;
            }

            // Graceful skip: provider doesn't support image generation (e.g. Claude is text-only).
            // Only reachable for BYOK tiers — managed tiers got the substitute above.
            $provider_meta = Provider_Registry::get_provider($image_provider);
            if ( ! $provider_meta || ! in_array('image', $provider_meta['capabilities'] ?? [], true)) {
                $this->log('warning', "Skipping $image_type image: provider \"$image_provider\" does not support image generation.", $campaign['id'], Log_Steps::VISUALS);
                return;
            }

            $this->log('info', "Starting $image_type image generation for Post #$post_id", $campaign['id'], Log_Steps::VISUALS, [
                'post_id'  => $post_id,
                'provider' => $image_provider,
            ]);

            // Cloud-only-generation Phase 3: every tier delegates image
            // synthesis to the cloud. The free-tier in-process branch
            // (`Provider_Registry::resolve_image_adapter` → adapter
            // class) is gone; the cloud's resolver applies the per-
            // cycle rate cap for free / none tiers, returns the
            // managed master key for cloud / cloud_pro, or decrypts
            // the activation-bound BYOK credential. Forward
            // `$image_type` as the slot id so the cloud's generations
            // record carries the same slot/topic/alt/fileName fields
            // the inline and stock paths persist.
            $raw_pixels = $this->delegate_image_to_cloud(
                $campaign,
                $image_data,
                $license_data,
                $image_type,
                $override_image_model
            );

            if (is_wp_error($raw_pixels)) {
                throw new \Exception(esc_html($raw_pixels->get_error_message()));
            }

            // 4. Sideload & Process (PNG to WebP conversion happens in Image_Processor)
            $attachment_id = $this->process_and_import_image($raw_pixels, $post_id, $image_data);

            // 4a. Stamp Structura provenance on the attachment so the
            // editor's Regenerate flow (featured + body) can resolve
            // the slot + neutral topic for THIS exact image without
            // having to walk the post content or grep for markers.
            // Mirrors what the cloud-inline sideload path does at
            // lines 1614-1646; adding it here gives the AS-chain
            // path the same audit + regen surface.
            //
            // _structura_image_topic stores the AI-proposed neutral
            // topic; the editor pre-fills its regen prompt with it
            // so subsequent regens don't double-stack the visual-
            // style wrapper.
            // _structura_image_slot identifies which post slot this
            // attachment fills ('featured' | 'body' | 'body-N').
            if (!empty($image_data['topic']) && is_string($image_data['topic'])) {
                update_post_meta(
                    $attachment_id,
                    '_structura_image_topic',
                    sanitize_text_field((string) $image_data['topic'])
                );
            }
            update_post_meta(
                $attachment_id,
                '_structura_image_slot',
                sanitize_text_field((string) $image_type)
            );

            // 5. Attachment Logic
            if ($image_type === 'featured') {
                set_post_thumbnail($post_id, $attachment_id);
            } else {
                $this->inject_image_into_content($post_id, $attachment_id, $image_data);
            }

            // Bump 'structura_stat_generated_images' for analytics
            $total = (int)get_option('structura_stat_generated_images', 0);
            update_option('structura_stat_generated_images', $total + 1);

            $this->log('success', "Attached $image_type image.", $campaign['id'], Log_Steps::VISUALS, [
                'attachment_id' => $attachment_id,
                'post_id'       => $post_id,
                'thumbnail'     => wp_get_attachment_image_url($attachment_id),
            ]);
        } catch (\Exception $e) {
            $this->log('error', $e->getMessage(), $campaign['id'], Log_Steps::VISUALS, [
                'post_id' => $post_id,
            ]);
            throw $e;
        }
    }

    /**
     * @throws \Exception
     */
    /**
     * @throws \Exception
     */
    private function delegate_image_to_cloud(
        array $campaign,
        array $image_data,
        array $license,
        ?string $slot = null,
        ?string $override_model = null
    ) {
        $image_provider = $campaign['intelligence']['imageProvider'] ?? null;

        if ( ! $image_provider) {
            throw new \Exception('No image provider configured for this campaign.');
        }

        // Pass the campaign-pinned model verbatim. The cloud's image
        // resolver applies PLAN_DEFAULTS for managed tiers when null
        // and validates BYOK callers carry a recognised model id.
        $model = $campaign['intelligence']['imageModel'] ?? null;

        // 2026-05-02 — per-regen model override from the post-meta-box
        // image-model picker. Wins over the campaign default for both
        // BYOK and managed tiers; the cloud-side resolver
        // (`resolveImageProviderAndModel`) validates the model is a
        // known catalog entry for the provider AND, for Cloud tier,
        // that it's a mid-tier model. Sanitised to keep an injection-
        // safe id (model ids are always alnum + hyphens + dots).
        if (is_string($override_model) && $override_model !== '') {
            $sanitised = preg_replace('/[^A-Za-z0-9._\-]/', '', $override_model);
            if ($sanitised !== '') {
                $model = $sanitised;
            }
        }

        // Mirror the text path: forward the fallback image provider so the
        // cloud's `executeCloudImageStep` has the intent, and include the
        // user's fallback key (Pro only — managed tiers use the master key).
        $fallback_image_provider = $campaign['intelligence']['fallbackImageProvider'] ?? null;

        // 2026-05-01 — cloud is the single source of truth for visual
        // settings (style / aspect_ratio / format). The cloud's
        // `executeCloudImageStep` reads them from the activation's
        // `visualSettings/global` doc, ignoring whatever the plugin
        // sends. We stopped sending them entirely so the payload
        // can't carry stale WP-options values (some installs had
        // both a cloud doc AND a WP option, and the plugin used to
        // forward the WP option even when it was outdated). If a
        // user wants to change the style for a single regen, they
        // edit the cloud Visual Settings via the SPA and trigger the
        // regen; cloud reads the fresh values.
        //
        // 2026-05-01 — also forward the slot + alt + fileName +
        // caption so the cloud's generations doc carries the same
        // fields the inline-gen and stock-served paths persist.
        // Pre-this-change, regens (Post_Meta_Box) and the AS-fallback
        // path produced docs missing slot/topic/alt/fileName, which
        // broke the post-editor's "Regenerate Image" attachment-id
        // lookup and the cloud-side audit/replay tools.
        $payload = [
            'licenseKey'       => $license['license_key'],
            'domain'           => wp_parse_url(get_site_url(), PHP_URL_HOST),
            'provider'         => $image_provider,
            'model'            => $model,
            'prompt'           => $image_data['topic'] ?? '',
            'campaign'         => $campaign,
        ];

        // Audit metadata — optional on the cloud side for back-compat
        // with older plugins that didn't send it. Only send keys that
        // are actually populated to keep the payload tidy.
        if (is_string($slot) && $slot !== '') {
            $payload['slot'] = $slot;
        }
        if (isset($image_data['topic']) && is_string($image_data['topic']) && $image_data['topic'] !== '') {
            $payload['topic'] = $image_data['topic'];
        }
        if (isset($image_data['alt']) && is_string($image_data['alt']) && $image_data['alt'] !== '') {
            $payload['alt'] = $image_data['alt'];
        }
        if (isset($image_data['file_name']) && is_string($image_data['file_name']) && $image_data['file_name'] !== '') {
            $payload['fileName'] = $image_data['file_name'];
        }
        if (isset($image_data['caption']) && is_string($image_data['caption']) && $image_data['caption'] !== '') {
            $payload['caption'] = $image_data['caption'];
        }

        if ($fallback_image_provider) {
            $payload['fallbackImageProvider'] = $fallback_image_provider;
        }

        // BYOK keys are no longer sent on the wire. The cloud's
        // resolver reads workspace credentials directly from
        // `/workspaces/{w}/credentials/{c}` for BYOK runs;
        // managed tiers use master keys; free / none tiers use
        // master keys with a per-cycle rate cap. Spec:
        // `specs/v2/cloud-only-generation.md` §Phase 2-3.

        $this->log('info', "Delegating image synthesis to Cloud Architect.", $campaign['id'], Log_Steps::CLOUD_DELEGATION);

        // 2026-05-07 — bumped from 60s. Top-tier image models
        // (gpt-image-2, Imagen) routinely take 60-120s; on Cloud
        // Functions cold starts the wall-clock can cross 60s before
        // any pixel data is generated, surfacing as `cURL error 28:
        // Operation timed out after 60002 milliseconds`. The cloud
        // function itself allows up to 540s (`scheduler/index.ts`'s
        // `executeCloudImageStep` `onRequest` config), so 300s leaves
        // comfortable headroom on both ends. Callers MUST also bump
        // PHP's max_execution_time via `set_time_limit` — admin-ajax
        // inherits php.ini's default which is often 30-60s.
        $result = Cloud_Client::post('/executeCloudImageStep', $payload, ['timeout' => 300]);

        if (is_wp_error($result)) {
            throw new \Exception(esc_html("Image generation delegation failed: " . $result->get_error_message()));
        }

        $body = $result['body'];

        // Cloud-only-generation Phase 3: surface the resolver's
        // structured rejection codes verbatim so a missing BYOK key
        // logs under `credentials_missing` (System Logs filter)
        // instead of being buried in a generic synthesis error. The
        // campaign stays scheduled — no auto-pause; the user
        // reconnects a key and the next AS tick succeeds without a
        // manual resume.
        if (is_array($body) && ! empty($body['code']) && in_array($body['code'], ['credentials_missing', 'tier_quota_exceeded'], true)) {
            $cloud_error = ! empty($body['error']) ? $body['error'] : 'AI provider key not configured.';
            $this->log('error', $cloud_error, $campaign['id'], Log_Steps::CREDENTIALS_MISSING, [
                'code'     => $body['code'],
                'detail'   => $body['detail'] ?? null,
                'provider' => $image_provider,
            ]);
            throw new \Exception(esc_html($cloud_error));
        }

        if ( ! is_array($body) || ! isset($body['dataUri'])) {
            $cloud_error = is_array($body) && ! empty($body['error']) ? $body['error'] : 'Unknown error';
            $this->log('error', "Cloud returned invalid image payload: $cloud_error", $campaign['id'], Log_Steps::CLOUD_DELEGATION,
                ['response' => $body]);
            throw new \Exception(esc_html("Cloud returned invalid image payload: $cloud_error"));
        }

        return $body['dataUri'];
    }

    /**
     * THE UNIFIED SAVER
     * Handles Binary, Data URIs, and URLs.
     * @throws \Exception
     */
    private function process_and_import_image($source, int $post_id, array $image_data): int
    {
        $binary     = null;
        $source_ext = 'jpg'; // Default fallback

        // 1. Extraction & Header Detection
        if (is_string($source) && strpos($source, 'data:image') === 0) {
            if (preg_match('/^data:image\/(\w+);base64,/', $source, $m)) {
                $source_ext = ($m[1] === 'jpeg') ? 'jpg' : $m[1];
            }
            $parts  = explode(',', $source);
            $data   = str_replace(' ', '+', $parts[1]); // Standard Base64 fix
            $binary = base64_decode($data);
        } else {
            $binary = $source;
        }

        if ( ! $binary || strlen($binary) < 100) {
            throw new \Exception("Binary extraction failed: Data too small.");
        }

        // 2. Dependencies
        if ( ! function_exists('media_handle_sideload')) {
            require_once(ABSPATH . 'wp-admin/includes/media.php');
            require_once(ABSPATH . 'wp-admin/includes/file.php');
            require_once(ABSPATH . 'wp-admin/includes/image.php');
        }

        // 3. Reliable Temp File with correct extension
        $upload_dir = wp_upload_dir();
        $tmp_file   = $upload_dir['path'] . '/tmp-' . uniqid() . '.' . $source_ext;
        file_put_contents($tmp_file, $binary);

        // Verify binary integrity
        if ( ! getimagesize($tmp_file)) {
            wp_delete_file($tmp_file);
            throw new \Exception("Downloaded data is not a valid image format.");
        }

        // 4. WebP Processing
        $target_name    = ! empty($image_data['file_name']) ? $image_data['file_name'] : 'ai-' . uniqid();
        $processed_path = Image_Processor::process($tmp_file, $target_name);

        // 5. Final File Array Preparation
        $file_info  = wp_check_filetype($processed_path);
        $file_array = [
            'name'     => basename($processed_path),
            'tmp_name' => $processed_path,
            'type'     => $file_info['type'] ?: 'image/' . $source_ext,
            'error'    => 0,
            'size'     => filesize($processed_path),
        ];

        // 6. Security Bypass (The "Trust Me" Filter)
        add_filter('wp_check_filetype_and_ext', function ($values, $file, $filename, $mimes) {
            $type = wp_check_filetype($filename);

            return [
                'ext'             => $type['ext'],
                'type'            => $type['type'],
                'proper_filename' => false,
            ];
        }, 999, 4);

        $id = media_handle_sideload($file_array, $post_id, $image_data['alt'] ?? get_the_title($post_id));

        remove_all_filters('wp_check_filetype_and_ext');

        if (is_wp_error($id)) {
            $this->log('error', "WordPress media sideload failed: " . $id->get_error_message(), 0, Log_Steps::SIDELOAD, [
                'post_id' => $post_id,
            ]);
            wp_delete_file($processed_path);
            throw new \Exception(esc_html("Sideload Failed: " . $id->get_error_message()));
        }

        // 7. Meta Updates
        if ( ! empty($image_data['alt'])) {
            update_post_meta($id, '_wp_attachment_image_alt', sanitize_text_field($image_data['alt']));
        }

        return (int)$id;
    }

    /**
     * Injects a generated image block into the post content using block-safe comments.
     */
    private function inject_image_into_content(int $post_id, int $attachment_id, array $image_data): void
    {
        $post = get_post($post_id);
        $url  = wp_get_attachment_image_url($attachment_id, 'large');

        // Generate the standard WordPress Image Block HTML
        $image_html = Block_Serializer::generate_image_block(
            $attachment_id,
            $url,
            $image_data['alt'] ?? '',
            $image_data['caption'] ?? '',
        );

        $content     = $post->post_content;
        $placeholder = '<!-- structura:image -->';

        // Smart Replacement logic
        if (strpos($content, $placeholder) !== false) {
            $new_content = str_replace($placeholder, $image_html, $content);
        } else {
            // Fallback: append to end of post
            $new_content = $content . "\n\n" . $image_html;
        }

        wp_update_post([
            'ID'           => $post_id,
            'post_content' => $new_content,
        ]);
    }

    /**
     * Entry point for the Pulse (Action Scheduler).
     *
     * Instead of executing immediately, this schedules a one-shot jittered
     * action with a random delay (0–90 min). This creates a natural,
     * human-like publishing rhythm where posts don't always land at the
     * exact same minute every cycle.
     *
     * The cron heartbeat keeps its regular cadence — only the actual
     * generation is offset by a random amount each time.
     */
    public function execute_campaign_step($campaign_id): void
    {
        // Phase 1.0c §4 — `$campaign_id` is `int|string`. WP-authoritative
        // sites pass int post IDs; cloud-authoritative sites pass nanoid
        // strings (via Cloud_Cadence_Sync's AS schedules). The fetch helper
        // below picks the right source based on the flag.
        $campaign = $this->fetch_campaign_for_run($campaign_id);
        if ($campaign === null) {
            // Campaign no longer exists in the authoritative store — could
            // be a recently-deleted campaign whose AS pulse hasn't been
            // swept yet, or a legacy int-keyed pulse on a cloud-authoritative
            // site (the int ids stop resolving after migration). Either way,
            // skip silently. Cloud_Cadence_Sync's next tick wipes the stale
            // pulse so this branch self-heals over a 15-minute window.
            $this->log(
                'info',
                'Pulse skipped: campaign not found in authoritative store.',
                is_int($campaign_id) ? $campaign_id : 0,
                Log_Steps::LIFECYCLE
            );
            return;
        }

        if ($campaign['status'] !== 'active') {
            $this->log('warning', "Pulse skipped: Campaign is inactive.", $campaign_id, Log_Steps::LIFECYCLE);

            return;
        }

        if ($this->is_lifecycle_complete($campaign)) {
            $this->finalize_campaign($campaign_id, 'completed');

            return;
        }

        // Avoid duplicate jittered actions for the same cycle
        $pending = as_get_scheduled_actions([
            'hook'     => 'structura_run_campaign_step_jittered',
            'args'     => ['campaign_id' => $campaign_id],
            'status'   => \ActionScheduler_Store::STATUS_PENDING,
            'per_page' => 1,
        ]);

        if ( ! empty($pending)) {
            $this->log('info', "Jittered step already pending — skipping duplicate.", $campaign_id, Log_Steps::LIFECYCLE);

            return;
        }

        $jitter_seconds = wp_rand(0, self::MAX_JITTER_SECONDS);

        as_schedule_single_action(
            time() + $jitter_seconds,
            'structura_run_campaign_step_jittered',
            ['campaign_id' => $campaign_id],
            STRUCTURA_AS_GROUP,
        );

        $this->log('info', sprintf(
            "Pulse received. Generation jittered by %d min %d sec.",
            intdiv($jitter_seconds, 60),
            $jitter_seconds % 60
        ), $campaign_id, Log_Steps::LIFECYCLE);
    }

    /**
     * Jittered execution — performs the actual content generation.
     * Fired by the one-shot action scheduled in execute_campaign_step() or
     * by the manual `Rest_Api::run_task` enqueue.
     *
     * `$campaign_run_id` is the progress-stream correlation id. Present only
     * for manual "Generate Now" runs (the plugin mints it in `run_task` so
     * the wp-admin drawer can start polling instantly). Automated cron
     * pulses pass an empty string; the cloud self-generates a runId in
     * `scheduler/index.ts` in that case.
     *
     * Action Scheduler spreads the args array positionally, so in-flight
     * pre-upgrade jobs (whose args are just `['campaign_id' => N]`) fire
     * with only the first parameter — the default empty string here keeps
     * them working during the deploy window.
     *
     * @throws \Exception
     */
    public function execute_campaign_step_jittered($campaign_id, string $campaign_run_id = ''): void
    {
        // Same fetch branching as execute_campaign_step — see that method's
        // comments for why $campaign_id is `int|string` post-Phase-1.0c.
        $campaign = $this->fetch_campaign_for_run($campaign_id);
        if ($campaign === null) {
            $this->log(
                'info',
                'Jittered step skipped: campaign not found in authoritative store.',
                is_int($campaign_id) ? $campaign_id : 0,
                Log_Steps::LIFECYCLE
            );
            return;
        }

        // Re-check status — campaign may have been paused during the jitter window
        if ($campaign['status'] !== 'active') {
            $this->log('warning', "Jittered step skipped: Campaign is no longer active.", $campaign_id, Log_Steps::LIFECYCLE);

            return;
        }

        // Re-check lifecycle — quota may have been reached by a manual run
        if ($this->is_lifecycle_complete($campaign)) {
            $this->finalize_campaign($campaign_id, 'completed');

            return;
        }

        $this->log('info', "Starting generation cycle (jittered).", $campaign_id, Log_Steps::LIFECYCLE);

        try {
            $license_data = License_Manager::get_license_data();

            // Cloud-only-generation Phase 3: every tier — managed,
            // BYOK, free, none — flows through `delegate_to_cloud()`.
            // The cloud's resolver (`resolveProviderKeyForTier`) picks
            // the master key, decrypts the activation-bound BYOK
            // credential, or applies the per-cycle rate cap based on
            // tier. The plugin never holds provider keys after this
            // change. Spec: `specs/v2/cloud-only-generation.md`.
            $this->delegate_to_cloud($campaign, $license_data, $campaign_run_id);

            // postsPublished is bumped INSIDE insert_wordpress_post() now
            // (see that method's bump_posts_published() call). The previous
            // optimistic bump here ran right after delegate_to_cloud
            // returned, but `delegate_to_cloud` is fire-and-forget — the
            // cloud might fail, the webhook might never arrive, the post
            // might never reach WP. The 2026-04-30 user report had two
            // failed Run-Now attempts that incremented the campaign's
            // "Posts Published" widget to 2 even though zero posts were
            // ever inserted.
            //
            // The new home is `insert_wordpress_post()`, which runs ONLY
            // after `wp_insert_post` has actually succeeded — and only
            // bumps when the resulting status is 'publish' (drafts /
            // pending don't count toward the "published" surface).
        } catch (\Throwable $e) {
            $this->log('error', $e->getMessage(), $campaign_id, Log_Steps::CONTENT_GENERATION);
            throw $e;
        }
    }

    /**
     * Resolve campaign data for a step that's about to execute.
     *
     * 2026-05-01 v2 — cloud is the single source of truth for
     * campaigns. Always fetches via `Campaign_Cloud_Reader::get_campaign_data()`
     * which calls cloud `/getCampaign` and re-shapes the response
     * into the cluster-format every Task_Runner downstream reader
     * expects. Returns null when the campaign has been deleted from
     * cloud or a stale AS row references a non-existent id.
     *
     * @param string $campaign_id Cloud nanoid.
     * @return array|null Cluster shape on success, null on miss.
     */
    private function fetch_campaign_for_run($campaign_id): ?array
    {
        return Campaign_Cloud_Reader::get_campaign_data((string) $campaign_id);
    }

    /**
     * Persist the running posts-published count for a campaign step
     * that just completed. Always writes to cloud (v2).
     *
     * @param string $campaign_id Cloud nanoid.
     */
    private function persist_posts_published($campaign_id, int $count): void
    {
        Campaign_Cloud_Reader::patch_campaign(
            (string) $campaign_id,
            ['postsPublished' => $count]
        );
    }

    /**
     * Persist the campaign status when the lifecycle finishes
     * (`completed` or `expired`). Always writes to cloud (v2).
     *
     * @param string $campaign_id Cloud nanoid.
     */
    private function persist_status($campaign_id, string $status): void
    {
        Campaign_Cloud_Reader::patch_campaign(
            (string) $campaign_id,
            ['status' => $status]
        );
    }

    private function is_lifecycle_complete(array $campaign): bool
    {
        $condition = $campaign['schedule']['endCondition'];

        if ($condition['type'] === 'date' && time() > strtotime($condition['value'])) {
            return true;
        }

        if ($condition['type'] === 'quota' && $campaign['stats']['postsPublished'] >= (int)$condition['value']) {
            return true;
        }

        return false;
    }

    private function finalize_campaign($campaign_id, string $reason): void
    {
        // Phase 1.0c §4 — `$campaign_id` is `int|string` (post id or nanoid).
        // The status write routes to cloud or WP based on the activation flag;
        // AS pulse stop works for either id type (Action_Scheduler_Service
        // accepts both since Phase 1.0c §2).
        $status = $reason === 'expired' ? 'expired' : 'completed';
        $this->persist_status($campaign_id, $status);

        Action_Scheduler_Service::stop_pulse($campaign_id);

        $this->log('success', "Campaign finalized ($status). Background pulse deactivated.", $campaign_id, Log_Steps::LIFECYCLE);
    }

    private function resolve_persona_id($persona_id)
    {
        if ($persona_id !== 'random') {
            // Preserve string nanoids; cast to int only for numeric
            // legacy WP post ids. Pre-fix `(int)$nanoid` returned 0
            // because nanoids start with letters — which broke the
            // body's `persona.id` field shipped to the cloud (the
            // cloud's `resolvedPersonaDoc` override masked it in
            // practice, but the wire shape was still wrong).
            // See Campaign_Validator::normalize_persona_id for the
            // canonical helper; here we inline the check because
            // the function is hot-path and avoids a static call.
            if (is_string($persona_id) && $persona_id !== '' && ! is_numeric($persona_id)) {
                return $persona_id;
            }
            return (int)$persona_id;
        }

        $persona_pool = get_posts(['post_type' => 'structura_persona', 'fields' => 'ids', 'post_status' => 'publish']);

        return ! empty($persona_pool) ? $persona_pool[array_rand($persona_pool)] : get_option('structura_default_persona',
            1);
    }

    /**
     * @param string $campaign_run_id Progress-stream correlation id (UUID)
     *                                for the run that produced this post.
     *                                Empty string on the free-tier direct path
     *                                where the cloud CampaignRun doc doesn't
     *                                exist. When non-empty we persist it as
     *                                post meta (`_structura_campaign_run_id`)
     *                                AND hoist it into the hook payload so
     *                                subscribers can correlate the WP post
     *                                back to the Firestore run doc without
     *                                re-reading meta.
     *
     * @throws \Exception
     */
    /**
     * @param int|string $persona_id Numeric WP post id (legacy) or
     *                                cloud nanoid (post-2026-05-01).
     *                                Widened from `int` because PHP
     *                                silently coerces nanoid strings
     *                                to 0, which broke author lookup
     *                                for cloud personas (Yurii report
     *                                2026-05-02 — every cloud post
     *                                landed authored by user 0).
     * @param int|null   $persona_author_id Optional explicit
     *                                author id forwarded by cloud in
     *                                the webhook payload. When set
     *                                it wins over the local meta
     *                                lookup — cloud is the source of
     *                                truth for the persona→author
     *                                mapping in v2.
     */
    public function insert_wordpress_post(array $ai_data, $persona_id, array $campaign, string $campaign_run_id = '', ?int $persona_author_id = null): int
    {
        // 1. Serialize Blocks (Now passing the object we already have)
        $serializer = new Block_Serializer();
        $content    = $serializer->serialize_post($ai_data, $campaign);

        $content = $this->finalize_blueprint($content, $campaign);

        // Per-campaign post_status — restored after the global
        // `structura_post_status` option was removed in commit 8ad567586.
        // Whitelist to the same three values the repository accepts so we
        // never hand wp_insert_post() an unexpected status even if the meta
        // was hand-edited.
        // A MISSING status must never auto-publish — a generated post
        // surprise-publishing to a live site is the worst failure mode (it
        // was happening: the cloud occasionally omitted `structure.postStatus`
        // and this fell through to 'publish'). Default to the safe 'draft';
        // the cloud now always sends an explicit status for the surfaces that
        // have a picker, so this fallback only guards genuinely absent values.
        $allowed_post_statuses = ['publish', 'draft', 'pending'];
        $campaign_post_status = $campaign['structure']['postStatus'] ?? 'draft';
        if (!in_array($campaign_post_status, $allowed_post_statuses, true)) {
            $campaign_post_status = 'draft';
        }

        $args = [
            'post_title'   => apply_filters('structura_post_title', sanitize_text_field($ai_data['title'])),
            'post_excerpt' => sanitize_text_field($ai_data['excerpt'] ?? ''),
            'post_content' => $content,
            'post_status'  => $campaign_post_status,
            'post_type'    => 'post',
            // 2026-05-02 — author resolution order:
            //   1. Explicit `persona_author_id` from the cloud
            //      webhook (v2 source of truth).
            //   2. Legacy WP post-meta lookup for numeric persona ids
            //      (Free-tier local-gen path + pre-cloud installs).
            //   3. 0 as the WP-default-author fallback (current
            //      logged-in user, or admin during cron).
            'post_author'  => $persona_author_id !== null
                ? $persona_author_id
                : (is_numeric($persona_id) ? (int) get_post_meta((int) $persona_id, '_author_id', true) : 0),
            // `sanitize_title()` preserves underscores, so a model slug like
            // `a_b_h4_3_4_heading` would ship with underscores instead of
            // SEO-friendly hyphens. The cloud now normalizes the slug, but we
            // map `_`→`-` here too as a belt-and-suspenders for older-cloud
            // payloads (back-compat) and any non-cloud path.
            'post_name'    => sanitize_title(str_replace('_', '-', (string) ($ai_data['meta_slug'] ?? ''))),
            // Write the campaign id atomically so it is present when
            // `wp_after_insert_post` fires inside wp_insert_post(). The
            // Channels forwarder (Channel_Event_Forwarder) gates on this
            // meta and would otherwise silently skip every generated post.
            // The run id (when we have one from the cloud path) is written
            // in the same atomic meta block so Run_Signal_Service and any
            // downstream progress-stream reconciler can find it even for
            // posts that were inserted by an older plugin before the
            // hook-signature extension landed.
            //
            // Builder_Compat::opt_out_meta() is merged in the same block
            // so the page-builder opt-outs (Divi `_et_pb_use_builder`,
            // WPBakery `_wpb_vc_js_status`) are persisted *before*
            // `save_post` fires. See Builder_Compat for the full
            // rationale and the list of builders we deliberately *don't*
            // opt out from.
            // `_structura_campaign_id` is mixed type — int for legacy
            // WP-authoritative installs (post id) and nanoid string for
            // cloud-authoritative installs (post-Phase-1.0c). The previous
            // `(int)$campaign['id']` cast silently destroyed nanoids
            // ("e0eNZgmm..." → 0), which made the editor's "Regenerate
            // featured image" meta box (and Channel_Event_Forwarder, and
            // Content_Strip_Diagnostic) treat the post as "not ours". Pass
            // the raw value; downstream readers also need to NOT cast to
            // int. 2026-04-30 cms.xerx.io regression motivated this.
            //
            // We deliberately do NOT persist the AI-generated image
            // topics (featured_image.topic / body_image.topic) here.
            // The cloud already stores the full blueprint in the
            // `generations` collection keyed by `campaignRunId` — the
            // plugin can fetch it on-demand for the regen-image flow
            // via a small cloud endpoint, keeping a single source of
            // truth instead of duplicating per-post.
            'meta_input'   => array_merge(
                array_filter([
                    '_structura_campaign_id'     => $campaign['id'] ?? null,
                    '_structura_campaign_run_id' => $campaign_run_id,
                    // 2026-05-02 — image-gen provenance for regen.
                    // Without these the regen handler can't tell which
                    // provider/model to use for ephemeral single-post
                    // runs (no campaign doc on cloud to fetch). The
                    // regen handler synthesises a minimal campaign-
                    // shaped object from these fields when
                    // `_structura_campaign_id` is absent or
                    // unrecoverable.
                    //
                    // Stamped here at insert time so the data lands
                    // atomically with the rest of the post — no race
                    // window where the editor could open before the
                    // meta exists. Empty / null values get pruned by
                    // array_filter below so we don't store
                    // `_structura_image_provider: ''` on every post.
                    '_structura_image_provider'           => $campaign['intelligence']['imageProvider'] ?? null,
                    '_structura_image_model'              => $campaign['intelligence']['imageModel'] ?? null,
                    '_structura_image_fallback_provider'  => $campaign['intelligence']['fallbackImageProvider'] ?? null,
                    '_structura_persona_id'               => $campaign['intelligence']['personaId'] ?? null,
                ], static function ($v) {
                    // Drop empty run id so we don't store empty-string
                    // meta on every free-tier post — meta absence is the
                    // signal Run_Signal_Service uses to skip non-cloud
                    // posts. Same drop applies to a missing campaign id.
                    return $v !== '' && $v !== null;
                }),
                Builder_Compat::opt_out_meta()
            ),
        ];

        $post_id = wp_insert_post($args);

        if (is_wp_error($post_id)) {
            $this->log('error', "WordPress post insertion failed: " . $post_id->get_error_message(), $campaign['id'],
                'wp_insert');
            throw new \Exception(esc_html("WP Post Insert Error: " . $post_id->get_error_message()));
        }

        // 3. Save structured schema data for <head> injection
        $schemas = $serializer->get_schema_data($ai_data);
        if ( ! empty($schemas)) {
            update_post_meta($post_id, '_structura_schema', $schemas);
        }

        // 4. Taxonomy & SEO Meta
        $this->apply_post_metadata($post_id, $ai_data, $campaign);

        /**
         * Fires after Structura finishes inserting a campaign-generated post
         * (including the schema payload, taxonomy, and SEO meta writes).
         *
         * This is the canonical internal signal that a Structura run produced
         * a post. All Structura-owned integrations (Channels forwarder,
         * IndexNow, future social publishers, ...) hook THIS instead of core
         * `save_post` / `wp_after_insert_post` so they:
         *   - don't need to re-check "was this one of ours?" (if the hook
         *     fired, it was);
         *   - get a stable payload shape not subject to WP's autosave /
         *     revision / block-editor heartbeat noise;
         *   - never fire for third-party edits to a Structura-generated post,
         *     which `save_post` would catch.
         *
         * The hook namespace is `structura/{domain}/{event}` — `domain` is the
         * subject (post / image / campaign / ...), `event` is past tense for
         * actions (`inserted`, `generated`) and present for filters
         * (`before_insert`). Keep new hooks inside this namespace so
         * documentation tooling can group them.
         *
         * @since 1.x.0
         *
         * @param array $context {
         *     Context describing the inserted post. All fields are always
         *     present; string fields may be empty.
         *
         *     @type int         $post_id         WordPress post ID returned by wp_insert_post().
         *     @type int         $campaign_id     Structura campaign that produced the post.
         *     @type string      $campaign_run_id Progress-stream correlation id (UUID) if
         *                                        the run came through the cloud path;
         *                                        empty string for free-tier direct-generate.
         *                                        Subscribers that reconcile against the
         *                                        Firestore CampaignRun doc (e.g.
         *                                        Run_Signal_Service) gate on non-empty.
         *                                        Added in 1.20.0.
         *     @type string      $status          Either 'publish' (went live immediately)
         *                                        or 'draft' (awaiting review per campaign config).
         *                                        Always one of these two values; other WP
         *                                        post statuses are normalized to 'draft'.
         *     @type string      $post_title      Rendered post title.
         *     @type string|null $post_url        Permalink when $status === 'publish',
         *                                        null otherwise (drafts have no public URL).
         *     @type string      $edit_url        WP admin edit screen URL for the post.
         *                                        Always populated so notification integrations
         *                                        can deep-link reviewers even for drafts.
         *     @type string|null $published_at    ISO 8601 timestamp when $status === 'publish',
         *                                        null for drafts.
         *     @type string      $locale          Site locale at insert time (get_locale()).
         * }
         */
        $post_status_raw = get_post_field('post_status', $post_id);
        $normalized_status = ($post_status_raw === 'publish') ? 'publish' : 'draft';

        // Bump the campaign's `postsPublished` counter — but ONLY when
        // the post actually went live. Drafts and pending posts don't
        // count toward the "Published" surface the user sees on the
        // campaign overview widget.
        //
        // History:
        //   1. Originally bumped after `delegate_to_cloud` returned —
        //      that counted failed dispatches as published posts
        //      (Yurii 2026-04-30).
        //   2. Moved here (post-insert, status === 'publish' gate) —
        //      but the bump was a read-then-write race that lost
        //      updates whenever two webhooks for the same campaign
        //      returned within the synthesis window. Yurii observed
        //      `1 veröffentlicht` on a campaign with multiple posts
        //      generated.
        //   3. Now: cloud-side atomic increment via
        //      `recordPostInserted({ should_increment_post_count: true })`
        //      inside the run-doc patch transaction. The Run_Signal_Service
        //      that fires off the `structura/post/inserted` hook below
        //      passes the post status so it can ask the cloud to bump
        //      ONLY when the post is `publish`. Local read-then-write
        //      is gone; this comment is what's left.
        //
        // Anonymous (None tier) installs hit the `campaign_run_id === ''`
        // branch inside Run_Signal_Service and skip the cloud call
        // entirely — no progress doc exists for those runs, and the
        // anonymous Free campaign cap (1) makes the counter
        // functionally inert anyway.

        // `structura/post/inserted` is fired by the CALLER
        // (`receive_cloud_blueprint`) AFTER `sideload_image_bundle`
        // has attached the featured image — otherwise subscribers
        // (Channel_Event_Forwarder → LinkedIn, etc.) read
        // `get_post_thumbnail_id()` and get `0` because the post
        // exists but its featured image hasn't been set yet,
        // shipping an empty `featured_image_url` to the cloud and
        // landing image-less posts on social. cms.formulafoundry.io
        // 2026-05-22 traced this directly.
        //
        // The caller has all the same context fields available
        // (campaign id, run id, status, locale) and can build the
        // same $context array post-sideload. Hoisting the hook out
        // of `insert_wordpress_post` is the only way to guarantee
        // the featured image is queryable when subscribers fire.

        return $post_id;
    }

    /**
     * Build the `structura/post/inserted` hook payload + fire it.
     *
     * Called by `receive_cloud_blueprint` after `wp_insert_post` AND
     * `sideload_image_bundle` have both run, so subscribers
     * (Channel_Event_Forwarder, mu-plugins) can read the featured
     * image, sideloaded body image, and Public_Site_Profile-rewritten
     * permalink consistently. The pre-2026-05-22 implementation
     * dispatched the hook from inside `insert_wordpress_post` BEFORE
     * sideload, so the LinkedIn integration shipped empty
     * featured_image_url for every cloud-synthesized post.
     *
     * Same shape as the legacy in-method call site so existing
     * `do_action('structura/post/inserted')` subscribers consume the
     * payload without changes.
     *
     * @param int    $post_id          Post id just inserted + sideloaded.
     * @param array  $campaign         Campaign payload from the cloud webhook.
     * @param string $campaign_run_id  Run nanoid (empty for non-run flows).
     * @param string $normalized_status `publish` / `draft` / `pending`.
     */
    public function fire_post_inserted_hook(
        int $post_id,
        array $campaign,
        string $campaign_run_id,
        string $normalized_status
    ): void {
        // Public-facing URL — rewritten through Public_Site_Profile when
        // the install runs WP headless (e.g. cms.xerx.io → xerx.io).
        // Subscribers on `structura/post/inserted` (Channel_Event_Forwarder,
        // anything in mu-plugins) need the URL readers actually visit, not
        // the WP origin.
        $public_url = $normalized_status === 'publish'
            ? Public_Site_Profile::load()->permalink_for_post($post_id)
            : '';
        $context = [
            'post_id'         => $post_id,
            // Mixed-type: int post id for legacy WP-authoritative campaigns,
            // string nanoid/UUID for cloud-authoritative. Casting to int here
            // zeroed every cloud campaign's id BEFORE the hook fired, which
            // is why Channel_Event_Forwarder was sending `campaign_id: 0` to
            // the cloud and the dispatcher could never match a connection's
            // `boundCampaignIds` filter (resolvedCount: 0 in the logs).
            'campaign_id'     => $campaign['id'] ?? 0,
            'campaign_run_id' => $campaign_run_id,
            'status'          => $normalized_status,
            'post_title'      => (string)get_the_title($post_id),
            'post_url'        => $normalized_status === 'publish'
                ? ($public_url !== '' ? $public_url : null)
                : null,
            'edit_url'        => (string)get_edit_post_link($post_id, 'raw'),
            'published_at'    => $normalized_status === 'publish'
                ? (get_post_time('c', true, $post_id) ?: null)
                : null,
            'locale'          => (string)get_locale(),
        ];
        do_action('structura/post/inserted', $context);
    }

    private function finalize_blueprint($content, array $campaign): string
    {
        // Every preg_replace below runs through this helper. PCRE2
        // returns `NULL` (not `false`, not the original input) when
        // it can't compile a pattern — which happens on hosts whose
        // PCRE2 library predates the Unicode property we're using.
        // `\p{Extended_Pictographic}` in particular was added in
        // PCRE2 10.30 (mid-2017); some shared hosts (observed on
        // IONOS, 2026-04-23) still ship an older PCRE2 and return
        // NULL here. Without this guard, a single failing regex
        // silently zeroes out every block of generated content —
        // the front-end post renders blank, there's no PHP warning
        // visible, and the only symptom is Yoast analysing the raw
        // post_content while the reader sees an empty body.
        //
        // The guard is deliberately silent on failure rather than
        // throwing. Content generation is a long-running Action
        // Scheduler job; throwing here would retry the whole cloud
        // blueprint fetch with no chance of success. Falling back to
        // the pre-replace content delivers a post that MIGHT still
        // contain an emoji/em-dash on a host that would otherwise
        // silently delete the entire body. Correctness beats
        // cosmetic pedantry.
        $safe_replace = static function (string $pattern, string $replacement, $input) {
            $result = @preg_replace($pattern, $replacement, $input);
            return $result === null ? $input : $result;
        };

        // 2. Global Style Cleanup
        if ($campaign['intelligence']['replaceLongDashes']) {
            $content = $safe_replace('/(?<=\w)—(?=\w)/u', ' - ', $content);
        }

        // 3. Emoji Removal
        /**
         * Sanitize content by stripping all emojis and pictorial symbols.
         *
         * We deliberately DON'T use `\p{Extended_Pictographic}` here even
         * though it would catch the broadest set of emoji. That Unicode
         * property was added in PCRE2 10.30 (mid-2017), and some shared
         * hosts still ship older PCRE2 builds where it's unsupported.
         * When that happens, `preg_replace` returns NULL instead of a
         * string — and before the `$safe_replace` wrapper above, that
         * silently turned the entire post body into an empty string
         * (observed on an IONOS-hosted Divi site, 2026-04-23). The
         * wrapper defends against that pattern for ALL replacements
         * below, and the explicit-codepoint range plus `\p{So}+`
         * together cover every emoji we've actually seen the AI emit.
         * If a truly modern multibyte emoji slips through on a BYOK
         * site running a non-emoji-aware provider, that's acceptable;
         * silently deleting every block is not.
         */
        if ($campaign['intelligence']['disableEmojis']) {
            // Classic emoji codepoint ranges — covers the Unicode blocks
            // that account for ~95 % of in-the-wild emoji usage.
            $content = $safe_replace(
                '/[\x{1F600}-\x{1F64F}\x{1F300}-\x{1F5FF}\x{1F680}-\x{1F6FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]/u',
                '',
                $content
            );

            // \p{So} — miscellaneous symbols. Widely supported across
            // PCRE2 versions (including the trimmed-down builds that
            // lack Extended_Pictographic).
            $content = $safe_replace('/\p{So}+/u', '', $content);

            // Remove Variation Selectors and clean up double spaces
            $content = $safe_replace('/\x{FE0F}/u', '', $content);
            $content = $safe_replace('/\s\s+/', ' ', $content);
        }

        return (string)$content;
    }

    private function apply_post_metadata(int $post_id, array $ai_data, array $campaign): void
    {
        $campaign_id = $campaign['id'];

        // 1. CATEGORY GOVERNANCE
        $cat_mode = $campaign['taxonomy']['categories']['mode'] ?? 'auto';

        if ($cat_mode !== 'disabled' && ! empty($ai_data['categories'])) {
            $categories = (array)$ai_data['categories'];

            if ($cat_mode === 'restricted') {
                $allowed_ids         = $campaign['taxonomy']['categories']['list'] ?? [];
                $filtered_categories = [];
                foreach ($categories as $cat_name) {
                    $term = get_term_by('name', $cat_name, 'category');
                    if ($term && in_array($term->term_id, $allowed_ids)) {
                        $filtered_categories[] = $term->term_id;
                    }
                }
                // Fallback: If AI hallucinated completely, use the first allowed category
                if (empty($filtered_categories) && ! empty($allowed_ids)) {
                    $filtered_categories = [(int)$allowed_ids[0]];
                }
                wp_set_object_terms($post_id, $filtered_categories, 'category');
            } else {
                // Auto mode: canonicalize against existing terms first. Passing
                // raw names to wp_set_object_terms() makes WP create a brand-new
                // term for anything it doesn't match VERBATIM, so "Messer-Wissen"
                // and "Messerwissen" would each spawn a category. Resolving them
                // onto the existing term — together with the cloud's reuse-first
                // prompt — stops the sprawl (48 categories for 26 posts on a live
                // site). Only creates a category when nothing matches even loosely.
                $term_ids = $this->resolve_auto_category_terms($categories);
                if (! empty($term_ids)) {
                    wp_set_object_terms($post_id, $term_ids, 'category');
                }
            }
        }

        // 2. TAG GOVERNANCE
        $tag_mode = $campaign['taxonomy']['tags']['mode'] ?? 'auto';

        if ($tag_mode !== 'disabled' && ! empty($ai_data['tags'])) {
            $tags = (array)$ai_data['tags'];

            if ($tag_mode === 'restricted') {
                $allowed_ids   = $campaign['taxonomy']['tags']['list'] ?? [];
                $filtered_tags = [];
                foreach ($tags as $tag_name) {
                    $term = get_term_by('name', $tag_name, 'post_tag');
                    if ($term && in_array($term->term_id, $allowed_ids)) {
                        $filtered_tags[] = $term->term_id;
                    }
                }
                wp_set_object_terms($post_id, $filtered_tags, 'post_tag');
            } else {
                wp_set_object_terms($post_id, $tags, 'post_tag');
            }
        }

        // 3. SEO CLUSTERS (Yoast / Rank Math / SEOPress)
        $this->maybe_update_keyphrase($post_id, $ai_data['keyphrase'] ?? '');
        $this->maybe_update_meta_title($post_id, $ai_data['meta_title'] ?? '');
        $this->maybe_update_meta_description($post_id, $ai_data['meta_description'] ?? '');

        // 4. TRACEABILITY
        // `_structura_campaign_id` is written atomically via `meta_input`
        // in insert_wordpress_post() so it is already present by the time
        // `wp_after_insert_post` fires. We still call update_post_meta here
        // as a belt-and-suspenders safeguard in case this method is ever
        // invoked against a post that was not created by insert_wordpress_post.
        update_post_meta($post_id, '_structura_campaign_id', $campaign_id);

        // Bump 'structura_stat_generated_posts' for analytics
        $total = (int)get_option('structura_stat_generated_posts', 0);
        update_option('structura_stat_generated_posts', $total + 1);
    }

    /**
     * Resolve AI-proposed category names to term ids in AUTO mode, reusing an
     * existing category whenever a proposed name is the same term up to
     * formatting (case, punctuation, hyphens, diacritics, "&"/"und"/"and").
     *
     * WordPress's `wp_set_object_terms()` creates a fresh term for any name it
     * doesn't match verbatim, so "Messer-Wissen", "Messerwissen" and
     * "messerwissen " would each become a separate category. This canonicalizer
     * collapses those formatting variants onto the existing term before
     * creation — the deterministic backstop to the cloud's reuse-first prompt —
     * which stops the category sprawl seen on live sites (48 categories for 26
     * posts). Only creates a genuinely new category when nothing matches.
     *
     * @param string[] $names AI-proposed category names.
     * @return int[] Resolved/created category term ids (deduplicated).
     */
    private function resolve_auto_category_terms(array $names): array
    {
        $existing = get_terms([
            'taxonomy'   => 'category',
            'hide_empty' => false,
        ]);
        if (is_wp_error($existing) || ! is_array($existing)) {
            $existing = [];
        }

        // Index existing terms by normalized key → term id.
        $by_key = [];
        foreach ($existing as $term) {
            $by_key[self::normalize_term_key($term->name)] = (int) $term->term_id;
        }

        $ids = [];
        foreach ($names as $name) {
            $name = trim((string) $name);
            if ($name === '') {
                continue;
            }
            $key = self::normalize_term_key($name);
            if ($key === '') {
                continue;
            }

            if (isset($by_key[$key])) {
                $ids[$by_key[$key]] = true;
                continue;
            }

            // Nothing matched — create it, then remember the key so a second
            // near-variant in the SAME payload reuses this new term.
            $created = wp_insert_term($name, 'category');
            if (! is_wp_error($created) && isset($created['term_id'])) {
                $id            = (int) $created['term_id'];
                $by_key[$key]  = $id;
                $ids[$id]      = true;
            } elseif (is_wp_error($created)) {
                // A 'term_exists' race carries the existing id in the error data.
                $existing_id = (int) $created->get_error_data();
                if ($existing_id > 0) {
                    $by_key[$key]     = $existing_id;
                    $ids[$existing_id] = true;
                }
            }
        }

        return array_keys($ids);
    }

    /**
     * Normalize a taxonomy term name to a comparison key that ignores the
     * formatting noise WP treats as distinct: case, diacritics, hyphens/spaces,
     * punctuation and the "&"/"und"/"and" conjunctions. So "Messer-Wissen",
     * "Messerwissen" and "Messer Wissen" share a key, and "A & B" == "A und B".
     *
     * Deliberately conservative: collapses spelling/format variants of the SAME
     * words, not semantic synonyms — that judgement is the model's job. Public
     * + static so it's unit-testable without a WP bootstrap (mirrors
     * {@see looks_like_code_fragment}).
     *
     * @param string $name Raw term name.
     * @return string Normalized comparison key ('' for symbol-only input).
     */
    public static function normalize_term_key(string $name): string
    {
        $s = function_exists('mb_strtolower') ? mb_strtolower($name, 'UTF-8') : strtolower($name);
        // Fold conjunctions BEFORE stripping symbols so the words don't merge.
        $s = preg_replace('/\b(und|and)\b/u', ' ', $s);
        // Strip diacritics where iconv is available (Zubehör → Zubehor).
        if (function_exists('iconv')) {
            $folded = @iconv('UTF-8', 'ASCII//TRANSLIT', $s);
            if ($folded !== false) {
                $s = $folded;
            }
        }
        // Drop everything that isn't a-z0-9 (hyphens, spaces, "&", accents…).
        $s = preg_replace('/[^a-z0-9]+/', '', $s);
        return (string) $s;
    }

    /**
     * Does this string carry leaked code/template fragments?
     *
     * Mirrors `CODE_FRAGMENT_RE` in the cloud's `ai/blueprint-repair.ts`:
     * curly braces, angle brackets, backticks, PHP open/close tags, and arrow
     * functions never appear in a legitimate focus keyphrase but are the
     * fingerprint of scraped code bleeding into the model's output. Kept as a
     * static helper so it's unit-testable without instantiating the runner.
     *
     * @param string $value Candidate string.
     * @return bool True when the string looks like code and must not be stored.
     */
    public static function looks_like_code_fragment(string $value): bool
    {
        return (bool) preg_match('/[{}<>`]|\?>|<\?|=>/', $value);
    }

    private function maybe_update_keyphrase(int $post_id, string $keyphrase): void
    {
        if ( ! $keyphrase) {
            return;
        }

        // Belt-and-suspenders for older-cloud payloads: refuse to write a
        // focus keyphrase that contains leaked code fragments (PHP tags,
        // braces, JSX) — e.g. `data }, 'p_core_array }` once shipped to Yoast.
        // The cloud now scrubs this, but an old-cloud / new-plugin window
        // could still deliver garbage. A missing keyphrase just makes Yoast
        // fall back to the title, which is strictly better than indexing junk.
        if (self::looks_like_code_fragment($keyphrase)) {
            return;
        }

        // Update Yoast SEO Focus Keyphrase
        update_post_meta($post_id, '_yoast_wpseo_focuskw', sanitize_text_field($keyphrase));

        // Update Rank Math Focus Keyword if Rank Math
        update_post_meta($post_id, 'rank_math_focus_keyword', sanitize_text_field($keyphrase));
    }

    private function maybe_update_meta_title(int $post_id, string $meta_title): void
    {
        if ( ! $meta_title) {
            return;
        }

        // Update Yoast SEO Meta Title if Yoast
        update_post_meta($post_id, '_yoast_wpseo_title', sanitize_text_field($meta_title));

        // Update Rank Math Snippet Title if Rank Math
        update_post_meta($post_id, 'rank_math_title', sanitize_text_field($meta_title));
    }

    private function maybe_update_meta_description(int $post_id, string $meta_description): void
    {
        if ( ! $meta_description) {
            return;
        }

        // Update Yoast SEO Meta Description if Yoast
        update_post_meta($post_id, '_yoast_wpseo_metadesc', sanitize_textarea_field($meta_description));

        // Update Rank Math Snippet Description if Rank Math
        update_post_meta($post_id, 'rank_math_description', sanitize_textarea_field($meta_description));
    }

    /**
     * Sideload images from a cloud-side bundle (Spec §1.0h Phase 3).
     *
     * Phase 1+2 of `cloud-image-gen-as-run-step.md` had the cloud
     * generate images during synthesis and ship signed Cloud Storage
     * URLs on the combined webhook payload. Phase 3 wires the plugin
     * to consume those URLs directly — no AS round-trip, no second
     * call to `executeCloudImageStep`, no double-generation.
     *
     * Per slot:
     *   1. `wp_remote_get` the signed URL into a binary buffer.
     *   2. Pass the binary to `process_and_import_image` (existing
     *      WebP-conversion + WP attachment pipeline — same code path
     *      the legacy AS chain hits, just fed inline rather than after
     *      a fresh provider call).
     *   3. Attach: featured slot → `set_post_thumbnail`; body slot →
     *      `inject_image_into_content`. Same helpers as before.
     *
     * Failure mode: best-effort PER SLOT. A featured-image fetch
     * failure leaves the post without a thumbnail and emits a warning
     * log; body-image work still runs. The cloud has already counted
     * the image generation in usage_logs (Phase 2 helper records
     * before returning the URL), so a fetch failure here costs the
     * user a slot but not a duplicate charge.
     *
     * Returns the set of slots that were sideloaded successfully.
     * Pre-Phase-1.0h this map fed `queue_image_tasks` so the AS
     * chain knew which slots to skip. With the AS chain retired
     * (Phase 1.0h, 2026-05-07) the return is informational — kept
     * for symmetry with the cloud-side bundle shape and for any
     * future caller that wants to log which slots landed.
     *
     * @param int        $post_id     Newly inserted post id.
     * @param array      $images      Bundle from the webhook payload —
     *                                `{ featured?: ImageBytes, body?: ImageBytes }`.
     *                                Missing slots simply aren't in the array.
     * @param array      $campaign    Campaign cluster — passed through
     *                                for log correlation only.
     * @param int|string $campaign_id Campaign id for log lines.
     * @return array<string, bool>    Keys: 'featured', 'body'. `true` =
     *                                slot was attempted AND succeeded.
     *                                `false` (or missing) = slot was not
     *                                in the bundle, or failed mid-flight.
     */
    public function sideload_image_bundle(
        int $post_id,
        array $images,
        array $campaign,
        $campaign_id
    ): array {
        $handled = [];

        foreach (['featured', 'body'] as $slot) {
            if ( ! isset($images[$slot]) || ! is_array($images[$slot])) {
                continue;
            }
            $entry = $images[$slot];
            $url   = isset($entry['url']) ? (string) $entry['url'] : '';
            if ($url === '') {
                $this->log(
                    'warning',
                    sprintf('Sideload skipped: cloud bundle slot=%s has no url.', $slot),
                    $campaign_id,
                    Log_Steps::VISUALS,
                    ['post_id' => $post_id, 'slot' => $slot]
                );
                continue;
            }

            try {
                // Signed URLs the cloud emits (V4, 30-min TTL) are
                // public-readable for any HTTP client — no auth header
                // needed. Time-out at 30s: a slow Storage fetch on a
                // pre-warmed bucket is unusual but a hung request
                // would block this whole webhook handler.
                $response = wp_remote_get($url, ['timeout' => 30]);
                if (is_wp_error($response)) {
                    throw new \Exception(
                        esc_html('wp_remote_get error: ' . $response->get_error_message())
                    );
                }
                $code = (int) wp_remote_retrieve_response_code($response);
                if ($code !== 200) {
                    throw new \Exception(
                        esc_html(sprintf('signed URL returned HTTP %d', $code))
                    );
                }
                $binary = wp_remote_retrieve_body($response);
                if ( ! $binary || strlen($binary) < 100) {
                    throw new \Exception('signed URL returned empty / truncated body');
                }

                // `process_and_import_image` accepts raw binary in its
                // `else` branch — same code path the legacy AS chain
                // exercises after a provider call. The `image_data`
                // arg carries `file_name` + `alt` + optional `caption`
                // which the saver propagates onto the WP attachment.
                $image_data = [
                    'file_name' => $entry['fileName'] ?? '',
                    'alt'       => $entry['alt'] ?? '',
                    'caption'   => $entry['caption'] ?? '',
                    // `topic` is unused on this path (the prompt
                    // already shipped to the provider); pass through
                    // for parity with legacy callers in case future
                    // saver versions reference it.
                    'topic'     => $entry['topic'] ?? '',
                ];

                $attachment_id = $this->process_and_import_image(
                    $binary,
                    $post_id,
                    $image_data
                );

                // Phase B (2026-04-30) — stamp the cloud's generation
                // doc id on the attachment so the editor's "Regenerate
                // Image" flow can resolve THIS exact image's source
                // record (prompt, topic, model, provider) on the next
                // regen click. Subsequent regens replace the
                // attachment AND the meta, so history follows the
                // attachment, not the post.
                //
                // Both fields are optional in the bundle; older cloud
                // builds that ship the bundle without them just leave
                // the meta absent and the regen flow falls back to
                // the campaignRunId-based lookup (Phase A).
                if (!empty($entry['generationId'])) {
                    update_post_meta(
                        $attachment_id,
                        '_structura_generation_id',
                        sanitize_text_field((string) $entry['generationId'])
                    );
                }
                if (!empty($entry['topic'])) {
                    update_post_meta(
                        $attachment_id,
                        '_structura_image_topic',
                        sanitize_text_field((string) $entry['topic'])
                    );
                }
                if (!empty($slot) && is_string($slot)) {
                    update_post_meta(
                        $attachment_id,
                        '_structura_image_slot',
                        sanitize_text_field($slot)
                    );
                }

                if ($slot === 'featured') {
                    set_post_thumbnail($post_id, $attachment_id);
                } else {
                    $this->inject_image_into_content($post_id, $attachment_id, $image_data);
                }

                $handled[$slot] = true;
                $this->log(
                    'success',
                    sprintf('Inline image sideloaded: %s → attachment #%d.', $slot, $attachment_id),
                    $campaign_id,
                    Log_Steps::VISUALS,
                    [
                        'post_id'       => $post_id,
                        'slot'          => $slot,
                        'attachment_id' => $attachment_id,
                        'storage_path'  => $entry['storagePath'] ?? null,
                    ]
                );

                // Bump the same counter the AS chain bumps so the
                // analytics number reflects total images regardless of
                // which path served them.
                $total = (int) get_option('structura_stat_generated_images', 0);
                update_option('structura_stat_generated_images', $total + 1);
            } catch (\Exception $e) {
                $handled[$slot] = false;
                $this->log(
                    'warning',
                    sprintf('Inline image sideload failed for slot=%s: %s', $slot, $e->getMessage()),
                    $campaign_id,
                    Log_Steps::VISUALS,
                    [
                        'post_id'      => $post_id,
                        'slot'         => $slot,
                        'storage_path' => $entry['storagePath'] ?? null,
                    ]
                );
            }
        }

        return $handled;
    }

    // `queue_image_tasks` and `enqueue_image_task` retired in Phase 1.0h
    // (2026-05-07). The cloud's webhook delivery now ships every image
    // inline via `payload.images` — there's nothing to queue. The
    // sideload still happens via `sideload_image_bundle` above; the
    // post-meta-box regen flow keeps using `generate_post_images` →
    // `delegate_image_to_cloud` for on-demand single-image rebuilds.
    // The `MAX_ALLOWED_PACKET` silent-insert-failure that motivated
    // the original tiny-args design is moot once nothing enqueues.

    /**
     * @throws \Exception
     */
    /**
     * Ship the campaign payload to the cloud Architect.
     *
     * @param array  $campaign        Resolved campaign doc from repository.
     * @param array  $license         License data (plan + license_key).
     * @param string $campaign_run_id Optional progress-stream correlation
     *                                id. Non-empty only for manual
     *                                "Generate Now" runs — automated cron
     *                                pulses pass '' and the cloud
     *                                self-generates a runId on receipt.
     *                                Wire field name (`campaign_run_id`)
     *                                matches `CampaignCloudPayload` in
     *                                `functions/src/types/functions.ts`.
     */
    private function delegate_to_cloud(array $campaign, array $license, string $campaign_run_id = ''): void
    {
        $this->log('info', "Delegating content synthesis to Cloud Architect.", $campaign['id'], Log_Steps::CLOUD_DELEGATION);

        $tier = $license['plan'];

        $data = Key_Manager::get_license_payload();

        // Resolve which persona we are using for this specific run
        $persona_id = $this->resolve_persona_id($campaign['intelligence']['personaId']);

        // Text provider is mandatory — cloud delegation without a text
        // provider is nonsensical (the entire payload is a text-generation
        // request). Silent "default to openai" here was the cause of
        // Claude+Gemini campaigns producing OpenAI-authored posts, so we
        // refuse instead of guessing. Legacy `provider` is still honored
        // for back-compat while migrated installs roll forward.
        $text_provider  = $campaign['intelligence']['textProvider'] ?? $campaign['intelligence']['provider'] ?? null;
        if ( ! $text_provider) {
            throw new \Exception(
                esc_html(
                    'No text provider configured for campaign #' . $campaign['id'] . '. ' .
                    'Expected `intelligence.textProvider` (or legacy `provider`) to be set.'
                )
            );
        }

        // Image provider is OPTIONAL — a campaign may run text-only. If
        // present we accept it verbatim (validator/migration guaranteed it
        // is image-capable). We do NOT fall back to the legacy `provider`
        // field anymore: that shortcut used to pick "anthropic" for
        // Claude text campaigns and then break image generation because
        // Claude has no image capability.
        $image_provider = $campaign['intelligence']['imageProvider'] ?? null;

        // Optional campaign-level fallback providers. The cloud decides
        // whether to actually use them (plan gating, key availability).
        // We forward them verbatim here so the cloud has the raw intent,
        // and for Pro we also forward the user's fallback API key(s).
        $fallback_text_provider  = $campaign['intelligence']['fallbackTextProvider'] ?? null;
        $fallback_image_provider = $campaign['intelligence']['fallbackImageProvider'] ?? null;

        // Pass the campaign-pinned model verbatim. The cloud's text
        // resolver applies PLAN_DEFAULTS for managed tiers when null
        // and validates BYOK callers carry a recognised model id.
        $model = $campaign['intelligence']['textModel'] ?? null;

        if ( ! $campaign['intelligence']['language'] || $campaign['intelligence']['language'] === 'default') {
            $campaign['intelligence']['language'] = get_bloginfo('language');
        }

        $persona = [
            'id'            => $persona_id,
            'role'          => get_post_meta($persona_id, '_role', true),
            'tone'          => get_post_meta($persona_id, '_tone', true),
            'reading_level' => get_post_meta($persona_id, '_reading_level', true),
        ];

        // Build the payload — include both textProvider and imageProvider
        // Cloud functions accept both new split fields AND legacy 'provider'
        // for backward compatibility during the transition.
        // Stamp fallback providers directly on the `intelligence` subtree
        // so the cloud's `CampaignCloudPayload.campaign.intelligence` read
        // path (the one `generateAIBitmap` already uses) picks them up
        // without a separate wire field. Null-out when not configured so
        // the cloud-side `?? undefined` check short-circuits cleanly.
        $campaign['intelligence']['fallbackTextProvider']  = $fallback_text_provider;
        $campaign['intelligence']['fallbackImageProvider'] = $fallback_image_provider;

        // 2026-05-01 v2 dispatch payload.
        //
        // Two legitimate shapes the cloud accepts:
        //
        //   1. Registered cloud campaign (scheduled cron / "Run Now"
        //      on a saved campaign) — `campaignId` is a nanoid that
        //      points to a Firestore doc. Cloud loads the doc and
        //      ignores any inline `campaign`. Source of truth lives
        //      on cloud.
        //
        //   2. Ephemeral single-post (the SPA's "Generate Now" form
        //      at /generate). The campaign exists ONLY in this
        //      request; there's nothing in Firestore to load. We
        //      ship the campaign object inline as `body.campaign`
        //      and omit `campaignId`. Cloud uses the inline payload
        //      directly.
        //
        // Single-post is detected by `$campaign['id']` being empty
        // (the `Rest_Api::generate_single_post` flow stamps `id: 0`
        // on the ephemeral campaign it builds). Anything truthy
        // means a registered campaign and goes the cloud-only route.
        $is_ephemeral_single_post = empty($campaign['id']);

        // Phase 1.8 PR8 — bearer auth carries identity (workspaceId,
        // activationId) directly. The cloud's `executeCloudCampaignStep`
        // reads `auth.workspaceId` from `requireActivationBearer`, so
        // shipping `licenseKey` + `domain` here was just legacy noise
        // (and silently 403'd anonymous installs whose `licenseKey`
        // is empty). `Cloud_Client::post()` injects bearer +
        // `activation_id` automatically; we only ship the operational
        // payload below.
        $payload = [
            'webhookUrl'       => rest_url('structura/v1/webhook/receive-blueprint'),
            'provider'         => $text_provider,         // Legacy field (backward compat)
            'textProvider'     => $text_provider,
            'imageProvider'    => $image_provider,
            'model'            => $model,
            'persona'          => $persona,
            'site_context'     => $this->context_builder->build_cloud_context($campaign),
        ];

        if ($is_ephemeral_single_post) {
            $payload['campaign'] = $campaign;
        } else {
            $payload['campaignId'] = (string) $campaign['id'];
        }

        // Progress-stream correlation. Only forwarded for manual runs, so
        // older cloud builds (pre-progress-stream) see a payload without
        // the field and behave exactly as before — no parse error, no
        // cascading failure. Spec: specs/progress-stream.md §11 Q1(a).
        if ($campaign_run_id !== '') {
            $payload['campaign_run_id'] = $campaign_run_id;
        }

        // BYOK keys are no longer injected on the wire. The cloud's
        // resolver reads workspace credentials directly from
        // `/workspaces/{w}/credentials/{c}` for BYOK runs;
        // managed tiers use master keys; free / none tiers use
        // master keys with a per-cycle rate cap. Spec:
        // `specs/v2/cloud-only-generation.md` §Phase 2-3.

        // Inject vetted authority domains from campaign meta (if available)
        $authority_cluster = get_post_meta($campaign['id'], '_cluster_authority', true);
        if ( ! empty($authority_cluster['domains'])) {
            $payload['campaign']['authorityDomains'] = $authority_cluster['domains'];
            $this->log('info', sprintf(
                'Authority domains loaded: %d vetted source(s) will be used for link placement.',
                count($authority_cluster['domains'])
            ), $campaign['id'], 'authority');
        }

        // Keyword Bank: pick the next keyword on the PHP side (round-robin)
        // and look up existing keyphrases for that keyword so the AI can
        // generate a unique long-tail variation (avoids Yoast/RankMath
        // duplicate keyphrase warnings and keyword cannibalization).
        $keywords_cluster = get_post_meta($campaign['id'], '_cluster_keywords', true);
        if ( ! empty($keywords_cluster['bank']) && is_array($keywords_cluster['bank'])) {
            $picked = $this->pick_next_keyword($keywords_cluster['bank']);

            if ($picked) {
                $existing_keyphrases = $this->get_existing_keyphrases_for_keyword(
                    $campaign['id'],
                    $picked['keyword']
                );

                $payload['campaign']['pickedKeyword']       = $picked;
                $payload['campaign']['existingKeyphrases']   = $existing_keyphrases;

                $this->log('info', sprintf(
                    'Keyword picked: "%s" (used %dx). %d existing keyphrase(s) for this keyword.',
                    $picked['keyword'],
                    $picked['usageCount'] ?? 0,
                    count($existing_keyphrases)
                ), $campaign['id'], 'keywords');
            }
        }

        $result = Cloud_Client::post('/executeCloudCampaignStep', $payload, ['timeout' => 60]);

        // Resolve the runId we're about to dispatch — same source-of-truth
        // the cloud will use as the doc id. Used by both the success and
        // failure paths below.
        $run_id = (string) ($payload['campaign_run_id'] ?? '');

        if (is_wp_error($result)) {
            $error_message = $result->get_error_message();
            $this->log('error', "Cloud handover failed: " . $error_message, $campaign['id']);

            // Record a local sentinel so `runs_get` can synthesize a
            // terminal-failed response for the SPA. Without this, the
            // SPA polls a cloud doc that was never created and sticks
            // at "Queued" forever — Spec: progress-stream §10
            // (terminal states from dispatch failure).
            if ($run_id !== '') {
                \Structura\Progress\Dispatch_Failure_Tracker::record(
                    $run_id,
                    (int) ($campaign['id'] ?? 0),
                    $error_message,
                    'dispatch_failed'
                );
            }

            return;
        }

        $body = $result['body'];

        if (isset($body['success']) && $body['success'] === true) {
            $this->log('success', "Handover complete. Campaign is now in the Cloud Pipeline.", $campaign['id']);
        } else {
            $error = $body['error'] ?? 'Unknown Error';
            $rejection_code = is_array($body) && ! empty($body['code']) ? (string) $body['code'] : '';
            $is_credentials_gap = in_array($rejection_code, ['credentials_missing', 'tier_quota_exceeded'], true);

            // Cloud-only-generation Phase 3: structured rejection codes
            // (`credentials_missing` / `tier_quota_exceeded`) get their
            // own log step so System Logs can surface "no provider key"
            // distinctly from synthesis failures. Auto-pause is NOT
            // triggered — the campaign stays scheduled; the user
            // reconnects a key (or upgrades) and the next AS tick
            // succeeds without manual resume.
            $log_step = $is_credentials_gap ? Log_Steps::CREDENTIALS_MISSING : Log_Steps::CLOUD_DELEGATION;
            $this->log('error', "Cloud rejected handover: " . $error, $campaign['id'], $log_step, [
                'code'   => $rejection_code,
                'detail' => $body['detail'] ?? null,
            ]);

            // Same sentinel write as the WP_Error branch — a non-2xx
            // body still means the cloud accepted the request but
            // refused to run it (auth / payload validation / version
            // mismatch). The SPA gets a terminal-failed response on
            // its next poll instead of a stuck progress bar.
            if ($run_id !== '') {
                $code = $is_credentials_gap
                    ? $rejection_code
                    : (is_string($error) && $error !== '' ? 'dispatch_rejected' : 'dispatch_failed');
                \Structura\Progress\Dispatch_Failure_Tracker::record(
                    $run_id,
                    (int) ($campaign['id'] ?? 0),
                    is_string($error) ? $error : 'Unknown Error',
                    $code
                );
            }
        }
    }

    /**
     * Action Scheduler bridge for manual "Generate Now" runs.
     *
     * The REST endpoint (`Rest_Api::generate_post_now`) persists the
     * ephemeral campaign to a transient and passes only the key through
     * AS args. This keeps the `wp_actionscheduler_actions.args` row small
     * enough to survive MySQL's `max_allowed_packet` on shared hosts — a
     * campaign payload with strategy / keywords / authority / rhythm
     * populated can otherwise reach 50–500 KB and the `$wpdb->insert`
     * silently fails (see `Structura\Core\Site_Health` and
     * docs/troubleshooting/images-not-generating).
     *
     * Terminal behaviour on a missing transient: we log and return rather
     * than throwing. A missing transient means either the request already
     * ran (and something re-fired the hook), the payload expired, or the
     * object cache was flushed. None of those recover on retry, so parking
     * the job in Action Scheduler's failure queue would just produce noise.
     *
     * @param string $campaign_key Transient key written by the REST handler.
     */
    public function handle_as_single_post_task(string $campaign_key): void
    {
        if ($campaign_key === '') {
            $this->log(
                'error',
                'Single-post task received an empty campaign key; skipping.',
                0,
                'single_post'
            );

            return;
        }

        $cached = get_transient($campaign_key);
        // Delete immediately — we don't want a successful run to leave its
        // payload behind, and if we failed to read above a delete is a no-op.
        delete_transient($campaign_key);

        // Handle both wire shapes:
        //   - New (post-2026-05-01): `['campaign' => [...], 'run_id' => '<uuid>']`
        //     so the SPA's redirect target is known up-front.
        //   - Legacy: just the campaign array. Pre-feature transients
        //     written before this rollout are tolerated for one TTL
        //     window (1 hour), then naturally drain.
        if (is_array($cached) && isset($cached['campaign']) && is_array($cached['campaign'])) {
            $campaign = $cached['campaign'];
            $run_id   = isset($cached['run_id']) && is_string($cached['run_id']) ? $cached['run_id'] : '';
        } elseif (is_array($cached)) {
            $campaign = $cached;
            $run_id   = '';
        } else {
            $this->log(
                'warning',
                sprintf(
                    'Single-post task could not load its campaign payload (key %s). The request may have expired or been evicted; click Generate Now again.',
                    $campaign_key
                ),
                0,
                'single_post'
            );

            return;
        }

        $this->execute_single_post($campaign, $run_id);
    }

    /**
     * Handles a one-time post generation triggered manually from the UI.
     *
     * `$campaign_run_id` is the UUID the REST handler minted upfront so
     * the SPA could navigate to `/generate/runs/:runId` immediately on
     * submit. Empty string means a legacy enqueue (pre-2026-05-01) that
     * didn't carry a run id; cloud will mint one in that case but the
     * SPA loses the in-place transition.
     *
     * @throws \Exception
     */
    public function execute_single_post(array $campaign, string $campaign_run_id = ''): void
    {
        $this->log('info', "Starting single post generation.", 0, 'single_post');

        try {
            $license_data = License_Manager::get_license_data();

            // Cloud-only-generation Phase 3: every tier delegates to
            // the cloud. No more local synthesis branch — the cloud
            // resolver applies tier policy (BYOK credentials, free /
            // none rate cap) on its side. Cloud path is async; the
            // actual result arrives via webhook, so we don't log a
            // misleading "success" here either.
            $this->delegate_to_cloud($campaign, $license_data, $campaign_run_id);
        } catch (\Exception $e) {
            $this->log('error', $e->getMessage(), 0, 'single_post');
            throw $e;
        }
    }

    /**
     * Webhook Receiver: Handles signed AI output from Cloud
     * @throws \Exception
     */
    public function receive_cloud_blueprint($request)
    {
        $signature = $request->get_header('x-structura-signature') ?: $request->get_header('x_structura_signature');

        if ( ! $this->verify_webhook_signature($request->get_body(), $signature)) {
            throw new \Exception("Webhook signature mismatch. Verification failed.", 0, 'webhook');
        }

        $payload = $request->get_json_params();

        $is_pulse_check = isset($payload['type']) && $payload["type"] === "pulse_check";

        if ($is_pulse_check) {
            return rest_ensure_response(['success' => true, 'message' => 'Pulse verified! Webhook is reachable.']);
        }

        // Phase 1.0c §4 — campaign_id from the cloud webhook is `int|string`
        // (legacy WP post id or nanoid). Casting to int silently zero'd
        // nanoids whose first char is a letter, which made the receiver
        // throw "campaign not found" inside the try block — surfaces as
        // an HTTP 500 to the cloud, which then retries 3x and aborts the
        // synthesis (see cloud log: `where: background_synthesis_catch`).
        //
        // 2026-05-02 — relax the "0 or '0'" guard for ephemeral
        // single-post runs. Cloud's single-post path synthesises an
        // inline campaign with id=0 (no registered campaign exists)
        // and ships it under `payload.campaign`. The receiver below
        // already prefers `payload.campaign` over a fetch-by-id, so
        // accepting campaign_id=0 with an inline campaign is safe;
        // the original anti-zero guard targets payloads with neither
        // a real id nor an inline campaign (genuinely malformed).
        $raw_campaign_id = $payload['campaign_id'] ?? null;
        $has_inline_campaign = isset($payload['campaign'])
            && is_array($payload['campaign'])
            && !empty($payload['campaign']);

        if ($raw_campaign_id === null || $raw_campaign_id === '') {
            return new \WP_Error('missing_campaign_id', 'Webhook payload missing campaign_id.', ['status' => 400]);
        }
        if (!$has_inline_campaign && ($raw_campaign_id === 0 || $raw_campaign_id === '0')) {
            return new \WP_Error(
                'missing_campaign_id',
                'Webhook payload has campaign_id=0 and no inline campaign — cannot route post.',
                ['status' => 400]
            );
        }
        $campaign_id = is_string($raw_campaign_id)
            ? sanitize_text_field($raw_campaign_id)
            : (int) $raw_campaign_id;

        if ( ! empty($payload['error'])) {
            $this->log($payload['level'] ?? "error", "Cloud delegation failure: " . $payload['message'], $campaign_id,
                $payload['step'] ?? Log_Steps::CLOUD_DELEGATION);

            return rest_ensure_response(['success' => false]);
        }

        try {
            // The actual insert lives in `apply_blueprint` so the polling
            // fallback (`Delivery_Poller`) runs the IDENTICAL code path —
            // post creation, keyword/meta, image sideload, the
            // `structura/post/inserted` hook, and the run_id idempotency
            // guard. Keep this receiver thin: it owns transport concerns
            // (signature, pulse, malformed-payload guards) and delegates the
            // domain logic.
            $result = $this->apply_blueprint($payload);

            $response = ['success' => true, 'post_id' => $result['post_id']];
            if ( ! empty($result['image_failures'])) {
                $response['image_failures'] = $result['image_failures'];
            }

            return rest_ensure_response($response);
        } catch (\Exception $e) {
            // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- third arg is the previous-exception (Throwable), never rendered; PCP scans every arg of `throw new \Exception(...)` without checking which one is the message.
            throw new \Exception(esc_html($e->getMessage()), 0, $e);
        }
    }

    /**
     * Convert a signed cloud blueprint payload into a WordPress post.
     *
     * Shared by the webhook receiver (`receive_cloud_blueprint`) and the
     * polling-delivery fallback (`Delivery_Poller`) so BOTH delivery paths run
     * identical insert logic. The cloud parks a deliverable for pull whenever
     * the webhook push is intercepted/unreachable; the poller pulls it and
     * calls this method.
     *
     * Idempotent on `campaign_run_id`: if a post for this run already exists,
     * the existing post id is returned WITHOUT inserting a duplicate. This is
     * what makes the pull fallback safe to attempt even when we can't be sure
     * the webhook didn't also land — the cms.xerx.io 2026-05-22 case where the
     * plugin completed the insert but the cloud never received the response.
     *
     * @param array $payload Decoded, signature-verified blueprint payload.
     * @return array{post_id:int, image_failures:array<int,array{slot:string,reason:string}>}
     * @throws \Exception on a hard failure (campaign not found, insert failure).
     */
    public function apply_blueprint(array $payload): array
    {
        $raw_campaign_id = $payload['campaign_id'] ?? null;
        $campaign_id = is_string($raw_campaign_id)
            ? sanitize_text_field($raw_campaign_id)
            : (int) $raw_campaign_id;

        $ai_data    = $payload['ai_output'] ?? [];
        $persona_id = $payload['persona_id'] ?? null;

        // `campaign_run_id` may live at the payload root or nested inside
        // `generation_meta` depending on which cloud version delivered this
        // blueprint (the nested form predates the root field, kept for
        // back-compat during the rollout window). Prefer the root when both
        // are present.
        $campaign_run_id = '';
        if ( ! empty($payload['campaign_run_id']) && is_string($payload['campaign_run_id'])) {
            $campaign_run_id = sanitize_text_field($payload['campaign_run_id']);
        } elseif ( ! empty($payload['generation_meta']['campaign_run_id']) &&
                   is_string($payload['generation_meta']['campaign_run_id'])) {
            $campaign_run_id = sanitize_text_field($payload['generation_meta']['campaign_run_id']);
        }

        // Idempotency guard — NEVER insert the same run twice. Two ways a
        // duplicate could otherwise happen:
        //   1. A host security layer ate the webhook RESPONSE after the plugin
        //      actually inserted the post (so the cloud thought delivery
        //      failed, parked a deliverable, and the poller now pulls it).
        //   2. Two poll ticks raced on the same pending deliverable.
        // In both cases the post already carries this run's
        // `_structura_campaign_run_id`, so we short-circuit to the existing id.
        if ($campaign_run_id !== '') {
            $existing_post_id = $this->find_post_by_run_id($campaign_run_id);
            if ($existing_post_id > 0) {
                $this->log(
                    'info',
                    'Blueprint already applied for this run — skipping duplicate insert.',
                    $campaign_id,
                    Log_Steps::CONTENT_GENERATION,
                    ['post_id' => $existing_post_id, 'campaign_run_id' => $campaign_run_id]
                );
                return ['post_id' => $existing_post_id, 'image_failures' => []];
            }
        }

        // Phase 1.0c §4 — cloud ships the full campaign in the delivery
        // payload (the same campaign synthesis was driven by). Prefer it over
        // the cloud round-trip: it saves ~500ms-1s and eliminates a race where
        // a campaign edited mid-synthesis would have post-edit settings
        // applied to a pre-edit synthesis. Fall back to the round-trip for
        // back-compat with cloud builds that predate this delivery shape.
        if (isset($payload['campaign']) && is_array($payload['campaign']) && !empty($payload['campaign'])) {
            $campaign = $payload['campaign'];
        } else {
            $campaign = $this->fetch_campaign_for_run($campaign_id);
            if ($campaign === null) {
                throw new \Exception(
                    esc_html('Blueprint apply: campaign not found for id ' . (string) $campaign_id)
                );
            }
        }

        // 2026-05-02 — cloud forwards `persona_author_id` post-fix. Older
        // cloud builds don't include it; we fall through to the legacy meta
        // lookup inside insert_wordpress_post when the value is null/missing.
        $persona_author_id = isset($payload['persona_author_id']) && is_numeric($payload['persona_author_id'])
            ? (int) $payload['persona_author_id']
            : null;
        $post_id = $this->insert_wordpress_post($ai_data, $persona_id, $campaign, $campaign_run_id, $persona_author_id);

        $this->log("success", "Blueprint converted to post.", $campaign_id, Log_Steps::CONTENT_GENERATION, [
            'post_id' => $post_id,
            'via'     => 'cloud',
        ]);

        // If a keyword was picked from the bank: save the target keyword for
        // future keyphrase lookups + increment its usage count. The AI
        // keyphrase itself is already saved by insert_wordpress_post; we don't
        // override it (the AI made a unique long-tail variation of the keyword).
        if ( ! empty($payload['picked_keyword'])) {
            update_post_meta($post_id, '_structura_target_keyword', sanitize_text_field($payload['picked_keyword']));
            $this->increment_keyword_usage($campaign_id, $payload['picked_keyword']);
        }

        // Store generation metadata for the post editor meta box (model,
        // provider, token usage, timestamp).
        if ( ! empty($payload['generation_meta']) && is_array($payload['generation_meta'])) {
            $gen_meta = $payload['generation_meta'];
            $gen_meta['campaign_id']   = $campaign_id;
            $gen_meta['campaign_name'] = $campaign['identity']['name'] ?? '';
            update_post_meta($post_id, '_structura_generation_meta', $gen_meta);
        }

        // Phase 1.0h — cloud ships images inline for every tier; sideload the
        // bundle if present. A missing `payload.images` means the cloud chose
        // not to generate images for this run and the post lands without them.
        $has_inline_images = isset($payload['images'])
            && is_array($payload['images'])
            && ! empty($payload['images']);
        // Slots we couldn't sideload — reported back so the cloud promotes the
        // run to "completed with warnings" (outputs.imageFailures).
        $image_failures = [];
        if ($has_inline_images) {
            // An image failure must NEVER take down the post — it's already
            // inserted above. `sideload_image_bundle` throws on a bad/expired
            // signed URL, an unwritable uploads dir, or a host blocking the
            // outbound fetch (the SiteGround upload-permission case: image-gen
            // ON silently lost the whole post while OFF published fine). Catch
            // it here so the post survives image-less and the failure is
            // logged, instead of bubbling up → 500 → cloud retry → orphaned
            // /duplicated post.
            try {
                $this->sideload_image_bundle(
                    $post_id,
                    $payload['images'],
                    $campaign,
                    $campaign_id
                );
            } catch (\Exception $img_e) {
                $this->log(
                    'warning',
                    'Image sideload failed; post kept without images: ' . $img_e->getMessage(),
                    $campaign_id,
                    Log_Steps::VISUALS,
                    ['post_id' => $post_id]
                );
                // The whole bundle threw, so every delivered slot is treated as
                // failed. Same {slot, reason} shape the cloud-side gen path
                // produces; the cloud folds these into outputs.imageFailures.
                foreach (['featured', 'body'] as $slot) {
                    if (isset($payload['images'][$slot]) && is_array($payload['images'][$slot])) {
                        $image_failures[] = [
                            'slot'   => $slot,
                            'reason' => $img_e->getMessage(),
                        ];
                    }
                }
            }
        }

        // Fire `structura/post/inserted` NOW — after sideload — so subscribers
        // (Channel_Event_Forwarder → LinkedIn / etc., Run_Signal_Service →
        // recordPostInserted) can read the post's featured image and ship a
        // non-empty featured_image_url. Pre-2026-05-22 the hook fired from
        // inside insert_wordpress_post BEFORE the sideload, so cloud-synthesized
        // posts landed image-less on LinkedIn (cms.formulafoundry.io incident).
        $post_status_raw = (string)get_post_field('post_status', $post_id);
        $normalized_status = ($post_status_raw === 'publish') ? 'publish' : 'draft';
        $this->fire_post_inserted_hook(
            $post_id,
            $campaign,
            $campaign_run_id,
            $normalized_status
        );

        return ['post_id' => $post_id, 'image_failures' => $image_failures];
    }

    /**
     * Find an existing post inserted for a given run, by the
     * `_structura_campaign_run_id` meta `insert_wordpress_post` stamps. The
     * basis of `apply_blueprint`'s idempotency guard. Returns 0 when none.
     *
     * @param string $run_id Progress-stream correlation id (UUID/nanoid).
     * @return int Post id, or 0 if no post carries this run id.
     */
    private function find_post_by_run_id(string $run_id): int
    {
        if ($run_id === '') {
            return 0;
        }
        $query = new \WP_Query([
            'post_type'      => 'any',
            'post_status'    => 'any',
            'posts_per_page' => 1,
            'fields'         => 'ids',
            'no_found_rows'  => true,
            'meta_query'     => [
                [
                    'key'   => '_structura_campaign_run_id',
                    'value' => $run_id,
                ],
            ],
        ]);
        return $query->have_posts() ? (int) $query->posts[0] : 0;
    }

    /**
     * Security: HMAC SHA256 Signature Verification
     */
    public function verify_webhook_signature(string $raw_body, ?string $signature): bool
    {
        if ( ! $signature) {
            return false;
        }

        $data = Key_Manager::get_license_payload();

        if ( ! $data) {
            return false;
        }

        $secret = $data['secret'] ?? '';

        if (empty($secret)) {
            return false;
        }

        $expected = hash_hmac('sha256', $raw_body, $secret);

        return hash_equals($expected, $signature);
    }

    /**
     * Round-robin keyword picker: selects the keyword with the lowest usageCount.
     * When multiple share the same count, picks one at random for variety.
     *
     * @param array $bank Array of keyword entries with 'keyword' and 'usageCount' keys.
     * @return array|null The picked keyword entry, or null if bank is empty.
     */
    private function pick_next_keyword(array $bank): ?array
    {
        if (empty($bank)) {
            return null;
        }

        $min_usage  = PHP_INT_MAX;
        foreach ($bank as $entry) {
            $usage = (int)($entry['usageCount'] ?? 0);
            if ($usage < $min_usage) {
                $min_usage = $usage;
            }
        }

        $candidates = array_filter($bank, fn($e) => (int)($e['usageCount'] ?? 0) === $min_usage);

        return $candidates[array_rand($candidates)];
    }

    /**
     * Look up the SEO focus keyphrases of all published posts that were
     * generated under a given keyword. This lets the AI avoid duplicating
     * keyphrases across posts in the same topic cluster.
     *
     * @param int    $campaign_id The campaign post ID.
     * @param string $keyword     The keyword to filter by.
     * @return string[] Array of existing keyphrases (Yoast + RankMath, deduplicated).
     */
    private function get_existing_keyphrases_for_keyword(int $campaign_id, string $keyword): array
    {
        // Find all posts generated by this campaign that used this keyword
        $query = new \WP_Query([
            'post_type'      => 'post',
            'posts_per_page' => 100,
            'post_status'    => 'publish',
            'meta_query'     => [
                'relation' => 'AND',
                [
                    'key'   => '_structura_campaign_id',
                    'value' => $campaign_id,
                ],
                [
                    'key'   => '_structura_target_keyword',
                    'value' => $keyword,
                ],
            ],
            'fields' => 'ids',
        ]);

        $keyphrases = [];

        if ($query->have_posts()) {
            foreach ($query->posts as $post_id) {
                $yoast = get_post_meta($post_id, '_yoast_wpseo_focuskw', true);
                if ( ! empty($yoast)) {
                    $keyphrases[] = $yoast;
                }

                $rankmath = get_post_meta($post_id, 'rank_math_focus_keyword', true);
                if ( ! empty($rankmath)) {
                    foreach (array_map('trim', explode(',', $rankmath)) as $kw) {
                        if ($kw !== '') {
                            $keyphrases[] = $kw;
                        }
                    }
                }
            }
        }

        return array_values(array_unique($keyphrases));
    }

    /**
     * Increment the usageCount for a keyword in the campaign's keyword
     * bank. Called after a post is successfully generated using that
     * keyword.
     *
     * 2026-05-01 v2 — cloud is the single source of truth. The cloud
     * maintains `keywordQueueIndex` advance during stock pre-gen
     * (spec §1.3) and the keyword bank lives on the cloud `CampaignDoc`.
     * The plugin no longer needs to track usage locally. Function
     * preserved as a no-op (still called from `receive_cloud_blueprint`)
     * to avoid touching the receiver in the same change; can be deleted
     * along with its call site in a follow-up sweep.
     */
    private function increment_keyword_usage($campaign_id, string $keyword): void
    {
        return;
    }
}