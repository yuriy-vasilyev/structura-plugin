<?php

namespace Structura\Core;

if ( ! defined('ABSPATH')) {
    exit;
}

use Structura\Api\Rest_Api;
use Structura\Api\Privacy_Rest_Api;
use Structura\Channels\Channel_Event_Forwarder;
use Structura\Generator\Schema_Injector;
use Structura\Progress\Run_Signal_Service;
use Structura\Scheduler\Task_Runner;
use Structura\Ui\Admin_Dashboard;
use Structura\Ui\Attention_Admin_Notice;
use Structura\Ui\Dashboard_Widget;
use Structura\Ui\Headless_Onboarding_Notice;
use Structura\Ui\Wp_Cron_Disabled_Notice;
use Structura\Ui\Image_Uploads_Unwritable_Notice;
use Structura\Ui\Site_Unreachable_Notice;
use Structura\Ui\Post_Meta_Box;

class Loader
{

    public function run(): void
    {
        $this->load_dependencies();
        $this->define_admin_hooks();

        Data_Structure::init();

        // Initialize Personas API
        $api_personas = new Rest_Api();
        add_action('rest_api_init', [$api_personas, 'register_routes']);

        // Privacy & telemetry consent (Phase 1 of analytics rollout). Stores
        // the admin's opt-in choice for plugin-usage analytics under the
        // structura_privacy_consent option; read on every request that fires
        // telemetry, so a revoke takes effect immediately.
        $privacy_api = new Privacy_Rest_Api();
        add_action('rest_api_init', [$privacy_api, 'register_routes']);

        // Initialize Task Runner
        $task_runner = new Task_Runner();
        $task_runner->init();

        // Phase 1.0c §3 — periodic reconciler that brings Action Scheduler
        // in line with cloud's authoritative campaign list. Self-installs
        // every request so an AS-cleanup plugin nuking the recurring action
        // gets healed on the next pageload. The legacy
        // `structura_campaigns_authoritative_in_cloud` gate was retired
        // in 2026-05 (see `Cloud_Cadence_Sync::should_sync` and the
        // matching `Rest_Api::get_campaigns()` comment) — every install
        // now sweeps cadences out of cloud, so freshly-activated sites
        // get their AS pulses installed on the first sync tick instead
        // of stalling at "Not Scheduled" forever.
        \Structura\Scheduler\Cloud_Cadence_Sync::init();

        // Polling fallback for blocked webhook delivery. When a host
        // firewall / security plugin / cache intercepts the cloud's inbound
        // delivery POST (the SiteGround case), the cloud parks the post and
        // this poller PULLS it on a recurring tick — outbound calls are
        // rarely what hosts block. No-ops on sites whose webhook works.
        \Structura\Scheduler\Delivery_Poller::init();

        // Inject schema.org markup into <head> for generated posts
        $schema_injector = new Schema_Injector();
        $schema_injector->init();

        // Initialize post editor meta box (generation info + image regen)
        $post_meta_box = new Post_Meta_Box();
        $post_meta_box->init();

        // Channels: forward post-published events to the cloud dispatcher.
        $channels_forwarder = new Channel_Event_Forwarder();
        $channels_forwarder->init();

        // Progress stream: patch the cloud CampaignRun doc with
        // resultPostId/resultPostUrl once WP actually inserts the post,
        // so the success-receipt drawer can render a "View post" CTA.
        // Spec: specs/progress-stream.md §4.1 + §8.4.
        $run_signal_service = new Run_Signal_Service();
        $run_signal_service->init();

        // Initialize Cloud Client (admin notices for version enforcement)
        Cloud_Client::init();

        // Public-site profile bootstrap. Idempotent — `add_option`
        // returns false on every boot after the first, so this is one
        // option-existence check on subsequent loads. Seeds the profile
        // option from the legacy `STRUCTURA_MARKETING_SITE_URL` constant
        // for our own headless deployments (`cms.structurawp.com` etc.)
        // so they roll forward without a manual migration step.
        // Spec: `specs/site-identity-headless.md` §10.
        Public_Site_Profile::seed_from_constant_if_missing();

        // Phase 1.0e §1.0e — push site identity (name/tagline/language/logo)
        // to the cloud activation doc on `update_option_blogname` /
        // `_blogdescription` / `_locale` / `theme_mods_{stylesheet}` etc.
        // The class's option-change hooks set a 60s debounce transient that
        // a `shutdown` flush turns into a single signed POST. Cheap when no
        // option ever changes (the shutdown handler short-circuits on a
        // missing transient before any DB or HTTP work).
        // Spec: specs/v2/cloud-pregeneration-and-model-catalog.md §1.0e.
        $site_identity_sync = new Site_Identity_Sync();
        $site_identity_sync->init();

        // Site Health probes — surface environmental problems (low MySQL
        // packet size, disabled WP-Cron, unwritable uploads dir) in
        // Tools → Site Health so operators see the underlying cause
        // before a campaign silently fails. The tests are registered
        // on the `site_status_tests` filter; no cost when the user
        // never opens the Site Health page.
        Site_Health::init();

        // Self-hosted update checker — pulls release manifests from a
        // GCS bucket so direct/agency-internal installs auto-update without
        // visiting wp.org. Gated behind `STRUCTURA_WPORG_BUILD` because
        // wp.org plugin guideline #11 prohibits any non-wp.org update
        // fetcher from existing in the submitted package; the runtime
        // step-aside in `is_on_wporg()` is not enough on its own.
        //
        // Default behaviour (constant absent): updater runs — used for
        // local development, agency-internal builds, and the existing
        // GCS-distributed test-site channel.
        //
        // wp.org builds: the build pipeline (`.github/workflows/wporg-zip.yml`)
        // sed-injects `define('STRUCTURA_WPORG_BUILD', true);` into
        // `structura.php` so this branch evaluates to false and the updater
        // is never wired up.
        if ( ! defined('STRUCTURA_WPORG_BUILD')) {
            Self_Updater::init();
        }

        // Phase 1.8 — anonymous shadow workspace bootstrap. Hooks
        // `admin_init` so a fresh wp.org install with no license bound
        // generates a UUID v4 install id, calls
        // `/bootstrapAnonymousInstall` once, and persists the returned
        // bearer + activation id into `structura_license_data` with
        // `plan: "none"`. Subsequent admin page loads short-circuit on
        // the api_token check. Failed bootstrap calls are silent +
        // retry on the next page load — a fresh install with no
        // internet shouldn't see a scary banner.
        // Spec: `specs/v2/multi-tenant-and-public-api.md` §1.8.1 + §1.8.3.
        Anonymous_Bootstrap::init();

        // One-time "looks like a headless install" nudge. Fires only on
        // sites whose host starts with `cms.` (the convention we and
        // the docs recommend). Suppresses itself once the operator
        // dismisses OR turns headless mode on by any path.
        // Spec: `specs/site-identity-headless.md` §7.
        Headless_Onboarding_Notice::init();

        // IndexNow keyfile rewrite. On non-headless installs this hook
        // catches `/{key}.txt` requests and emits the stored key as
        // plain text — the verification path the IndexNow aggregator
        // needs before it'll accept submissions. On headless installs
        // the hook never matches (the keyfile lives at the front-end
        // origin, which the operator uploads themselves) so it costs
        // one early-return per request — cheaper than every other
        // rewrite rule.
        // Spec: `specs/site-identity-headless.md` §6.
        \Structura\Channels\IndexNow_Key_Service::init();

        // Fallback /llms.txt for AI crawlers — serves a manifest ONLY on
        // sites with no SEO plugin (Yoast/Rank Math/etc. ship their own
        // and we defer to them). Same init-priority-1 + path-match
        // strategy as IndexNow above; deferring is a cheap early-return.
        // Spec: `specs/outrank-parity-implementation.md` §6.
        \Structura\Generator\Llms_Txt_Service::init();

        // DISABLE_WP_CRON admin notice. Cross-wp-admin red banner that
        // fires when `wp-config.php` sets `DISABLE_WP_CRON = true`,
        // because without a system-cron fallback every scheduled
        // Structura task stalls silently. Site Health already reports
        // the same condition, but Site Health is low-discoverability.
        // Per-user dismissal with a 90-day re-prompt interval so a
        // broken system-cron setup is caught the next quarter rather
        // than silently masked forever.
        Wp_Cron_Disabled_Notice::init();

        // Unwritable-uploads admin notice. When wp-content/uploads isn't
        // writable, image sideload fails for every generated post (posts
        // now survive image-less, but the user loses every image until
        // they fix permissions — a common SiteGround/managed-host case).
        // Site Health reports it too, but this is the loud, discoverable
        // surface, with a direct "how to fix" docs link.
        Image_Uploads_Unwritable_Notice::init();

        // Cloud → plugin reachability admin notice. Cross-wp-admin red
        // banner that fires when the last handshake probe found the cloud
        // could not POST a blueprint back to this site (localhost / private
        // / firewalled / auth-walled). Without inbound reachability NO post
        // is ever delivered, so the failure is as silent and catastrophic
        // as the WP-Cron one. Detection is the cached verdict from
        // Site_Reachability — the live round-trip runs on the daily cron
        // (registered below), after activation, and on the manual pulse
        // button, never on a pageview.
        Site_Unreachable_Notice::init();

        // Page-builder compatibility detection + admin notice.
        // Spec: `specs/page-builder-compat.md` §3.2 + §4.1. The scheduler
        // hooks `init` for AS registration (self-healing when the daily
        // recheck record is missing) and the daily refresh handler; the
        // notice registers `admin_notices` + ajax dismissal. Both are
        // cheap on pageviews that don't need them because the notice
        // short-circuits on a dismissed-meta read and the scheduler only
        // touches Action Scheduler on `init`.
        \Structura\Compat\Compat_Scheduler::init();
        \Structura\Ui\Page_Builder_Notice::init();

        // Cross-wp-admin "needs attention" banner for unacknowledged
        // Cross-wp-admin "X campaign runs failed" banner — retired
        // 2026-05-22 (Yurii feedback): the card was too intrusive on
        // every admin page and re-aggregated previously-dismissed
        // failures alongside any new ones, so each new failure
        // resurfaced the entire backlog. The Dashboard widget below
        // is the remaining native-admin failure surface; in-SPA the
        // Runs tab + RunDetail still carry the full state.
        // \Structura\Ui\Attention_Admin_Notice::init();

        // wp-admin Dashboard widget — "Structura status" card. Same spec
        // reference as the banner above (§7 native-admin surfaces); the
        // two share a single site-transient cache so they never disagree
        // on the same pageview. Greenfield — the plugin registered no
        // dashboard widgets before this one.
        Dashboard_Widget::init();

        // Eagerly sync plugin version to Firestore when the plugin is updated
        add_action('upgrader_process_complete', [self::class, 'on_plugin_updated'], 10, 2);

        add_action('structura_daily_license_check', [License_Manager::class, 'verify_health']);

        // Re-run the cloud → plugin reachability handshake daily, piggy-
        // backing the existing license-health cron rather than scheduling a
        // second event. Keeps the Site_Unreachable_Notice / in-SPA banner
        // verdict fresh (a site URL change or a newly-closed firewall is
        // caught within a day) without a round-trip on every pageview.
        add_action('structura_daily_license_check', [Site_Reachability::class, 'probe_and_store']);

        // Backfill seed of the default "House voice" persona for installs
        // whose license was activated before the inline seed shipped.
        // Method short-circuits in O(1) when the option flag is set, so
        // already-seeded sites pay one option-lookup per admin pageload.
        add_action('admin_init', [License_Manager::class, 'seed_default_persona_if_needed']);

        // Phase 3b — the `structura_prune_logs` cron + retention sweep
        // is retired together with `wp_structura_logs`. The next
        // `Loader::on_plugin_updated` run unschedules the legacy cron;
        // the option keys are dropped from the settings endpoint.
    }

