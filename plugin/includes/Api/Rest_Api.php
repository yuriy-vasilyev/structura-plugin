<?php

namespace Structura\Api;

use Structura\Channels\Channels_Connections_Service;
use Structura\Channels\Channels_Connections_Service_Interface;
use Structura\Channels\Channels_Events_Service;
use Structura\Channels\Channels_Events_Service_Interface;
use Structura\Channels\IndexNow_Key_Service;
use Structura\Core\Cloud_Client;
use Structura\Core\Diagnostics;
use Structura\Core\Key_Manager;
use Structura\Core\License_Manager;
use Structura\Core\Log_Service;
use Structura\Core\Provider_Registry;
use Structura\Core\Public_Site_Profile;
use Structura\Core\SEO_Rules_Registry;
use Structura\Progress\Runs_Service;
use Structura\Progress\Runs_Service_Interface;
use Structura\Scheduler\Action_Scheduler_Service;
use Structura\Scheduler\Campaign_Cloud_Reader;
use Structura\Scheduler\Campaign_Validator;
use Structura\Scheduler\Cloud_Cadence_Sync;
use Structura\Scheduler\Context_Builder;
use Structura\Scheduler\Task_Runner;
use Structura\Ui\Attention_Admin_Notice;

if ( ! defined('ABSPATH')) {
    exit;
}

class Rest_Api
{
    private string $namespace = 'structura/v1';

    /**
     * Lazily-instantiated proxy for the cloud `channels*Connection` endpoints.
     * Tests inject a fake via `set_channels_connections_service()` to assert
     * the routes hand off without standing up the cloud.
     */
    private ?Channels_Connections_Service_Interface $channels_connections = null;

    /**
     * Lazily-instantiated proxy for the cloud `channelsListEvents` endpoint.
     * Same lazy / test-seam pattern as `$channels_connections` above.
     */
    private ?Channels_Events_Service_Interface $channels_events = null;

    /**
     * Lazily-instantiated proxy for the cloud `getCampaignRun` endpoint
     * (progress-stream). Same lazy / test-seam pattern as the channels
     * proxies above.
     */
    private ?Runs_Service_Interface $runs = null;

    /**
     * Test seam: swap in a mocked Channels connections proxy. Production code
     * never calls this — callers go through the lazy getter below, which
     * builds the real service on first use.
     */
    public function set_channels_connections_service(Channels_Connections_Service_Interface $service): void
    {
        $this->channels_connections = $service;
    }

    /**
     * Test seam: swap in a mocked Channels events proxy.
     */
    public function set_channels_events_service(Channels_Events_Service_Interface $service): void
    {
        $this->channels_events = $service;
    }

    /**
     * Test seam: swap in a mocked progress Runs proxy. Production code
     * goes through the lazy getter below, which builds the real service on
     * first use.
     */
    public function set_runs_service(Runs_Service_Interface $service): void
    {
        $this->runs = $service;
    }