    private function load_dependencies(): void
    {
        require_once STRUCTURA_PATH . 'includes/Core/Log_Service.php';
        require_once STRUCTURA_PATH . 'includes/Core/Data_Structure.php';
        require_once STRUCTURA_PATH . 'includes/Core/Encryption.php';
        require_once STRUCTURA_PATH . 'includes/Core/Key_Manager.php';
        require_once STRUCTURA_PATH . 'includes/Core/Cloud_Client.php';
        require_once STRUCTURA_PATH . 'includes/Core/Public_Site_Profile.php';
        require_once STRUCTURA_PATH . 'includes/Core/Site_Identity_Sync.php';
        require_once STRUCTURA_PATH . 'includes/Core/Anonymous_Bootstrap.php';
        // Self_Updater is gated behind `STRUCTURA_WPORG_BUILD` (see init() above)
        // and the file is also excluded from the wp.org rsync as defense in
        // depth, so the require_once must be guarded too — otherwise the wp.org
        // ZIP would `require_once` a missing file and fatal on plugin load.
        if ( ! defined('STRUCTURA_WPORG_BUILD')) {
            require_once STRUCTURA_PATH . 'includes/Core/Self_Updater.php';
        }
        require_once STRUCTURA_PATH . 'includes/Core/Site_Health.php';
        // Debug_Mode + Compat\Content_Strip_Diagnostic retired with the
        // System Logs page (spec/v2/notification-center.md §12).

        require_once STRUCTURA_PATH . 'includes/Core/Provider_Registry.php';
        require_once STRUCTURA_PATH . 'includes/Core/SEO_Rules_Registry.php';

        // Provider adapter classes (OpenAI / Gemini / Claude text + image
        // adapters, abstract bases, connection traits, and the
        // `*_Provider_Interface` contracts) were retired in Phase 4 of
        // `specs/v2/cloud-only-generation.md`. The cloud's
        // `resolveProviderKeyForTier` is the sole resolver and the
        // plugin never instantiates adapters or holds provider keys.

        // REST API
        require_once STRUCTURA_PATH . 'includes/Api/Rest_Api.php';

        // Generator
        require_once STRUCTURA_PATH . 'includes/Generator/Block_Serializer.php';
        require_once STRUCTURA_PATH . 'includes/Generator/Schema_Injector.php';
        require_once STRUCTURA_PATH . 'includes/Generator/Llms_Txt_Service.php';

        // UI
        require_once STRUCTURA_PATH . 'includes/Ui/Admin_Dashboard.php';
        require_once STRUCTURA_PATH . 'includes/Ui/Post_Meta_Box.php';
        require_once STRUCTURA_PATH . 'includes/Ui/Headless_Onboarding_Notice.php';
        require_once STRUCTURA_PATH . 'includes/Ui/Page_Builder_Notice.php';
        require_once STRUCTURA_PATH . 'includes/Ui/Wp_Cron_Disabled_Notice.php';
        require_once STRUCTURA_PATH . 'includes/Compat/Builder_Compat.php';
        require_once STRUCTURA_PATH . 'includes/Compat/Builder_Detector.php';
        require_once STRUCTURA_PATH . 'includes/Compat/SEO_Plugin_Detector.php';
        require_once STRUCTURA_PATH . 'includes/Compat/Compat_Scheduler.php';
        require_once STRUCTURA_PATH . 'includes/Ui/Attention_Admin_Notice.php';
        require_once STRUCTURA_PATH . 'includes/Ui/Dashboard_Widget.php';

        // Scheduler
        require_once STRUCTURA_PATH . 'includes/Scheduler/Action_Scheduler_Service.php';
        // Campaign_Repository.php was retired in v2 (2026-05-01) and
        // physically deleted in Phase 1.0d cleanup (2026-05-07). Cloud
        // is the single source of truth for campaigns — reads go through
        // Campaign_Cloud_Reader and writes through the cloud REST
        // endpoints. See memory feedback_cloud_is_single_source_of_truth_v2.
        require_once STRUCTURA_PATH . 'includes/Scheduler/Campaign_Cloud_Reader.php';
        require_once STRUCTURA_PATH . 'includes/Scheduler/Cloud_Cadence_Sync.php';
        require_once STRUCTURA_PATH . 'includes/Scheduler/Context_Builder.php';
        require_once STRUCTURA_PATH . 'includes/Scheduler/Task_Runner.php';

        // Core Processing & Tiers
        require_once STRUCTURA_PATH . 'includes/Core/License_Manager.php';
        require_once STRUCTURA_PATH . 'includes/Core/Image_Processor.php';

        // Channels (Integrations Store) — PHP side stays thin; cloud does the work.
        require_once STRUCTURA_PATH . 'includes/Channels/Channel_Event_Forwarder_Interface.php';
        require_once STRUCTURA_PATH . 'includes/Channels/Channel_Event_Forwarder.php';
        require_once STRUCTURA_PATH . 'includes/Channels/Channels_Connections_Service_Interface.php';
        require_once STRUCTURA_PATH . 'includes/Channels/Channels_Connections_Service.php';
        require_once STRUCTURA_PATH . 'includes/Channels/Channels_Events_Service_Interface.php';
        require_once STRUCTURA_PATH . 'includes/Channels/Channels_Events_Service.php';
        require_once STRUCTURA_PATH . 'includes/Channels/IndexNow_Key_Service.php';

        // Progress stream — plugin-side post-inserted signal + cloud proxies.
        require_once STRUCTURA_PATH . 'includes/Progress/Runs_Service_Interface.php';
        require_once STRUCTURA_PATH . 'includes/Progress/Runs_Service.php';
        require_once STRUCTURA_PATH . 'includes/Progress/Run_Signal_Service.php';
        // Local sentinel for cloud-dispatch failures (Spec: progress-stream
        // §10) — Task_Runner records via this when /executeCloudCampaignStep
        // is unreachable; Rest_Api::runs_get reads it to synthesize a
        // terminal-failed response so the SPA stops polling on cloud 404.
        require_once STRUCTURA_PATH . 'includes/Progress/Dispatch_Failure_Tracker.php';
    }