    /**
     * Register all plugin REST routes. Hooked to `rest_api_init` from the
     * plugin bootstrap — see `Core/Loader.php` where this class is wired.
     */
    public function register_routes(): void
    {
        // --- SYSTEM & SETTINGS ---
        register_rest_route($this->namespace, '/settings', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_settings'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/settings', [
            'methods'             => 'POST',
            'callback'            => [$this, 'update_settings'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/keys', [
            'methods'             => 'POST',
            'callback'            => [$this, 'save_api_key'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/onboarding', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_onboarding_status'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/status', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_system_status'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/site/indexing-status', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_site_indexing_status'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // --- MIGRATION ---
        // Per-post SEO meta (Yoast / RankMath title, description, focus
        // keyphrase) for the cloud's Migrate / Move-to-Headless engines. WP REST
        // never exposes the protected `_yoast_wpseo_*` meta, so a site that
        // retires WordPress would lose its SEO data; this surfaces it for the
        // importer. Read-only; admin-gated (the importer authenticates with an
        // application password whose user has `manage_options`).
        register_rest_route($this->namespace, '/migration/seo', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_migration_seo'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Public-site profile (headless mode) —
        // spec: specs/site-identity-headless.md §4 (Quick setup) + §5.
        register_rest_route($this->namespace, '/site-profile', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_site_profile'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/site-profile', [
            'methods'             => 'POST',
            'callback'            => [$this, 'update_site_profile'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/site-profile/quick-setup', [
            'methods'             => 'POST',
            'callback'            => [$this, 'quick_setup_site_profile'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // IndexNow keyfile lifecycle (Phase 3 of site-identity-headless.md).
        // GET returns the active key + composed keyLocation so the SPA
        // can pre-fill the credentials form before submit.
        register_rest_route($this->namespace, '/channels/indexnow/key', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_indexnow_key'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        // POST proxies to the cloud `verifyIndexNowKeyfile` endpoint —
        // the cloud GETs the keyfile URL and writes the result back to
        // the connection summary.
        register_rest_route($this->namespace, '/channels/indexnow/(?P<id>[\w-]+)/verify', [
            'methods'             => 'POST',
            'callback'            => [$this, 'verify_indexnow_keyfile'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // 1. DASHBOARD STATS
        register_rest_route($this->namespace, '/stats', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_stats'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // 2. PERSONAS (CRUD)
        register_rest_route($this->namespace, '/personas', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_personas'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/personas', [
            'methods'             => 'POST',
            'callback'            => [$this, 'save_persona'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/personas/delete', [
            'methods'             => 'POST',
            'callback'            => [$this, 'delete_persona'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/jobs', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_jobs'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/jobs/run', [
            'methods'             => 'POST',
            'callback'            => [$this, 'run_task'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/jobs/retry', [
            'methods'             => 'POST',
            'callback'            => [$this, 'retry_task'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/jobs/(?P<id>\d+)', [
            'methods'             => 'DELETE',
            'callback'            => [$this, 'delete_task'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/scheduler/campaigns', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_campaigns'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/scheduler/campaign', [
            'methods'             => 'POST',
            'callback'            => [$this, 'create_campaign'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/scheduler/campaign/(?P<id>[\w-]+)', [
            'methods'             => 'PUT',
            'callback'            => [$this, 'update_campaign'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/scheduler/campaign/(?P<id>[\w-]+)/duplicate', [
            'methods'             => 'POST',
            'callback'            => [$this, 'duplicate_campaign'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/scheduler/campaign/(?P<id>[\w-]+)/toggle', [
            'methods'             => 'POST',
            'callback'            => [$this, 'toggle_campaign'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/post/generate', [
            'methods'             => 'POST',
            'callback'            => [$this, 'generate_single_post'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // AUTHORITY DISCOVERY
        // Campaign-bound: loads keyphrase/language/provider from campaign meta
        register_rest_route($this->namespace, '/scheduler/campaign/(?P<id>[\w-]+)/discover-authority', [
            'methods'             => 'POST',
            'callback'            => [$this, 'discover_authority_domains'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Detached: accepts keyphrase/language/provider directly in the body (pre-creation wizard step)
        register_rest_route($this->namespace, '/scheduler/discover-authority', [
            'methods'             => 'POST',
            'callback'            => [$this, 'discover_authority_domains_detached'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/scheduler/campaign/(?P<id>[\w-]+)/save-authority', [
            'methods'             => 'POST',
            'callback'            => [$this, 'save_authority_domains'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // --- KEYWORD DISCOVERY ---
        // Detached: accepts keyphrase/language/provider directly in the body (pre-creation wizard step)
        register_rest_route($this->namespace, '/scheduler/discover-keywords', [
            'methods'             => 'POST',
            'callback'            => [$this, 'discover_keywords_detached'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // --- SEO INTELLIGENCE ---
        // Spec: specs/seo-intelligence-plan.md §4.2.
        // The `/site` page's "Analyze my site" button — fires the Live
        // DataForSEO Labs queries (ranked_keywords + categories +
        // domain rank overview), caches the result on the workspace,
        // and returns the data inline so the SPA renders without a
        // second fetch.
        register_rest_route($this->namespace, '/site/analyze', [
            'methods'             => 'POST',
            'callback'            => [$this, 'analyze_site'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Cache lookup — free of spend. SPA calls this on /site tab
        // mount to decide between rendering the "Analyze" button and
        // the data view.
        register_rest_route($this->namespace, '/site/state', [
            'methods'             => 'POST',
            'callback'            => [$this, 'get_site_state'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Durable SEO settings — competitor URLs + digest opt-in.
        // POSTed from /site/competitors and /site/settings. Spec
        // specs/seo-intelligence-plan.md §4.2.
        register_rest_route($this->namespace, '/site/seo-settings', [
            'methods'             => 'POST',
            'callback'            => [$this, 'update_site_seo_settings'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // --- ONBOARDING WIZARD (W-A) ---
        // Spec: specs/onboarding-wizard-plan.md. Three universal-shape
        // proxies to the cloud's onboarding endpoints. Workspace-scoped;
        // works for all tiers (free/none see locked previews, paid see
        // the full wizard).
        register_rest_route($this->namespace, '/wizard/state', [
            'methods'             => 'POST',
            'callback'            => [$this, 'get_wizard_state'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/wizard/step', [
            'methods'             => 'POST',
            'callback'            => [$this, 'save_wizard_step'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/wizard/skip', [
            'methods'             => 'POST',
            'callback'            => [$this, 'skip_wizard_step'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        // Restart the wizard from step 1. Wipes progress, keeps the
        // underlying saved data (positioning, keywords, persona, etc.).
        register_rest_route($this->namespace, '/wizard/reset', [
            'methods'             => 'POST',
            'callback'            => [$this, 'reset_wizard_state'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        // W-B: AI connection test (blocking gate on wizard step 2).
        register_rest_route($this->namespace, '/wizard/test-ai', [
            'methods'             => 'POST',
            'callback'            => [$this, 'test_wizard_ai_connection'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        // W-B: One-click "Notify support" for managed-tier AI outages.
        register_rest_route($this->namespace, '/wizard/notify-support', [
            'methods'             => 'POST',
            'callback'            => [$this, 'notify_wizard_support'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        // W-C: Positioning answers (3a) — read + save.
        register_rest_route($this->namespace, '/wizard/positioning', [
            'methods'             => 'POST',
            'callback'            => [$this, 'get_wizard_positioning'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/wizard/positioning/save', [
            'methods'             => 'POST',
            'callback'            => [$this, 'save_wizard_positioning'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        // W-C: AI-draft positioning from the homepage (3a magic button).
        register_rest_route($this->namespace, '/wizard/positioning/suggest', [
            'methods'             => 'POST',
            'callback'            => [$this, 'suggest_wizard_positioning'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        // W-C: Target keyword suggestions (3c main feature).
        register_rest_route($this->namespace, '/wizard/keywords/suggest', [
            'methods'             => 'POST',
            'callback'            => [$this, 'suggest_wizard_keywords'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        // AI competitor suggestions — fallback when DataForSEO's
        // SERP-overlap discovery returns nothing (new / un-indexed sites).
        register_rest_route($this->namespace, '/wizard/competitors/suggest', [
            'methods'             => 'POST',
            'callback'            => [$this, 'suggest_wizard_competitors'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/scheduler/campaign/(?P<id>[\w-]+)/save-keywords', [
            'methods'             => 'POST',
            'callback'            => [$this, 'save_campaign_keywords'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/scheduler/campaign/(?P<id>[\w-]+)', [
            'methods'             => 'DELETE',
            'callback'            => [$this, 'delete_campaign'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Phase 1.6 follow-up — pre-generation stock state per campaign.
        // Used by the SPA's CampaignCard to show a "2 ready" / "Generating…"
        // chip. Cloud-side endpoint is `getCampaignStockSummary`.
        register_rest_route($this->namespace, '/scheduler/campaign/(?P<id>[\w-]+)/stock-summary', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_campaign_stock_summary'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Stock tab (2026-06-05) — visibility + control over the
        // pre-generated post buffer. List renders the tab's cards;
        // delete/clear discard drafts (the cloud cancels any in-flight
        // provider batch first); restock is the "Cancel & regenerate"
        // CTA for wedged batches. Cloud-side endpoints:
        // `listCampaignStock` / `deleteStockEntry` /
        // `clearCampaignStock` / `restockCampaign`.
        register_rest_route($this->namespace, '/scheduler/campaign/(?P<id>[\w-]+)/stock', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_campaign_stock'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/scheduler/campaign/(?P<id>[\w-]+)/stock/(?P<stock_id>[\w-]+)', [
            'methods'             => 'DELETE',
            'callback'            => [$this, 'delete_campaign_stock_entry'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/scheduler/campaign/(?P<id>[\w-]+)/stock/clear', [
            'methods'             => 'POST',
            'callback'            => [$this, 'clear_campaign_stock'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/scheduler/campaign/(?P<id>[\w-]+)/stock/restock', [
            'methods'             => 'POST',
            'callback'            => [$this, 'restock_campaign_stock'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Phase 1.7 — bulk-enable pre-generation across all campaigns
        // for the current activation. Wired to the post-upgrade
        // admin notice's "Enable for all my campaigns" CTA.
        register_rest_route($this->namespace, '/scheduler/pregeneration/bulk-enable', [
            'methods'             => 'POST',
            'callback'            => [$this, 'bulk_enable_pregeneration'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Phase 1.7 — admin-notice dismissal. Stored in WP user_meta
        // keyed by user id so the notice doesn't reappear on every
        // page load after the user has decided.
        register_rest_route($this->namespace, '/scheduler/pregeneration/notice/dismiss', [
            'methods'             => 'POST',
            'callback'            => [$this, 'dismiss_pregeneration_notice'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/scheduler/job/(?P<id>\d+)', [
            'methods'             => 'DELETE',
            'callback'            => [$this, 'delete_job'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Alias for the hook if needed
        register_rest_route($this->namespace, '/scheduler/all', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_campaigns'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Alias for the hook if needed
        register_rest_route($this->namespace, '/settings/seo-rules', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_seo_optimization_rules'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // 4. AI ENGINE & KEYS
        register_rest_route($this->namespace, '/models', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_available_models'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/models/refresh', [
            'methods'             => 'POST',
            'callback'            => [$this, 'refresh_models'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // User-facing Notification Center (spec/v2/notification-center.md).
        // Thin proxies — every notice mutation goes through the cloud
        // (where workspace membership + actor stamping live).
        register_rest_route($this->namespace, '/notices', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_notices'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/notices/acknowledge', [
            'methods'             => 'POST',
            'callback'            => [$this, 'acknowledge_notice'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/notices/dismiss', [
            'methods'             => 'POST',
            'callback'            => [$this, 'dismiss_notice'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // User-triggered diagnostics — runs the WP-environment
        // probes that the cloud can't see (DISABLE_WP_CRON, plugin
        // version vs. cloud minimum, future compat checks) and
        // POSTs each finding to the cloud's noticesReport endpoint.
        // Spec: v2/notification-center.md §11.2 (user-triggered only).
        register_rest_route($this->namespace, '/diagnostics/run', [
            'methods'             => 'POST',
            'callback'            => [$this, 'run_diagnostics'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/suggest', [
            'methods'             => 'POST',
            'callback'            => [$this, 'handle_unified_suggestion'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Page-builder compatibility snapshot. Spec
        // `specs/page-builder-compat.md` §4.3. Reads the cached
        // detection option written by `Compat_Scheduler::refresh()`
        // rather than probing on every request — the detection is
        // cheap but the wp-admin SPA polls this on the campaign
        // editor screen, so an option read keeps the worst case at
        // a single `get_option` per poll.
        register_rest_route($this->namespace, '/compat/page-builders', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_compat_page_builders'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/heartbeat/(?P<provider>[a-zA-Z0-9-]+)', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_provider_heartbeat'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route('structura/v1', '/engine/disconnect/(?P<provider>[a-zA-Z0-9-]+)', [
            'methods'             => 'DELETE',
            'callback'            => [$this, 'disconnect_provider'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/users', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_assignable_users'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/visual', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_visual_settings'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/visual', [
            'methods'             => 'POST',
            'callback'            => [$this, 'update_visual_settings'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Visual presets — workspace library + per-activation binding.
        register_rest_route($this->namespace, '/visual-presets', [
            'methods'             => 'GET',
            'callback'            => [$this, 'list_visual_presets'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/visual-presets', [
            'methods'             => 'POST',
            'callback'            => [$this, 'create_visual_preset'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/visual-presets/bind', [
            'methods'             => 'POST',
            'callback'            => [$this, 'bind_visual_preset'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/visual-presets/(?P<id>[\w-]+)', [
            'methods'             => 'POST',
            'callback'            => [$this, 'update_visual_preset'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/visual-presets/(?P<id>[\w-]+)/fork', [
            'methods'             => 'POST',
            'callback'            => [$this, 'fork_visual_preset'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/visual-presets/(?P<id>[\w-]+)', [
            'methods'             => 'DELETE',
            'callback'            => [$this, 'delete_visual_preset'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Persona binding + fork.
        register_rest_route($this->namespace, '/personas/(?P<id>[\w-]+)/fork', [
            'methods'             => 'POST',
            'callback'            => [$this, 'fork_persona'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/personas/set-default', [
            'methods'             => 'POST',
            'callback'            => [$this, 'set_default_persona'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        // Per-site persona membership — bind/unbind a workspace persona to
        // THIS site so it joins the site's "random per post" rotation.
        register_rest_route($this->namespace, '/personas/membership/add', [
            'methods'             => 'POST',
            'callback'            => [$this, 'add_persona_membership'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/personas/membership/remove', [
            'methods'             => 'POST',
            'callback'            => [$this, 'remove_persona_membership'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Workspace AI keys library + cross-site bind.
        register_rest_route($this->namespace, '/keys/workspace', [
            'methods'             => 'GET',
            'callback'            => [$this, 'list_workspace_keys'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route($this->namespace, '/keys/bind', [
            'methods'             => 'POST',
            'callback'            => [$this, 'bind_workspace_key'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // --- LICENSE & ACTIVATION ---
        register_rest_route($this->namespace, '/license/activate', [
            'methods'             => 'POST',
            'callback'            => [$this, 'activate_license_endpoint'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/license/deactivate', [
            'methods'             => 'POST',
            'callback'            => [$this, 'deactivate_license_endpoint'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Hard-delete the cloud activation doc so this WP install can
        // start fresh — the SPA's "Forget this site" affordance in
        // `SiteNotConnectedBanner`. Re-authentication is via license
        // key in the request body, since `License_Manager::deactivate()`
        // already wiped the bearer from `wp_options` before this call
        // can possibly fire.
        register_rest_route($this->namespace, '/license/forget-site', [
            'methods'             => 'POST',
            'callback'            => [$this, 'forget_site_endpoint'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/license/sync', [
            'methods'             => 'POST',
            'callback'            => [$this, 'sync_license_plan'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Proxy the cloud heartbeat through the plugin so the bearer
        // token (kept in `wp_options`, never exposed to the browser)
        // is attached automatically by `Cloud_Client::post()`. Pre-
        // 2026-05-05 the wp-admin SPA hit `/checkLicenseStatus` direct
        // from `useLicense.ts`, which after Phase 3.5's bearer cutover
        // 401'd on every load and fed `{plan: "none"}` into the local
        // sync useEffect — auto-deactivating live activations on every
        // wp-admin mount.
        register_rest_route($this->namespace, '/license/cloud-status', [
            'methods'             => 'POST',
            'callback'            => [$this, 'license_cloud_status_endpoint'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // --- WEBHOOKS (The Secure Handshake) ---
        register_rest_route($this->namespace, '/webhook/receive-blueprint', [
            'methods'             => 'POST',
            'callback'            => [$this, 'receive_cloud_blueprint'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route($this->namespace, '/webhook/pulse-check', [
            'methods'             => 'POST',
            'callback'            => [$this, 'handle_pulse_check'],
            'permission_callback' => '__return_true',
        ]);

        // --- DIAGNOSTIC TRIGGER ---
        register_rest_route($this->namespace, '/pulse/initiate', [
            'methods'             => 'POST',
            'callback'            => [$this, 'handle_pulse_initiate'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/pulse/test-error', [
            'methods'             => 'POST',
            'callback'            => [$this, 'initiate_error_test'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/analytics/usage', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_cloud_analytics'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/analytics/recent-blueprints', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_recent_blueprints'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // --- CHANNELS / INTEGRATIONS STORE ---
        // Thin REST proxy over the cloud `channels*Connection` endpoints.
        // Auth surface is the standard `manage_options` capability check —
        // the cloud handshake (license_key + activation_secret + site_url) is
        // assembled inside Channels_Connections_Service so callers don't see
        // any of it. Integration ids are constrained to lowercase + digits +
        // dash to match IntegrationRegistry's id convention.
        register_rest_route($this->namespace, '/channels/connections', [
            'methods'             => 'GET',
            'callback'            => [$this, 'channels_list_connections'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/channels/connections/webhook', [
            'methods'             => 'POST',
            'callback'            => [$this, 'channels_save_webhook_connection'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route($this->namespace, '/channels/connections/credential', [
            'methods'             => 'POST',
            'callback'            => [$this, 'channels_save_credential_connection'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Settings-only edit (campaign bindings + locale + cadence) for an
        // existing connection. Used by the per-row Edit affordance and the
        // post-OAuth configure modal — both need to update user-managed
        // fields without touching the connection's tokens, which is the
        // only thing that distinguishes this from the save endpoints.
        register_rest_route($this->namespace, '/channels/connections/settings', [
            'methods'             => 'POST',
            'callback'            => [$this, 'channels_update_connection_settings'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Accepts either a post-migration UUID or a legacy integration id
        // in the path segment. The charset `[a-z0-9-]+` already matches both
        // (UUIDs are lowercase hex + hyphens) so no regex change was needed
        // when we moved to UUID doc ids — the handler just has to stop
        // assuming the segment is an integration id.
        register_rest_route($this->namespace, '/channels/connections/(?P<connection_key>[a-z0-9-]+)', [
            'methods'             => 'DELETE',
            'callback'            => [$this, 'channels_delete_connection'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Activity log reader — proxies cloud `channelsListEvents`. GET so it
        // can be cached / retried without the body consent POSTs imply, and
        // so the `?limit=` query param surfaces normally.
        register_rest_route($this->namespace, '/channels/events', [
            'methods'             => 'GET',
            'callback'            => [$this, 'channels_list_events'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Video render retry — proxies cloud `channelsVideoRetry` for the
        // Activity page's "Retry render" (failed job, free) and
        // "Regenerate" (expired download, uses 1 quota unit) actions.
        // POST because it (re)queues work; the cloud decides idempotency
        // per job state.
        register_rest_route($this->namespace, '/channels/video/retry', [
            'methods'             => 'POST',
            'callback'            => [$this, 'channels_video_retry'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // OAuth init — kicks off the OAuth dance for integrations like
        // LinkedIn. Returns the provider's authorize URL so the client can
        // redirect the browser.
        register_rest_route($this->namespace, '/channels/oauth/init', [
            'methods'             => 'POST',
            'callback'            => [$this, 'channels_oauth_init'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Integration catalog reader — proxies cloud `channelsListCatalog`.
        // Returns the full marketplace catalog with per-caller entitlement
        // so the Store UI can render tier badges and correct CTAs without a
        // separate license-status round-trip.
        register_rest_route($this->namespace, '/channels/catalog', [
            'methods'             => 'GET',
            'callback'            => [$this, 'channels_list_catalog'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // ── Literal-segment /runs/* routes register FIRST ─────────────────
        //
        // WordPress's REST dispatcher iterates routes in registration
        // order and serves the first regex that matches. The single-run
        // getter below uses `(?P<run_id>[A-Za-z0-9_-]+)`, which happily
        // captures the strings `"active"` and `"single"` — so without
        // this ordering, `GET /runs/active` was being routed to
        // `runs_get(run_id="active")` and the cloud's `getCampaignRun`
        // would 404 with `run_not_found`. (Yurii incident 2026-05-01.)
        // Tightening the regex with negative lookaheads is brittle as
        // we add new literal segments later; ordering the literals
        // first solves it once.

        // SPA refresh-recovery: list every currently-in-flight
        // (queued/running) run across ALL campaigns for the site. The
        // wp-admin SPA's `RunsContext.activeRunId` is pure in-memory
        // state — on page reload it resets to null, so any component
        // that self-gates on it (the inline CampaignRunProgress strip,
        // live badges on campaign cards) vanishes even while a run is
        // still executing. This endpoint is the hydration source; the
        // client pushes the first returned row into RunsContext so the
        // right surface lights back up. Hard-capped at 10 rows
        // server-side — multi-run visualization is Phase 4 and the v1
        // hydration only needs the freshest row.
        register_rest_route($this->namespace, '/runs/active', [
            'methods'             => 'GET',
            'callback'            => [$this, 'runs_active_list'],
            'permission_callback' => [$this, 'check_permission'],
            'args'                => [
                'limit' => [
                    'type'              => 'integer',
                    'required'          => false,
                    'default'           => 10,
                    'sanitize_callback' => 'absint',
                ],
            ],
        ]);

        // Dashboard "Recent generations" widget — lists the most recent
        // ephemeral runs (one-off `/generate` submissions), newest first.
        // Distinct from `/runs/active` (in-flight only) and the campaign-
        // scoped list at `/campaigns/{id}/runs`. Cloud filters on
        // `isEphemeral === true` so campaign runs never bleed into this
        // surface.
        register_rest_route($this->namespace, '/runs/single', [
            'methods'             => 'GET',
            'callback'            => [$this, 'runs_single_list'],
            'permission_callback' => [$this, 'check_permission'],
            'args'                => [
                'limit' => [
                    'type'              => 'integer',
                    'required'          => false,
                    'default'           => 10,
                    'sanitize_callback' => 'absint',
                ],
            ],
        ]);

        // Progress-stream: read a single CampaignRun doc by its UUID. GET
        // so the admin drawer can poll through standard HTTP caching
        // semantics (even though we also implement a short-lived in-request
        // dedupe below). `run_id` is constrained to a UUID-ish shape so
        // malformed polls fail at the router layer rather than paying a
        // cloud round-trip. Spec: specs/progress-stream.md §7.
        //
        // MUST be registered AFTER the literal-segment `/runs/*` routes
        // above — see the dispatcher-order note up top.
        register_rest_route($this->namespace, '/runs/(?P<run_id>[A-Za-z0-9_-]+)', [
            'methods'             => 'GET',
            'callback'            => [$this, 'runs_get'],
            'permission_callback' => [$this, 'check_permission'],
            'args'                => [
                'run_id' => [
                    'type'              => 'string',
                    'required'          => true,
                    'sanitize_callback' => 'sanitize_text_field',
                ],
            ],
        ]);

        // Needs Attention widget (spec `specs/run-detail-view.md` §6):
        // list runs that terminated in `failed` or
        // `succeeded_with_warnings` and haven't been dismissed yet.
        // Simple limit — the widget caps visually at 10 rows, and the
        // 30-day TTL on run docs keeps the result set small.
        register_rest_route($this->namespace, '/runs', [
            'methods'             => 'GET',
            'callback'            => [$this, 'runs_list_attention'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Dismiss a row from the Needs Attention widget. Idempotent —
        // repeated clicks just refresh the timestamp. The dismissing
        // admin's WP user id is captured for support context.
        register_rest_route($this->namespace, '/runs/(?P<run_id>[A-Za-z0-9_-]+)/acknowledge', [
            'methods'             => 'POST',
            'callback'            => [$this, 'runs_acknowledge'],
            'permission_callback' => [$this, 'check_permission'],
            'args'                => [
                'run_id' => [
                    'type'              => 'string',
                    'required'          => true,
                    'sanitize_callback' => 'sanitize_text_field',
                ],
            ],
        ]);

        // Reverse of /acknowledge — wired to the ~10s Undo toast after
        // a Dismiss click. Splitting this into a separate endpoint
        // (rather than a DELETE-on-acknowledge) keeps the Cloud_Client
        // POST-only contract intact at the plugin↔cloud hop.
        register_rest_route($this->namespace, '/runs/(?P<run_id>[A-Za-z0-9_-]+)/unacknowledge', [
            'methods'             => 'POST',
            'callback'            => [$this, 'runs_unacknowledge'],
            'permission_callback' => [$this, 'check_permission'],
            'args'                => [
                'run_id' => [
                    'type'              => 'string',
                    'required'          => true,
                    'sanitize_callback' => 'sanitize_text_field',
                ],
            ],
        ]);

        // POST /scheduler/runs/cancel — cancel a run (user or system-initiated).
        // Idempotent: re-cancelling an already-terminal run succeeds.
        register_rest_route($this->namespace, "/scheduler/runs/cancel", [
            "methods"             => "POST",
            "callback"            => [$this, "runs_cancel"],
            "permission_callback" => [$this, "check_permission"],
        ]);

        // Campaign-detail "Runs" tab (historical receipt view). Returns
        // every run recorded for the given campaign, newest first,
        // across ALL statuses — distinct from GET /runs which is scoped
        // to the Needs-Attention widget's narrower "unacknowledged
        // problems" contract. Limit is a query param so the tab can
        // trivially upgrade to a "Load more" affordance without a
        // second endpoint.
        register_rest_route($this->namespace, '/campaigns/(?P<campaign_id>[A-Za-z0-9_-]+)/runs', [
            'methods'             => 'GET',
            'callback'            => [$this, 'campaign_runs_list'],
            'permission_callback' => [$this, 'check_permission'],
            'args'                => [
                // Phase 1.0c §4 — `campaign_id` is `string` because cloud-
                // authoritative campaigns use nanoid IDs (e.g.
                // "8SJgX4TrqOC0tYXJk-Crn"). The pre-Phase-1.0c declaration
                // of `type: 'integer'` + `sanitize_callback: 'absint'`
                // silently mangled every nanoid: `absint('8SJgX4...')`
                // returns `8` (extracts leading digits), so the SPA's
                // Runs tab passed the right URL but the handler received
                // a different campaign_id and queried for runs that
                // didn't exist. The route regex `[A-Za-z0-9_-]+` already
                // limits the character set; sanitize_text_field is the
                // correct null-op-friendly sanitizer for the body.
                'campaign_id' => [
                    'type'              => 'string',
                    'required'          => true,
                    'sanitize_callback' => 'sanitize_text_field',
                ],
                'limit'       => [
                    'type'              => 'integer',
                    'required'          => false,
                    'default'           => 20,
                    'sanitize_callback' => 'absint',
                ],
            ],
        ]);

        // `/runs/active` and `/runs/single` were here historically but
        // moved up above the `/runs/(?P<run_id>...)` regex on
        // 2026-05-01 — the catch-all was stealing both literal paths
        // and routing them into `runs_get`, which 404'd from cloud.
        // See the dispatcher-order note at the top of this method.
    }

    /**
     * The Outbound Pulse Trigger (Calls Firebase)
     */
    public function handle_pulse_initiate($request)
    {
        // Bridge Diagnostics work for every cloud-connected install, not
        // just licensed ones — anonymous/"none" workspaces run cloud
        // generation too and need to verify the same handshake (Yurii
        // wp.org testing 2026-07-08). Gate on workspace presence (bearer
        // bound) rather than a license key; a truly unconfigured install
        // has nothing to probe.
        if ( ! License_Manager::has_workspace()) {
            return new \WP_Error('no_workspace', __('Connect to Structura Cloud first.', 'structura'), ['status' => 403]);
        }

        // Run the shared handshake probe so the manual "Run Pulse Check"
        // button double-duties as a cache refresh: a user who fixes their
        // firewall and re-runs the check clears the unreachable banner on
        // the next page load without waiting for the daily cron.
        $state = \Structura\Core\Site_Reachability::probe_and_store();

        // The probe returns `ok:true` with a `reason` for the two cases
        // that aren't an authoritative cloud→site verdict (no license —
        // already guarded above — or an outbound-to-cloud transport
        // failure). Surface the latter as the WP_Error the SPA's global
        // handler expects, so the toast says "couldn't reach the cloud"
        // instead of a misleading green check.
        if (($state['reason'] ?? '') === 'cloud_unreachable_outbound') {
            return new \WP_Error(
                'cloud_unreachable',
                __('Could not reach Structura Cloud. Check your server\'s outbound connection and try again.', 'structura'),
                ['status' => 502]
            );
        }

        return rest_ensure_response([
            'success' => (bool) ($state['ok'] ?? false),
            'message' => (string) ($state['message'] ?? ''),
        ]);
    }

    public function initiate_error_test()
    {
        // Anonymous/"none" workspaces can simulate the signed-error
        // handshake too — gate on workspace presence, not a license key.
        // The cloud resolves the signing secret from the bearer-injected
        // activation (Cloud_Client adds it), so an empty licenseKey is
        // fine here (Yurii wp.org testing 2026-07-08).
        if ( ! \Structura\Core\License_Manager::has_workspace()) {
            return ['success' => false, 'message' => 'Not connected to Structura Cloud.'];
        }

        $license_data = \Structura\Core\License_Manager::get_license_data();

        Cloud_Client::post('/performPulseCheck', [
            'licenseKey'       => $license_data['license_key'] ?? '',
            'domain'           => wp_parse_url(get_site_url(), PHP_URL_HOST),
            'webhookUrl'       => rest_url('structura/v1/webhook/receive-blueprint'),
            'simulate_error'   => true, // The trigger
            'campaign'         => ['id' => 0], // Dummy ID for testing
        ], ['timeout' => 20]);

        return rest_ensure_response(['success' => true, 'message' => 'Error trigger sent to cloud.']);
    }

    /**
     * Proxies the request to Structura Cloud with the local license context.
     */
    public function get_cloud_analytics($request)
    {
        $license_data = License_Manager::get_license_data();
        $secret_data  = Key_Manager::get_license_payload();

        if ( ! $license_data['is_pro']) {
            return new \WP_Error('no_license',
                __('Active Pro or Cloud license required to access analytics.', 'structura'), ['status' => 403]);
        }

        $params = array_filter([
            'licenseKey'       => $license_data['license_key'],
            'domain'           => wp_parse_url(get_site_url(), PHP_URL_HOST),
            'startDate'        => $request->get_param('start_date'),
            'endDate'          => $request->get_param('end_date'),
            'mode'             => $request->get_param('mode'),
            'provider'         => $request->get_param('provider'),
            'campaignId'       => $request->get_param('campaign_id'),
        ]);

        $result = Cloud_Client::post('/getUsageAnalytics', $params);

        if (is_wp_error($result)) {
            return new \WP_Error('cloud_error', $result->get_error_message(), ['status' => 500]);
        }

        return rest_ensure_response($result['body']);
    }

    public function check_permission(): bool
    {
        return current_user_can('manage_options');
    }

    /**
     * GET /structura/v1/migration/seo
     *
     * Returns one page of posts with their SEO meta — Yoast first, RankMath as
     * fallback — so the cloud migration can preserve title / description /
     * keyphrase that the core REST API hides (protected `_yoast_wpseo_*` meta).
     *
     * Query params: `page` (1-based), `per_page` (1–100), `status`
     * (`publish` default; `any` = all non-trashed), `post_type` (`post`).
     * Paginates the same way (`post_type` + `status`, date DESC) as the
     * importer's `wp/v2/posts` fetch so the caller can match by post id.
     *
     * @param \WP_REST_Request $request
     * @return \WP_REST_Response
     */
    public function get_migration_seo($request)
    {
        $per_page  = (int) ($request->get_param('per_page') ?: 100);
        $per_page  = max(1, min(100, $per_page));
        $page      = max(1, (int) ($request->get_param('page') ?: 1));
        $post_type = sanitize_key($request->get_param('post_type') ?: 'post');
        $status    = (string) ($request->get_param('status') ?: 'publish');
        $any       = ['publish', 'draft', 'pending', 'private', 'future'];
        $post_status = $status === 'any' ? $any : (in_array($status, $any, true) ? $status : 'publish');

        $query = new \WP_Query([
            'post_type'           => $post_type,
            'post_status'         => $post_status,
            'posts_per_page'      => $per_page,
            'paged'               => $page,
            'orderby'             => 'date',
            'order'               => 'DESC',
            'ignore_sticky_posts' => true,
            'no_found_rows'       => false,
        ]);

        $posts = [];
        foreach ($query->posts as $post) {
            $posts[] = $this->read_post_seo_meta($post);
        }

        return new \WP_REST_Response([
            'posts'      => $posts,
            'totalPages' => (int) $query->max_num_pages,
        ], 200);
    }

    /**
     * Read a post's SEO meta — Yoast (`_yoast_wpseo_*`) first, RankMath
     * (`rank_math_*`) as fallback. Resolves Yoast template variables
     * (`%%title%%` …) to their rendered value when Yoast is active, so the
     * importer gets the real string rather than a template.
     *
     * @param \WP_Post $post
     * @return array{id:int,slug:string,metaTitle:string,metaDescription:string,focusKeyphrase:string}
     */
    private function read_post_seo_meta($post): array
    {
        $title = (string) get_post_meta($post->ID, '_yoast_wpseo_title', true);
        if ($title === '') {
            $title = (string) get_post_meta($post->ID, 'rank_math_title', true);
        }
        $desc = (string) get_post_meta($post->ID, '_yoast_wpseo_metadesc', true);
        if ($desc === '') {
            $desc = (string) get_post_meta($post->ID, 'rank_math_description', true);
        }
        $keyphrase = (string) get_post_meta($post->ID, '_yoast_wpseo_focuskw', true);
        if ($keyphrase === '') {
            $keyphrase = (string) get_post_meta($post->ID, 'rank_math_focus_keyword', true);
        }

        // Yoast/RankMath snippet fields can hold template variables; render them.
        if (function_exists('wpseo_replace_vars')) {
            if ($title !== '' && strpos($title, '%%') !== false) {
                $title = (string) wpseo_replace_vars($title, $post);
            }
            if ($desc !== '' && strpos($desc, '%%') !== false) {
                $desc = (string) wpseo_replace_vars($desc, $post);
            }
        }

        return [
            'id'              => (int) $post->ID,
            'slug'            => (string) $post->post_name,
            'metaTitle'       => $title,
            'metaDescription' => $desc,
            'focusKeyphrase'  => $keyphrase,
        ];
    }

    /**
     * GET /structura/v1/compat/page-builders
     *
     * Returns the cached page-builder detection snapshot plus
     * locale-aware docs URLs so the wp-admin SPA doesn't have to
     * hard-code the docs-site's URL shape. Each entry:
     *
     * ```json
     * {
     *   "slug": "divi",
     *   "label": "Divi",
     *   "kind": "atomic-meta",
     *   "docs_url": "https://docs.structurawp.com/en/troubleshooting/page-builders/divi",
     *   "opt_out_meta_active": true
     * }
     * ```
     *
     * `opt_out_meta_active` is a derived flag — `true` for
     * `atomic-meta` builders (Divi / WPBakery) because that's what
     * `Builder_Compat::opt_out_meta()` writes for; `false` for
     * `opt-in` builders (Elementor / Beaver / Brizy / Bricks) which
     * Structura doesn't preemptively neutralise.
     *
     * The caller gets the same data the admin notice uses, plus
     * the opt-in builders for the campaign-editor card. The
     * campaign-editor card filters client-side based on `kind`.
     *
     * Spec: `specs/page-builder-compat.md` §4.3.
     */
    public function get_compat_page_builders()
    {
        $raw = get_option(\Structura\Compat\Compat_Scheduler::OPTION_DETECTED, []);
        if ( ! is_array($raw)) {
            $raw = [];
        }

        $locale = self::docs_locale();
        $items  = [];
        foreach ($raw as $slug => $entry) {
            if ( ! is_array($entry)) {
                continue;
            }
            $kind    = (string)($entry['kind'] ?? 'opt-in');
            $items[] = [
                'slug'                => (string)$slug,
                'label'               => (string)($entry['label'] ?? $slug),
                'kind'                => $kind,
                'docs_url'            => self::compat_docs_url(
                    $locale,
                    (string)($entry['docs_slug'] ?? $slug),
                ),
                'opt_out_meta_active' => $kind === 'atomic-meta',
            ];
        }

        // Include the last-run timestamp so the SPA can display a
        // "last checked N hours ago" hint when it matters for a
        // support conversation.
        $last_run = (int)get_option(\Structura\Compat\Compat_Scheduler::OPTION_LAST_RUN, 0);

        return rest_ensure_response([
            'detected'   => $items,
            'checked_at' => $last_run > 0 ? gmdate('c', $last_run) : null,
        ]);
    }

    /**
     * Site locale → docs locale. Same logic as
     * `Page_Builder_Notice::docs_locale()` — duplicated rather than
     * shared so the REST endpoint doesn't take a Ui namespace
     * dependency. Keep both copies in sync; the short list of
     * supported docs locales is small enough that drift is easy to
     * spot on review.
     *
     * Currently pinned to `'en'` because `docs/content/` only ships
     * English content (specs/docs-site-rewrite.md §8 — i18n phase 1).
     * Without this short-circuit, a German-speaking site would receive
     * `/de/troubleshooting/page-builders/divi` from this endpoint and
     * the SPA card would link to a 404 on the docs site.
     *
     * Phase-2 unfreeze: drop the `return 'en'` line. Mirror the same
     * change in `Page_Builder_Notice::docs_locale()`.
     */
    private static function docs_locale(): string
    {
        // Phase-1 short-circuit. Mirror of `Page_Builder_Notice::docs_locale()`
        // — flip the flag (or remove the guard) when de/es/fr content ships
        // in `docs/content/`. The WP-locale branch below is preserved so
        // unfreezing is a one-line change rather than a re-implementation.
        $docs_i18n_phase_2_complete = false;
        if ( ! $docs_i18n_phase_2_complete) {
            return 'en';
        }

        $locale    = function_exists('determine_locale') ? determine_locale() : get_locale();
        $short     = strtolower(substr((string)$locale, 0, 2));
        $supported = ['en', 'de', 'es', 'fr'];

        return in_array($short, $supported, true) ? $short : 'en';
    }

    /**
     * Build the canonical docs URL for a builder. Mirrored in
     * `Page_Builder_Notice::docs_url()` — both point at the same
     * page shape so a user who clicks through from the admin
     * notice or the campaign-editor card lands at the same
     * documentation.
     */
    private static function compat_docs_url(string $locale, string $slug): string
    {
        return sprintf(
            'https://docs.structurawp.com/%s/troubleshooting/page-builders/%s',
            rawurlencode($locale),
            rawurlencode($slug),
        );
    }

    /**
     * Return steps completion for the "Getting Started" widget
     */
    public function get_onboarding_status()
    {
        // Phase 5c — "is at least one provider configured?" comes off
        // the cloud's binding map for this activation. Avoids a stale
        // wp_options-based answer disagreeing with what the resolver
        // actually sees at run time.
        $bindings  = $this->fetch_cloud_provider_bindings();
        $has_keys  = isset($bindings['openai']) || isset($bindings['gemini']);

        // Count Personas
        $personas     = wp_count_posts('structura_persona');
        $has_personas = (int)$personas->publish > 0;

        // Count Jobs (Any scheduled action with our hook)
        $has_jobs = false;
        if (function_exists('as_get_scheduled_actions')) {
            $jobs     = as_get_scheduled_actions(['hook' => 'structura_run_campaign_step', 'per_page' => 1]);
            $has_jobs = count($jobs) > 0;
        }

        return rest_ensure_response([
            'step_api'      => $has_keys,
            'step_persona'  => $has_personas,
            'step_schedule' => $has_jobs,
            'completed'     => ($has_keys && $has_personas && $has_jobs),
        ]);
    }

    /**
     * Return connection status + Masked Keys for UI
     */
    public function get_system_status()
    {
        $plan      = License_Manager::get_plan();
        $providers = Provider_Registry::get_providers_for_tier($plan);
        $bindings  = $this->fetch_cloud_provider_bindings();
        $status    = [];

        foreach ($providers as $id => $provider) {
            $binding     = $bindings[$id] ?? null;
            $status[$id] = [
                'connected'    => $binding !== null,
                'masked'       => is_array($binding) && isset($binding['maskedKey'])
                    ? (string)$binding['maskedKey']
                    : '',
                'capabilities' => $provider['capabilities'],
            ];
        }

        return rest_ensure_response($status);
    }

    private function mask_key($key): string
    {
        if (empty($key)) {
            return '';
        }

        return substr($key, 0, 3) . '...' . substr($key, -4);
    }

    /**
     * Fetch the cloud's view of which AI providers are bound on this
     * activation. Thin shim over `Cloud_Client::get_provider_bindings()`
     * (which carries the per-request memoisation) — left in place so
     * call sites in this class keep their existing readability without
     * each line knowing about the cache implementation.
     *
     * @return array<string, array<string, mixed>>
     */
    private function fetch_cloud_provider_bindings(): array
    {
        return Cloud_Client::get_provider_bindings();
    }

    /**
     * Return the site's search-engine visibility flag.
     *
     * Callers today: the IndexNow install modal, which surfaces a warning
     * when the site is set to discourage search engines. The modal needs to
     * know this before the user commits to the install — IndexNow pinging
     * Bing about a site that returns `<meta name="robots" content="noindex">`
     * is worse than useless (it spends crawl budget and confuses the
     * operator).
     *
     * The wire shape exposes both spellings of the same bit:
     *   - `blogPublic` — mirrors WP's `blog_public` option. 1/true means the
     *     site is indexable, 0/false means it is discouraged. Kept verbatim
     *     for clients that want the raw value.
     *   - `discourageSearchEngines` — the inverse, named the way the WP
     *     admin UI labels the checkbox. Most UI call sites want this one.
     *
     * Values are coerced through `(int)` first because WordPress stores this
     * option as a stringy `"0"` / `"1"` in many installs (option rows are
     * LONGTEXT, not booleans).
     *
     * @since 1.x.0
     */
    public function get_site_indexing_status()
    {
        $blog_public_int = (int)get_option('blog_public', 1);
        $is_indexable    = $blog_public_int === 1;

        return rest_ensure_response([
            'success'                 => true,
            'blogPublic'              => $is_indexable,
            'discourageSearchEngines' => ! $is_indexable,
        ]);
    }

    // --- ENDPOINTS ---

    public function get_stats()
    {
        // Content Stats
        $posts  = (int)get_option('structura_stat_generated_posts', 0);
        $blocks = (int)get_option('structura_stat_generated_blocks', 0);

        // Visual Stats
        $images    = (int)get_option('structura_stat_generated_images', 0);
        $optimized = (int)get_option('structura_stat_compressed_images', 0);
        $bytes     = (int)get_option('structura_stat_saved_bytes', 0);

        // Convert bytes to a readable MB format
        $mb_saved = round($bytes / 1024 / 1024, 2);

        return rest_ensure_response([
            'content' => [
                'posts'  => $posts,
                'blocks' => $blocks,
            ],
            'visual'  => [
                'total_images' => $images,
                'optimized'    => $optimized,
                'space_saved'  => $mb_saved . ' MB',
            ],
        ]);
    }

    public function get_personas()
    {
        // 2026-05-01 v2 — cloud is the single source of truth.
        // The legacy `structura_personas_authoritative_in_cloud` flag
        // is retired; all installs read from cloud. The
        // `get_personas_from_wp()` helper below stays in the file as
        // dead code until the broader cleanup sweep removes it.
        return $this->get_personas_from_cloud();
    }

    /**
     * Fetch personas from cloud via REST endpoint.
     *
     * Cloud function is exported as `listPersonas` in functions/src/index.ts —
     * Cloud_Client::post() uses the path-as-function-name convention, so this
     * MUST be `/listPersonas`. Cloud_Client::post() returns a wrapped
     * `['code' => N, 'body' => ..., 'raw' => ...]` envelope; the persona array
     * lives at $result['body']['personas'].
     */
    private function get_personas_from_cloud()
    {
        // Phase 1.8 PR5 — `/listPersonas` is bearer-authenticated via
        // the cloud's `requireActivationBearer` middleware, which works
        // for both licensed AND anonymous shadow workspaces. The legacy
        // `license_key + activation_secret + site_url` body guard
        // pre-dates that change and silently 403'd the personas page
        // for every anonymous install (no `key`, no `secret`). Drop
        // the guard; let `Cloud_Client::post()` inject the bearer
        // header from the stashed `api_token` and the cloud handler
        // do the auth work. If the bearer is missing or invalid the
        // cloud returns a structured 401 that propagates back to the
        // SPA — same UX as a normal cloud failure.
        $result = Cloud_Client::post('/listPersonas', []);

        if (is_wp_error($result)) {
            return $result;
        }

        $personas = $result['body']['personas'] ?? [];
        $data     = array_map(
            function ($p) {
                return Persona_Shape_Transformer::cloud_to_wp($p);
            },
            $personas,
        );

        // Return the envelope (not a bare array) so the SPA can read the
        // per-site default + membership set. `fetchPersonas` already tolerates
        // both shapes; `memberPersonaIds` powers the wizard's "writing for
        // this site" vs bindable-library split.
        return rest_ensure_response([
            'personas'        => $data,
            'defaultPersonaId' => $result['body']['defaultPersonaId'] ?? null,
            'memberPersonaIds' => $result['body']['memberPersonaIds'] ?? [],
        ]);
    }

    /**
     * Fetch personas from WP post-meta storage.
     */
    private function get_personas_from_wp()
    {
        $posts = get_posts([
            'post_type'      => 'structura_persona',
            'posts_per_page' => -1,
            'post_status'    => 'publish',
        ]);

        $data = array_map(function ($p) {
            $author_id = get_post_meta($p->ID, '_author_id', true);

            return [
                'id'            => $p->ID,
                'name'          => $p->post_title,
                'system_prompt' => get_post_meta($p->ID, '_role', true),
                'tone'          => get_post_meta($p->ID, '_tone', true),
                'reading_level' => get_post_meta($p->ID, '_reading_level', true),
                'author_id'     => $author_id ? (int)$author_id : 1,
            ];
        }, $posts);

        return rest_ensure_response($data);
    }

    public function save_persona($request)
    {
        // 2026-05-01 v2 — cloud is the single source of truth.
        return $this->save_persona_to_cloud($request);
    }

    /**
     * Save persona to cloud via REST endpoint.
     *
     * Cloud exports two distinct functions: `postPersona` for create and
     * `patchPersona` for update. The SPA uses one POST /personas route for
     * both, distinguishing by whether `id` is present in the body, so we
     * route on the same signal here. Response envelope is the standard
     * `['code', 'body', 'raw']` from Cloud_Client::post().
     */
    private function save_persona_to_cloud($request)
    {
        $params      = $request->get_json_params();
        $cloud_input = Persona_Shape_Transformer::wp_input_to_cloud($params);
        $persona_id  = isset($params['id']) ? (string)$params['id'] : '';

        // SPA initializes new-persona forms with `id: 0` as a "no id yet"
        // sentinel. Casting that to string yields "0", which is non-empty
        // — so we must explicitly treat "0" (and "") as create. Only real
        // cloud nanoid strings route to update; otherwise the cloud's
        // merge-write would upsert at `personas/0` and silently spawn a
        // ghost doc (regression observed 2026-05-05).
        $is_update = $persona_id !== '' && $persona_id !== '0';

        // Phase 1.8 PR5 — `/postPersona` and `/patchPersona` are
        // bearer-authenticated, same as `/listPersonas`. Legacy
        // license_key + activation_secret + site_url body fields are
        // ignored by the cloud handlers and the pre-check guard
        // 403'd anonymous installs. Bearer is injected by
        // `Cloud_Client::post()` from the persisted `api_token`.
        if ($is_update) {
            $result = Cloud_Client::post('/patchPersona', [
                'persona_id' => $persona_id,
                'persona'    => $cloud_input,
            ]);
        } else {
            $result = Cloud_Client::post('/postPersona', [
                'persona' => $cloud_input,
            ]);
        }

        if (is_wp_error($result)) {
            return $result;
        }

        $persona = $result['body']['persona'] ?? [];
        $wp_form = Persona_Shape_Transformer::cloud_to_wp($persona);

        return rest_ensure_response(['success' => true, 'id' => $wp_form['id']]);
    }

    /**
     * Save persona to WP post-meta storage.
     */
    private function save_persona_to_wp($request)
    {
        $params = $request->get_json_params();

        $post_id = wp_insert_post([
            'ID'          => ! empty($params['id']) ? $params['id'] : 0,
            'post_type'   => 'structura_persona',
            'post_title'  => sanitize_text_field($params['name']),
            'post_status' => 'publish',
        ]);

        if (is_wp_error($post_id)) {
            return $post_id;
        }

        update_post_meta($post_id, '_role', sanitize_textarea_field($params['system_prompt']));
        update_post_meta($post_id, '_tone', sanitize_text_field($params['tone']));
        update_post_meta($post_id, '_reading_level', sanitize_text_field($params['reading_level']));

        $author_id        = (int)($params['author_id'] ?? 1);
        $validated_author = $this->validate_persona_author($author_id);
        update_post_meta($post_id, '_author_id', $validated_author);

        return rest_ensure_response(['success' => true, 'id' => $post_id]);
    }

    /**
     * Ensures the assigned author is valid before saving
     */
    private function validate_persona_author(int $user_id): int
    {
        $user = get_userdata($user_id);

        // Fallback to ID 1 if user doesn't exist or can't edit posts
        if ( ! $user || ! user_can($user->ID, 'edit_posts')) {
            return 1;
        }

        return $user->ID;
    }

    public function get_jobs($request)
    {
        if ( ! class_exists('ActionScheduler_Store')) {
            return rest_ensure_response(['data' => [], 'pagination' => []]);
        }

        $status   = $request->get_param('status');
        $search   = $request->get_param('search');
        $page     = (int)$request->get_param('page') ?: 1;
        $per_page = 20;

        $total_items = count(as_get_scheduled_actions([
            'group'    => STRUCTURA_AS_GROUP,
            'status'   => $status ?: '',
            'per_page' => -1,
            'fields'   => 'ids',
        ]));

        $query_args = [
            'hooks'    => 'structura_run_campaign_step',
            'per_page' => $per_page,
            'offset'   => ($page - 1) * $per_page,
            'status'   => $status ?: '',
            'order'    => 'DESC',
        ];

        $actions = as_get_scheduled_actions($query_args);
        $store   = \ActionScheduler::store();
        $logger  = \ActionScheduler::logger();
        $data    = [];

        // Phase 1.0c §4 — campaign_id from AS args is `int|string` now: legacy
        // pulses carry int WP post ids, cloud-scheduled pulses carry nanoid
        // strings. The previous (int) cast silently zero'd nanoids, then the
        // WP post-meta read returned `''` for missing cluster keys, and the
        // `$campaign['identity']['name']` access blew up with "string offset
        // on string". Fix: keep the raw arg, route through the same
        // cloud-auth branch Task_Runner uses, and skip gracefully when the
        // campaign can't be located in either store.
        // 2026-05-01 v2 — cloud is the single source of truth.
        // Campaigns are keyed by nanoid (string, alphanumeric);
        // any purely-numeric id in an AS row is a stale leftover
        // from pre-v2 migration scaffolding and gets skipped.
        foreach ($actions as $action_id => $action) {
            $job_args = $action->get_args();
            $raw_id   = $job_args['campaign_id'] ?? null;
            if ($raw_id === null || $raw_id === '' || $raw_id === 0 || $raw_id === '0') {
                continue;
            }

            $campaign_id = is_string($raw_id) ? $raw_id : (int)$raw_id;

            // Skip purely-numeric IDs — those can only be stale AS
            // rows from before v2 (cloud campaigns are nanoids only).
            // Hitting the cloud for those just produces noisy 404s
            // in System Logs.
            if (is_int($campaign_id) || ctype_digit((string)$campaign_id)) {
                continue;
            }

            $campaign = Campaign_Cloud_Reader::get_campaign_data((string)$campaign_id);

            // Skip rather than fatal when:
            //  - cloud lookup returned null (deleted / nanoid not in this
            //    activation / legacy int id post-migration);
            //  - WP-side returned a degenerate shape (`identity` is the
            //    empty-string default from a missing meta key).
            // The activity feed tolerates a stale AS row better than a
            // 500 on every wp-admin pageview.
            if ( ! is_array($campaign) || ! isset($campaign['identity']) || ! is_array($campaign['identity'])) {
                continue;
            }

            if ($search && ! str_contains(strtolower($campaign['identity']['name'] ?? $campaign['identity']['objective'] ?? ''),
                    strtolower($search))) {
                continue;
            }

            try {
                $as_status = $store->get_status($action_id);
            } catch (\Exception $e) {
                $as_status = 'unknown';
            }

            $ui_status     = 'pending';
            $error_message = '';

            if ($as_status == 'in-progress') {
                $ui_status = 'generating';
            }
            if ($as_status == 'failed') {
                $logs          = $logger->get_logs($action_id);
                $last_log      = end($logs);
                $error_message = is_object($last_log) && method_exists($last_log,
                    'get_message') ? $last_log->get_message() : __('Unknown error', 'structura');
                $ui_status     = 'failed';
            }

            if ($as_status == 'complete') {
                $ui_status = 'published';
            }

            $schedule_date = $action->get_schedule()->get_date();

            $data[] = [
                'id'              => $action_id,
                'campaign_id'     => $campaign_id,
                'campaign_name'   => $campaign['identity']['name'],
                'model_slug'      => $campaign['intelligence']['textProvider'] ?? $campaign['intelligence']['provider'] ?? '',
                'persona_id'      => $campaign['intelligence']['personaId'] ?? null,
                'generate_images' => $campaign['structure']['featuredImage'],
                'topic'           => $campaign['identity']['objective'],
                'status'          => $ui_status,
                'error'           => $error_message,
                'date'            => $schedule_date ? $schedule_date->format('Y-m-d H:i:s') : null,
                'timestamp'       => $schedule_date ? $schedule_date->getTimestamp() : 0,
                'formatted_date'  => $schedule_date ? $schedule_date->format('M j, g:i A') : null,
            ];
        }

        return rest_ensure_response([
            'data'       => $data,
            'pagination' => [
                'current_page' => $page,
                'total_pages'  => ceil($total_items / $per_page),
                'total_items'  => $total_items,
            ],
        ]);
    }

    /**
     * Safe Manual Trigger (Background vs Foreground)
     *
     * The client's "Generate Now" / "Run now" button is the only user-
     * initiated entry to the generation pipeline, so this is where we mint
     * the progress-stream run id. We return it synchronously so the wp-admin
     * drawer can start polling `/runs/{runId}` immediately — before Action
     * Scheduler's async handler has even picked up the job. Spec:
     * `specs/progress-stream.md` §11 Q1 option (a).
     *
     * Tier gate (post cloud-only-generation Phase 3): every licensed tier —
     * managed, BYOK, AND Free — now flows through `delegate_to_cloud()` in
     * `Task_Runner::execute_campaign_step_jittered` (see that method's
     * comment "every tier … flows through delegate_to_cloud"). The cloud
     * primes a Firestore progress doc via `primeProgressDoc` inside
     * `executeCloudCampaignStep`, so the drawer's `/runs/{runId}` poll is
     * valid for Free tier too. The earlier "Free runs locally" assumption
     * left the 2026-04-23 404-storm scar and the silent free-tier flow, but
     * that path no longer exists — minting a runId for Free is now correct.
     *
     * `none` (anonymous, unlicensed) is the only tier we still suppress:
     * `Cloud_Client::post` requires a license_key, so anonymous installs
     * 403 before `primeProgressDoc` runs and no doc is ever written.
     * Handing the client a runId in that case would re-introduce the
     * `run_not_found` poll storm.
     *
     * The automated (cron) pulse in `Task_Runner::execute_campaign_step`
     * still does NOT mint a runId — background cycles aren't attached to a
     * visible drawer, so the cloud self-generates one (see
     * `functions/src/scheduler/index.ts` line ~327: `suppliedRunId ||
     * randomUUID()`).
     */
    public function run_task($request)
    {
        // Phase 1.0c §4 — `campaign_id` may arrive as int (legacy WP post id)
        // or string nanoid (cloud-authoritative). Casting to int silently
        // zero'd nanoids that start with a letter, so "Run Now" returned a
        // 400 "missing_id" for half the cloud campaigns and dispatched
        // garbage int ids for the rest. Keep the raw value, treat strings
        // as cloud ids, ints as legacy WP ids.
        $raw_id = $request['campaign_id'] ?? null;
        if ($raw_id === null || $raw_id === '' || $raw_id === 0 || $raw_id === '0') {
            return new \WP_Error('missing_id', __('Campaign ID is required.', 'structura'), ['status' => 400]);
        }
        $campaign_id = is_string($raw_id) ? sanitize_text_field($raw_id) : (int)$raw_id;

        // Cloud-only-generation Phase 3: every licensed tier delegates to
        // the cloud, so a progress doc is always written when a license key
        // is present. Only anonymous (`none`) installs are skipped — they
        // 403 at cloud auth and never reach `primeProgressDoc`.
        $license_data = License_Manager::get_license_data();
        $tier         = $license_data['plan'] ?? 'none';
        $has_cloud    = ($tier !== 'none');

        $campaign_run_id = $has_cloud ? wp_generate_uuid4() : '';

        // Fire the jittered hook directly — manual runs skip the delay.
        // Args are spread *positionally* by Action Scheduler when the hook
        // fires, so the order of keys here matches the callback signature
        // `execute_campaign_step_jittered(int $campaign_id, string $campaign_run_id = '')`.
        // On the `none` tier the empty string arg causes the callback to
        // skip cloud delegation, matching the historical anonymous flow.
        as_enqueue_async_action(
            'structura_run_campaign_step_jittered',
            ['campaign_id' => $campaign_id, 'campaign_run_id' => $campaign_run_id],
            STRUCTURA_AS_GROUP,
        );

        $response = [
            'success' => true,
            'message' => __('Manual execution initiated in background.', 'structura'),
        ];

        // Include `campaign_run_id` whenever the cloud will write a progress
        // doc. The client's `useJobMutations` keys `setActiveRun` on this
        // field — its absence is what was leaving Free-tier "Run now" with
        // no inline progress strip until a full page reload re-fetched
        // `/runs/active`.
        if ($has_cloud) {
            $response['campaign_run_id'] = $campaign_run_id;
        }

        return rest_ensure_response($response);
    }

    public function retry_task($request)
    {
        $action_id = (int)$request->get_param('id');

        try {
            $store  = \ActionScheduler_Store::instance();
            $action = $store->fetch_action($action_id);

            // Safety: Only clone if it's one of our hooks
            if ( ! str_starts_with($action->get_hook(), 'structura_')) {
                throw new \Exception("Unauthorized action hook.");
            }

            as_enqueue_async_action(
                $action->get_hook(),
                $action->get_args(),
                STRUCTURA_AS_GROUP,
            );

            return rest_ensure_response(['success' => true]);
        } catch (\Exception $e) {
            return new \WP_Error('retry_failed', $e->getMessage(), ['status' => 500]);
        }
    }

    /**
     * @throws \Exception
     */
    public function delete_task($request)
    {
        if ( ! class_exists('ActionScheduler')) {
            return new \WP_Error('retry_failed', __('Unable to delete task.', 'structura'));
        }

        $id = (int)$request['id'];

        \ActionScheduler::store()->delete_action($id);

        return rest_ensure_response(['success' => true]);
    }

    /**
     * Serves localized rules to the React Settings page.
     */
    public function get_seo_optimization_rules()
    {
        return rest_ensure_response(SEO_Rules_Registry::get_all());
    }

    /**
     * Enqueues a one-time post generation without creating a campaign record.
     */
    public function generate_single_post($request)
    {
        $params = $request->get_json_params();

        if (empty($params['topic'])) {
            return new \WP_Error('missing_topic', __('A post objective is required.', 'structura'), ['status' => 400]);
        }

        // Persona-presence gate (2026-05-25). Every generated post is
        // attributed to a persona — a pinned id or the "random" rotation
        // — so a workspace with zero personas can't honour that contract
        // and the cloud run degrades to a generic voice, silently
        // defeating the personas feature. Fresh workspaces are
        // auto-seeded with a "House voice" persona, so this is normally
        // unreachable; a failed seed or a deleted last persona are the
        // paths that land here. The SPA mirrors this with a hard block +
        // "create a persona first" CTA. Unlike scheduled campaigns,
        // single-post has no dedicated cloud create endpoint to gate, so
        // this plugin-side check is the server trust boundary.
        //
        // Fail OPEN on a cloud hiccup (is_wp_error): a transient
        // /listPersonas failure shouldn't trap an otherwise-valid
        // request, and the run will surface its own cloud error if the
        // backend is genuinely unreachable. We block only on a confirmed
        // empty list.
        $persona_probe = Cloud_Client::post('/listPersonas', [], ['timeout' => 15]);
        if ( ! is_wp_error($persona_probe)) {
            $existing_personas = $persona_probe['body']['personas'] ?? [];
            if (is_array($existing_personas) && count($existing_personas) === 0) {
                return new \WP_Error(
                    'personas_required',
                    __('Create at least one persona before generating a post.', 'structura'),
                    ['status' => 403],
                );
            }
        }

        // Provider contract for the one-shot path mirrors Campaign_Validator:
        // text_provider is mandatory, image_provider is optional (empty →
        // null, meaning "don't generate images for this run"). We do NOT
        // fall back to "openai" silently — that shortcut is precisely how
        // Claude+Gemini campaigns used to end up generating with OpenAI
        // on "Generate Now". Legacy `provider` is read from the payload
        // for back-compat with older React clients but never written.
        $raw_text_provider = sanitize_key($params['text_provider'] ?? $params['provider'] ?? '');
        if ($raw_text_provider === '') {
            return new \WP_Error(
                'missing_text_provider',
                __('A text provider is required.', 'structura'),
                ['status' => 400],
            );
        }

        $raw_image_provider = sanitize_key($params['image_provider'] ?? '');
        $image_provider     = $raw_image_provider === '' ? null : $raw_image_provider;
        if ($image_provider !== null) {
            $img_meta = \Structura\Core\Provider_Registry::get_provider($image_provider);
            if ( ! $img_meta || ! in_array('image', $img_meta['capabilities'] ?? [], true)) {
                return new \WP_Error(
                    'invalid_image_provider',
                    sprintf(
                    /* translators: %s: provider slug (e.g. "anthropic") */
                        __('Provider "%s" does not support image generation.', 'structura'),
                        $image_provider,
                    ),
                    ['status' => 400],
                );
            }
        }

        // Optional fallback providers for the one-shot path — same rules as
        // Campaign_Validator: empty → null, must differ from primary, image
        // fallback must be image-capable. Invalid input is surfaced as a
        // 400 (rather than silently stripped) so misconfigured UI state is
        // caught at request time, not at cloud-invocation time.
        $raw_fallback_text      = sanitize_key($params['fallback_text_provider'] ?? '');
        $fallback_text_provider = $raw_fallback_text === '' ? null : $raw_fallback_text;
        if ($fallback_text_provider !== null && $fallback_text_provider === $raw_text_provider) {
            return new \WP_Error(
                'invalid_fallback_text_provider',
                __('The fallback text provider must be different from the primary.', 'structura'),
                ['status' => 400],
            );
        }

        $raw_fallback_image      = sanitize_key($params['fallback_image_provider'] ?? '');
        $fallback_image_provider = $raw_fallback_image === '' ? null : $raw_fallback_image;
        if ($fallback_image_provider !== null) {
            if ($fallback_image_provider === $image_provider) {
                return new \WP_Error(
                    'invalid_fallback_image_provider',
                    __('The fallback image provider must be different from the primary.', 'structura'),
                    ['status' => 400],
                );
            }
            $fb_img_meta = \Structura\Core\Provider_Registry::get_provider($fallback_image_provider);
            if ( ! $fb_img_meta || ! in_array('image', $fb_img_meta['capabilities'] ?? [], true)) {
                return new \WP_Error(
                    'invalid_fallback_image_provider',
                    sprintf(
                    /* translators: %s: provider slug (e.g. "anthropic") */
                        __('Fallback provider "%s" does not support image generation.', 'structura'),
                        $fallback_image_provider,
                    ),
                    ['status' => 400],
                );
            }
        }

        // Build a campaign-shaped array from flat params (same shape as get_campaign_data output)
        $allowed_modes = ['traffic_magnet', 'quick_wins', 'conversion', 'authority'];
        $campaign      = [
            'id'           => 0,
            'identity'     => [
                'name'         => sanitize_text_field($params['name'] ?? ''),
                'objective'    => sanitize_textarea_field($params['topic']),
                'campaignMode' => in_array($params['campaign_mode'] ?? '', $allowed_modes, true)
                    ? $params['campaign_mode']
                    : 'traffic_magnet',
            ],
            'intelligence' => [
                // Split text/image providers mirror Campaign_Repository so
                // Task_Runner sees the same shape whether this campaign came
                // from the scheduled run path or this one-shot "Generate
                // Now" endpoint. Silent fallbacks on either field would
                // re-introduce the Claude+Gemini-routed-to-OpenAI bug.
                'textProvider'          => $raw_text_provider,
                'imageProvider'         => $image_provider,
                'textModel'             => sanitize_text_field($params['text_model'] ?? ''),
                'imageModel'            => sanitize_text_field($params['image_model'] ?? ''),
                // Optional campaign-level fallback providers — Task_Runner
                // stamps these on the cloud payload so transient errors on
                // the primary are recovered from automatically. Null when
                // unset. Added in 1.16.0.
                'fallbackTextProvider'  => $fallback_text_provider,
                'fallbackImageProvider' => $fallback_image_provider,
                // Preserve string nanoids; cast to int only for numeric
                // legacy WP post ids. See Campaign_Validator::normalize_persona_id
                // for the full rationale — `(int)$nanoid` returns 0 and
                // silently nukes the persona binding on every cloud-personas
                // campaign save (cms.formulafoundry.io 2026-05-22).
                'personaId'             => \Structura\Scheduler\Campaign_Validator::normalize_persona_id_public(
                    $params['persona_id'] ?? null
                ),
                'language'              => sanitize_text_field($params['language'] ?? 'default'),
                'replaceLongDashes'     => filter_var($params['replace_long_dashes'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'disableEmojis'         => filter_var($params['disable_emojis'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'postLength'            => (int)($params['post_length'] ?? 1000),
                'seoRules'              => (array)($params['seo_optimization_rules'] ?? []),
            ],
            'structure'    => [
                'enabledBlocks' => (array)($params['enabled_blocks'] ?? []),
                'featuredImage' => filter_var($params['featured_image'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'bodyImages'    => filter_var($params['body_images'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'disclosure'    => [
                    'enabled' => filter_var($params['enable_disclosure'] ?? false, FILTER_VALIDATE_BOOLEAN),
                    'text'    => sanitize_textarea_field($params['disclosure_text'] ?? ''),
                ],
            ],
            'taxonomy'     => [
                'categories' => [
                    'mode' => sanitize_key($params['category_mode'] ?? 'auto'),
                    'list' => array_map('intval', (array)($params['allowed_categories'] ?? [])),
                ],
                'tags'       => [
                    'mode' => sanitize_key($params['tag_mode'] ?? 'auto'),
                    'list' => array_map('intval', (array)($params['allowed_tags'] ?? [])),
                ],
            ],
        ];

        // Single-post SEO grounding (optional — the "SEO Targeting" section).
        // The ephemeral campaign ships inline under `payload.campaign`, so we
        // set these directly on the array: the meta-keyed authority/keyword
        // injection in Task_Runner::delegate_to_cloud is keyed on a real
        // campaign post id and no-ops for this id=0 ephemeral run. The picked
        // focus keyphrase becomes the post's target keyword; authority domains
        // drive the outbound-link search. Absent → the cloud derives the
        // keyword from the objective, exactly as before (back-compat).
        $focus_keyphrase = sanitize_text_field($params['focus_keyphrase'] ?? '');
        if ($focus_keyphrase !== '') {
            $campaign['pickedKeyword'] = [
                'keyword'    => $focus_keyphrase,
                'source'     => 'manual',
                'usageCount' => 0,
            ];
        }
        $authority_domains = array_values(array_filter(array_map(
            static function ($d) {
                return is_string($d) ? sanitize_text_field($d) : '';
            },
            (array) ($params['authority_domains'] ?? [])
        )));
        if ( ! empty($authority_domains)) {
            $campaign['authorityDomains'] = $authority_domains;
        }

        // Mint the run id upfront so the SPA can navigate immediately
        // to `/generate/runs/:runId` after this call returns. The same
        // id flows through transient → AS → delegate_to_cloud →
        // executeCloudCampaignStep, which means the SPA's polling
        // hook starts seeing the primed run doc within a second of
        // submit. Without this, the SPA had no id to navigate to and
        // the form just "disappeared".
        $run_id = wp_generate_uuid4();

        // Persist the ephemeral one-shot campaign + the run id behind
        // a short key rather than serializing the whole array into
        // wp_actionscheduler_actions.args. A fully-populated campaign
        // (strategy + keywords + authority + rhythm) can reach 50–500 KB,
        // and on shared hosts the default 1 MB max_allowed_packet
        // silently drops the row — $wpdb->insert returns false without
        // raising. The Generate Now button would then return 200 and
        // never run anything. Same class of bug we fixed on the
        // image-task path in Task_Runner::queue_image_tasks.
        //
        // TTL is intentionally loose: manual runs execute within seconds
        // on a healthy host, but a slow AS queue (many backlogged jobs)
        // can push the actual invocation out by minutes. HOUR_IN_SECONDS
        // is plenty.
        $campaign_key = 'structura_single_post_' . wp_generate_uuid4();
        $payload = [
            'campaign' => $campaign,
            'run_id'   => $run_id,
        ];
        if ( ! set_transient($campaign_key, $payload, HOUR_IN_SECONDS)) {
            return new \WP_Error(
                'single_post_cache_failed',
                __('Could not cache the post request for background processing. Please try again.', 'structura'),
                ['status' => 500],
            );
        }

        $enqueue_id = as_enqueue_async_action(
            'structura_generate_single_post',
            ['campaign_key' => $campaign_key],
            STRUCTURA_AS_GROUP,
        );

        // Action Scheduler returns 0 when its own wp_actionscheduler_actions
        // insert failed. This is almost always MySQL's max_allowed_packet
        // (see Structura → Site Health) or a database-write failure. Clean up
        // the orphan transient so it doesn't sit in the options table.
        if ( ! $enqueue_id) {
            delete_transient($campaign_key);

            return new \WP_Error(
                'single_post_enqueue_failed',
                __('Could not queue this post for background processing. Open Tools → Site Health and resolve any Structura-flagged issues (usually MySQL max_allowed_packet) before retrying.',
                    'structura'),
                ['status' => 500],
            );
        }

        return rest_ensure_response([
            'success' => true,
            'run_id'  => $run_id,
            'message' => __('Your post is being generated in the background.', 'structura'),
        ]);
    }

    /**
     * Trigger authority domain discovery for a campaign.
     * Proxies to the Cloud Function executeAuthorityDiscovery.
     */
    public function discover_authority_domains($request)
    {
        // 2026-05-01 v2 — campaign id is a nanoid string. Cloud read.
        $id      = (string) $request['id'];
        $license = License_Manager::get_license_data();

        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }

        $campaign = Campaign_Cloud_Reader::get_campaign_data($id);
        if (empty($campaign)) {
            return new \WP_Error('not_found', __('Campaign not found.', 'structura'), ['status' => 404]);
        }

        $identity     = $campaign['identity'] ?? [];
        $intelligence = $campaign['intelligence'] ?? [];
        $keyphrase    = $identity['objective'] ?? '';

        if (empty($keyphrase)) {
            return new \WP_Error('missing_keyphrase', __('Campaign must have an objective.', 'structura'),
                ['status' => 400]);
        }

        // Log the start
        Log_Service::add('info', sprintf(
            /* translators: %s: campaign identity name or keyphrase. */
            __('Authority discovery started for "%s"…', 'structura'),
            $identity['name'] ?? $keyphrase,
        ), $id, 'authority_discovery');

        try {
            $license_payload = Key_Manager::get_license_payload();

            // Discovery is a text-LLM research call, so the text provider is
            // what matters. Prefer the split field; fall back to the legacy
            // `provider` key only for the rare in-flight save that hasn't
            // re-rendered yet. If neither is set, that's a data error — do
            // NOT silently default to gemini, which was the bug the user
            // flagged: silent fallbacks let a mis-wired campaign run on the
            // wrong provider for weeks.
            $provider = $intelligence['textProvider'] ?? $intelligence['provider'] ?? '';
            if ($provider === '') {
                return new \WP_Error(
                    'missing_text_provider',
                    __('Campaign is missing a text provider. Please re-save the campaign settings.', 'structura'),
                    ['status' => 400],
                );
            }

            $payload = [
                'licenseKey'       => $license['license_key'],
                'domain'           => wp_parse_url(home_url(), PHP_URL_HOST),
                'keyphrase'        => $keyphrase,
                'language'         => $intelligence['language'] ?? 'default',
                'provider'         => $provider,
                'site_context'     => [
                    'site_name'    => get_bloginfo('name'),
                    'site_tagline' => get_bloginfo('description'),
                ],
                // The campaign's confirmed authority list — prompt context +
                // don't-repeat for the suggestion model (2026-06-07), so a
                // re-discover proposes NEW sources instead of re-suggesting
                // what's already adopted.
                'existing_domains' => array_slice(array_values(array_filter(array_map(
                    function ($d) {
                        return is_string($d) ? sanitize_text_field($d) : '';
                    },
                    (array) ($intelligence['authorityDomains'] ?? [])
                ))), 0, 50),
            ];

            // BYOK keys are no longer threaded through the wire — the
            // cloud's `resolveProviderKeyOrThrow` reads the activation-
            // bound credential from `/workspaces/{w}/credentials/{c}`.
            // Spec: `specs/v2/cloud-only-generation.md` §Phase 3.

            $result = Cloud_Client::post('/executeAuthorityDiscovery', $payload, ['timeout' => 240]);

            if (is_wp_error($result)) {
                throw new \Exception($result->get_error_message());
            }

            $body = $result['body'];

            if (empty($body['success'])) {
                throw new \Exception($body['error'] ?? __('Unknown error from discovery service.', 'structura'));
            }

            $domains = $body['domains'] ?? [];
            $meta    = $body['meta'] ?? [];

            // Persist the discovered domains to the cloud campaign doc.
            // Pre-2026-05-03 this called `update_post_meta($id,
            // '_cluster_authority', ...)` which silently no-op'd against
            // cloud nanoid ids (`update_post_meta` requires an int post
            // id; cloud nanoids cast to 0). Symptom in the field: the
            // SPA's authority list never persisted across page reloads.
            // Spec: `specs/v2/cloud-pregeneration-and-model-catalog.md` §1.0c hardening tail.
            $discovered_at = current_time('mysql');
            $patched       = Campaign_Cloud_Reader::patch_campaign($id, [
                'authorityDomains'      => $domains,
                'authorityDiscoveredAt' => $discovered_at,
            ]);
            if ( ! $patched) {
                Log_Service::add('warning', sprintf(
                    /* translators: 1: number of domains saved locally, 2: campaign id. */
                    __('Authority discovery saved %1$d domains but cloud persist failed for campaign %2$s.', 'structura'),
                    count($domains),
                    $id,
                ), $id, 'authority_discovery');
            }

            Log_Service::add('success', sprintf(
                /* translators: 1: number of authority domains found, 2: number of queries the discovery service ran, 3: total wall-clock duration in milliseconds. */
                __('Authority discovery complete: %1$d domains found (%2$d queries, %3$dms).', 'structura'),
                count($domains),
                $meta['queriesRun'] ?? 0,
                $meta['durationMs'] ?? 0,
            ), $id, 'authority_discovery', [
                'domains' => array_map(fn($d) => $d['domain'] ?? '', $domains),
            ]);

            return rest_ensure_response([
                'success'             => true,
                'domains'             => $domains,
                'meta'                => $meta,
            ]);
        } catch (\Exception $e) {
            Log_Service::add('error', sprintf(
                /* translators: %s: error message from the authority-discovery service. */
                __('Authority discovery failed: %s', 'structura'),
                $e->getMessage(),
            ), $id, 'authority_discovery');

            return new \WP_Error('discovery_failed', $e->getMessage(), ['status' => 500]);
        }
    }

    /**
     * Old get_campaigns method (moved to get_campaigns_from_wp).
     * This docblock is kept for reference but the method is now routed by the dispatcher.
     */
    // NOTE: This was the original get_campaigns implementation. It is now called
    // indirectly via get_campaigns() dispatch logic that checks the cloud flag.

    /**
     * Detached authority discovery — used during campaign creation wizard
     * BEFORE the campaign exists. Accepts keyphrase/language/provider in the
     * request body. Does NOT save to any campaign; returns domains to the client
     * which holds them in state until campaign creation.
     */
    public function discover_authority_domains_detached($request)
    {
        $license = License_Manager::get_license_data();

        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }

        $params        = $request->get_json_params();
        $keyphrase     = sanitize_text_field($params['keyphrase'] ?? '');
        $campaign_name = sanitize_text_field($params['campaign_name'] ?? '');
        $language      = sanitize_text_field($params['language'] ?? 'default');
        // `provider` here is the text provider used for the discovery LLM
        // call. The React wizard always sends whichever provider the user
        // picked in the form; if somehow it doesn't reach us, fail loudly
        // rather than silently running the request on gemini — the bug the
        // user flagged was exactly that kind of invisible provider swap.
        $provider = sanitize_text_field($params['text_provider'] ?? $params['provider'] ?? '');

        // Resolve "default" to the WordPress site language (e.g. "de_DE")
        if ( ! $language || $language === 'default') {
            $language = get_bloginfo('language');
        }

        if (empty($keyphrase)) {
            return new \WP_Error('missing_keyphrase', __('A keyphrase is required for discovery.', 'structura'),
                ['status' => 400]);
        }

        if (empty($provider)) {
            return new \WP_Error(
                'missing_provider',
                __('A text provider is required for authority discovery.', 'structura'),
                ['status' => 400],
            );
        }

        $log_label = $campaign_name ?: mb_substr($keyphrase, 0, 60) . (mb_strlen($keyphrase) > 60 ? '…' : '');

        Log_Service::add('info', sprintf(
            /* translators: %s: campaign label (campaign name or first 60 chars of keyphrase). */
            __('Authority discovery started for "%s" (pre-creation)…', 'structura'),
            $log_label,
        ), 0, 'authority_discovery');

        try {
            $license_payload = Key_Manager::get_license_payload();

            $payload = [
                'licenseKey'       => $license['license_key'],
                'domain'           => wp_parse_url(home_url(), PHP_URL_HOST),
                'keyphrase'        => $keyphrase,
                'language'         => $language,
                'provider'         => $provider,
                'site_context'     => [
                    'site_name'    => get_bloginfo('name'),
                    'site_tagline' => get_bloginfo('description'),
                ],
            ];

            // Authority domains already confirmed by the user — forwarded
            // so the cloud feeds them into the suggestion prompt as
            // quality-bar context with a don't-repeat instruction
            // (2026-06-07). Without it the model re-suggested domains the
            // user already had and the UI filtered them out of view.
            if (isset($params['existing_domains']) && is_array($params['existing_domains'])) {
                $payload['existing_domains'] = array_slice(array_values(array_filter(array_map(
                    function ($d) {
                        return is_string($d) ? sanitize_text_field($d) : '';
                    },
                    $params['existing_domains']
                ))), 0, 50);
            }

            // BYOK keys live in the workspace credentials store; cloud
            // resolves on its own. Phase 3 of `cloud-only-generation.md`.

            $result = Cloud_Client::post('/executeAuthorityDiscovery', $payload, ['timeout' => 240]);

            if (is_wp_error($result)) {
                throw new \Exception($result->get_error_message());
            }

            $body = $result['body'];

            if (empty($body['success'])) {
                throw new \Exception($body['error'] ?? __('Unknown error from discovery service.', 'structura'));
            }

            $domains = $body['domains'] ?? [];
            $meta    = $body['meta'] ?? [];

            Log_Service::add('success', sprintf(
                /* translators: 1: number of authority domains found, 2: number of queries the discovery service ran, 3: total wall-clock duration in milliseconds. */
                __('Authority discovery complete: %1$d domains found (%2$d queries, %3$dms).', 'structura'),
                count($domains),
                $meta['queriesRun'] ?? 0,
                $meta['durationMs'] ?? 0,
            ), 0, 'authority_discovery', [
                'domains' => array_map(fn($d) => $d['domain'] ?? '', $domains),
            ]);

            return rest_ensure_response([
                'success'             => true,
                'domains'             => $domains,
                'meta'                => $meta,
            ]);
        } catch (\Exception $e) {
            Log_Service::add('error', sprintf(
                /* translators: %s: error message from the authority-discovery service. */
                __('Authority discovery failed: %s', 'structura'),
                $e->getMessage(),
            ), 0, 'authority_discovery');

            return new \WP_Error('discovery_failed', $e->getMessage(), ['status' => 500]);
        }
    }

    /**
     * Save or update authority domains for a campaign.
     * Called when the user edits the domain list in the UI.
     */
    public function save_authority_domains($request)
    {
        // Cloud is the single source of truth (Spec: `specs/v2/cloud-pregeneration-and-model-catalog.md`
        // §1.0c hardening tail). Campaign ids are cloud nanoids — the
        // pre-fix `(int)` cast collapsed them to 0 and the subsequent
        // `update_post_meta` silently no-op'd, so the SPA's "Save"
        // button reported success while nothing persisted server-side.
        $id      = (string) $request['id'];
        $params  = $request->get_json_params();
        $domains = $params['domains'] ?? [];

        if ( ! is_array($domains)) {
            return new \WP_Error('invalid_data', __('Domains must be an array.', 'structura'), ['status' => 400]);
        }

        $discovered_at = current_time('mysql');
        $patched       = Campaign_Cloud_Reader::patch_campaign($id, [
            'authorityDomains'      => $domains,
            'authorityDiscoveredAt' => $discovered_at,
        ]);

        if ( ! $patched) {
            return new \WP_Error(
                'cloud_persist_failed',
                __('Authority list could not be saved. Please try again.', 'structura'),
                ['status' => 502],
            );
        }

        Log_Service::add('info', sprintf(
            /* translators: %d: number of authority domains the user saved. */
            __('Authority domains updated manually (%d domains).', 'structura'),
            count($domains),
        ), $id, 'authority_discovery');

        return rest_ensure_response([
            'success' => true,
            'message' => __('Authority domains saved.', 'structura'),
        ]);
    }

    /**
     * Detached keyword discovery — runs pre-campaign-creation.
     * Accepts keyphrase/language/provider in the body (no campaign ID needed).
     * Returns a keyword bank of 20–50 curated keywords.
     */
    public function discover_keywords_detached($request)
    {
        $license = License_Manager::get_license_data();

        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }

        $params        = $request->get_json_params();
        $keyphrase     = sanitize_text_field($params['keyphrase'] ?? '');
        $campaign_name = sanitize_text_field($params['campaign_name'] ?? '');
        $language      = sanitize_text_field($params['language'] ?? 'default');
        // Same contract as discover_authority_domains_detached — the text
        // provider must be explicit. No silent gemini fallback.
        $provider = sanitize_text_field($params['text_provider'] ?? $params['provider'] ?? '');

        // Resolve "default" to the WordPress site language (e.g. "de_DE")
        if ( ! $language || $language === 'default') {
            $language = get_bloginfo('language');
        }

        if (empty($keyphrase)) {
            return new \WP_Error('missing_keyphrase', __('A keyphrase is required for keyword discovery.', 'structura'),
                ['status' => 400]);
        }

        if (empty($provider)) {
            return new \WP_Error(
                'missing_provider',
                __('A text provider is required for keyword discovery.', 'structura'),
                ['status' => 400],
            );
        }

        $log_label = $campaign_name ?: mb_substr($keyphrase, 0, 60) . (mb_strlen($keyphrase) > 60 ? '…' : '');

        Log_Service::add('info', sprintf(
            /* translators: %s: campaign label (campaign name or first 60 chars of keyphrase). */
            __('Keyword discovery started for "%s" (pre-creation)…', 'structura'),
            $log_label,
        ), 0, 'keyword_discovery');

        try {
            $license_payload = Key_Manager::get_license_payload();

            $payload = [
                'licenseKey'       => $license['license_key'],
                'domain'           => wp_parse_url(home_url(), PHP_URL_HOST),
                'keyphrase'        => $keyphrase,
                'language'         => $language,
                'provider'         => $provider,
                'site_context'     => [
                    'site_name'    => get_bloginfo('name'),
                    'site_tagline' => get_bloginfo('description'),
                ],
            ];

            // Interview topics, forwarded as explicit keyword-discovery seeds.
            // When present the cloud expands these directly instead of
            // re-deriving seeds from the objective prose; absent (interview
            // skipped) → objective-derived seeds.
            if (isset($params['topic_seeds']) && is_array($params['topic_seeds'])) {
                $topic_seeds = array_values(array_filter(array_map(
                    function ($s) {
                        return is_string($s) ? sanitize_text_field($s) : '';
                    },
                    $params['topic_seeds'],
                )));
                if (! empty($topic_seeds)) {
                    $payload['topic_seeds'] = $topic_seeds;
                }
            }

            // BYOK keys live in the workspace credentials store; cloud
            // resolves on its own. Phase 3 of `cloud-only-generation.md`.

            $result = Cloud_Client::post('/executeKeywordDiscovery', $payload, ['timeout' => 240]);

            if (is_wp_error($result)) {
                throw new \Exception($result->get_error_message());
            }

            $body = $result['body'];

            if (empty($body['success'])) {
                throw new \Exception($body['error'] ?? __('Unknown error from keyword discovery service.',
                    'structura'));
            }

            $keywords = $body['keywords'] ?? [];
            $meta     = $body['meta'] ?? [];

            Log_Service::add('success', sprintf(
                /* translators: 1: number of keywords found, 2: number of queries the discovery service ran, 3: total wall-clock duration in milliseconds. */
                __('Keyword discovery complete: %1$d keywords found (%2$d queries, %3$dms).', 'structura'),
                count($keywords),
                $meta['queriesRun'] ?? 0,
                $meta['durationMs'] ?? 0,
            ), 0, 'keyword_discovery', [
                'sample' => array_slice(array_map(fn($k) => $k['keyword'] ?? '', $keywords), 0, 5),
            ]);

            return rest_ensure_response([
                'success'  => true,
                'keywords' => $keywords,
                'meta'     => $meta,
            ]);
        } catch (\Exception $e) {
            Log_Service::add('error', sprintf(
                /* translators: %s: error message from the keyword-discovery service. */
                __('Keyword discovery failed: %s', 'structura'),
                $e->getMessage(),
            ), 0, 'keyword_discovery');

            return new \WP_Error('keyword_discovery_failed', $e->getMessage(), ['status' => 500]);
        }
    }

    // Duplicate methods removed — see the new proxy/dispatcher methods in the "Cloud Proxy Layer" section below
    // Original implementations: toggle_campaign, create_campaign, handle_campaign_persistence,
    // duplicate_campaign, update_campaign, delete_campaign are now dispatchers that route to
    // either WP-side or cloud-side implementations depending on the flag.

    /**
     * POST /structura/v1/site/analyze
     *
     * Spec: specs/seo-intelligence-plan.md §4.2. Manual trigger for the
     * /site page's SEO intelligence analysis. Forwards to the cloud's
     * `analyzeSite` endpoint, which runs the Live DataForSEO Labs
     * queries and caches the result on the workspace.
     *
     * Pass-through: the cloud is the source of truth for tier gating,
     * provider resolution, and result shape — the plugin just adds
     * auth + bearer headers via `Cloud_Client::post`.
     */
    public function analyze_site($request)
    {
        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }

        $params = $request->get_json_params();
        $locale = sanitize_text_field($params['locale'] ?? get_bloginfo('language'));

        $payload = [
            'licenseKey' => $license['license_key'],
            'locale'     => $locale,
        ];

        // Long timeout — two Labs endpoints + parsing routinely lands in
        // the 8–15s range, occasionally up to 30s on a slow upstream.
        $result = Cloud_Client::post('/analyzeSite', $payload, ['timeout' => 60]);
        if (is_wp_error($result)) {
            return $result;
        }
        return rest_ensure_response($result['body']);
    }

    /**
     * POST /structura/v1/site/state
     *
     * Spec: specs/seo-intelligence-plan.md §4.2. Cache-only read of the
     * workspace's last analysis result. Free of spend; the SPA calls
     * this on /site tab mount to decide between the "Analyze my site"
     * button and the data view.
     */
    public function get_site_state($request)
    {
        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }

        $params = $request->get_json_params();
        $locale = sanitize_text_field($params['locale'] ?? get_bloginfo('language'));

        $payload = [
            'licenseKey' => $license['license_key'],
            'locale'     => $locale,
        ];

        $result = Cloud_Client::post('/getSiteState', $payload, ['timeout' => 15]);
        if (is_wp_error($result)) {
            return $result;
        }
        return rest_ensure_response($result['body']);
    }

    /**
     * POST /structura/v1/site/seo-settings — durable SEO settings CRUD.
     * Forwards to the cloud's `updateSiteSeoSettings` HTTP endpoint
     * (the plugin-friendly counterpart to the `updateWorkspaceSeoSettings`
     * callable). Body shape:
     *   { competitorUrls?: string[], targetKeywords?: string[],
     *     authorityDomains?: string[], emailDigestOptIn?: bool }
     * Every field is independently optional — sending one doesn't clobber
     * the others (the cloud read-modify-writes the seoIntel block).
     */
    public function update_site_seo_settings($request)
    {
        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }
        $params = $request->get_json_params();
        $payload = [
            'licenseKey' => $license['license_key'],
        ];
        if (isset($params['competitorUrls']) && is_array($params['competitorUrls'])) {
            $payload['competitorUrls'] = array_map(
                'esc_url_raw',
                array_filter($params['competitorUrls'], 'is_string'),
            );
        }
        // targetKeywords + authorityDomains were previously NOT forwarded,
        // so wizard/Site edits to them were silently dropped here before
        // ever reaching the cloud. Forward both (the cloud trims, caps,
        // de-dups, and normalises authority domains to bare hostnames).
        if (isset($params['targetKeywords']) && is_array($params['targetKeywords'])) {
            $payload['targetKeywords'] = array_values(array_map(
                'sanitize_text_field',
                array_filter($params['targetKeywords'], 'is_string'),
            ));
        }
        if (isset($params['authorityDomains']) && is_array($params['authorityDomains'])) {
            $payload['authorityDomains'] = array_values(array_map(
                'sanitize_text_field',
                array_filter($params['authorityDomains'], 'is_string'),
            ));
        }
        if (isset($params['emailDigestOptIn'])) {
            $payload['emailDigestOptIn'] = (bool) $params['emailDigestOptIn'];
        }
        // Referral / partner links — the site-level seed. Objects, not strings:
        // esc_url_raw the URL (tracking params survive), text-sanitize the rest,
        // drop URL-less rows. Sent even when empty so the list can be cleared.
        if (isset($params['referralLinks']) && is_array($params['referralLinks'])) {
            $links = [];
            foreach ($params['referralLinks'] as $entry) {
                if (! is_array($entry)) {
                    continue;
                }
                $url = esc_url_raw((string) ($entry['url'] ?? ''));
                if ($url === '') {
                    continue;
                }
                $keywords = array_values(array_filter(array_map(
                    'sanitize_text_field',
                    array_filter((array) ($entry['relevanceKeywords'] ?? []), 'is_string')
                )));
                $link = [
                    'url'               => $url,
                    'label'             => sanitize_text_field((string) ($entry['label'] ?? '')),
                    'relevanceKeywords' => $keywords,
                ];
                $anchor = sanitize_text_field((string) ($entry['anchorText'] ?? ''));
                if ($anchor !== '') {
                    $link['anchorText'] = $anchor;
                }
                $links[] = $link;
            }
            $payload['referralLinks'] = $links;
        }
        $result = Cloud_Client::post('/updateSiteSeoSettings', $payload, ['timeout' => 15]);
        if (is_wp_error($result)) {
            return $result;
        }
        return rest_ensure_response($result['body']);
    }

    /**
     * POST /structura/v1/wizard/state
     *
     * Spec: specs/onboarding-wizard-plan.md. Universal-shape proxy to
     * the cloud's `getWizardState`. Returns the workspace's current
     * onboarding wizard state, creating the doc lazily if missing.
     * Free of spend; safe to call on every wizard mount.
     */
    public function get_wizard_state($request)
    {
        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            // No license yet — a fresh/anonymous install, or a plugin whose
            // activation was hard-deleted. This is a background nudge query
            // (the SPA marks it silentError), so a 403 just spams the console
            // on every poll. Return a quiet, fresh state instead. Crucially
            // `justCreated` is false so the dashboard auto-redirect doesn't
            // yank the user into the wizard on every read.
            return rest_ensure_response([
                'state' => [
                    'currentStep'            => 1,
                    'completedSteps'         => [],
                    'skippedSteps'           => [],
                    'startedAt'              => gmdate('c'),
                    'completedAt'            => null,
                    'completedAtPlanId'      => null,
                    'initiatedFromSurface'   => 'wp-admin',
                    'lastUpdatedFromSurface' => 'wp-admin',
                ],
                'justCreated'                => false,
                'activationNeedsPositioning' => false,
            ]);
        }
        $payload = ['licenseKey' => $license['license_key']];
        $result  = Cloud_Client::post('/getWizardState', $payload, ['timeout' => 15]);
        if (is_wp_error($result)) {
            return $result;
        }
        return rest_ensure_response($result['body']);
    }

    /**
     * POST /structura/v1/wizard/step — mark a step as completed and
     * advance the wizard cursor.
     *
     * Body: { step: int (1..6) }
     */
    public function save_wizard_step($request)
    {
        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }
        $params = $request->get_json_params();
        $step   = isset($params['step']) ? (int) $params['step'] : 0;
        if ($step < 1 || $step > 6) {
            return new \WP_Error('invalid_step', __('Invalid step id.', 'structura'), ['status' => 400]);
        }
        $payload = [
            'licenseKey' => $license['license_key'],
            'step'       => $step,
        ];
        $result = Cloud_Client::post('/saveWizardStep', $payload, ['timeout' => 15]);
        if (is_wp_error($result)) {
            return $result;
        }
        return rest_ensure_response($result['body']);
    }

    /**
     * POST /structura/v1/wizard/skip — mark a step as skipped and
     * advance the wizard cursor.
     *
     * Body: { step: int (1..6) }
     */
    public function skip_wizard_step($request)
    {
        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }
        $params = $request->get_json_params();
        $step   = isset($params['step']) ? (int) $params['step'] : 0;
        if ($step < 1 || $step > 6) {
            return new \WP_Error('invalid_step', __('Invalid step id.', 'structura'), ['status' => 400]);
        }
        $payload = [
            'licenseKey' => $license['license_key'],
            'step'       => $step,
        ];
        $result = Cloud_Client::post('/skipWizardStep', $payload, ['timeout' => 15]);
        if (is_wp_error($result)) {
            return $result;
        }
        return rest_ensure_response($result['body']);
    }

    /**
     * POST /structura/v1/wizard/reset — wipe wizard progress so the
     * user can run through it again. The underlying saved data
     * (positioning, target keywords, persona, AI settings, visual
     * preset) all stays intact; the user lands back at step 1 with
     * everything they had before, free to edit.
     */
    public function reset_wizard_state($request)
    {
        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }
        $payload = ['licenseKey' => $license['license_key']];
        $result  = Cloud_Client::post('/resetWizardState', $payload, ['timeout' => 15]);
        if (is_wp_error($result)) {
            return $result;
        }
        return rest_ensure_response($result['body']);
    }

    /**
     * POST /structura/v1/wizard/test-ai — run a real connection test
     * against the chosen provider + model.
     *
     * Body: { provider: "openai"|"gemini"|"anthropic", model: string }
     */
    public function test_wizard_ai_connection($request)
    {
        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }
        $params   = $request->get_json_params();
        $provider = isset($params['provider']) ? sanitize_text_field($params['provider']) : '';
        $model    = isset($params['model']) ? sanitize_text_field($params['model']) : '';
        if (!in_array($provider, ['openai', 'gemini', 'anthropic'], true) || $model === '') {
            return new \WP_Error('invalid_request', __('provider + model required.', 'structura'), ['status' => 400]);
        }
        $payload = [
            'licenseKey' => $license['license_key'],
            'provider'   => $provider,
            'model'      => $model,
        ];
        // 15s — provider call has its own 10s cap on the cloud side.
        $result = Cloud_Client::post('/testWizardAiConnection', $payload, ['timeout' => 15]);
        if (is_wp_error($result)) {
            return $result;
        }
        return rest_ensure_response($result['body']);
    }

    /**
     * POST /structura/v1/wizard/notify-support — alert the ops team
     * about a managed-tier AI connection failure. Body carries the
     * provider/model/error context; the cloud auto-attaches workspace
     * + license ids server-side so we don't trust the client to
     * forward identity.
     */
    public function notify_wizard_support($request)
    {
        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }
        $params  = $request->get_json_params();
        $payload = [
            'licenseKey'   => $license['license_key'],
            'provider'     => isset($params['provider']) ? sanitize_text_field($params['provider']) : '',
            'model'        => isset($params['model']) ? sanitize_text_field($params['model']) : '',
            'errorCode'    => isset($params['errorCode']) ? sanitize_text_field($params['errorCode']) : '',
            'errorMessage' => isset($params['errorMessage']) ? sanitize_textarea_field($params['errorMessage']) : '',
        ];
        $result = Cloud_Client::post('/notifyWizardSupport', $payload, ['timeout' => 15]);
        if (is_wp_error($result)) {
            return $result;
        }
        return rest_ensure_response($result['body']);
    }

    /**
     * POST /structura/v1/wizard/positioning — read the workspace's
     * saved positioning answers (or null when none saved yet).
     */
    public function get_wizard_positioning($request)
    {
        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }
        $payload = ['licenseKey' => $license['license_key']];
        $result  = Cloud_Client::post('/getWizardPositioning', $payload, ['timeout' => 15]);
        if (is_wp_error($result)) {
            return $result;
        }
        return rest_ensure_response($result['body']);
    }

    /**
     * POST /structura/v1/wizard/positioning/save — persist positioning.
     * Body: { what, who, problem, source? }
     */
    public function save_wizard_positioning($request)
    {
        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }
        $params  = $request->get_json_params();
        $payload = [
            'licenseKey' => $license['license_key'],
            'what'       => isset($params['what']) ? sanitize_textarea_field($params['what']) : '',
            'who'        => isset($params['who']) ? sanitize_textarea_field($params['who']) : '',
            'problem'    => isset($params['problem']) ? sanitize_textarea_field($params['problem']) : '',
            'source'     => isset($params['source']) ? sanitize_text_field($params['source']) : 'user',
        ];
        $result = Cloud_Client::post('/saveWizardPositioning', $payload, ['timeout' => 15]);
        if (is_wp_error($result)) {
            return $result;
        }
        return rest_ensure_response($result['body']);
    }

    /**
     * POST /structura/v1/wizard/positioning/suggest — AI-draft from
     * the homepage. Body: no fields (uses workspace context).
     * Long timeout — DFS OnPage + Gemini call together typically lands
     * in the 4–10s range.
     */
    public function suggest_wizard_positioning($request)
    {
        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }
        $payload = ['licenseKey' => $license['license_key']];
        $result  = Cloud_Client::post('/suggestWizardPositioning', $payload, ['timeout' => 30]);
        if (is_wp_error($result)) {
            return $result;
        }
        return rest_ensure_response($result['body']);
    }

    /**
     * POST /structura/v1/wizard/keywords/suggest — AI keyword
     * candidates. Body:
     *   { positioning?: {what, who, problem}, competitorUrls?: string[] }
     * Both optional — cloud uses whatever's available.
     */
    public function suggest_wizard_keywords($request)
    {
        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }
        $params  = $request->get_json_params();
        $payload = ['licenseKey' => $license['license_key']];
        if (isset($params['positioning']) && is_array($params['positioning'])) {
            $p = $params['positioning'];
            $payload['positioning'] = [
                'what'    => isset($p['what']) ? sanitize_textarea_field($p['what']) : '',
                'who'     => isset($p['who']) ? sanitize_textarea_field($p['who']) : '',
                'problem' => isset($p['problem']) ? sanitize_textarea_field($p['problem']) : '',
            ];
        }
        if (isset($params['competitorUrls']) && is_array($params['competitorUrls'])) {
            $payload['competitorUrls'] = array_values(array_filter(array_map(
                function ($u) {
                    return is_string($u) ? esc_url_raw($u) : '';
                },
                $params['competitorUrls']
            )));
        }
        // Confirmed target keywords — forwarded so the cloud can feed
        // them into the prompt as topical context with a don't-repeat
        // instruction (2026-06-07). Without it the model re-suggested
        // keywords the user already had.
        if (isset($params['existingKeywords']) && is_array($params['existingKeywords'])) {
            $payload['existingKeywords'] = array_slice(array_values(array_filter(array_map(
                function ($k) {
                    return is_string($k) ? sanitize_text_field($k) : '';
                },
                $params['existingKeywords']
            ))), 0, 50);
        }
        $result = Cloud_Client::post('/suggestWizardKeywords', $payload, ['timeout' => 30]);
        if (is_wp_error($result)) {
            return $result;
        }
        return rest_ensure_response($result['body']);
    }

    /**
     * AI competitor suggestions — fallback when DataForSEO's SERP-overlap
     * discovery returns nothing for a domain (new / un-indexed sites).
     */
    public function suggest_wizard_competitors($request)
    {
        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }
        $params  = $request->get_json_params();
        $payload = ['licenseKey' => $license['license_key']];
        if (isset($params['positioning']) && is_array($params['positioning'])) {
            $p = $params['positioning'];
            $payload['positioning'] = [
                'what'    => isset($p['what']) ? sanitize_textarea_field($p['what']) : '',
                'who'     => isset($p['who']) ? sanitize_textarea_field($p['who']) : '',
                'problem' => isset($p['problem']) ? sanitize_textarea_field($p['problem']) : '',
            ];
        }
        if (isset($params['excludeDomains']) && is_array($params['excludeDomains'])) {
            $payload['excludeDomains'] = array_values(array_filter(array_map(
                function ($d) {
                    return is_string($d) ? sanitize_text_field($d) : '';
                },
                $params['excludeDomains']
            )));
        }
        // Campaign-level augmentation forwards the campaign's content
        // language so the cloud biases suggestions toward that market.
        if (isset($params['language']) && is_string($params['language'])) {
            $payload['language'] = sanitize_text_field($params['language']);
        }
        $result = Cloud_Client::post('/suggestWizardCompetitors', $payload, ['timeout' => 30]);
        if (is_wp_error($result)) {
            return $result;
        }
        return rest_ensure_response($result['body']);
    }

    /**
     * Save or update keyword bank for a campaign.
     * Called when the user edits keywords in the UI or after campaign creation.
     */
    public function save_campaign_keywords($request)
    {
        // Cloud is the single source of truth (Spec: `specs/v2/cloud-pregeneration-and-model-catalog.md`
        // §1.0c hardening tail). Same shape as `save_authority_domains`
        // — pre-fix cast `(int)$request['id']` to 0 for nanoid ids,
        // then `get_post_meta` / `update_post_meta` silently failed.
        $id       = (string) $request['id'];
        $params   = $request->get_json_params();
        $keywords = $params['keywords'] ?? [];

        if ( ! is_array($keywords)) {
            return new \WP_Error('invalid_data', __('Keywords must be an array.', 'structura'), ['status' => 400]);
        }

        // Preserve usage counts from the existing bank when keywords are re-discovered.
        // Without this, the round-robin "forgets" which keywords were already used
        // and the next pick collides with a recent post. Read the existing bank from
        // the cloud campaign doc; an empty / missing bank is treated as "no prior
        // history to merge" rather than an error (fresh campaign).
        $existing_campaign = Campaign_Cloud_Reader::get_campaign_data($id);
        $existing_bank     = $existing_campaign['cluster']['keywords']['bank'] ?? [];

        if (is_array($existing_bank) && ! empty($existing_bank)) {
            $usage_map = [];
            foreach ($existing_bank as $entry) {
                $kw = strtolower($entry['keyword'] ?? '');
                if ($kw && ! empty($entry['usageCount'])) {
                    $usage_map[$kw] = (int) $entry['usageCount'];
                }
            }

            if ( ! empty($usage_map)) {
                foreach ($keywords as &$kw_entry) {
                    $kw_lower = strtolower($kw_entry['keyword'] ?? '');
                    if (isset($usage_map[$kw_lower]) && empty($kw_entry['usageCount'])) {
                        $kw_entry['usageCount'] = $usage_map[$kw_lower];
                    }
                }
                unset($kw_entry);
            }
        }

        $patched = Campaign_Cloud_Reader::patch_campaign($id, [
            'keywordBank'          => $keywords,
            'keywordsDiscoveredAt' => current_time('mysql'),
        ]);

        if ( ! $patched) {
            return new \WP_Error(
                'cloud_persist_failed',
                __('Keyword bank could not be saved. Please try again.', 'structura'),
                ['status' => 502],
            );
        }

        Log_Service::add('info', sprintf(
            /* translators: %d: number of keywords the user saved to the bank. */
            __('Keyword bank updated (%d keywords).', 'structura'),
            count($keywords),
        ), $id, 'keyword_discovery');

        return rest_ensure_response([
            'success' => true,
            'message' => __('Keyword bank saved.', 'structura'),
        ]);
    }

    /**
     * Delete/Cancel a Job by ID
     * Uses ActionScheduler_Store::delete_action directly.
     */
    public function delete_job($request)
    {
        if ( ! class_exists('ActionScheduler_Store')) {
            return new \WP_Error('as_error', __('Action Scheduler not available.', 'structura'));
        }

        $id = (int)$request['id'];

        try {
            \ActionScheduler::store()->delete_action($id);

            return rest_ensure_response(['success' => true]);
        } catch (\Exception $e) {
            return new \WP_Error('delete_failed', $e->getMessage());
        }
    }

    /**
     * Production Blueprint Handler
     * @throws \Exception
     */
    public function receive_cloud_blueprint($request)
    {
        $runner = new Task_Runner();

        return $runner->receive_cloud_blueprint($request);
    }

    public function handle_pulse_check($request)
    {
        $signature = $request->get_header('x-structura-signature')
            ?: $request->get_header('x_structura_signature');

        $runner = new Task_Runner();

        if ( ! $runner->verify_webhook_signature($request->get_body(), $signature)) {
            return new \WP_Error('unauthorized', 'Pulse Handshake Failed: Invalid Signature.', ['status' => 401]);
        }

        return rest_ensure_response([
            'success' => true,
            'message' => __('Handshake verified. Your server is reachable.', 'structura'),
        ]);
    }

    /**
     * @throws \Exception
     */
    public function handle_unified_suggestion($request)
    {
        $mode = sanitize_text_field($request['mode']);

        if ( ! in_array($mode, ['visual', 'persona', 'campaign', 'topic_chips'], true)) {
            $this->log('error', 'Invalid suggestion mode: ' . $mode, 0, 'suggestion_handler');
            throw new \Exception(esc_html__('Invalid suggestion mode.', 'structura'));
        }

        $user_context = $request['context'] ?? [];
        $provider     = sanitize_text_field($request['provider'] ?? '');
        $plan         = License_Manager::get_plan();

        // Visual mode: the picked rendering medium drives the cloud
        // blueprint's STYLE. Validate against the known set; anything else
        // (or absent) leaves it empty so the cloud applies its photography
        // default.
        $medium = sanitize_text_field($request['medium'] ?? '');
        if ( ! in_array($medium, ['photography', 'illustration', '3d_render'], true)) {
            $medium = '';
        }

        // Cloud-tier users: utility suggestions (topic chips, campaign strategy,
        // persona, visual style) use our preferred provider silently — the user's
        // chosen default only matters for actual post/image generation.
        $is_managed = in_array($plan, ['cloud', 'cloud_pro'], true);
        if ($is_managed) {
            $provider = 'gemini';
        }

        if (empty($provider)) {
            return new \WP_Error(
                'missing_provider',
                __('Intelligence source not specified.', 'structura'),
                ['status' => 400],
            );
        }

        $builder = new Context_Builder();
        // Gathers Brand Colors, Niche, and Site Identity
        $site_identity = $builder->build_brand_context();

        // Enrich URL context entries with fetched page content so the LLM
        // receives actual text rather than bare URL strings.
        if ( ! empty($user_context) && is_array($user_context)) {
            $user_context = $this->enrich_context_with_resource($user_context);
        }

        try {
            // Cloud-only-generation Phase 3: every tier suggestion call
            // runs through the cloud. The free / none rate cap is
            // applied by `resolveProviderKeyForTier`; BYOK keys are
            // read from `/workspaces/{w}/credentials/{c}`.
            return $this->execute_cloud_suggestion($mode, $site_identity, $user_context, $provider, $medium);
        } catch (\Exception $e) {
            $this->log('error', 'Suggestion execution failed: ' . $e->getMessage(), 0, 'suggestion_handler');

            throw $e; // Re-throw to be caught by the REST API and returned as WP_Error
        }
    }

    /**
     * Unified Logger Proxy
     *
     * `$campaign_id` accepts int (legacy WP post id) or string (cloud nanoid,
     * post-Phase-1.0c). The Log_Service column is bigint; cloud-keyed events
     * land under campaign_id=0. The pre-Phase-1.0c `int` declaration was a
     * silent TypeError bomb on PHP 8 — see Task_Runner::log() docblock.
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

    /**
     * Enriches each context entry with fetched resource signals.
     *
     * Adds the following keys alongside the existing `title` and `url`:
     *   - `content` — text snippet (stripped HTML, detected palette note,
     *                 or "image attached" placeholder)
     *   - `colors` — array of hex strings when the resource is an SVG
     *   - `image`  — `{ mime, base64 }` when the resource is a raster
     *                image (PNG/JPEG/WEBP/GIF)
     *
     * Images and colors are forwarded to the cloud suggestion engine so
     * it can attach the logo as a multimodal input to vision-capable
     * models (Gemini today). See `Resource_Fetcher` for the branching
     * logic and why each case exists.
     */
    private function enrich_context_with_resource(array $context): array
    {
        return array_map(function (array $item) {
            if (empty($item['url'])) {
                return $item;
            }

            $resource = Resource_Fetcher::fetch($item['url']);

            $item['content'] = $resource['content'];

            // Only attach the optional keys when they carry signal so
            // the outgoing JSON stays small when nothing was detected.
            if ( ! empty($resource['colors'])) {
                $item['colors'] = $resource['colors'];
            }
            if ( ! empty($resource['image'])) {
                $item['image'] = $resource['image'];
            }

            return $item;
        }, $context);
    }

    // `execute_local_suggestion` (in-process BYOK suggestion path)
    // retired in Phase 4 of `specs/v2/cloud-only-generation.md`. Every
    // suggestion request now flows through `execute_cloud_suggestion`
    // → `/executeCloudSuggestion`. `clean_ai_json` went with it (its
    // only caller was the local path; cloud responses are pre-parsed
    // JSON).

    /**
     * @throws \Exception
     */
    private function execute_cloud_suggestion($mode, $site_identity, $user_context, $provider, $medium = '')
    {
        $license = License_Manager::get_license_data();
        $payload = Key_Manager::get_license_payload();

        if (empty($provider)) {
            throw new \Exception(esc_html__('AI provider is required for cloud suggestions.', 'structura'));
        }

        $cloud_payload = [
            'mode'             => $mode,
            'site_identity'    => $site_identity,
            'user_context'     => $user_context,
            'provider'         => $provider,
            'licenseKey'       => $license['license_key'],
            'domain'           => wp_parse_url(get_site_url(), PHP_URL_HOST),
            // BYOK keys live in the workspace credentials store; cloud
            // resolves on its own. Phase 3 of `cloud-only-generation.md`.
        ];

        // Visual mode only — forward the picked rendering medium so the
        // cloud blueprint drafts in it. Omitted otherwise (cloud defaults
        // to photography).
        if ($medium !== '') {
            $cloud_payload['visualMedium'] = $medium;
        }

        // 240s curl timeout — the cloud function is provisioned for 300s
        // (executeCloudSuggestion timeoutSeconds). Suggestion calls
        // typically settle in 5-30s on a warm instance and 30-90s on a
        // cold start, but the long tail can run >120s when the provider
        // is slow on a large keyphrase. 60s tripped cURL error 28 at the
        // ceiling; 120s did the same on slow runs (see keyword-discovery
        // 128s incident, 2026-05-08). 240s leaves us inside the cloud's
        // 300s ceiling with margin, without holding the WP request open
        // longer than typical FastCGI / mod_php process limits allow.
        $result = Cloud_Client::post('/executeCloudSuggestion', $cloud_payload, ['timeout' => 240]);

        if (is_wp_error($result)) {
            throw new \Exception(esc_html($result->get_error_message()));
        }

        $status_code = $result['code'];
        $data        = $result['body'];

        // The Cloud Function returns a non-200 status on any handled error
        // (e.g. rate limit, invalid key, license failure). Without this check
        // the error JSON is silently spread into a 200 response and the frontend
        // never sees it as an error — the suggestion just disappears.
        if ($status_code !== 200) {
            $message = $data['error'] ?? __('The AI service returned an unexpected error. Please try again.',
                'structura');
            $this->log('error', "Cloud suggestion failed [{$mode}]: {$message}", 0, 'cloud_suggestion');

            // Forward the cloud's structured error envelope into the
            // WP_Error data so the wp-admin client can branch on
            // `code` / `provider` / `retriable` to render a humane
            // toast instead of leaking the raw provider message
            // ("[Gemini Text Synthesis] high demand…"). The cloud
            // returns 503 for transient provider errors; mirror it
            // here so the client (and any downstream proxy) can tell
            // retryable from terminal at a glance.
            $error_data = ['status' => $status_code === 503 ? 503 : 502];
            foreach (['code', 'provider', 'retriable', 'reason', 'providerStatus'] as $field) {
                if (isset($data[$field])) {
                    $error_data[$field] = $data[$field];
                }
            }

            return new \WP_Error('cloud_suggestion_error', $message, $error_data);
        }

        return rest_ensure_response([...$data, 'via' => 'cloud']);
    }

    public function get_provider_heartbeat($request)
    {
        $provider_id = sanitize_text_field($request['provider']);

        // Phase 5c — keys live cloud-side, the plugin no longer holds
        // them and can't make a live latency probe to the provider.
        // The "is this configured?" half of the heartbeat is what the
        // wp-admin SPA actually consumes; we satisfy that by reading
        // the activation's binding list. Live latency probes are a
        // future cloud-side feature (the cloud has both the key and
        // egress observability the plugin doesn't).
        $bindings = $this->fetch_cloud_provider_bindings();
        if ( ! isset($bindings[$provider_id])) {
            return new \WP_Error('no_key', 'Provider not configured', ['status' => 404]);
        }

        return rest_ensure_response([
            'status'    => 'online',
            'latency'   => null,
            'timestamp' => current_time('mysql'),
        ]);
    }

    public function disconnect_provider($request)
    {
        $provider = sanitize_text_field($request['provider']);

        // Phase 5c — keys live in the cloud as a workspace library,
        // bound per-activation. "Disconnect on this site" clears the
        // binding for this activation; the library entry stays so a
        // portal user can re-bind it elsewhere. Cloud helper is
        // idempotent, so a stale UI clicking disconnect twice doesn't
        // 404.
        $response = Cloud_Client::post('/deleteProviderCredential', [
            'provider' => $provider,
        ]);
        if (is_wp_error($response)) {
            return new \WP_Error(
                'cloud_disconnect_failed',
                $response->get_error_message(),
                ['status' => 502],
            );
        }
        $body = is_array($response) ? ($response['body'] ?? []) : [];
        $code = is_array($response) ? (int)($response['code'] ?? 0) : 0;
        if ($code < 200 || $code >= 300 || empty($body['success'])) {
            $error = is_array($body) && isset($body['error']) ? (string)$body['error']
                : __('Failed to disconnect provider in the cloud.', 'structura');
            return new \WP_Error('cloud_disconnect_failed', $error, ['status' => $code ?: 502]);
        }

        // Drop the per-request bindings cache so the
        // reassign-defaults logic below (which calls
        // `Provider_Registry::get_connected_providers`) observes the
        // post-disconnect state.
        Cloud_Client::reset_provider_bindings_cache();

        // If this provider was a default, promote the next connected
        // provider or clear it. Defaults still live in `wp_options` for
        // now — the workspace-shared default UX is deferred per spec
        // §"Open" notes in cloud-only-generation.md.
        $this->reassign_defaults_after_disconnect($provider);

        return rest_ensure_response(['success' => true]);
    }

    /**
     * When a default provider is disconnected, auto-promote another connected
     * provider with the same capability, or clear the default.
     */
    private function reassign_defaults_after_disconnect(string $disconnected): void
    {
        $plan      = License_Manager::get_plan();
        $connected = Provider_Registry::get_connected_providers($plan);

        $default_text  = get_option('structura_default_text_provider', '');
        $default_image = get_option('structura_default_image_provider', '');

        if ($default_text === $disconnected) {
            $next = '';
            foreach ($connected as $p) {
                if ($p['id'] !== $disconnected && in_array('text', $p['capabilities'], true)) {
                    $next = $p['id'];
                    break;
                }
            }
            update_option('structura_default_text_provider', $next);
        }

        if ($default_image === $disconnected) {
            $next = '';
            foreach ($connected as $p) {
                if ($p['id'] !== $disconnected && in_array('image', $p['capabilities'], true)) {
                    $next = $p['id'];
                    break;
                }
            }
            update_option('structura_default_image_provider', $next);
        }
    }

    public function get_assignable_users()
    {
        $args = [
            'role__in' => ['administrator', 'editor', 'author'],
            'fields'   => ['ID', 'display_name'],
            'number'   => 100,
        ];

        $users = get_users($args);

        $data = array_map(function ($u) {
            return [
                'id'        => (int)$u->ID,
                'name'      => $u->display_name,
                'avatarUrl' => get_avatar_url($u->ID, ['size' => 96]),
            ];
        }, $users);

        return rest_ensure_response($data);
    }

    public function delete_persona($request)
    {
        // 2026-05-01 v2 — cloud is the single source of truth.
        return $this->delete_persona_from_cloud($request);
    }

    /**
     * Delete persona from cloud via REST endpoint.
     *
     * Cloud function is exported as `deletePersona`.
     */
    private function delete_persona_from_cloud($request)
    {
        $id = (string)$request['id'];

        // Phase 1.8 PR5 — bearer auth via `Cloud_Client::post()`; legacy
        // license-key/secret guard would have 403'd anonymous installs.
        $result = Cloud_Client::post('/deletePersona', [
            'persona_id' => $id,
        ]);

        if (is_wp_error($result)) {
            return $result;
        }

        return rest_ensure_response(['success' => true]);
    }

    /**
     * Delete persona from WP post-meta storage.
     */
    private function delete_persona_from_wp($request)
    {
        $id = (int)$request['id'];

        // 1. Safety Check: Don't delete the default persona
        $default_id = (int)get_option('structura_default_persona', 0);
        if ($id === $default_id) {
            return new \WP_Error('delete_failed', __('Cannot delete the default persona.', 'structura'),
                ['status' => 400]);
        }

        // 2. Trash the post (using bypass_trash for a clean wipe, or leave as false to use trash)
        $result = wp_delete_post($id, true);

        if ( ! $result) {
            return new \WP_Error('delete_failed', __('Failed to delete persona.', 'structura'), ['status' => 500]);
        }

        return rest_ensure_response(['success' => true]);
    }

    public function get_visual_settings()
    {
        // 2026-05-01 — cloud is the single source of truth for visual
        // settings. The legacy `structura_visual_settings_authoritative_in_cloud`
        // flag and the WP-options-backed read path are retired:
        // fresh installs go straight to cloud, no migration step,
        // no flag flip. The WP-options helper is preserved below
        // ONLY as a transient backfill for legacy installs whose
        // settings were stored locally before this change — first
        // read from cloud; if cloud is empty AND WP options have
        // values, copy them up once.
        return $this->get_visual_settings_from_cloud();
    }

    /**
     * Fetch visual settings from cloud via REST endpoint.
     *
     * Cloud function is exported as `getVisualSettings`. Response envelope is
     * the standard `['code', 'body', 'raw']` from Cloud_Client::post(); the
     * settings object lives at $result['body']['settings'].
     */
    private function get_visual_settings_from_cloud()
    {
        $license     = Key_Manager::get_license_payload();
        $license_key = $license['key'] ?? '';
        $secret      = $license['secret'] ?? '';
        $site_url    = home_url();

        if ( ! $license_key || ! $secret) {
            return new \WP_Error('auth_failed', 'Unable to authenticate with cloud.', ['status' => 403]);
        }

        $result = Cloud_Client::post('/getVisualSettings', [
            'license_key'       => $license_key,
            'site_url'          => $site_url,
            'activation_secret' => $secret,
        ]);

        if (is_wp_error($result)) {
            return $result;
        }

        // Map cloud format (camelCase) to WP format (snake_case)
        $settings = $result['body']['settings'] ?? null;
        if ( ! $settings) {
            // Return empty/default if cloud has no settings yet
            return rest_ensure_response([
                'global_art_direction' => '',
                'aspect_ratio'         => '16:9',
                'format'               => 'webp',
                'optimize_on_upload'   => false,
                'logo_url'             => get_site_icon_url(256) ?: '',
            ]);
        }

        return rest_ensure_response([
            'global_art_direction' => $settings['globalArtDirection'] ?? '',
            'aspect_ratio'         => $settings['aspectRatio'] ?? '16:9',
            'format'               => $settings['format'] ?? 'webp',
            'optimize_on_upload'   => (bool)($settings['optimizeOnUpload'] ?? false),
            'logo_url'             => get_site_icon_url(256) ?: '',
        ]);
    }

    /**
     * Fetch visual settings from WP option storage.
     */
    private function get_visual_settings_from_wp()
    {
        $logo_url       = '';
        $custom_logo_id = get_theme_mod('custom_logo');
        if ($custom_logo_id) {
            $logo_url = wp_get_attachment_image_url($custom_logo_id, 'full') ?: '';
        }
        if ( ! $logo_url) {
            $logo_url = get_site_icon_url(256) ?: '';
        }

        return rest_ensure_response([
            'global_art_direction' => get_option('structura_visual_art_direction', ''),
            'aspect_ratio'         => get_option('structura_visual_aspect_ratio', '16:9'),
            'format'               => get_option('structura_visual_format', 'webp'),
            'optimize_on_upload'   => get_option('structura_visual_optimize', 'yes') === 'yes',
            'logo_url'             => $logo_url,
        ]);
    }

    public function update_visual_settings($request)
    {
        // 2026-05-01 — cloud is the single source of truth. Always
        // route writes to the cloud endpoint. The WP-options writer
        // (`update_visual_settings_wp`) is preserved below only for
        // migration tooling that may want to reconstruct legacy state.
        return $this->update_visual_settings_cloud($request);
    }

    // =========================================================================
    // VISUAL SETTINGS HANDLERS (SINGLETON CLOUD-SYNC)
    // =========================================================================

    /**
     * Update visual settings in cloud via REST endpoint.
     *
     * Cloud function is exported as `saveVisualSettings` and is the same
     * endpoint the migration tooling calls.
     */
    private function update_visual_settings_cloud($request)
    {
        $params      = $request->get_json_params();
        $license     = Key_Manager::get_license_payload();
        $license_key = $license['key'] ?? '';
        $secret      = $license['secret'] ?? '';
        $site_url    = home_url();

        if ( ! $license_key || ! $secret) {
            return new \WP_Error('auth_failed', 'Unable to authenticate with cloud.', ['status' => 403]);
        }

        // Map WP format (snake_case) to cloud format (camelCase)
        $cloud_settings = [
            'globalArtDirection' => sanitize_textarea_field($params['global_art_direction'] ?? ''),
            'aspectRatio'        => sanitize_text_field($params['aspect_ratio'] ?? '16:9'),
            'format'             => sanitize_text_field($params['format'] ?? 'webp'),
            'optimizeOnUpload'   => ! empty($params['optimize_on_upload']),
        ];

        $result = Cloud_Client::post('/saveVisualSettings', [
            'license_key'       => $license_key,
            'site_url'          => $site_url,
            'activation_secret' => $secret,
            'settings'          => $cloud_settings,
        ]);

        if (is_wp_error($result)) {
            return $result;
        }

        // 2026-05-01 — bust the Task_Runner image-gen cache so the
        // next free-tier or BYOK image gen picks up the new style
        // immediately. Without this, a SPA save would only take
        // effect after the 5-minute TTL elapsed.
        if (class_exists(\Structura\Scheduler\Task_Runner::class)) {
            \Structura\Scheduler\Task_Runner::invalidate_visual_settings_cache();
        }

        return rest_ensure_response(['success' => true]);
    }

    /**
     * Update visual settings in WP option storage.
     */
    private function update_visual_settings_wp($request)
    {
        $params = $request->get_json_params();

        update_option('structura_visual_art_direction', sanitize_textarea_field($params['global_art_direction'] ?? ''));
        update_option('structura_visual_aspect_ratio', sanitize_text_field($params['aspect_ratio'] ?? '16:9'));
        update_option('structura_visual_format', sanitize_text_field($params['format'] ?? 'webp'));
        update_option('structura_visual_optimize', ! empty($params['optimize_on_upload']) ? 'yes' : 'no');

        return rest_ensure_response(['success' => true]);
    }

    /**
     * Force-refresh the remote model catalog.
     *
     * Clears the cached transient and in-memory memo, then re-fetches
     * from the cloud endpoint. Useful when:
     * - A new provider was added server-side and the cache is stale
     * - The setup wizard shows zero models for a provider
     */
    public function refresh_models()
    {
        Provider_Registry::invalidate_models_cache();

        // Re-fetch immediately so the subsequent GET /models returns fresh data
        return $this->get_available_models(new \WP_REST_Request());
    }

    public function get_available_models($request)
    {
        $plan      = License_Manager::get_plan();
        $providers = Provider_Registry::get_providers_for_tier($plan);
        $provider  = sanitize_text_field($request->get_param('provider') ?? '');

        $text_list  = [];
        $image_list = [];
        $defaults   = [];

        $provider_ids = $provider ? [$provider] : array_keys($providers);

        foreach ($provider_ids as $pid) {
            if ( ! isset($providers[$pid])) {
                continue;
            }

            $text_models  = Provider_Registry::get_models($pid, 'text');
            $image_models = Provider_Registry::get_models($pid, 'image');

            foreach ($text_models as $m) {
                $entry = ['id' => $m['id'], 'name' => $m['name'], 'provider' => $pid];
                if ( ! empty($m['warning'])) {
                    $entry['warning'] = $m['warning'];
                }
                // Phase 1.6 follow-up — surface the per-entry quality
                // flags so the SPA model picker can (a) hide `fast: true`
                // models from the BYOK dropdown (fast underperforms on
                // long-form text and we don't want users picking it for
                // post generation) and (b) pin a "Recommended" badge on
                // the `recommended: true` model. Cloud catalog already
                // sets these flags; previous strip dropped them.
                if ( ! empty($m['fast'])) {
                    $entry['fast'] = true;
                }
                if ( ! empty($m['recommended'])) {
                    $entry['recommended'] = true;
                }
                $text_list[] = $entry;
            }
            foreach ($image_models as $m) {
                $entry = ['id' => $m['id'], 'name' => $m['name'], 'provider' => $pid];
                if ( ! empty($m['warning'])) {
                    $entry['warning'] = $m['warning'];
                }
                if ( ! empty($m['fast'])) {
                    $entry['fast'] = true;
                }
                if ( ! empty($m['recommended'])) {
                    $entry['recommended'] = true;
                }
                $image_list[] = $entry;
            }

            $defaults[$pid] = [
                'text'  => Provider_Registry::get_default_model($pid, 'text'),
                'fast'  => Provider_Registry::get_default_model($pid, 'fast'),
                'image' => Provider_Registry::get_default_model($pid, 'image'),
            ];
        }

        return rest_ensure_response([
            'text'     => $text_list,
            'image'    => $image_list,
            'defaults' => $defaults,
        ]);
    }

    public function save_api_key($request)
    {
        $provider = sanitize_text_field($request['provider']);
        $key      = sanitize_text_field($request['key']);
        // Optional friendly label — falls back to the WordPress site name
        // so the cloud library doesn't end up with a wall of "OpenAI" /
        // "Gemini" rows once an agency stocks their workspace from
        // multiple sites. The label is purely a display affordance for
        // the portal; the resolver doesn't read it.
        $label = isset($request['label']) ? sanitize_text_field($request['label']) : '';
        if ($label === '') {
            $site_name = get_bloginfo('name');
            $label = $site_name !== '' ? $site_name : (string)wp_parse_url(home_url(), PHP_URL_HOST);
        }

        // Validate provider is accessible for the user's tier
        if ( ! Provider_Registry::validate_provider_access($provider)) {
            return new \WP_Error(
                'provider_not_available',
                __('This provider is not available on your current plan.', 'structura'),
                ['status' => 403],
            );
        }

        // Phase 5c (specs/v2/cloud-only-generation.md) — keys live in the
        // cloud now, encrypted under our master key, and bound to this
        // activation via the workspace's `aiBindings` map. The plugin
        // forwards rather than persisting locally; the response carries
        // back the masked key for the wp-admin "is this the key I just
        // pasted?" UX.
        $response = Cloud_Client::post('/saveProviderCredential', [
            'provider' => $provider,
            'label'    => $label,
            'apiKey'   => $key,
        ]);
        if (is_wp_error($response)) {
            return new \WP_Error(
                'cloud_save_failed',
                $response->get_error_message(),
                ['status' => 502],
            );
        }
        $body = is_array($response) ? ($response['body'] ?? []) : [];
        $code = is_array($response) ? (int)($response['code'] ?? 0) : 0;
        if ($code < 200 || $code >= 300 || empty($body['success'])) {
            $error = is_array($body) && isset($body['error']) ? (string)$body['error']
                : __('Failed to save the provider key in the cloud.', 'structura');
            return new \WP_Error('cloud_save_failed', $error, ['status' => $code ?: 502]);
        }

        // Clear both old and new model caches + invalidate the
        // per-request bindings cache so any subsequent read in this
        // same WP request (e.g. the SPA refetching `get_settings`)
        // sees the new "connected" state.
        delete_transient('structura_model_list');
        Provider_Registry::invalidate_models_cache();
        Cloud_Client::reset_provider_bindings_cache();

        return rest_ensure_response([
            'success' => true,
            'masked'  => isset($body['maskedKey']) ? (string)$body['maskedKey'] : $this->mask_key($key),
            'credId'  => isset($body['credId']) ? (string)$body['credId'] : '',
        ]);
    }

    /**
     * UNIFIED SETTINGS FETCH
     * Returns everything needed for both Settings.tsx and AIEngine.tsx
     */
    public function get_settings()
    {
        // Phase 5c — connected/masked state comes from the cloud's
        // activation bindings (specs/v2/cloud-only-generation.md). One
        // round trip per settings load is fine; the cloud caches per-
        // process and the wp-admin SPA debounces its own refetches via
        // TanStack Query staleness. Failure modes (no bearer, expired
        // license) collapse to "no providers connected" so the page
        // still renders rather than 502'ing on the whole settings call.
        $bindings_by_provider = $this->fetch_cloud_provider_bindings();

        return rest_ensure_response(self::build_settings_payload($bindings_by_provider));
    }

    /**
     * Build the unified settings payload that the SPA's `useSettingsQuery`
     * consumes. Pulled out as a public static helper so the page-load
     * bootstrap (`Admin_Dashboard::enqueue_scripts`) can inject the same
     * shape into `window.structuraConfig.bootstrap_settings` without
     * making the cloud round-trip a critical-path call.
     *
     * Provider bindings are accepted as an argument rather than fetched
     * here on purpose: the bootstrap path runs synchronously inside
     * `wp_localize_script`, so any cloud HTTP would block the wp-admin
     * page render. Pass `[]` from bootstrap; the SPA's first
     * revalidation against `/structura/v1/settings` re-fills the
     * connected/masked fields with live cloud state ~500ms later.
     *
     * @param array $bindings_by_provider Map of provider_id => binding
     *                                    (cloud `listProviderCredentials`
     *                                    shape) or `[]` to render every
     *                                    provider as `connected: false`.
     *
     * @return array
     */
    public static function build_settings_payload(array $bindings_by_provider = []): array
    {
        $plan           = License_Manager::get_plan();
        $full_catalog   = Provider_Registry::get_all_providers();
        $tier_available = Provider_Registry::get_providers_for_tier($plan);
        $providers      = [];

        foreach ($tier_available as $id => $meta) {
            $default_text  = Provider_Registry::get_default_model($id, 'text');
            $default_image = Provider_Registry::get_default_model($id, 'image');
            $binding       = $bindings_by_provider[$id] ?? null;

            $providers[$id] = [
                'connected'    => $binding !== null,
                'masked_key'   => is_array($binding) && isset($binding['maskedKey'])
                    ? (string)$binding['maskedKey']
                    : '',
                'capabilities' => $meta['capabilities'],
                'text_model'   => get_option("structura_text_model_{$id}", $default_text),
                'image_model'  => get_option("structura_image_model_{$id}", $default_image),
            ];
        }

        return [
            'license'               => License_Manager::get_license_data(),
            'general'               => [
                'delete_data_on_uninstall' => get_option('structura_delete_data_on_uninstall', 'no') === 'yes',
                // Log retention: on by default at install (activation hook seeds
                // the options), but fall back gracefully for sites that
                // upgraded before the feature landed.
                // log_retention_enabled / log_retention_days were retired
                // in Phase 3b (spec/v2/notification-center.md §8.1). The
                // option keys are deleted on plugin upgrade; the SPA's
                // Log Retention card was removed in the same slice.
                // Debug mode field removed when the toggle was retired
                // (see UnifiedSettings in client/src/features/settings/types.ts
                // for the matching SPA-side note).
            ],
            'ai'                    => [
                'providers'       => $providers,
                'catalog'         => $full_catalog,
                'defaults'        => [
                    'text_provider'  => get_option('structura_default_text_provider', ''),
                    'image_provider' => get_option('structura_default_image_provider', ''),
                ],
                'has_text'        => Provider_Registry::has_text_provider($plan),
                'has_image'       => Provider_Registry::has_image_provider($plan),
                'models_fallback' => Provider_Registry::is_using_fallback(),
            ],
            'onboarding_dismissed'  => (bool)get_user_meta(get_current_user_id(), 'structura_guide_dismissed', true),
            'free_banner_dismissed' => (bool)get_user_meta(get_current_user_id(), 'structura_free_banner_dismissed',
                true),
            'scheduler_simple_mode' => self::get_user_meta_with_default('structura_scheduler_simple_mode', true),
        ];
    }

    /**
     * Reads a user meta value with a fallback default when the key doesn't exist.
     * WordPress get_user_meta returns "" for non-existent keys, which (bool)"" = false,
     * making it impossible to distinguish "never set" from "explicitly set to false".
     */
    private static function get_user_meta_with_default(string $key, $default = false)
    {
        $raw = get_user_meta(get_current_user_id(), $key, true);

        // "" means the key was never stored — use the default.
        return $raw === '' ? $default : (bool)$raw;
    }

    public function update_settings($request)
    {
        $params = $request->get_json_params();

        // Handle General Settings
        if (isset($params['general'])) {
            $g = $params['general'];
            if (isset($g['delete_data_on_uninstall'])) {
                update_option('structura_delete_data_on_uninstall', $g['delete_data_on_uninstall'] ? 'yes' : 'no');
            }
            // Phase 3b — `log_retention_*` fields are no longer
            // accepted on the settings POST. Sending them is a
            // no-op rather than an error so older clients in flight
            // during the rollout window degrade gracefully.
            // Debug mode handler removed when the toggle was retired —
            // older SPA builds that still POST `debug_mode_enabled` are
            // ignored. The option keys are dropped on plugin upgrade
            // via `Loader::on_plugin_updated`.
        }

        // Handle AI Config
        if (isset($params['ai'])) {
            $ai = $params['ai'];

            // Per-provider model overrides (generic — works for any provider ID)
            $all_providers = Provider_Registry::get_all_providers();
            foreach ($all_providers as $pid => $_meta) {
                if (isset($ai[$pid])) {
                    $pdata = $ai[$pid];
                    if (isset($pdata['text_model'])) {
                        update_option("structura_text_model_{$pid}", sanitize_text_field($pdata['text_model']));
                    }
                    if (isset($pdata['image_model'])) {
                        update_option("structura_image_model_{$pid}", sanitize_text_field($pdata['image_model']));
                    }
                }
            }

            // Default provider selections
            if (isset($ai['defaults'])) {
                $defaults = $ai['defaults'];
                if (isset($defaults['text_provider'])) {
                    update_option('structura_default_text_provider', sanitize_key($defaults['text_provider']));
                }
                if (isset($defaults['image_provider'])) {
                    update_option('structura_default_image_provider', sanitize_key($defaults['image_provider']));
                }
            }
        }

        if (isset($params['onboarding_dismissed'])) {
            update_user_meta(get_current_user_id(), 'structura_guide_dismissed',
                boolval($params['onboarding_dismissed']));
        }

        if (isset($params['free_banner_dismissed'])) {
            update_user_meta(get_current_user_id(), 'structura_free_banner_dismissed',
                boolval($params['free_banner_dismissed']));
        }

        if (isset($params['scheduler_simple_mode'])) {
            update_user_meta(get_current_user_id(), 'structura_scheduler_simple_mode',
                boolval($params['scheduler_simple_mode']));
        }

        delete_transient('structura_model_list');

        return rest_ensure_response(['success' => true]);
    }

    /**
     * GET /site-profile — return the current public-site profile state.
     *
     * Reads through {@see Public_Site_Profile::load()} so the SPA always
     * receives a fully-populated object, including the WP-derived
     * defaults that don't live in the option (name, tagline, language,
     * logoUrl, homeUrl). This lets the headless toggle render its
     * "Inherits everything from this WordPress install" copy without a
     * second query.
     *
     * Spec: `specs/site-identity-headless.md` §5.
     */
    public function get_site_profile()
    {
        $profile = Public_Site_Profile::load();

        return rest_ensure_response([
            'name'                 => $profile->name,
            'tagline'              => $profile->tagline,
            'language'             => $profile->language,
            'logoUrl'              => $profile->logoUrl,
            'homeUrl'              => $profile->homeUrl,
            'publicUrl'            => $profile->publicUrl,
            'isHeadless'           => $profile->isHeadless,
            'description'          => $profile->description,
            'keyPages'             => $profile->keyPages,
            'permalinkStrategy'    => $profile->permalinkStrategy,
            'permalinkTemplate'    => $profile->permalinkTemplate,
            'defaultPermalinkLang' => $profile->defaultPermalinkLang,
        ]);
    }

    /**
     * POST /site-profile — persist the operator's headless-mode config.
     *
     * Only the headless override fields are writable (the brand surface
     * comes from WP's own getters and is mirrored to the cloud via
     * `Site_Identity_Sync` automatically). Validation matches the
     * cloud-side `normaliseSiteIdentity` shape: same enum, same length
     * caps, same keyPages role allowlist.
     *
     * Writing the option triggers `update_option_structura_public_site_profile`,
     * which `Site_Identity_Sync` subscribes to — the headless override
     * lands on the cloud activation doc within one debounce window.
     *
     * Spec: `specs/site-identity-headless.md` §4 + §5.
     */
    public function update_site_profile($request)
    {
        $params = $request->get_json_params();
        if ( ! is_array($params)) {
            return new \WP_Error(
                'invalid_payload',
                __('Request body must be a JSON object.', 'structura'),
                ['status' => 400]
            );
        }

        // Pull only the writable fields. Anything else (homeUrl, name,
        // tagline, etc.) is ignored — those come from WP getters and
        // can't be overridden through this endpoint.
        $allowed_strategies = [
            Public_Site_Profile::STRATEGY_INHERIT,
            Public_Site_Profile::STRATEGY_PREFIX_SWAP,
            Public_Site_Profile::STRATEGY_TEMPLATE,
        ];
        $allowed_roles = [
            'about', 'features', 'services', 'pricing',
            'case_studies', 'blog_index', 'contact', 'other',
        ];

        $public_url = isset($params['publicUrl']) ? esc_url_raw((string)$params['publicUrl']) : '';
        if ($public_url !== '' && ! preg_match('#^https?://#i', $public_url)) {
            // Reject non-https?: schemes here rather than silently dropping
            // — this is operator-facing, surfacing the error helps them
            // fix the typo immediately.
            return new \WP_Error(
                'invalid_public_url',
                __('Public website URL must start with https://', 'structura'),
                ['status' => 400]
            );
        }

        $strategy = isset($params['permalinkStrategy']) ? (string)$params['permalinkStrategy'] : Public_Site_Profile::STRATEGY_INHERIT;
        if ( ! in_array($strategy, $allowed_strategies, true)) {
            $strategy = Public_Site_Profile::STRATEGY_INHERIT;
        }

        // keyPages: validate each entry. Drop malformed; cap at the
        // documented max. Mirrors `Public_Site_Profile::sanitize_key_pages`
        // and the cloud-side `normaliseKeyPage`.
        $key_pages = [];
        if (isset($params['keyPages']) && is_array($params['keyPages'])) {
            foreach ($params['keyPages'] as $page) {
                if ( ! is_array($page)) continue;
                $url   = isset($page['url']) ? esc_url_raw((string)$page['url']) : '';
                $label = isset($page['label']) ? sanitize_text_field((string)$page['label']) : '';
                $role  = isset($page['role']) ? (string)$page['role'] : '';

                if ($url === '' || ! preg_match('#^https?://#i', $url)) continue;
                if ($label === '') continue;
                if ( ! in_array($role, $allowed_roles, true)) continue;

                $key_pages[] = [
                    'url'   => $url,
                    'label' => $label,
                    'role'  => $role,
                ];
                if (count($key_pages) >= Public_Site_Profile::KEY_PAGES_MAX) break;
            }
        }

        $option = [
            'isHeadless'           => isset($params['isHeadless']) ? (bool)$params['isHeadless'] : false,
            'publicUrl'            => $public_url !== '' ? rtrim($public_url, '/') : '',
            'description'          => isset($params['description'])
                ? mb_substr(
                    sanitize_textarea_field((string)$params['description']),
                    0,
                    Public_Site_Profile::DESCRIPTION_MAX_LEN
                )
                : '',
            'keyPages'             => $key_pages,
            'permalinkStrategy'    => $strategy,
            'permalinkTemplate'    => isset($params['permalinkTemplate'])
                ? sanitize_text_field((string)$params['permalinkTemplate'])
                : '',
            'defaultPermalinkLang' => isset($params['defaultPermalinkLang'])
                ? sanitize_text_field((string)$params['defaultPermalinkLang'])
                : '',
        ];

        update_option(Public_Site_Profile::OPTION_NAME, $option);

        // Re-load to return the canonical state — the SPA uses the
        // response to refresh its draft (avoids a double GET right
        // after save).
        return $this->get_site_profile();
    }

    /**
     * POST /site-profile/quick-setup — proxy to cloud `scrapePublicSite`.
     *
     * Returns proposals (`description`, `keyPages`) that the SPA
     * displays in a confirmation modal. Does NOT mutate the option —
     * the operator reviews and clicks Save through the regular
     * `update_site_profile` path.
     *
     * Auth: standard activation pattern (license_key + activation_secret
     * over HTTPS), same as every other cloud-bound call from the plugin.
     *
     * Spec: `specs/site-identity-headless.md` §4 (Quick setup).
     */
    public function quick_setup_site_profile($request)
    {
        $params     = $request->get_json_params();
        $public_url = isset($params['publicUrl']) ? esc_url_raw((string)$params['publicUrl']) : '';
        if ($public_url === '' || ! preg_match('#^https?://#i', $public_url)) {
            return new \WP_Error(
                'invalid_public_url',
                __('Provide a valid https:// URL before running Quick setup.', 'structura'),
                ['status' => 400]
            );
        }

        $license = Key_Manager::get_license_payload();
        if ( ! $license || empty($license['key']) || empty($license['secret'])) {
            // No activation yet — Quick setup needs to authenticate
            // against the cloud. Surface a clear error rather than a
            // generic 500.
            return new \WP_Error(
                'no_active_license',
                __('Connect your license before running Quick setup.', 'structura'),
                ['status' => 400]
            );
        }

        $body = [
            'licenseKey'       => $license['key'],
            'domain'           => wp_parse_url(get_site_url(), PHP_URL_HOST),
            'publicUrl'        => rtrim($public_url, '/'),
        ];

        $result = Cloud_Client::post('/scrapePublicSite', $body, ['timeout' => 30]);

        if (is_wp_error($result)) {
            return new \WP_Error(
                'cloud_unreachable',
                __('Could not reach the Structura cloud. Try again in a moment.', 'structura'),
                ['status' => 502, 'cloud_error' => $result->get_error_message()]
            );
        }

        $code = (int)($result['code'] ?? 0);
        $body_decoded = is_string($result['body'] ?? null)
            ? json_decode($result['body'], true)
            : ($result['body'] ?? null);

        if ($code !== 200 || ! is_array($body_decoded) || empty($body_decoded['success'])) {
            // Pass the cloud's error code through if we have one — the
            // SPA copy keys off it ("scrape_failed" → "Couldn't reach the
            // public site", etc.).
            return new \WP_Error(
                (string)($body_decoded['error'] ?? 'cloud_error'),
                (string)($body_decoded['message'] ?? __('Quick setup failed.', 'structura')),
                ['status' => $code >= 400 ? $code : 502]
            );
        }

        return rest_ensure_response([
            'success'  => true,
            'proposed' => $body_decoded['proposed'] ?? [],
            'cached'   => (bool)($body_decoded['cached'] ?? false),
        ]);
    }

    /**
     * GET /channels/indexnow/key — return the active IndexNow key plus
     * a composed `keyLocation` URL the SPA uses to pre-fill the
     * credentials form before saving an IndexNow connection.
     *
     * Reads the key from {@see IndexNow_Key_Service::ensure_key()}, so
     * the first call ever lands the key on the activation. Subsequent
     * calls are idempotent — same key, same composed location.
     *
     * Spec: `specs/site-identity-headless.md` §6.
     */
    public function get_indexnow_key()
    {
        $key          = IndexNow_Key_Service::ensure_key();
        $key_location = IndexNow_Key_Service::build_key_location($key);
        $public_url   = IndexNow_Key_Service::public_origin();

        return rest_ensure_response([
            'key'         => $key,
            'keyLocation' => $key_location,
            'publicUrl'   => $public_url,
            // Headless mode flips the upload-instructions copy on the
            // SPA side — explicit boolean here saves a second roundtrip
            // through `/site-profile`.
            'isHeadless'  => \Structura\Core\Public_Site_Profile::load()->isHeadless,
        ]);
    }

    /**
     * POST /channels/indexnow/{id}/verify — proxy to the cloud
     * `verifyIndexNowKeyfile` endpoint. Surfaces the cloud's typed
     * response verbatim so the SPA can render code-specific copy
     * (`unreachable` vs `content_mismatch` vs `invalid_key`).
     *
     * Auth: standard activation handshake (license_key +
     * activation_secret over HTTPS). Capability gate matches the rest
     * of the channel REST surface.
     *
     * Spec: `specs/site-identity-headless.md` §6.
     */
    public function verify_indexnow_keyfile($request)
    {
        $connection_id = (string)$request->get_param('id');
        if ($connection_id === '') {
            return new \WP_Error(
                'missing_connection_id',
                __('Missing connection id.', 'structura'),
                ['status' => 400]
            );
        }

        $license = Key_Manager::get_license_payload();
        if ( ! $license || empty($license['key']) || empty($license['secret'])) {
            return new \WP_Error(
                'no_active_license',
                __('Connect your license before verifying IndexNow.', 'structura'),
                ['status' => 400]
            );
        }

        // The cloud's `authenticateActivation` helper expects `site_url`
        // (not `domain` — that was the pre-2026-05-01 shape and it's
        // what the rest of the channel proxies in this file already
        // send). Mismatched keys make the cloud emit
        // `400 "Malformed payload."`, which is what the user saw on
        // every "Verify" click. Yurii incident 2026-05-01.
        $body = [
            'license_key'        => $license['key'],
            'site_url'           => home_url(),
            'activation_secret'  => $license['secret'],
            'connection_id'      => $connection_id,
        ];

        $result = Cloud_Client::post('/verifyIndexNowKeyfile', $body, ['timeout' => 30]);

        if (is_wp_error($result)) {
            return new \WP_Error(
                'cloud_unreachable',
                __('Could not reach the Structura cloud. Try again in a moment.', 'structura'),
                ['status' => 502, 'cloud_error' => $result->get_error_message()]
            );
        }

        $code = (int)($result['code'] ?? 0);
        $body_decoded = is_string($result['body'] ?? null)
            ? json_decode($result['body'], true)
            : ($result['body'] ?? null);

        if ($code !== 200 || ! is_array($body_decoded)) {
            return new \WP_Error(
                (string)($body_decoded['error'] ?? 'cloud_error'),
                (string)($body_decoded['message'] ?? __('Verification failed.', 'structura')),
                ['status' => $code >= 400 ? $code : 502]
            );
        }

        // Pass the cloud body through untouched. The SPA branches on
        // `verified` (boolean) and `error.code` (typed) to render the
        // status badge + recovery copy.
        return rest_ensure_response($body_decoded);
    }

    /**
     * GET /notices — proxy the user-facing Notification Center list to
     * the cloud. Spec: `specs/v2/notification-center.md` §5.2.
     *
     * The plugin REST surface is the single auth boundary for wp-admin
     * SPA calls; we forward to `noticesList` on the cloud with the
     * activation's bearer token (attached automatically by
     * `Cloud_Client::post`). Pagination + status filters pass through
     * unchanged. Empty body on a clean response — the SPA's TanStack
     * Query layer interprets `notices: []` as "all clear."
     */
    public function get_notices($request)
    {
        $statuses = $request->get_param('statuses');
        $payload  = [];
        // Normalise the statuses param to the cloud's accepted shape —
        // accept `?statuses=open,acknowledged` or repeated `statuses[]`.
        if (is_array($statuses)) {
            $payload['statuses'] = array_values(array_filter(
                array_map('sanitize_text_field', $statuses),
                static fn($s) => in_array($s, ['open', 'acknowledged', 'resolved'], true)
            ));
        } elseif (is_string($statuses) && $statuses !== '') {
            $payload['statuses'] = array_values(array_filter(
                array_map('trim', explode(',', $statuses)),
                static fn($s) => in_array($s, ['open', 'acknowledged', 'resolved'], true)
            ));
        }
        $limit = (int)$request->get_param('limit');
        if ($limit > 0) {
            $payload['limit'] = $limit;
        }
        $cursor = $request->get_param('cursor');
        if (is_string($cursor) && $cursor !== '') {
            $payload['cursor'] = sanitize_text_field($cursor);
        }

        $result = Cloud_Client::post('/noticesList', $payload);
        if (is_wp_error($result)) {
            return $result;
        }
        return rest_ensure_response($result['body']);
    }

    /**
     * POST /notices/acknowledge — flip a notice to `acknowledged`.
     * Body: `{ noticeId: string }`. Cloud validates ownership.
     */
    public function acknowledge_notice($request)
    {
        $notice_id = sanitize_text_field((string)$request->get_param('noticeId'));
        if ($notice_id === '') {
            return new \WP_Error(
                'bad_request',
                __('noticeId is required.', 'structura'),
                ['status' => 400]
            );
        }
        $result = Cloud_Client::post('/noticesAcknowledge', ['noticeId' => $notice_id]);
        if (is_wp_error($result)) {
            return $result;
        }
        return rest_ensure_response($result['body']);
    }

    /**
     * POST /diagnostics/run — execute the WP-side environment probes
     * (scheduler / version / compat) and forward each finding to the
     * cloud's noticesReport endpoint. Returns a small summary the SPA
     * uses to render a toast.
     *
     * Spec: `specs/v2/notification-center.md` §11.2 — user-triggered
     * only, never on bootstrap; the button is the single entry point.
     *
     * The route deliberately doesn't accept any input — the diagnostic
     * set is server-decided so the SPA can't ask for partial runs that
     * skip a check the cloud expects to always observe.
     */
    public function run_diagnostics()
    {
        $summary = Diagnostics::run();
        return rest_ensure_response([
            'success'   => true,
            'checksRun' => $summary['checksRun'],
            'findings'  => $summary['findings'],
        ]);
    }

    /**
     * POST /notices/dismiss — flip a notice to `resolved`
     * (`resolvedBy: "user"`). Body: `{ noticeId: string }`.
     */
    public function dismiss_notice($request)
    {
        $notice_id = sanitize_text_field((string)$request->get_param('noticeId'));
        if ($notice_id === '') {
            return new \WP_Error(
                'bad_request',
                __('noticeId is required.', 'structura'),
                ['status' => 400]
            );
        }
        $result = Cloud_Client::post('/noticesDismiss', ['noticeId' => $notice_id]);
        if (is_wp_error($result)) {
            return $result;
        }
        return rest_ensure_response($result['body']);
    }

    /**
     * Handle license activation from the React UI
     */
    public function activate_license_endpoint($request)
    {
        $params = $request->get_json_params();
        $key    = sanitize_text_field($params['key'] ?? '');

        if (empty($key)) {
            return new \WP_Error('missing_key', __('Please enter a license key.', 'structura'), ['status' => 400]);
        }

        // This calls the logic we wrote in License_Manager
        $result = License_Manager::activate($key);

        if (isset($result['success']) && $result['success'] === true) {
            return rest_ensure_response([
                'success' => true,
                'message' => __('License activated successfully!', 'structura'),
                'data'    => License_Manager::get_license_data(),
            ]);
        }

        // Handle API errors (e.g., "Limit reached" or "Invalid key")
        $error_msg = $result['error'] ?? __('Activation failed. Please check your key and try again.', 'structura');

        return new \WP_Error('activation_failed', $error_msg, ['status' => 403]);
    }

    /**
     * Handle license deactivation
     */
    public function deactivate_license_endpoint(\WP_REST_Request $request)
    {
        // `purge` (default false) opts into a hard remove — delete the cloud
        // activation (and the workspace when it's the last site) instead of a
        // reversible soft disconnect. Set by the removal dialog's
        // "permanently delete all data" checkbox.
        $purge   = (bool) $request->get_param('purge');
        $success = License_Manager::deactivate($purge);

        if ($success) {
            return rest_ensure_response([
                'success' => true,
                'message' => $purge
                    ? __('Site removed.', 'structura')
                    : __('License deactivated.', 'structura'),
                'data'    => License_Manager::get_license_data(),
            ]);
        }

        return new \WP_Error('deactivate_failed', __('Could not deactivate license.', 'structura'), ['status' => 500]);
    }

    /**
     * Hard-delete this site's activation doc on the cloud and clear
     * every local trace of prior activation. The SPA's "Forget this
     * site" recovery flow ends here.
     *
     * Auth: the user re-enters their license key in the SPA confirm
     * dialog and we forward it as the cloud's auth boundary — at this
     * point the previously-stashed bearer is gone (Disconnect already
     * cleared `structura_license_data`), so we can't authenticate any
     * other way. The cloud verifies key ownership and matches the
     * activation by `surfaceMetadata.siteUrl == domain`.
     */
    public function forget_site_endpoint($request)
    {
        $params = $request->get_json_params();
        $key    = sanitize_text_field($params['key'] ?? '');

        if (empty($key)) {
            return new \WP_Error(
                'missing_key',
                __('Please enter your license key to confirm.', 'structura'),
                ['status' => 400]
            );
        }

        $result = License_Manager::forget_site($key);

        if (isset($result['success']) && $result['success'] === true) {
            return rest_ensure_response([
                'success' => true,
                'message' => $result['message'] ?? __('Site removed from your activations.', 'structura'),
            ]);
        }

        $error_msg = $result['error'] ?? __('Could not remove this site. Please try again.', 'structura');
        $status    = isset($result['code']) && (int) $result['code'] >= 400 ? (int) $result['code'] : 500;

        return new \WP_Error('forget_failed', $error_msg, ['status' => $status]);
    }

    public function sync_license_plan($request)
    {
        $new_plan = sanitize_text_field($request->get_param('plan'));

        if (empty($new_plan)) {
            return new \WP_Error('missing_params', 'Plan is required.', ['status' => 400]);
        }

        $success = License_Manager::sync_plan($new_plan);

        return rest_ensure_response([
            'success' => $success,
            'plan'    => $new_plan,
            'message' => __('License plan synchronized with cloud.', 'structura'),
        ]);
    }

    /**
     * SPA-facing proxy for `/checkLicenseStatus`. Browser JavaScript
     * cannot speak the Phase 3.5 bearer protocol because the activation-
     * bound token lives in `wp_options` and must never leak to the
     * client. The SPA POSTs here, the handler relays through
     * `Cloud_Client::post()` which injects the bearer, and we forward
     * the cloud's JSON body back unchanged so the existing client-side
     * shape (entitlements + grace periods + activationStatus) keeps
     * working with no SPA-side decoding changes.
     *
     * Returns the cloud body as-is on a 200; surfaces 4xx/5xx as
     * `success:false` with the cloud's message preserved so the SPA
     * sync useEffect can still tell "active" from "anything else"
     * without firing the destructive plan="none" path on transport
     * errors.
     */
    public function license_cloud_status_endpoint()
    {
        $data = Key_Manager::get_license_payload();
        if ( ! is_array($data) || empty($data['key'])) {
            return rest_ensure_response([
                'plan'    => null,
                'status'  => null,
                'message' => __('No license bound to this site.', 'structura'),
            ]);
        }

        $result = Cloud_Client::post('/checkLicenseStatus', [
            'domain'    => wp_parse_url(get_site_url(), PHP_URL_HOST),
            'plan'      => $data['plan'] ?? 'none',
            'wpVersion' => get_bloginfo('version'),
        ], ['timeout' => 15]);

        if (is_wp_error($result)) {
            // Transport failure (network blip, cloud down). Return a
            // sentinel that the SPA can recognize as "no fresh signal"
            // — must NOT look like an authoritative "your plan is now
            // none" response, or the auto-sync would deactivate the
            // license on every WP page load whenever the cloud blips.
            return rest_ensure_response([
                'plan'    => null,
                'status'  => null,
                'message' => $result->get_error_message(),
                'transport_error' => true,
            ]);
        }

        $code = (int) ($result['code'] ?? 0);
        $body = $result['body'];

        if ( ! is_array($body)) {
            return rest_ensure_response([
                'plan'    => null,
                'status'  => null,
                'message' => __('Invalid server response format.', 'structura'),
                'transport_error' => true,
            ]);
        }

        // Forward the cloud body verbatim on 200. On 4xx/5xx, normalise
        // to the SPA's expected envelope shape (plan/status/message)
        // while preserving the cloud's error wording.
        if ($code === 200) {
            // Opportunistically cache the workspace audience next to the
            // plan (2026-06-07). Activation + the daily heartbeat persist
            // it going forward, but installs activated BEFORE the field
            // existed would otherwise flash the name-only badge label for
            // up to a day — this proxy fires on the SPA's first paid
            // mount, so the cache heals on the very next page load.
            if (array_key_exists('audience', $body)
                && ($body['audience'] ?? null) !== ($data['audience'] ?? null)
            ) {
                $data['audience'] = $body['audience'];
                Key_Manager::save_license_payload($data);
            }

            return rest_ensure_response($body);
        }

        return rest_ensure_response([
            'plan'    => null,
            'status'  => null,
            'message' => $body['error'] ?? $body['message'] ?? __('Cloud heartbeat rejected.', 'structura'),
            'transport_error' => true,
            'http_code' => $code,
        ]);
    }

    public function get_recent_blueprints($request)
    {
        $campaign_filter = $request->get_param('campaign_id');
        $page            = max(1, (int)($request->get_param('page') ?: 1));
        $per_page        = max(1, min(50, (int)($request->get_param('per_page') ?: 10)));

        $meta_query = [];

        if ($campaign_filter) {
            // `_structura_campaign_id` stores the cloud campaign's
            // nanoid (string like "lZQOnYgB6XZH4lk0J3-rJ"), not an int
            // — the v2 cloud-authoritative writes in Task_Runner stamp
            // the raw nanoid via `update_post_meta`. Pre-fix this query
            // cast the filter to (int) with `type: NUMERIC`, which made
            // MySQL coerce every non-numeric stored string to 0 in the
            // comparison: every campaign id cast to 0, every stored
            // nanoid cast to 0, so 0 = 0 matched EVERY post on the site
            // and a freshly-created campaign's "Recent Posts" widget
            // showed posts that actually belonged to other campaigns.
            //
            // String equality is the right compare here — both the
            // legacy numeric WP ids and the cloud nanoids round-trip
            // through it correctly.
            $meta_query[] = [
                'key'     => '_structura_campaign_id',
                'value'   => (string)$campaign_filter,
                'compare' => '=',
            ];
        } else {
            $meta_query[] = [
                'key'     => '_structura_campaign_id',
                'compare' => 'EXISTS',
            ];
        }

        $count_query = new \WP_Query([
            'post_type'           => 'any',
            'ignore_sticky_posts' => true,
            'posts_per_page'      => -1,
            'fields'              => 'ids',
            'meta_query'          => $meta_query,
        ]);

        $total_items = $count_query->found_posts;
        $total_pages = (int)ceil($total_items / $per_page);

        $args = [
            'post_type'           => 'any',
            'ignore_sticky_posts' => true,
            'posts_per_page'      => $per_page,
            'paged'               => $page,
            'meta_query'          => $meta_query,
        ];

        $query   = new \WP_Query($args);
        $posts   = [];
        // Load the profile once and reuse — the posts list can run into
        // dozens of rows per page and `Public_Site_Profile::load()` does
        // a `get_option` + `get_theme_mod` on every call. One snapshot
        // per response is plenty given this method renders into a single
        // SPA view.
        $profile = Public_Site_Profile::load();

        foreach ($query->posts as $post) {
            // 2026-05-01 v2 — `_structura_campaign_id` is mixed type
            // (nanoid string for cloud-auth posts; legacy ints from
            // pre-v2 installs are no longer expected). Read raw and
            // resolve via cloud.
            $post_campaign_id = (string) get_post_meta($post->ID, '_structura_campaign_id', true);
            $campaign         = $post_campaign_id !== ''
                ? Campaign_Cloud_Reader::get_campaign_data($post_campaign_id)
                : null;

            // get_userdata() returns false when the post_author no longer
            // exists (deleted user, or post_author=0 from a legacy import).
            // Reading ->display_name on false raises a PHP 8.1+ warning, so
            // resolve to a safe fallback string instead.
            $author_user = $post->post_author ? get_userdata($post->post_author) : false;
            $author_name = $author_user ? $author_user->display_name : __('Unknown', 'structura');

            $posts[] = [
                'id'          => $post->ID,
                'campaign_id' => $post_campaign_id,
                'title'       => get_the_title($post),
                'status'      => $post->post_status,
                'date'        => get_the_date('M j, g:i A', $post),
                // Public-facing permalink — in headless mode the SPA
                // shows the front-end URL (xerx.io/blog/...) so the
                // operator's "View" link lands somewhere readers
                // actually see.
                'permalink'   => $profile->permalink_for_post((int)$post->ID),
                'edit_link'   => get_edit_post_link($post, ''),
                'thumbnail'   => get_the_post_thumbnail_url($post, 'thumbnail'),
                'author'      => $author_name,
                // Display hint only — prefer the split textProvider; the
                // legacy `provider` fallback is defensive for any meta row
                // that hasn't been re-saved through the split-aware path.
                'model'       => $campaign['intelligence']['textProvider'] ?? $campaign['intelligence']['provider'] ?? __('Unknown',
                        'structura'),
            ];
        }

        return rest_ensure_response([
            'data'       => $posts,
            'pagination' => [
                'current_page' => $page,
                'total_pages'  => $total_pages,
                'total_items'  => $total_items,
            ],
        ]);
    }

    /**
     * GET /channels/connections — return the activation's saved connection
     * summaries (no secret material). The cloud already scrubs the encrypted
     * blob; this handler is a straight pass-through.
     */
    public function channels_list_connections($request)
    {
        $result = $this->channels_connections()->list_connections();
        if (is_wp_error($result)) {
            return $result;
        }

        return rest_ensure_response($result);
    }

    private function channels_connections(): Channels_Connections_Service_Interface
    {
        if ($this->channels_connections === null) {
            $this->channels_connections = new Channels_Connections_Service();
        }

        return $this->channels_connections;
    }

    /**
     * POST /channels/connections/webhook — create or replace a webhook-style
     * connection. Body must contain `integration_id` and `webhook_url`;
     * `display_name`, `notification_locale`, and `signing_secret` are
     * optional on the wire but `signing_secret` is required by the cloud
     * for signed integrations (webhook-ping).
     *
     * `notification_locale` accepts `"system"` (follow the event's site locale
     * at dispatch time — the install-modal default) or one of the supported
     * base codes (`"en"`, `"de"`, `"es"`, `"fr"`). The cloud normalizes any
     * unknown value to `"system"`, so we purposely don't re-validate the
     * allow-list here — that keeps older plugins forward-compatible if a new
     * locale is added cloud-side.
     *
     * `signing_secret` is an HMAC secret for integrations that sign outbound
     * deliveries. We do NOT validate its length/shape here (the cloud enforces
     * a 16-char minimum and returns a readable 400 if it's too short) so the
     * plugin stays forward-compatible if the cloud tightens or loosens the
     * rules without a plugin release. We also intentionally avoid
     * `sanitize_text_field` on the raw secret — it collapses whitespace runs
     * and strips newlines, which would mutate a user's pasted secret and make
     * HMAC verification silently fail on the consumer side. Instead we
     * hex/base64-shape-check the bytes and pass them through verbatim.
     */
    public function channels_save_webhook_connection($request)
    {
        $integration_id = sanitize_text_field((string)$request->get_param('integration_id'));
        // Webhook URL is validated structurally on the cloud side by the
        // integration's own validateTarget(); we only do the WP-standard
        // url sanitization here so the value is safe to log.
        $webhook_url         = esc_url_raw((string)$request->get_param('webhook_url'));
        $display_param       = $request->get_param('display_name');
        $display_name        = is_string($display_param) && $display_param !== ''
            ? sanitize_text_field($display_param)
            : null;
        $locale_param        = $request->get_param('notification_locale');
        $notification_locale = is_string($locale_param) && $locale_param !== ''
            ? sanitize_text_field($locale_param)
            : null;
        // `connection_id` is only sent by the Edit flow; Install omits it so
        // the cloud mints a fresh UUID. Sanitize + nullify empty strings so
        // the service contract receives null rather than "" for "no value".
        $connection_param = $request->get_param('connection_id');
        $connection_id    = is_string($connection_param) && $connection_param !== ''
            ? sanitize_text_field($connection_param)
            : null;

        // Signing secret: shape-restrict to the character set a real secret
        // would use (hex, base64url, punctuation). Anything outside this set
        // is almost certainly a stray paste artifact (rich-text ellipsis,
        // smart quotes), and letting it through would hand the cloud a secret
        // the user's consumer could never reproduce. Falsy/absent → null so
        // the service contract gets null rather than "".
        $signing_param  = $request->get_param('signing_secret');
        $signing_secret = null;
        if (is_string($signing_param) && $signing_param !== '') {
            $candidate = trim($signing_param);
            if ($candidate !== '' && preg_match('/^[A-Za-z0-9_\-+=\/]+$/', $candidate)) {
                $signing_secret = $candidate;
            }
        }

        if ($integration_id === '' || $webhook_url === '') {
            return new \WP_Error(
                'channels_invalid_input',
                __('Integration id and webhook URL are required.', 'structura'),
                ['status' => 400],
            );
        }

        $result = $this->channels_connections()->save_webhook_connection(
            $integration_id,
            $webhook_url,
            $display_name,
            $notification_locale,
            $connection_id,
            $signing_secret,
        );
        if (is_wp_error($result)) {
            return $result;
        }

        return rest_ensure_response($result);
    }

    /**
     * POST /channels/connections/settings — patch the user-managed fields
     * on an existing connection (campaign bindings, locale, cadence) without
     * touching tokens or secrets. Used by both the post-OAuth configure
     * modal and the per-row Edit affordance.
     *
     * `bound_campaign_ids` is mixed-type (int post id for legacy
     * WP-authoritative campaigns, string nanoid for cloud-authoritative)
     * and is passed through verbatim — see Channel_Event_Forwarder for
     * the int-cast bug class this carefully avoids.
     */
    public function channels_update_connection_settings($request)
    {
        $connection_id = sanitize_text_field((string)$request->get_param('connection_id'));
        if ($connection_id === '') {
            return new \WP_Error(
                'channels_invalid_input',
                __('Connection id is required.', 'structura'),
                ['status' => 400],
            );
        }

        $locale_param        = $request->get_param('notification_locale');
        $notification_locale = is_string($locale_param) && $locale_param !== ''
            ? sanitize_text_field($locale_param)
            : null;

        // Bindings: null sentinel means "leave untouched"; an empty array
        // means "explicitly clear any existing binding." Anything that's
        // neither array nor null is treated as null so a malformed payload
        // doesn't accidentally wipe the user's selection.
        $bindings_param      = $request->get_param('bound_campaign_ids');
        $bound_campaign_ids  = null;
        if (is_array($bindings_param)) {
            $bound_campaign_ids = [];
            foreach ($bindings_param as $v) {
                if (is_int($v) || (is_string($v) && $v !== '')) {
                    $bound_campaign_ids[] = is_string($v) ? sanitize_text_field($v) : $v;
                }
            }
        }

        // Cadence: clamp at the REST boundary to [1, 50] so a malicious or
        // typoed client can't park the connection in a never-firing state.
        // The cloud re-clamps with the same range — defense in depth.
        $cadence_param  = $request->get_param('post_cadence_n');
        $post_cadence_n = null;
        if (is_numeric($cadence_param)) {
            $post_cadence_n = max(1, min(50, (int)$cadence_param));
        }

        // "Attach featured image" toggle for publishable+image channels
        // (LinkedIn, X). Accept only an explicit boolean; everything
        // else falls through as `null` (= "leave the cloud value
        // untouched"). `WP_REST_Request::get_param` returns the raw
        // value from the request body — JSON true / false comes through
        // as PHP `bool`; the `false === null`-style edge would silently
        // strip the field. cms.formulafoundry.io 2026-05-22 hit this
        // exact bug: the toggle's `false` was being dropped on the wire
        // because the REST handler didn't read the field at all.
        $attach_featured_image_param = $request->get_param('attach_featured_image');
        $attach_featured_image       = is_bool($attach_featured_image_param)
            ? $attach_featured_image_param
            : null;

        // LinkedIn posting-target switch. `null` (param absent) means "leave
        // the target untouched"; an empty string is the meaningful "switch to
        // personal profile" sentinel, and a non-empty value is an org URN the
        // cloud validates against the connection's administered Pages. Read
        // with `is_string` (not truthiness) so the empty-string sentinel
        // survives the wire — mirrors the attach_featured_image bug class.
        $org_urn_param              = $request->get_param('selected_organization_urn');
        $selected_organization_urn  = is_string($org_urn_param)
            ? sanitize_text_field($org_urn_param)
            : null;

        // Video channel voice/style ids. Shape-restricted to the slug charset
        // real ids use (`ava`, `clean`, …) so stray markup can't ride the
        // wire, but NOT allow-listed here — the cloud owns the catalog of
        // valid ids, and a new voice cloud-side must not need a plugin
        // release (same forward-compat stance as `notification_locale`).
        $video_voice = $this->sanitize_video_choice($request->get_param('video_voice'));
        $video_style = $this->sanitize_video_choice($request->get_param('video_style'));

        $result = $this->channels_connections()->update_connection_settings(
            $connection_id,
            $notification_locale,
            $bound_campaign_ids,
            $post_cadence_n,
            $attach_featured_image,
            $selected_organization_urn,
            $video_voice,
            $video_style,
        );
        if (is_wp_error($result)) {
            return $result;
        }

        return rest_ensure_response($result);
    }

    /**
     * Normalize a video voice/style request param to a lowercase slug, or
     * null when absent/invalid. Ids are cloud-defined slugs (`[a-z0-9_-]`);
     * anything else is a paste artifact we drop rather than forward.
     *
     * @param mixed $value Raw request param.
     */
    private function sanitize_video_choice($value): ?string
    {
        if (! is_string($value) || $value === '') {
            return null;
        }
        $candidate = strtolower(sanitize_text_field($value));

        return preg_match('/^[a-z0-9_-]+$/', $candidate) === 1 ? $candidate : null;
    }

    /**
     * POST /channels/video/retry — retry a failed video render, or
     * regenerate an expired one, via the cloud `channelsVideoRetry`
     * endpoint. Body: `{ job_id }`. Returns `{ success, jobId }` on
     * success; cloud failures come back as WP_Error with the cloud's own
     * message so the SPA toast is actionable.
     */
    public function channels_video_retry($request)
    {
        $job_id = sanitize_text_field((string)$request->get_param('job_id'));

        if ($job_id === '') {
            return new \WP_Error(
                'channels_invalid_input',
                __('Video job id is required.', 'structura'),
                ['status' => 400],
            );
        }

        $result = $this->channels_events()->retry_video($job_id);
        if (is_wp_error($result)) {
            return $result;
        }

        return rest_ensure_response($result);
    }

    /**
     * POST /channels/connections/credential — create or replace a credential-style
     * connection (email-owner, telegram, whatsapp). Body must contain
     * `integration_id` and a `credentials` map; `display_name` and
     * `notification_locale` are optional.
     *
     * The `credentials` map is forwarded verbatim to the cloud — per-integration
     * validation lives in the cloud endpoint so the WP side stays
     * forward-compatible as new integrations ship.
     */
    public function channels_save_credential_connection($request)
    {
        $integration_id = sanitize_text_field((string)$request->get_param('integration_id'));

        // Credentials come as a flat key/value map. We sanitize each value
        // individually but pass the structure through so cloud-side validation
        // can enforce per-integration schemas.
        $raw_credentials = $request->get_param('credentials');
        $credentials     = [];
        if (is_array($raw_credentials)) {
            foreach ($raw_credentials as $key => $value) {
                if (is_string($key) && is_string($value)) {
                    $credentials[sanitize_text_field($key)] = sanitize_text_field($value);
                }
            }
        }

        $display_param       = $request->get_param('display_name');
        $display_name        = is_string($display_param) && $display_param !== ''
            ? sanitize_text_field($display_param)
            : null;
        $locale_param        = $request->get_param('notification_locale');
        $notification_locale = is_string($locale_param) && $locale_param !== ''
            ? sanitize_text_field($locale_param)
            : null;
        $connection_param    = $request->get_param('connection_id');
        $connection_id       = is_string($connection_param) && $connection_param !== ''
            ? sanitize_text_field($connection_param)
            : null;

        if ($integration_id === '') {
            return new \WP_Error(
                'channels_invalid_input',
                __('Integration id is required.', 'structura'),
                ['status' => 400],
            );
        }

        $result = $this->channels_connections()->save_credential_connection(
            $integration_id,
            $credentials,
            $display_name,
            $notification_locale,
            $connection_id,
        );
        if (is_wp_error($result)) {
            return $result;
        }

        return rest_ensure_response($result);
    }

    /**
     * DELETE /channels/connections/{connection_key} — hard-delete a single
     * connection. The path segment is either the post-migration UUID
     * (`connection.connectionId`) or a legacy integration id for pre-migration
     * rows that predate the UUID doc-id move; the cloud handler accepts both
     * via its `connection_id` / `integration_id` fallback.
     *
     * Idempotent — a stale UI hitting this route a second time still returns
     * 200 so no duplicate-click error state is needed on the client.
     */
    public function channels_delete_connection($request)
    {
        $connection_key = sanitize_text_field((string)$request->get_param('connection_key'));

        if ($connection_key === '') {
            return new \WP_Error(
                'channels_invalid_input',
                __('Connection id is required.', 'structura'),
                ['status' => 400],
            );
        }

        $result = $this->channels_connections()->delete_connection($connection_key);
        if (is_wp_error($result)) {
            return $result;
        }

        return rest_ensure_response($result);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  CHANNELS — connection management proxy
    // ──────────────────────────────────────────────────────────────────────

    /**
     * GET /channels/events — return the activation's recent channel events.
     *
     * The React client (`useChannelEventsQuery`) expects a bare array of
     * events, not the cloud envelope `{success, events}`. This handler
     * unwraps so the client shape stays simple; on failure we forward the
     * `WP_Error` unchanged so the exact cloud reason reaches the UI.
     */
    public function channels_list_events($request)
    {
        $raw_limit = $request->get_param('limit');
        $limit     = is_numeric($raw_limit) ? (int)$raw_limit : 25;
        if ($limit <= 0) {
            $limit = 25;
        }

        $result = $this->channels_events()->list_events($limit);
        if (is_wp_error($result)) {
            return $result;
        }

        $events = is_array($result['events'] ?? null) ? $result['events'] : [];

        return rest_ensure_response($events);
    }

    private function channels_events(): Channels_Events_Service_Interface
    {
        if ($this->channels_events === null) {
            $this->channels_events = new Channels_Events_Service();
        }

        return $this->channels_events;
    }

    /**
     * GET /runs/{run_id} — return a single CampaignRun doc for the progress
     * drawer.
     *
     * Two short-circuits happen before we touch the cloud:
     *   1. A per-request in-memory cache. WordPress has no sub-second
     *      transients (minimum granularity is 1s), but the progress drawer
     *      can call this route multiple times within one page-load during
     *      a re-render storm. A static array deduplicates those.
     *
     * The response shape is passed through verbatim from the cloud:
     * `{ success: true, run: RunStatusSerialized }`. The React client keys
     * every access through `data.run.*` (see `useCampaignRunQuery.ts`
     * `RunQueryResponse`), so unwrapping here would make every callsite
     * read `undefined` — that was a real bug caught 2026-04-22 where the
     * progress strip stuck in "Starting…" and the run detail page showed
     * an infinite loader because the bridge was stripping the envelope
     * the client's types declared.
     *
     * Spec: specs/progress-stream.md §7.
     */
    public function runs_get($request)
    {
        $run_id = (string)$request->get_param('run_id');
        $run_id = sanitize_text_field($run_id);

        if ($run_id === '') {
            return new \WP_Error(
                'runs_missing_param',
                __('run_id is required.', 'structura'),
                ['status' => 400],
            );
        }

        // Per-request memoization. The drawer re-renders several times per
        // second during the first milestone transitions, and an unchanged
        // runId hitting `runs_get` twice in one pageload should only cost
        // one cloud round-trip. The static resets on every PHP request, so
        // there's no risk of staleness bleeding across polls.
        static $memo = [];
        if (isset($memo[$run_id])) {
            return $memo[$run_id];
        }

        $result = $this->runs()->get_run($run_id);

        // Dispatch-failure synthesis path: when the local plugin
        // recorded a `Dispatch_Failure_Tracker` sentinel for this
        // runId AND the cloud returned 404 / unreachable, the SPA
        // would otherwise poll forever waiting for a CampaignRunDoc
        // the cloud never created. Substitute a synthetic terminal-
        // failed response so the polling loop hits a stop on its next
        // tick. We check ONLY when the cloud's answer is 404 / WP_Error
        // — a real cloud doc always wins.
        $cloud_unreachable = $this->is_cloud_unreachable_response($result);
        if ($cloud_unreachable) {
            $sentinel = \Structura\Progress\Dispatch_Failure_Tracker::get($run_id);
            if (is_array($sentinel)) {
                $synthetic = \Structura\Progress\Dispatch_Failure_Tracker::synthesize_failed_run(
                    $sentinel,
                    ''
                );
                $response      = rest_ensure_response($synthetic);
                $memo[$run_id] = $response;
                return $response;
            }
        }

        if (is_wp_error($result)) {
            // Don't memoize errors — a transient cloud blip shouldn't
            // poison the next poll. The client's polling cadence is
            // already our de-facto backoff.
            return $result;
        }

        // Pass the cloud body through as-is. The client's
        // `useCampaignRunQuery` types the payload as
        // `{ success: true, run: RunStatusSerialized }` and every consumer
        // reads through `data.run.*`, so stripping the envelope here would
        // silently break every downstream component (progress strip,
        // RunDetailPage, useRunStatusToasts). If a future caller needs a
        // bare run, they should do that unwrap on the client side.
        $response      = rest_ensure_response($result);
        $memo[$run_id] = $response;

        return $response;
    }

    /**
     * Decide whether a runs-service response looks like "cloud said
     * the run doesn't exist" — either an explicit 404 / `run_not_found`
     * or a transport-layer WP_Error. Used by the dispatch-failure
     * synthesis path to know when to substitute a local sentinel.
     *
     * @param mixed $result Whatever runs_get returned — array on
     *                      success, WP_Error on transport / 404.
     */
    private function is_cloud_unreachable_response($result): bool
    {
        if (is_wp_error($result)) {
            // WP_Error covers cURL transport failures (connect timeout,
            // DNS, etc.) AND the runs-service's normalized 404 (which
            // it returns as a WP_Error with code `run_not_found`).
            return true;
        }
        if ( ! is_array($result)) {
            return false;
        }
        // Some success-shaped responses still encode a `run_not_found`
        // body without raising WP_Error — defensive against either
        // shape variant.
        $body = $result['body'] ?? null;
        if (is_array($body) && isset($body['error']) && $body['error'] === 'run_not_found') {
            return true;
        }
        if (isset($result['code']) && (int) $result['code'] === 404) {
            return true;
        }
        return false;
    }

    private function runs(): Runs_Service_Interface
    {
        if ($this->runs === null) {
            $this->runs = new Runs_Service();
        }

        return $this->runs;
    }

    /**
     * GET /runs — list runs needing attention (Needs Attention widget).
     *
     * Returns the array of unacknowledged `failed` +
     * `succeeded_with_warnings` runs directly (not wrapped in `{ runs }`)
     * so the client can `useQuery` it as an array without unwrapping.
     * The cloud caps server-side at 50; the widget caps visually at 10.
     *
     * Spec: specs/run-detail-view.md §6.
     */
    public function runs_list_attention($request)
    {
        $result = $this->runs()->list_attention_runs(50);
        if (is_wp_error($result)) {
            return $result;
        }

        $runs = is_array($result['runs'] ?? null) ? $result['runs'] : [];

        return rest_ensure_response($runs);
    }

    /**
     * GET /campaigns/{campaign_id}/runs — historical run list for the
     * Campaign detail "Runs" tab.
     *
     * Returns the array of runs directly (not wrapped in `{ runs }`)
     * so the client can `useQuery<Run[]>` without unwrapping — same
     * contract as `runs_list_attention`. Ordered newest-first by the
     * cloud.
     *
     * Spec: specs/progress-stream.md §8 (surfaces inventory — Runs tab).
     */
    public function campaign_runs_list($request)
    {
        // Diagnostic — confirm whether the Runs tab fetch actually hits
        // the plugin's REST endpoint. If the SPA's request never reaches
        // here, the empty Runs tab state is a route or permission issue
        // upstream of this handler. Strip after Phase 1.0c testing is
        // signed off.
        if (defined('WP_DEBUG') && WP_DEBUG) {
            // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log,WordPress.PHP.DevelopmentFunctions.error_log_var_export -- WP_DEBUG-gated diagnostic; see comment above.
            error_log('[campaign_runs_list] HIT — raw_param=' . var_export($request->get_param('campaign_id'), true));
        }

        // Phase 1.0c §4 — `campaign_id` is `int|string` (legacy WP post id
        // or cloud nanoid). The previous `(int)` cast silently zero'd
        // nanoids whose first character was a letter, causing the SPA's
        // Runs tab to render "Couldn't load run history" with a generic
        // 400 — distinguishable from a real cloud failure only by reading
        // debug.log. Keep the raw value, validate non-empty.
        $raw_id = $request->get_param('campaign_id');
        if ($raw_id === null || $raw_id === '' || $raw_id === 0 || $raw_id === '0') {
            if (defined('WP_DEBUG') && WP_DEBUG) {
                // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- WP_DEBUG-gated diagnostic.
                error_log('[campaign_runs_list] EARLY RETURN — missing campaign_id');
            }
            return new \WP_Error(
                'runs_missing_param',
                __('campaign_id is required.', 'structura'),
                ['status' => 400],
            );
        }
        $campaign_id = is_string($raw_id) ? sanitize_text_field($raw_id) : (int)$raw_id;
        if (defined('WP_DEBUG') && WP_DEBUG) {
            // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log,WordPress.PHP.DevelopmentFunctions.error_log_var_export -- WP_DEBUG-gated diagnostic.
            error_log('[campaign_runs_list] resolved campaign_id=' . var_export($campaign_id, true));
        }

        // Clamp to the cloud's server-side ceiling here too so a
        // misconfigured caller doesn't even incur the cloud round-trip.
        $limit = (int)$request->get_param('limit');
        if ($limit <= 0) {
            $limit = 20;
        }
        $limit = max(1, min($limit, 50));

        if (defined('WP_DEBUG') && WP_DEBUG) {
            // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- WP_DEBUG-gated diagnostic.
            error_log('[campaign_runs_list] about to call Runs_Service::list_runs_for_campaign');
        }
        $result = $this->runs()->list_runs_for_campaign($campaign_id, $limit);
        if (is_wp_error($result)) {
            if (defined('WP_DEBUG') && WP_DEBUG) {
                // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- WP_DEBUG-gated diagnostic.
                error_log('[campaign_runs_list] Runs_Service returned WP_Error: ' . $result->get_error_code() . ' — ' . $result->get_error_message());
            }
            return $result;
        }
        if (defined('WP_DEBUG') && WP_DEBUG) {
            // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- WP_DEBUG-gated diagnostic.
            error_log('[campaign_runs_list] Runs_Service returned: ' . wp_json_encode(array_keys((array) $result)));
        }

        $runs = is_array($result['runs'] ?? null) ? $result['runs'] : [];
        if (defined('WP_DEBUG') && WP_DEBUG) {
            // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- WP_DEBUG-gated diagnostic.
            error_log('[campaign_runs_list] returning ' . count($runs) . ' runs to SPA');
        }

        return rest_ensure_response($runs);
    }

    /**
     * GET /runs/active — currently-in-flight runs across ALL campaigns.
     *
     * Powers the SPA's refresh-recovery path: when the admin reloads a
     * wp-admin page, `RunsContext.activeRunId` resets to null (it's
     * in-memory UI state, not persisted), so any surface that self-gates
     * on it — the inline progress strip on a campaign card, the
     * live-status badge — disappears even while a cloud run is still
     * executing. This endpoint returns at most 10 non-terminal rows
     * (queued or running), newest-started first; the client pushes the
     * freshest row into RunsContext to light the right surface back up.
     *
     * Returns the array of runs directly (not wrapped in `{ runs }`),
     * matching the contract the other list endpoints follow.
     *
     * Spec: specs/progress-stream.md §3 (refresh recovery).
     */
    public function runs_active_list($request)
    {
        $limit = (int)$request->get_param('limit');
        if ($limit <= 0) {
            $limit = 10;
        }
        // Clamp to the cloud's hard 10-row ceiling here too so a
        // misconfigured caller doesn't waste a round-trip.
        $limit = max(1, min($limit, 10));

        $result = $this->runs()->list_active_runs($limit);
        if (is_wp_error($result)) {
            return $result;
        }

        $runs = is_array($result['runs'] ?? null) ? $result['runs'] : [];

        return rest_ensure_response($runs);
    }

    /**
     * GET /runs/single — list the most recent ephemeral runs (one-off
     * `/generate` submissions) for the dashboard's "Recent generations"
     * widget. Newest-first; cloud clamps to 1..50.
     *
     * Same response shape as `runs_active_list` and `campaign_runs_list`
     * — bare array of `RunStatusSerialized` so the SPA hook can type the
     * payload uniformly.
     */
    public function runs_single_list($request)
    {
        $limit = (int)$request->get_param('limit');
        if ($limit <= 0) {
            $limit = 10;
        }
        $limit = max(1, min($limit, 50));

        $result = $this->runs()->list_single_post_runs($limit);
        if (is_wp_error($result)) {
            return $result;
        }

        $runs = is_array($result['runs'] ?? null) ? $result['runs'] : [];

        return rest_ensure_response($runs);
    }

    /**
     * POST /runs/{run_id}/acknowledge — Dismiss a row from the Needs
     * Attention widget.
     *
     * Idempotent — re-acknowledging an already-acknowledged run simply
     * refreshes the timestamp. The dismissing admin's WP user id is
     * captured so support conversations can identify who cleared what.
     *
     * Spec: specs/run-detail-view.md §6.5 + §8.
     */
    public function runs_acknowledge($request)
    {
        $run_id = sanitize_text_field((string)$request->get_param('run_id'));
        if ($run_id === '') {
            return new \WP_Error(
                'runs_missing_param',
                __('run_id is required.', 'structura'),
                ['status' => 400],
            );
        }

        // `check_permission` already gates on `manage_options`, so
        // `wp_get_current_user()` is guaranteed to return a real user
        // here. We still defend against the edge (lost session, unit
        // tests, etc.) rather than trusting the gate transitively.
        $user    = wp_get_current_user();
        $user_id = $user && $user->ID ? (int)$user->ID : 0;
        if ($user_id <= 0) {
            return new \WP_Error(
                'rest_forbidden',
                __('Active admin session required.', 'structura'),
                ['status' => 403],
            );
        }

        $result = $this->runs()->acknowledge_run($run_id, $user_id);
        if (is_wp_error($result)) {
            return $result;
        }

        // Bust the cross-wp-admin attention-notice cache so the banner's
        // next render picks up the new acknowledged state within a page
        // navigation (rather than the 60 s transient TTL). The notice
        // and the Needs Attention widget share the same underlying
        // cloud data, so keeping them in lockstep avoids a "SPA says
        // acknowledged, native banner still lists it" drift.
        \Structura\Ui\Attention_Admin_Notice::bust_cache();

        return rest_ensure_response(['success' => true]);
    }

    /**
     * POST /runs/{run_id}/unacknowledge — reverse of /acknowledge.
     * Wired to the ~10s Undo toast in the Needs Attention widget.
     *
     * Spec: specs/run-detail-view.md §6.5 + §8.
     */
    public function runs_unacknowledge($request)
    {
        $run_id = sanitize_text_field((string)$request->get_param('run_id'));
        if ($run_id === '') {
            return new \WP_Error(
                'runs_missing_param',
                __('run_id is required.', 'structura'),
                ['status' => 400],
            );
        }

        $result = $this->runs()->unacknowledge_run($run_id);
        if (is_wp_error($result)) {
            return $result;
        }

        // See the twin call in runs_acknowledge — same rationale.
        \Structura\Ui\Attention_Admin_Notice::bust_cache();

        return rest_ensure_response(['success' => true]);
    }

    /**
     * POST /scheduler/runs/cancel — cancel a campaign run.
     *
     * Called by the SPA when:
     *   - User clicks "Stop Run" button (cancelled_by: "user")
     *   - Polling hits max-attempts cap without seeing run start
     *     (cancelled_by: "system")
     *
     * Spec: none yet (part of run-cancellation infrastructure).
     */
    public function runs_cancel($request)
    {
        $run_id        = sanitize_text_field((string)$request->get_param('run_id'));
        $cancelled_by  = sanitize_text_field((string)$request->get_param('cancelled_by'));
        $cancel_reason = sanitize_text_field((string)$request->get_param('cancel_reason'));

        if ($run_id === '' || $cancelled_by === '') {
            return new \WP_Error(
                'runs_missing_param',
                __('run_id and cancelled_by are required.', 'structura'),
                ['status' => 400],
            );
        }

        if ( ! in_array($cancelled_by, ['user', 'system'], true)) {
            return new \WP_Error(
                'runs_invalid_param',
                __('cancelled_by must be "user" or "system".', 'structura'),
                ['status' => 400],
            );
        }

        $result = $this->runs()->cancel_run(
            $run_id,
            $cancelled_by,
            $cancel_reason !== '' ? $cancel_reason : null,
        );
        if (is_wp_error($result)) {
            return $result;
        }

        return rest_ensure_response(['success' => true]);
    }

    /**
     * GET /channels/catalog — return the cloud integration catalog with
     * per-caller entitlement. Straight pass-through: the response envelope
     * from the cloud is exactly what the React Store expects.
     */
    public function channels_list_catalog($request)
    {
        $result = $this->channels_connections()->list_catalog();
        if (is_wp_error($result)) {
            return $result;
        }

        return rest_ensure_response($result);
    }

    /**
     * POST /channels/oauth/init — kick off the OAuth flow for an integration.
     *
     * The client sends `{ integration_id }` and receives `{ authorizeUrl }` in
     * return. The `redirect_uri` (the cloud callback URL) is assembled here
     * based on the cloud base URL — the client never needs to know it.
     *
     * The React InstallModal redirects the browser to `authorizeUrl` after
     * receiving the response. The provider authorization page then bounces
     * back to the cloud callback endpoint (not WP), which persists the
     * connection and redirects to wp-admin.
     */
    public function channels_oauth_init($request)
    {
        $integration_id = sanitize_text_field($request->get_param('integration_id') ?? '');

        if ($integration_id === '') {
            return new \WP_Error(
                'channels_missing_param',
                __('integration_id is required.', 'structura'),
                ['status' => 400],
            );
        }

        // Build the redirect_uri pointing at the cloud's callback endpoint.
        // The cloud's callback parses the integration id out of the URL path
        // (functions/src/channels/endpoints/oauth-callback.ts: `/:integrationId/callback`),
        // and every provider (LinkedIn, X, …) requires exact-match registration
        // of the URL we hand to their authorize endpoint, so the suffix must
        // be present here — not just at callback time.
        // STRUCTURA_API_BASE is the same base URL Cloud_Client uses.
        $cloud_base   = rtrim(STRUCTURA_API_BASE, '/');
        $redirect_uri = $cloud_base
            . '/channelsOAuthCallback/'
            . rawurlencode($integration_id)
            . '/callback';

        // The cloud's callback lands the user on this URL after the OAuth
        // dance. Passing `admin_url(...)` explicitly is the only way to
        // get the right destination on subdirectory installs, multisite,
        // or sites that have rewritten the admin path via a login-URL
        // plugin — the cloud has no way to derive any of that from
        // `home_url()` or the activation's stored `siteUrl`.
        //
        // Only ONE top-level admin menu page is registered:
        // `page=structura` (Admin_Dashboard mounts the SPA at
        // `#structura-root`). Earlier this constant pointed at a
        // `page=structura-channels` slug that doesn't exist — WP fell
        // through to its "Sorry, you are not allowed to access this
        // page" wall (2026-05-21 cms.xerx.io report). The Channels
        // surface is an SPA route under hash routing, so we append
        // `#/channels/connections` to land directly on the
        // connections list when the callback redirects back.
        $return_url = admin_url('admin.php?page=structura') . '#/channels/connections';

        // Posting target — LinkedIn only. The React install modal sends
        // `post_as: "organization"` when the user picks "A company page I
        // manage", which makes the cloud request the company-page OAuth
        // scopes. Anything else falls through as personal-profile posting.
        $post_as_param = $request->get_param('post_as');
        $post_as       = ($post_as_param === 'organization') ? 'organization' : '';

        $result = $this->channels_connections()->init_oauth($integration_id, $redirect_uri, $return_url, $post_as);
        if (is_wp_error($result)) {
            return $result;
        }

        return rest_ensure_response([
            'success'      => true,
            'authorizeUrl' => $result['authorizeUrl'] ?? '',
        ]);
    }

    /**
     * GET /structura/v1/scheduler/campaigns — List campaigns
     *
     * Routes to cloud if flag is set, otherwise uses WP-side storage.
     */
    public function get_campaigns()
    {
        // 2026-05-01 v2 — cloud is the single source of truth.
        // The legacy `structura_campaigns_authoritative_in_cloud`
        // flag is retired; all installs read from cloud. The
        // `*_from_wp` / `*_on_wp` helpers below stay in the file as
        // dead code until the broader cleanup sweep removes them.
        return $this->get_campaigns_from_cloud();
    }

    // =========================================================================
    // Campaign Cloud Proxy Layer (Phase 1.0b)
    // =========================================================================

    private function get_campaigns_from_cloud()
    {
        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }

        $secret_data = Key_Manager::get_license_payload();
        $payload     = [
            'license_key'       => $license['license_key'],
            'site_url'          => wp_parse_url(home_url(), PHP_URL_HOST),
            'activation_secret' => $secret_data['secret'] ?? '',
        ];

        $result = Cloud_Client::post('/listCampaigns', $payload);
        if (is_wp_error($result)) {
            return $result;
        }

        $cloud_campaigns = $result['body']['campaigns'] ?? [];
        $campaigns       = array_map(function ($cloud_doc) {
            return Campaign_Shape_Transformer::cloud_to_wp($cloud_doc);
        }, $cloud_campaigns);

        return rest_ensure_response($campaigns);
    }

    /**
     * Read the shared attention-runs transient and group the newest
     * failed / warning run per `campaignId`.
     *
     * Relies on the cloud's `listUnacknowledgedRuns` returning
     * newest-first (it does — see spec `run-detail-view.md` §6.4),
     * so the first match we see for a given campaign is the most
     * recent signal. We don't warm the cache inline: the campaigns
     * list endpoint is called by the SPA on a hot path and we don't
     * want a cold cache to turn it into a cloud round-trip. A cold
     * cache just means no indicators render this tick; the next
     * refetch will have them.
     *
     * @return array<int, array{runId:string, status:string, endedAt:string, headline:string, errorMessage:string}>
     */
    private function attention_runs_by_campaign(): array
    {
        $cached = get_site_transient(Attention_Admin_Notice::TRANSIENT_KEY);
        if ( ! is_array($cached) || empty($cached)) {
            return [];
        }

        $out = [];
        foreach ($cached as $run) {
            if ( ! is_array($run)) {
                continue;
            }
            $cid = isset($run['campaignId']) ? (int)$run['campaignId'] : 0;
            if ($cid <= 0) {
                continue;
            }
            // First-wins — the cloud orders newest-first, so the first
            // attention entry we see per campaign is the most recent.
            if (isset($out[$cid])) {
                continue;
            }

            $out[$cid] = [
                'runId'        => isset($run['runId']) && is_string($run['runId']) ? $run['runId'] : '',
                'status'       => isset($run['status']) ? (string)$run['status'] : '',
                'endedAt'      => isset($run['endedAt']) && is_string($run['endedAt']) ? $run['endedAt'] : '',
                'headline'     => isset($run['headline']) && is_string($run['headline']) ? $run['headline'] : '',
                'errorMessage' => isset($run['error']['userMessage']) && is_string($run['error']['userMessage'])
                    ? $run['error']['userMessage']
                    : '',
            ];
        }

        return $out;
    }

    /**
     * Map a structured cloud error envelope (HTTP code + JSON body) onto a
     * WP_Error the SPA can branch on, or null when the response isn't an
     * error (<400).
     *
     * The cloud emits tier-policy rejections as HTTP 4xx with a stable
     * `error` code and structured fields:
     *   - `campaign_limit_reached` — { limit, current, tier }
     *   - `cadence_limit_reached`  — { maxPerWeek, weeklyCount, tier }
     * WordPress serialises WP_Error->error_data into the response `data`
     * key, so the SPA receives e.g. `{ code: "cadence_limit_reached",
     * data: { status, maxPerWeek, weeklyCount, tier } }` natively and
     * renders its own translated copy off the structured fields. Any other
     * 4xx is forwarded verbatim so future structured cloud errors surface
     * without another plugin release.
     *
     * Shared by the create and update proxies so the two paths can't drift
     * on how a rejection is surfaced. Spec: tier-policy gates in
     * `functions/src/policy/tier-policy.ts`.
     *
     * @param int   $code Cloud HTTP status.
     * @param array $body Decoded cloud JSON body.
     * @return \WP_Error|null
     */
    private function cloud_campaign_error_to_wp_error($code, $body)
    {
        if ((int) $code < 400) {
            return null;
        }
        $body        = is_array($body) ? $body : [];
        $cloud_error = is_string($body['error'] ?? null) ? $body['error'] : '';

        if ($cloud_error === 'campaign_limit_reached') {
            $message = is_string($body['message'] ?? null) && $body['message'] !== ''
                ? $body['message']
                : __('Campaign limit reached for your current plan.', 'structura');

            return new \WP_Error('campaign_limit_reached', $message, [
                'status'  => (int) $code,
                'limit'   => $body['limit']   ?? null,
                'current' => $body['current'] ?? null,
                'tier'    => $body['tier']    ?? null,
            ]);
        }

        if ($cloud_error === 'cadence_limit_reached') {
            $message = is_string($body['message'] ?? null) && $body['message'] !== ''
                ? $body['message']
                : __('This publishing schedule is more frequent than your current plan allows.', 'structura');

            return new \WP_Error('cadence_limit_reached', $message, [
                'status'      => (int) $code,
                'maxPerWeek'  => $body['maxPerWeek']  ?? null,
                'weeklyCount' => $body['weeklyCount'] ?? null,
                'tier'        => $body['tier']        ?? null,
            ]);
        }

        $message = is_string($body['error'] ?? null) && $body['error'] !== ''
            ? $body['error']
            : __('Cloud rejected the campaign request.', 'structura');

        return new \WP_Error('cloud_error', $message, ['status' => (int) $code]);
    }

    /**
     * POST /structura/v1/scheduler/campaign — Create campaign
     *
     * Routes to cloud if flag is set, otherwise uses WP-side storage.
     */
    public function create_campaign($request)
    {
        // 2026-05-01 v2 — cloud is the single source of truth.
        return $this->create_campaign_on_cloud($request);
    }

    private function create_campaign_on_cloud($request)
    {
        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }

        $params    = $request->get_json_params();
        $validated = Campaign_Validator::validate($params);

        if (is_wp_error($validated)) {
            return $validated;
        }

        $secret_data = Key_Manager::get_license_payload();
        $cloud_shape = Campaign_Shape_Transformer::wp_input_to_cloud($validated);

        $payload = [
            'license_key'       => $license['license_key'],
            'site_url'          => wp_parse_url(home_url(), PHP_URL_HOST),
            'activation_secret' => $secret_data['secret'] ?? '',
            'campaign'          => $cloud_shape,
        ];

        $result = Cloud_Client::post('/postCampaign', $payload);
        if (is_wp_error($result)) {
            return new \WP_Error('cloud_error', $result->get_error_message(), ['status' => 500]);
        }

        // Phase 1.0l + cadence cap — propagate per-tier rejections
        // (campaign-count, weekly-cadence) as structured WP_Errors so the
        // SPA can render a useful "upgrade or change schedule" message
        // rather than a generic 500. Shared mapping lives in
        // cloud_campaign_error_to_wp_error() so create + update stay in
        // sync. Returns null for <400, falling through to success handling.
        $code = (int) ($result['code'] ?? 0);
        $body = is_array($result['body'] ?? null) ? $result['body'] : [];
        $cloud_err = $this->cloud_campaign_error_to_wp_error($code, $body);
        if ($cloud_err instanceof \WP_Error) {
            return $cloud_err;
        }

        $cloud_doc = $body['campaign'] ?? [];
        if (empty($cloud_doc)) {
            return new \WP_Error('cloud_error', __('Cloud did not return campaign document.', 'structura'),
                ['status' => 500]);
        }

        // Phase 1.0c §3 — make the cadence change visible to AS immediately.
        // Invalidating the cache forces the next sync to re-fetch from cloud;
        // the async one-shot fires that sync within seconds rather than
        // waiting up to 15 min for the recurring tick.
        Cloud_Cadence_Sync::invalidate_cache();
        Cloud_Cadence_Sync::queue_immediate_sync();

        return rest_ensure_response([
            'success'     => true,
            'campaign_id' => $cloud_doc['campaignId'] ?? '',
            'message'     => __('New campaign deployed successfully.', 'structura'),
        ]);
    }

    /**
     * PUT /structura/v1/scheduler/campaign/{id} — Update campaign
     *
     * Routes to cloud if flag is set, otherwise uses WP-side storage.
     */
    public function update_campaign($request)
    {
        // 2026-05-01 v2 — cloud is the single source of truth.
        return $this->update_campaign_on_cloud($request);
    }

    private function update_campaign_on_cloud($request)
    {
        $campaign_id = sanitize_text_field($request['id'] ?? '');
        if (empty($campaign_id)) {
            return new \WP_Error('missing_id', __('Campaign ID is required.', 'structura'), ['status' => 400]);
        }

        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }

        $params    = $request->get_json_params();
        $validated = Campaign_Validator::validate($params, true); // Allow partial validation for PATCH

        if (is_wp_error($validated)) {
            return $validated;
        }

        $secret_data = Key_Manager::get_license_payload();
        $cloud_shape = Campaign_Shape_Transformer::wp_input_to_cloud($validated);

        $payload = [
            'license_key'       => $license['license_key'],
            'site_url'          => wp_parse_url(home_url(), PHP_URL_HOST),
            'activation_secret' => $secret_data['secret'] ?? '',
            'campaign_id'       => $campaign_id,
            'campaign'          => $cloud_shape,
        ];

        $result = Cloud_Client::post('/patchCampaign', $payload);
        if (is_wp_error($result)) {
            return new \WP_Error('cloud_error', $result->get_error_message(), ['status' => 500]);
        }

        // Surface structured tier-policy rejections (e.g. a Free campaign
        // edited to publish more than once a week → cadence_limit_reached)
        // the same way the create path does, so the SPA shows an upgrade
        // prompt instead of a bare "no campaign document" error.
        $code = (int) ($result['code'] ?? 0);
        $body = is_array($result['body'] ?? null) ? $result['body'] : [];
        $cloud_err = $this->cloud_campaign_error_to_wp_error($code, $body);
        if ($cloud_err instanceof \WP_Error) {
            return $cloud_err;
        }

        $cloud_doc = $body['campaign'] ?? [];
        if (empty($cloud_doc)) {
            return new \WP_Error('cloud_error', __('Cloud did not return campaign document.', 'structura'),
                ['status' => 500]);
        }

        // See create_campaign_on_cloud() above for the rationale.
        Cloud_Cadence_Sync::invalidate_cache();
        Cloud_Cadence_Sync::queue_immediate_sync();

        return rest_ensure_response([
            'success'     => true,
            'campaign_id' => $campaign_id,
            'message'     => __('Campaign architecture updated.', 'structura'),
        ]);
    }

    /**
     * DELETE /structura/v1/scheduler/campaign/{id} — Delete campaign.
     */
    public function delete_campaign($request)
    {
        // 2026-05-01 v2 — cloud is the single source of truth.
        return $this->delete_campaign_on_cloud($request);
    }

    /**
     * Phase 1.6 follow-up — proxy the cloud's `getCampaignStockSummary`
     * so the SPA's CampaignCard can render a stock-state chip without
     * a direct cloud call. Returns the raw cloud response when the call
     * succeeds and the standard wp_error envelope on failure.
     *
     * Wired only on cloud-authoritative campaigns (Phase 1.0c onwards).
     * Pre-cloud campaigns return a zero-summary so the chip renders as
     * "No stock" gracefully — the feature only applies to cloud-tier
     * campaigns anyway.
     */
    public function get_campaign_stock_summary($request)
    {
        $campaign_id = sanitize_text_field($request['id'] ?? '');
        if (empty($campaign_id)) {
            return new \WP_Error('missing_id', __('Campaign ID is required.', 'structura'), ['status' => 400]);
        }

        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }

        $secret_data = Key_Manager::get_license_payload();
        $payload     = [
            'license_key'       => $license['license_key'],
            'site_url'          => wp_parse_url(home_url(), PHP_URL_HOST),
            'activation_secret' => $secret_data['secret'] ?? '',
            'campaign_id'       => $campaign_id,
        ];

        $result = Cloud_Client::post('/getCampaignStockSummary', $payload);
        if (is_wp_error($result)) {
            return new \WP_Error('cloud_error', $result->get_error_message(), ['status' => 500]);
        }

        $code = (int) ($result['code'] ?? 0);
        if ($code !== 200) {
            return new \WP_Error(
                'cloud_error',
                $result['body']['error'] ?? __('Failed to fetch stock summary.', 'structura'),
                ['status' => 502]
            );
        }

        return rest_ensure_response($result['body'] ?? ['success' => false]);
    }

    /**
     * Shared proxy for the Stock tab's campaign-scoped cloud calls
     * (2026-06-05). All four endpoints share the same auth payload and
     * error envelope; only the cloud path and any extra fields differ.
     *
     * @param string $cloud_path    Cloud function path, e.g. '/listCampaignStock'.
     * @param string $campaign_id   Sanitized campaign id (cloud nanoid).
     * @param array  $extra_payload Additional payload fields (already sanitized).
     * @param string $error_message Fallback error for non-200 cloud replies.
     * @return \WP_REST_Response|\WP_Error
     */
    private function proxy_campaign_stock_call($cloud_path, $campaign_id, array $extra_payload, $error_message)
    {
        if (empty($campaign_id)) {
            return new \WP_Error('missing_id', __('Campaign ID is required.', 'structura'), ['status' => 400]);
        }

        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }

        $secret_data = Key_Manager::get_license_payload();
        $payload     = array_merge([
            'license_key'       => $license['license_key'],
            'site_url'          => wp_parse_url(home_url(), PHP_URL_HOST),
            'activation_secret' => $secret_data['secret'] ?? '',
            'campaign_id'       => $campaign_id,
        ], $extra_payload);

        $result = Cloud_Client::post($cloud_path, $payload);
        if (is_wp_error($result)) {
            return new \WP_Error('cloud_error', $result->get_error_message(), ['status' => 500]);
        }

        $code = (int) ($result['code'] ?? 0);
        if ($code !== 200) {
            return new \WP_Error(
                'cloud_error',
                $result['body']['error'] ?? $error_message,
                ['status' => 502]
            );
        }

        return rest_ensure_response($result['body'] ?? ['success' => false]);
    }

    /**
     * Stock tab — list the campaign's live pre-generated entries
     * (ready / generating / failed) for the card grid. Cloud endpoint:
     * `listCampaignStock`.
     */
    public function get_campaign_stock($request)
    {
        return $this->proxy_campaign_stock_call(
            '/listCampaignStock',
            sanitize_text_field($request['id'] ?? ''),
            [],
            __('Failed to fetch stock.', 'structura')
        );
    }

    /**
     * Stock tab — delete one pre-generated entry. The cloud cancels any
     * in-flight provider batch before removing the doc, so a manual
     * delete can't orphan a provider-side job. Cloud endpoint:
     * `deleteStockEntry`.
     */
    public function delete_campaign_stock_entry($request)
    {
        return $this->proxy_campaign_stock_call(
            '/deleteStockEntry',
            sanitize_text_field($request['id'] ?? ''),
            ['stock_id' => sanitize_text_field($request['stock_id'] ?? '')],
            __('Failed to delete the stock entry.', 'structura')
        );
    }

    /**
     * Stock tab — "Empty stock": discard every live entry. While
     * pre-generation stays enabled the cloud refills the buffer
     * automatically. Cloud endpoint: `clearCampaignStock`.
     */
    public function clear_campaign_stock($request)
    {
        return $this->proxy_campaign_stock_call(
            '/clearCampaignStock',
            sanitize_text_field($request['id'] ?? ''),
            [],
            __('Failed to empty the stock.', 'structura')
        );
    }

    /**
     * Stock tab — "Cancel & regenerate": purge live entries (cancelling
     * in-flight provider batches) and request an immediate refill.
     * Cloud endpoint: `restockCampaign`.
     */
    public function restock_campaign_stock($request)
    {
        return $this->proxy_campaign_stock_call(
            '/restockCampaign',
            sanitize_text_field($request['id'] ?? ''),
            [],
            __('Failed to regenerate the stock.', 'structura')
        );
    }

    /**
     * Phase 1.7 — proxy to the cloud's `bulkEnableCampaignPregeneration`.
     * Wired to the post-upgrade admin notice's "Enable for all" CTA.
     * Returns the cloud's `{ success, flipped, alreadyEnabled }` envelope
     * so the SPA can show a precise confirmation toast.
     */
    public function bulk_enable_pregeneration()
    {
        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }

        $secret_data = Key_Manager::get_license_payload();
        $payload     = [
            'license_key'       => $license['license_key'],
            'site_url'          => wp_parse_url(home_url(), PHP_URL_HOST),
            'activation_secret' => $secret_data['secret'] ?? '',
        ];

        $result = Cloud_Client::post('/bulkEnableCampaignPregeneration', $payload);
        if (is_wp_error($result)) {
            return new \WP_Error('cloud_error', $result->get_error_message(), ['status' => 500]);
        }

        $code = (int) ($result['code'] ?? 0);
        if ($code !== 200) {
            return new \WP_Error(
                'cloud_error',
                $result['body']['error'] ?? __('Failed to enable pre-generation.', 'structura'),
                ['status' => 502]
            );
        }

        return rest_ensure_response($result['body'] ?? ['success' => false]);
    }

    /**
     * Phase 1.7 — record that the current admin user dismissed the
     * pre-generation rollout notice. Stored in user_meta so the notice
     * stays dismissed across page loads. The user-meta key carries the
     * notice version (`pregen_v1`) so future Phase 2 rollouts get a
     * fresh prompt without false-positive "already dismissed" reads
     * from a stale meta value.
     */
    public function dismiss_pregeneration_notice()
    {
        $user_id = get_current_user_id();
        if (!$user_id) {
            return new \WP_Error('not_logged_in', __('Not authenticated.', 'structura'), ['status' => 401]);
        }
        update_user_meta($user_id, 'structura_pregen_v1_notice_dismissed', '1');
        return rest_ensure_response(['success' => true]);
    }

    private function delete_campaign_on_cloud($request)
    {
        $campaign_id = sanitize_text_field($request['id'] ?? '');
        if (empty($campaign_id)) {
            return new \WP_Error('missing_id', __('Campaign ID is required.', 'structura'), ['status' => 400]);
        }

        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }

        $secret_data = Key_Manager::get_license_payload();
        $payload     = [
            'license_key'       => $license['license_key'],
            'site_url'          => wp_parse_url(home_url(), PHP_URL_HOST),
            'activation_secret' => $secret_data['secret'] ?? '',
            'campaign_id'       => $campaign_id,
        ];

        $result = Cloud_Client::post('/deleteCampaign', $payload);
        if (is_wp_error($result)) {
            return new \WP_Error('cloud_error', $result->get_error_message(), ['status' => 500]);
        }

        // Cadence sync needs to know this campaign is gone so it stops the
        // pulse on the next tick. See create_campaign_on_cloud() for the
        // rationale on why we both invalidate and queue an immediate sync.
        Cloud_Cadence_Sync::invalidate_cache();
        Cloud_Cadence_Sync::queue_immediate_sync();

        return rest_ensure_response([
            'success' => true,
            'message' => __('Campaign cleared.', 'structura'),
        ]);
    }

    /**
     * POST /structura/v1/scheduler/campaign/{id}/duplicate — Duplicate campaign.
     */
    public function duplicate_campaign($request)
    {
        // 2026-05-01 v2 — cloud is the single source of truth.
        return $this->duplicate_campaign_on_cloud($request);
    }

    /**
     * Cloud-authoritative duplicate path.
     *
     * 1. GET the source campaign as a raw flat doc (we want every field
     *    verbatim, not the cluster reshape — the round-trip through
     *    `cloud_to_wp` would lose anything the transformer doesn't know
     *    about, and that's a back-compat bug waiting to happen).
     * 2. Strip server-managed fields (`campaignId`, `createdAt`, `updatedAt`,
     *    `postsPublished`, `lastRunTimestamp`) so the new doc gets fresh
     *    values from `postCampaign`.
     * 3. Append "(Copy)" to the name and force `status: paused` — the
     *    legacy `Campaign_Repository::duplicate` did the same (sets status
     *    to "paused" on the cloned post) so users don't accidentally
     *    double-publish on the same cron.
     * 4. POST it to `/postCampaign`. Cloud auto-generates a fresh nanoid.
     * 5. Trigger an immediate `Cloud_Cadence_Sync` so AS doesn't have to
     *    wait 15 minutes to learn about the new (paused) campaign — though
     *    since it's paused it won't get a pulse, the state map needs it.
     */
    private function duplicate_campaign_on_cloud($request)
    {
        $campaign_id = sanitize_text_field((string)($request['id'] ?? ''));
        if ($campaign_id === '') {
            return new \WP_Error('missing_id', __('Campaign ID is required.', 'structura'), ['status' => 400]);
        }

        $license = License_Manager::get_license_data();
        if (empty($license['license_key'])) {
            return new \WP_Error('no_license', __('Active license required.', 'structura'), ['status' => 403]);
        }

        $secret_data = Key_Manager::get_license_payload();
        $auth        = [
            'license_key'       => $license['license_key'],
            'site_url'          => wp_parse_url(home_url(), PHP_URL_HOST),
            'activation_secret' => $secret_data['secret'] ?? '',
        ];

        $get_result = Cloud_Client::post('/getCampaign', array_merge($auth, [
            'campaign_id' => $campaign_id,
        ]));

        if (is_wp_error($get_result)) {
            return new \WP_Error('cloud_error', $get_result->get_error_message(), ['status' => 500]);
        }
        if (($get_result['code'] ?? 0) !== 200) {
            $err = $get_result['body']['error'] ?? 'Source campaign not found.';

            return new \WP_Error('cloud_error', $err, ['status' => 404]);
        }

        $source = $get_result['body']['campaign'] ?? null;
        if ( ! is_array($source) || empty($source)) {
            return new \WP_Error('cloud_error', __('Source campaign payload was empty.', 'structura'),
                ['status' => 500]);
        }

        // Strip server-managed fields so /postCampaign mints fresh ones.
        unset(
            $source['campaignId'],
            $source['createdAt'],
            $source['updatedAt'],
        );
        // Reset run-time stats — a duplicate should look brand new.
        $source['postsPublished']   = 0;
        $source['lastRunTimestamp'] = null;
        // Mark the duplicate paused, mirroring Campaign_Repository::duplicate.
        $source['status'] = 'paused';
        // Tag the name so it's distinguishable in the SPA list.
        $source['name'] = ((string)($source['name'] ?? '')) . ' ' . __('(Copy)', 'structura');

        $post_result = Cloud_Client::post('/postCampaign', array_merge($auth, [
            'campaign' => $source,
        ]));

        if (is_wp_error($post_result)) {
            return new \WP_Error('cloud_error', $post_result->get_error_message(), ['status' => 500]);
        }
        if (($post_result['code'] ?? 0) !== 200) {
            $err = $post_result['body']['error'] ?? 'Cloud refused the duplicate.';

            return new \WP_Error('cloud_error', $err, ['status' => 500]);
        }

        $new_doc = $post_result['body']['campaign'] ?? [];
        if (empty($new_doc)) {
            return new \WP_Error('cloud_error', __('Cloud did not return campaign document.', 'structura'),
                ['status' => 500]);
        }

        // Ensure cadence sync's state map gets the new campaign on its next
        // tick. Even though paused campaigns aren't scheduled, this is
        // cheap insurance against the user un-pausing immediately.
        Cloud_Cadence_Sync::invalidate_cache();
        Cloud_Cadence_Sync::queue_immediate_sync();

        return rest_ensure_response([
            'success' => true,
            'message' => __('Campaign cloned successfully.', 'structura'),
            'data'    => Campaign_Shape_Transformer::cloud_to_wp($new_doc),
        ]);
    }

    /** WP-authoritative duplicate path — clones the post + all post meta. */
    /**
     * POST /structura/v1/scheduler/campaign/{id}/toggle — Toggle campaign status.
     */
    public function toggle_campaign($request)
    {
        // 2026-05-01 v2 — cloud is the single source of truth.
        return $this->toggle_campaign_on_cloud($request);
    }

    /**
     * Cloud-authoritative toggle — patches the cloud doc's status field and
     * lets `Cloud_Cadence_Sync` reconcile AS on the next tick (or sooner via
     * the queued one-shot below).
     *
     * We deliberately do NOT call `Action_Scheduler_Service::sync_pulse` /
     * `stop_pulse` directly here. The cadence sync is the single source of
     * truth for AS records on cloud-auth sites; routing pulse changes
     * through it keeps that promise. The user-perceived latency is bounded
     * by `queue_immediate_sync` (seconds, not minutes).
     */
    private function toggle_campaign_on_cloud($request)
    {
        $campaign_id = sanitize_text_field((string)($request['id'] ?? ''));
        if ($campaign_id === '') {
            return new \WP_Error('missing_id', __('Campaign ID is required.', 'structura'), ['status' => 400]);
        }

        // Read current status so we know which way to flip. Using
        // Campaign_Cloud_Reader returns the cluster shape; we just need
        // the top-level `status` key it normalizes.
        $current = Campaign_Cloud_Reader::get_campaign_data($campaign_id);
        if ($current === null) {
            return new \WP_Error('not_found', __('Campaign not found in cloud.', 'structura'), ['status' => 404]);
        }
        $current_status = $current['status'] ?? 'active';
        $new_status     = ($current_status === 'active') ? 'paused' : 'active';

        $ok = Campaign_Cloud_Reader::patch_campaign($campaign_id, [
            'status' => $new_status,
        ]);
        if ( ! $ok) {
            return new \WP_Error('cloud_error', __('Failed to update campaign status.', 'structura'),
                ['status' => 500]);
        }

        Cloud_Cadence_Sync::invalidate_cache();
        Cloud_Cadence_Sync::queue_immediate_sync();

        return rest_ensure_response([
            'success' => true,
            'status'  => $new_status,
            'message' => $new_status === 'active'
                ? __('Campaign resumed.', 'structura')
                : __('Campaign paused.', 'structura'),
        ]);
    }

    /** WP-authoritative toggle — flips `_status` post meta + manages AS pulse. */

    // =========================================================================
    // VISUAL PRESETS — workspace library + per-activation binding
    // =========================================================================

    /**
     * Forward a typed cloud response back to wp-admin, preserving the
     * cloud's HTTP status code on error so the SPA's TanStack Query
     * error handler can branch correctly.
     */
    private function forward_cloud_response($response, string $generic_error)
    {
        if (is_wp_error($response)) {
            return new \WP_Error('cloud_unreachable', $response->get_error_message(), ['status' => 502]);
        }
        $body = is_array($response) ? ($response['body'] ?? []) : [];
        $code = is_array($response) ? (int)($response['code'] ?? 0) : 0;
        if ($code < 200 || $code >= 300 || empty($body['success'])) {
            $error = is_array($body) && isset($body['error']) ? (string)$body['error'] : $generic_error;
            return new \WP_Error('cloud_error', $error, ['status' => $code ?: 502]);
        }
        return rest_ensure_response($body);
    }

    public function list_visual_presets()
    {
        $response = Cloud_Client::post('/listVisualPresets', []);
        return $this->forward_cloud_response($response, __('Failed to list visual presets.', 'structura'));
    }

    public function create_visual_preset($request)
    {
        $params = $request->get_json_params();
        $payload = [
            'label'              => sanitize_text_field($params['label'] ?? ''),
            'content'            => $this->sanitize_visual_content($params['content'] ?? []),
            'bindToActivation'   => isset($params['bind_to_activation']) ? (bool)$params['bind_to_activation'] : true,
        ];
        $response = Cloud_Client::post('/createVisualPreset', $payload);
        return $this->forward_cloud_response($response, __('Failed to create visual preset.', 'structura'));
    }

    public function update_visual_preset($request)
    {
        $params = $request->get_json_params();
        $payload = [
            'presetId' => sanitize_text_field((string)$request['id']),
        ];
        if (isset($params['label'])) {
            $payload['label'] = sanitize_text_field($params['label']);
        }
        if (isset($params['content'])) {
            $payload['content'] = $this->sanitize_visual_content($params['content']);
        }
        $response = Cloud_Client::post('/updateVisualPreset', $payload);
        $forwarded = $this->forward_cloud_response($response, __('Failed to update visual preset.', 'structura'));
        if ( ! is_wp_error($forwarded) && class_exists(\Structura\Scheduler\Task_Runner::class)) {
            \Structura\Scheduler\Task_Runner::invalidate_visual_settings_cache();
        }
        return $forwarded;
    }

    public function fork_visual_preset($request)
    {
        $params = $request->get_json_params();
        $payload = [
            'sourcePresetId'   => sanitize_text_field((string)$request['id']),
            'bindToActivation' => isset($params['bind_to_activation']) ? (bool)$params['bind_to_activation'] : true,
        ];
        if (isset($params['label'])) {
            $payload['label'] = sanitize_text_field($params['label']);
        }
        $response = Cloud_Client::post('/forkVisualPreset', $payload);
        $forwarded = $this->forward_cloud_response($response, __('Failed to fork visual preset.', 'structura'));
        if ( ! is_wp_error($forwarded) && class_exists(\Structura\Scheduler\Task_Runner::class)) {
            \Structura\Scheduler\Task_Runner::invalidate_visual_settings_cache();
        }
        return $forwarded;
    }

    public function delete_visual_preset($request)
    {
        $payload = [
            'presetId' => sanitize_text_field((string)$request['id']),
        ];
        $response = Cloud_Client::post('/deleteVisualPreset', $payload);
        return $this->forward_cloud_response($response, __('Failed to delete visual preset.', 'structura'));
    }

    public function bind_visual_preset($request)
    {
        $params = $request->get_json_params();
        $presetId = $params['preset_id'] ?? null;
        $payload = [
            'presetId' => $presetId === null ? null : sanitize_text_field((string)$presetId),
        ];
        $response = Cloud_Client::post('/setActivationVisualBinding', $payload);
        $forwarded = $this->forward_cloud_response($response, __('Failed to bind visual preset.', 'structura'));
        if ( ! is_wp_error($forwarded) && class_exists(\Structura\Scheduler\Task_Runner::class)) {
            \Structura\Scheduler\Task_Runner::invalidate_visual_settings_cache();
        }
        return $forwarded;
    }

    /**
     * Sanitise the visual-content sub-object before forwarding to the
     * cloud. Defence in depth — the cloud re-validates against an
     * allow-list, this is just the wire-shape coercion.
     *
     * Video-styling keys (video-visuals handoff, 2026-07) are forwarded
     * ONLY when the caller sent them: absent keys must stay absent so an
     * older SPA build (or an ineligible plan whose Video section never
     * rendered) can't clobber a preset's saved video styling with
     * defaults during the rollout window. Invalid values are dropped,
     * never coerced — forwarding a garbage style would still overwrite
     * the stored one after the cloud's own coercion.
     */
    private function sanitize_visual_content($raw): array
    {
        if ( ! is_array($raw)) return [];
        $content = [
            'globalArtDirection' => isset($raw['global_art_direction'])
                ? sanitize_textarea_field((string)$raw['global_art_direction'])
                : (isset($raw['globalArtDirection']) ? sanitize_textarea_field((string)$raw['globalArtDirection']) : ''),
            'aspectRatio'        => isset($raw['aspect_ratio'])
                ? sanitize_text_field((string)$raw['aspect_ratio'])
                : sanitize_text_field((string)($raw['aspectRatio'] ?? '16:9')),
            'format'             => isset($raw['format'])
                ? sanitize_text_field((string)$raw['format'])
                : 'webp',
            'optimizeOnUpload'   => isset($raw['optimize_on_upload'])
                ? (bool)$raw['optimize_on_upload']
                : (bool)($raw['optimizeOnUpload'] ?? false),
            'medium'             => in_array(
                (string)($raw['medium'] ?? ''),
                ['photography', 'illustration', '3d_render'],
                true,
            ) ? (string)$raw['medium'] : 'photography',
        ];

        $video_style = $raw['video_style'] ?? $raw['videoStyle'] ?? null;
        if (is_string($video_style)
            && in_array($video_style, ['clean', 'bold', 'kinetic'], true)) {
            $content['videoStyle'] = $video_style;
        }

        if (isset($raw['video_art_direction']) || isset($raw['videoArtDirection'])) {
            $content['videoArtDirection'] = sanitize_textarea_field(
                (string)($raw['video_art_direction'] ?? $raw['videoArtDirection'])
            );
        }

        $caption_placement = $raw['caption_placement'] ?? $raw['captionPlacement'] ?? null;
        if (is_string($caption_placement)
            && in_array($caption_placement, ['top', 'middle', 'bottom'], true)) {
            $content['captionPlacement'] = $caption_placement;
        }

        if (array_key_exists('palette', $raw)) {
            $content['palette'] = $this->sanitize_palette($raw['palette']);
        }

        return $content;
    }

    /**
     * Reduce a suggest-extracted brand palette to well-formed CSS hex
     * strings (`#RGB` / `#RRGGBB`), capped at 8 entries. Hand-rolled
     * rather than `sanitize_hex_color()` so a malformed entry is dropped
     * instead of nulled into the array. An empty result is forwarded as
     * `[]` — that's the caller explicitly clearing the palette.
     *
     * @param mixed $raw Whatever the SPA sent under `palette`.
     */
    private function sanitize_palette($raw): array
    {
        if ( ! is_array($raw)) return [];
        $palette = [];
        foreach ($raw as $color) {
            if ( ! is_string($color)) continue;
            $color = trim($color);
            if (preg_match('/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $color)) {
                $palette[] = $color;
            }
            if (count($palette) >= 8) break;
        }
        return $palette;
    }

    // =========================================================================
    // PERSONAS — fork + per-site default binding
    // =========================================================================

    public function fork_persona($request)
    {
        $params = $request->get_json_params();
        $payload = [
            'source_persona_id' => sanitize_text_field((string)$request['id']),
        ];
        if (isset($params['label_suffix'])) {
            $payload['label_suffix'] = sanitize_text_field((string)$params['label_suffix']);
        }
        $response = Cloud_Client::post('/forkPersona', $payload);
        return $this->forward_cloud_response($response, __('Failed to fork persona.', 'structura'));
    }

    public function set_default_persona($request)
    {
        $params = $request->get_json_params();
        $personaId = $params['persona_id'] ?? null;
        $payload = [
            'persona_id' => $personaId === null ? null : sanitize_text_field((string)$personaId),
        ];
        $response = Cloud_Client::post('/setDefaultPersona', $payload);
        return $this->forward_cloud_response($response, __('Failed to set default persona.', 'structura'));
    }

    /**
     * Bind a workspace persona to this site (per-site membership). The cloud
     * resolves the activation from the bearer; we only forward the persona id.
     */
    public function add_persona_membership($request)
    {
        $params    = $request->get_json_params();
        $personaId = sanitize_text_field((string)($params['persona_id'] ?? ''));
        $response  = Cloud_Client::post('/addPersonaMembership', ['persona_id' => $personaId]);
        return $this->forward_cloud_response($response, __('Failed to add persona to this site.', 'structura'));
    }

    /** Unbind a persona from this site's rotation (per-site membership). */
    public function remove_persona_membership($request)
    {
        $params    = $request->get_json_params();
        $personaId = sanitize_text_field((string)($params['persona_id'] ?? ''));
        $response  = Cloud_Client::post('/removePersonaMembership', ['persona_id' => $personaId]);
        return $this->forward_cloud_response($response, __('Failed to remove persona from this site.', 'structura'));
    }

    // =========================================================================
    // WORKSPACE AI KEYS — cross-site library picker + bind
    // =========================================================================

    public function list_workspace_keys()
    {
        $response = Cloud_Client::post('/listWorkspaceProviderCredentials', []);
        return $this->forward_cloud_response($response, __('Failed to list workspace keys.', 'structura'));
    }

    public function bind_workspace_key($request)
    {
        $params = $request->get_json_params();
        $payload = [
            'credId'   => sanitize_text_field((string)($params['cred_id'] ?? '')),
            'provider' => sanitize_text_field((string)($params['provider'] ?? '')),
        ];
        if ($payload['credId'] === '' || $payload['provider'] === '') {
            return new \WP_Error('bad_request', __('Credential id and provider are required.', 'structura'), ['status' => 400]);
        }
        $response = Cloud_Client::post('/bindWorkspaceProviderCredential', $payload);
        $forwarded = $this->forward_cloud_response($response, __('Failed to bind workspace key.', 'structura'));
        if ( ! is_wp_error($forwarded)) {
            delete_transient('structura_model_list');
            Provider_Registry::invalidate_models_cache();
            Cloud_Client::reset_provider_bindings_cache();
        }
        return $forwarded;
    }
}