    /**
     * Fires after WordPress completes a plugin update.
     * Eagerly syncs the new plugin version to the cloud activation record
     * so the Firestore document stays current for dashboard/analytics.
     *
     * @param \WP_Upgrader $upgrader
     * @param array        $hook_extra
     */
    public static function on_plugin_updated($upgrader, array $hook_extra): void
    {
        // Only proceed for plugin updates
        if (($hook_extra['type'] ?? '') !== 'plugin' || ($hook_extra['action'] ?? '') !== 'update') {
            return;
        }

        // Check if Structura is among the updated plugins
        $our_basename = plugin_basename(STRUCTURA_PATH . 'structura.php');
        $plugins      = $hook_extra['plugins'] ?? [];

        if ( ! in_array($our_basename, $plugins, true)) {
            return;
        }

        // Phase 3b retirement — unschedule the legacy
        // `structura_prune_logs` cron and drop the now-orphaned
        // option keys + the `wp_structura_logs` table on upgrade.
        // The Notification Center supersedes the plugin's local
        // log surface (spec/v2/notification-center.md §8.1).
        wp_clear_scheduled_hook('structura_prune_logs');
        delete_option('structura_log_retention_enabled');
        delete_option('structura_log_retention_days');
        // Debug mode toggle retired in the same wave — clear its
        // option pair so disabled installs don't leave orphan rows.
        delete_option('structura_debug_mode_enabled');
        delete_option('structura_debug_mode_enabled_until');
        Log_Service::drop_table();

        // Fire a non-blocking version sync to the cloud
        License_Manager::sync_version_to_cloud();
    }

    private function define_admin_hooks(): void
    {
        $plugin_admin = new Admin_Dashboard();

        // Menu & Assets
        add_action('admin_menu', [$plugin_admin, 'add_plugin_menu']);
        add_action('admin_enqueue_scripts', [$plugin_admin, 'enqueue_styles']);
        add_action('admin_enqueue_scripts', [$plugin_admin, 'enqueue_scripts']);
    }
}
