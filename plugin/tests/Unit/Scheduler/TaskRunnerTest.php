<?php

namespace Structura\Tests\Unit\Scheduler;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Scheduler\Task_Runner;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for Task_Runner helpers.
 *
 * The full `generate_post_images()` path has too many WP-side side effects
 * (media sideload, file I/O, HTTP calls to the cloud) to exercise in a
 * Brain-Monkey unit test. Instead we pin the small, testable seams:
 *
 *   1. `generate_post_images()` up to the `/executeCloudImageStep` call —
 *      which image provider reaches the cloud on managed and own-key plans
 *      (managed image binding, 2026-10-06).
 *
 *   2. `handle_as_single_post_task()` — the bridge from the manual
 *      "Generate Now" REST endpoint. Pins that AS args carry only a
 *      transient key, that the key is deleted before execute_single_post
 *      runs, and that missing/empty keys fail loudly rather than looping.
 *
 * The Phase-1.0h-retired AS image chain (`queue_image_tasks`,
 * `enqueue_image_task`, `handle_as_image_task`) had its own fixture-
 * heavy test suite. With the methods gone the tests are gone; cloud-
 * side image-bundle delivery is exercised by
 * `functions/src/scheduler/__tests__/inlineImageGen.test.ts`.
 *
 * Anything more integration-shaped belongs in the plugin integration
 * suite (which needs a running WP stack to do meaningfully).
 *
 * @covers \Structura\Scheduler\Task_Runner
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class TaskRunnerTest extends TestCase
{
    /** @test */
    public function article_delivery_keeps_the_generated_language_for_later_draft_approval(): void
    {
        $saved = [];
        Functions\when('get_bloginfo')->justReturn('en-US');
        Functions\when('update_post_meta')->alias(function ($post_id, $key, $value) use (&$saved) {
            $saved[$key] = $value;
            return true;
        });
        $method = new \ReflectionMethod(Task_Runner::class, 'apply_post_metadata');
        $method->setAccessible(true);
        $runner = new Task_Runner();
        foreach (['de' => 'de', 'default' => 'en-US', '' => 'en-US'] as $language => $expected) {
            $method->invoke($runner, 42, [], ['id' => 'campaign-one', 'intelligence' => ['language' => $language]]);
            $this->assertSame($expected, $saved['_structura_content_language']);
        }
    }

    protected function tearDown(): void
    {
        // Mockery alias mocks persist across tests within the same process,
        // matching the pattern in ChannelEventForwarderTest.
        Mockery::close();
        parent::tearDown();
    }


    // ──────────────────────────────────────────────────────────────────────
    //  MANAGED IMAGE BINDING (2026-10-06, specs/managed-ai-lineup.md §2.4)
    //
    //  On Cloud and Cloud Pro the cloud picks the image model from the
    //  managed binding and ignores the provider the plugin sends. The
    //  plugin used to fill in its own managed default (`gemini` / `openai`)
    //  when the campaign's image provider was missing or text-only; that
    //  map no longer matched the binding. Now a managed plan sends no
    //  provider in that case and the regen still runs. Own-key plans keep
    //  the graceful skip.
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Run `generate_post_images` on `$plan` and return the payload sent to
     * `/executeCloudImageStep`, or null when nothing was sent.
     *
     * The cloud call throws after capture so the sideload path never runs.
     *
     * @param string               $plan         License plan.
     * @param array<string, mixed> $intelligence Campaign intelligence.
     */
    private function capture_image_payload(string $plan, array $intelligence): ?array
    {
        Functions\when('wp_parse_url')->justReturn('example.test');
        Functions\when('get_site_url')->justReturn('https://example.test');
        Functions\when('esc_html')->returnArg();
        $this->stub_log_service();

        $license_manager = Mockery::mock('alias:Structura\Core\License_Manager');
        $license_manager->shouldReceive('get_license_data')
            ->andReturn(['plan' => $plan, 'license_key' => 'lic']);

        $captured = null;
        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->zeroOrMoreTimes()
            ->andReturnUsing(function ($route, $payload) use (&$captured) {
                if ($route === '/executeCloudImageStep') {
                    $captured = $payload;
                }
                throw new \RuntimeException('stop after capture');
            });

        try {
            (new Task_Runner())->generate_post_images(
                42,
                'featured',
                ['topic' => 'A harbour at dawn'],
                ['id' => 7, 'intelligence' => $intelligence]
            );
        } catch (\RuntimeException $e) {
            // Expected once the payload is captured.
        }

        return $captured;
    }

    /** @test */
    public function managed_plan_with_a_text_only_image_provider_sends_no_provider(): void
    {
        $payload = $this->capture_image_payload('cloud', [
            'imageProvider' => 'anthropic',
            'imageModel'    => 'claude-x',
        ]);

        $this->assertIsArray($payload, 'A managed regen must reach the cloud.');
        $this->assertArrayNotHasKey('provider', $payload);
        $this->assertNull($payload['model']);
    }

    /** @test */
    public function managed_plan_without_an_image_provider_still_reaches_the_cloud(): void
    {
        foreach (['cloud', 'cloud_pro'] as $plan) {
            $payload = $this->capture_image_payload($plan, []);

            $this->assertIsArray($payload, $plan);
            $this->assertArrayNotHasKey('provider', $payload, $plan);
            Mockery::close();
        }
    }

    /** @test */
    public function managed_plan_keeps_forwarding_a_stored_image_capable_provider(): void
    {
        // Back-compat: the hidden stored provider still travels (§2.4).
        $payload = $this->capture_image_payload('cloud_pro', ['imageProvider' => 'gemini']);

        $this->assertSame('gemini', $payload['provider']);
    }

    /** @test */
    public function own_key_plan_with_a_text_only_image_provider_still_skips(): void
    {
        $this->assertNull($this->capture_image_payload('byok', ['imageProvider' => 'anthropic']));
    }

    /** @test */
    public function own_key_plan_forwards_its_image_provider(): void
    {
        $payload = $this->capture_image_payload('free', ['imageProvider' => 'openai']);

        $this->assertSame('openai', $payload['provider']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  HOOK REGISTRATION — the 404 storm regression guard
    //
    //  `Rest_Api::run_task` enqueues `structura_run_campaign_step_jittered`
    //  with `['campaign_id' => N, 'campaign_run_id' => 'uuid-…']` so the
    //  wp-admin progress drawer has a run id to poll. Action Scheduler
    //  spreads the array positionally into the callback, which means the
    //  `add_action` binding MUST accept 2 args. WordPress's default of 1
    //  would silently drop `campaign_run_id`, `delegate_to_cloud` would
    //  omit it from the POST body, and the cloud would mint its own UUID
    //  under `/executeCloudCampaignStep`. Plugin hands the SPA one id,
    //  cloud writes the doc under another → /getCampaignRun 404 storm.
    //
    //  This pins `$accepted_args = 2` so the bug can't regress in a
    //  drive-by refactor.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function init_registers_jittered_hook_with_two_accepted_args(): void
    {
        // Count the calls where accepted_args=2 was supplied for the
        // jittered hook. Anything less (default=1) would re-introduce
        // the 404 storm diagnosed 2026-04-23.
        $jittered_accepted_args = null;
        $this->expectFn('add_action')
            ->atLeast()
            ->once()
            ->andReturnUsing(function (...$args) use (&$jittered_accepted_args) {
                if (($args[0] ?? '') === 'structura_run_campaign_step_jittered') {
                    // Signature: add_action($hook, $callback, $priority = 10, $accepted_args = 1)
                    $jittered_accepted_args = $args[3] ?? 1;
                }
                return true;
            });

        $runner = new Task_Runner();
        $runner->init();

        $this->assertSame(
            2,
            $jittered_accepted_args,
            'structura_run_campaign_step_jittered must be registered with '
            . '$accepted_args = 2. Rest_Api::run_task enqueues this hook with '
            . 'campaign_id + campaign_run_id; dropping the second arg produces '
            . 'a /getCampaignRun 404 storm because the cloud mints its own '
            . 'UUID when campaign_run_id is missing from the POST body.'
        );
    }

    // The AS-image-chain regression guards (queue_image_tasks's tiny-
    // args contract, the cloud-inline skip map, the per-slot
    // sideload-vs-fallback semantics, the empty-cloud_handled
    // pre-Phase-3 behaviour) were retired in Phase 1.0h alongside the
    // methods themselves. Cloud-side image-bundle delivery is exercised
    // in `functions/src/scheduler/__tests__/inlineImageGen.test.ts`.

    // The historical AS args / cloud-skip tests below were placeholder
    // — replaced with a no-op so the rest of the file diff stays
    // line-stable. Keep this method here only as long as the surrounding
    // structure relies on the old line numbers; safe to delete in a
    // follow-up sweep.
    // ──────────────────────────────────────────────────────────────────────
    //  PHASE 3: sideload_image_bundle URL-fetch contract
    //
    //  These pin the wire shape `Task_Runner` expects on the cloud's
    //  inline image bundle and the per-slot best-effort failure mode.
    //  We can't easily test the full sideload (it touches WP media
    //  pipeline + filesystem), but we CAN pin the gating + error
    //  handling at the seam.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function sideload_image_bundle_records_failure_when_url_is_missing(): void
    {
        // Defensive: a malformed bundle (slot key present, but `url`
        // empty) shouldn't throw. The slot lands in the returned map
        // as absent (not `true`) so queue_image_tasks knows to fall
        // back to the AS chain.
        $this->stub_log_service();
        Functions\when('wp_remote_get')->justReturn([]);

        $runner = new Task_Runner();
        $result = $runner->sideload_image_bundle(
            /* post_id */ 42,
            ['featured' => ['url' => '', 'mimeType' => 'image/webp']],
            $this->sample_campaign(),
            $this->sample_campaign()['id']
        );

        $this->assertArrayNotHasKey('featured', $result);
    }

    /** @test */
    public function sideload_image_bundle_records_failure_on_http_error(): void
    {
        // Signed URL TTL elapsed, bucket policy changed, network
        // failure — any non-200 from `wp_remote_get` lands the slot
        // as `false`. The post still has a chance via the AS chain
        // (queue_image_tasks falls back).
        $this->stub_log_service();

        Functions\when('wp_remote_get')->justReturn(['response' => ['code' => 403]]);
        Functions\when('wp_remote_retrieve_response_code')->alias(
            fn($r) => (int) ($r['response']['code'] ?? 0)
        );
        Functions\when('wp_remote_retrieve_body')->justReturn('');

        $runner = new Task_Runner();
        $result = $runner->sideload_image_bundle(
            /* post_id */ 42,
            ['featured' => ['url' => 'https://example.invalid/expired', 'mimeType' => 'image/webp']],
            $this->sample_campaign(),
            $this->sample_campaign()['id']
        );

        $this->assertSame(false, $result['featured']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  SINGLE-POST BRIDGE — manual "Generate Now"
    //
    //  Sibling of the image-task bug above. The REST endpoint used to pass
    //  the full ephemeral `$campaign` (50–500 KB) through AS args, blowing
    //  the same `max_allowed_packet` cliff. We now stash the campaign in a
    //  transient and forward only the key, with `handle_as_single_post_task`
    //  re-hydrating on the consumer side. These tests pin:
    //
    //    - Empty key is rejected loudly (error log, no WP calls).
    //    - Missing transient short-circuits with a warning rather than
    //      throwing — AS would otherwise park the job in a retry loop it
    //      can never recover from (transients don't come back).
    //    - When the transient is present, it is deleted *before*
    //      `execute_single_post` runs. Belt-and-braces against a scenario
    //      where execute_single_post throws and AS retries the hook — we
    //      never want the same payload processed twice.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function handle_as_single_post_task_logs_error_when_key_is_empty(): void
    {
        $get_called = false;
        Functions\when('get_transient')->alias(function () use (&$get_called) {
            $get_called = true;
            return false;
        });
        Functions\when('delete_transient')->justReturn(true);

        $error_logged = false;
        $log_service = Mockery::mock('alias:Structura\Core\Log_Service');
        $log_service->shouldReceive('add')
            ->once()
            ->andReturnUsing(function ($level) use (&$error_logged) {
                if ($level === 'error') {
                    $error_logged = true;
                }
            });

        $runner = new Task_Runner();
        $runner->handle_as_single_post_task('');

        $this->assertTrue($error_logged, 'Empty campaign key must emit an error log.');
        $this->assertFalse($get_called, 'Empty-key short-circuit must not touch the transient store.');
    }

    /** @test */
    public function handle_as_single_post_task_logs_warning_when_transient_missing(): void
    {
        // Matches the real failure mode: transient evicted from a volatile
        // object cache, or the hook somehow re-firing after a successful run.
        Functions\when('get_transient')->justReturn(false);

        $deleted_keys = [];
        Functions\when('delete_transient')->alias(function ($key) use (&$deleted_keys) {
            $deleted_keys[] = $key;
            return true;
        });

        $warning_logged = false;
        $log_service = Mockery::mock('alias:Structura\Core\Log_Service');
        $log_service->shouldReceive('add')
            ->once()
            ->andReturnUsing(function ($level) use (&$warning_logged) {
                if ($level === 'warning') {
                    $warning_logged = true;
                }
            });

        /** @var Task_Runner|\Mockery\MockInterface $runner */
        $runner = Mockery::mock(Task_Runner::class . '[execute_single_post]')->makePartial();
        $runner->shouldNotReceive('execute_single_post');

        $runner->handle_as_single_post_task('structura_single_post_ghost');

        $this->assertTrue($warning_logged, 'Missing transient must emit a warning, not throw.');
        $this->assertSame(
            ['structura_single_post_ghost'],
            $deleted_keys,
            'delete_transient must still run on the miss path so an orphan row (empty or stale) does not linger.'
        );
    }

    /** @test */
    public function handle_as_single_post_task_deletes_transient_before_delegating(): void
    {
        $campaign = [
            'id'           => 0,
            'intelligence' => ['personaId' => 1],
            'structure'    => ['featuredImage' => false, 'bodyImages' => false],
        ];

        // Call-order capture. Pinning delete-before-execute protects against
        // a double-run if execute_single_post throws and AS retries.
        $call_order = [];
        Functions\when('get_transient')->alias(function () use ($campaign, &$call_order) {
            $call_order[] = 'get_transient';
            return $campaign;
        });
        Functions\when('delete_transient')->alias(function () use (&$call_order) {
            $call_order[] = 'delete_transient';
            return true;
        });

        $this->stub_log_service();

        /** @var Task_Runner|\Mockery\MockInterface $runner */
        $runner = Mockery::mock(Task_Runner::class . '[execute_single_post]')->makePartial();
        // Production now passes the upfront-minted run_id as a second
        // argument (post-2026-05-01 "SPA navigates immediately" flow);
        // accept it without coupling the test to the exact value so a
        // future tweak to the legacy-shape transient handling doesn't
        // require touching the call-order assertion.
        $runner->shouldReceive('execute_single_post')
            ->once()
            ->with($campaign, Mockery::type('string'))
            ->andReturnUsing(function () use (&$call_order) {
                $call_order[] = 'execute_single_post';
            });

        $runner->handle_as_single_post_task('structura_single_post_live');

        $this->assertSame(
            ['get_transient', 'delete_transient', 'execute_single_post'],
            $call_order,
            'Order must be: load transient → delete it → run execute_single_post. '
            . 'If execute runs before delete, an AS retry could re-process the same payload.'
        );
    }

    // `handle_as_image_task` was retired in Phase 1.0h (2026-05-07);
    // image generation now happens cloud-side inline with the run, so
    // the plugin no longer enqueues a separate AS task for it. The
    // short-circuit-when-campaign-missing test that lived here is
    // covered for the surviving single-post path by the test above.

    // ──────────────────────────────────────────────────────────────────────
    //  Test helpers
    // ──────────────────────────────────────────────────────────────────────

    /**
     * License_Manager is consulted twice in queue_image_tasks (one gate
     * for featured, one for body). We alias-mock it here because it's
     * not worth spinning up the real class in a unit test.
     */
    private function stub_license_gates(bool $featured_ok, bool $body_ok): void
    {
        $license_manager = Mockery::mock('alias:Structura\Core\License_Manager');
        $license_manager->shouldReceive('can_generate_featured_image')
            ->zeroOrMoreTimes()
            ->andReturn($featured_ok);
        $license_manager->shouldReceive('can_generate_body_images')
            ->zeroOrMoreTimes()
            ->andReturn($body_ok);
    }

    /**
     * Swallow `Log_Service::add()` calls in tests that don't care about
     * log assertions — individual tests that DO assert on log output
     * re-mock the alias.
     */
    private function stub_log_service(): void
    {
        $log_service = Mockery::mock('alias:Structura\Core\Log_Service');
        $log_service->shouldReceive('add')->zeroOrMoreTimes();
    }

    /**
     * Minimal campaign array with the fields `queue_image_tasks` reads.
     *
     * When `$with_bloat` is true, a large structure blob is attached —
     * mirrors real-world campaign rows (50–500 KB) to keep us honest
     * about WHY we stopped passing this through AS args.
     */
    private function sample_campaign(bool $with_bloat = false): array
    {
        $campaign = [
            'id'        => 7,
            'structure' => [
                'featuredImage' => true,
                'bodyImages'    => true,
            ],
        ];

        if ($with_bloat) {
            // ~60 KB of decorative padding — representative of a real
            // campaign's `structure` + `intelligence` + `authority` blobs.
            $campaign['structure']['_bloat'] = str_repeat('x', 60_000);
        }

        return $campaign;
    }

    /**
     * Minimal AI-data blob with both image slots populated.
     */
    private function sample_ai_data(): array
    {
        return [
            'featured_image' => [
                'topic'     => 'A robot painting',
                'file_name' => 'robot-painting',
                'alt'       => 'Robot painting a sunset',
                'caption'   => 'Generated by Structura',
            ],
            'body_image' => [
                'topic'     => 'A robot sculpting',
                'file_name' => 'robot-sculpting',
                'alt'       => 'Robot sculpting clay',
                'caption'   => 'Generated by Structura',
            ],
        ];
    }

    // ──────────────────────────────────────────────────────────────────────
    //  VISUAL-SETTINGS RESOLUTION (2026-05-01)
    //
    //  Cloud is the single source of truth for `visualSettings/global`.
    //  Free-tier and BYOK image gen used to read stale WP options,
    //  which caused the long-running "free tier ignores my visual
    //  prompt" regression. These tests pin the cache-hit short-circuit
    //  and the cache-invalidation contract; the cloud-fetch branch
    //  itself is integration-shaped (touches Key_Manager + Cloud_Client
    //  + WP options) and lives in the integration suite.
    // ──────────────────────────────────────────────────────────────────────
    /** @test */
    public function get_visual_settings_returns_cached_value_on_hit(): void
    {
        // A cache hit must short-circuit the entire cloud round-trip
        // — the per-image gen path can't afford a network hop. We
        // pin the round-trip contract by stubbing get_transient with
        // a sentinel value and asserting it lands unchanged. If a
        // future refactor accidentally skips the cache check, the
        // sentinel won't survive the cloud helper's reshaping.
        $cached = [
            'style'        => 'electric cyan editorial',
            'aspect_ratio' => '16:9',
            'format'       => 'webp',
        ];
        Functions\when('get_transient')->justReturn($cached);

        $this->assertSame($cached, Task_Runner::get_visual_settings_for_image_gen());
    }

    /** @test */
    public function invalidate_visual_settings_cache_deletes_the_transient(): void
    {
        // The Rest_Api visual-settings writer calls this after a SPA
        // save so the next free-tier gen picks up the new style
        // immediately instead of waiting for the 5-minute TTL. Pin
        // the exact transient key — a typo would leak stale styles
        // for up to 5 minutes per save.
        $this->expectFn('delete_transient')
            ->once()
            ->with('structura_visual_settings_cache')
            ->andReturn(true);

        Task_Runner::invalidate_visual_settings_cache();
    }

    // ──────────────────────────────────────────────────────────────────────
    //  KEYPHRASE CODE-FRAGMENT GUARD
    //
    //  Belt-and-suspenders for older-cloud payloads: a focus keyphrase that
    //  leaked code (braces, PHP/JSX tags, arrow functions) must not reach
    //  Yoast. Mirrors `CODE_FRAGMENT_RE` in the cloud's
    //  `ai/blueprint-repair.ts`.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function flags_leaked_code_fragments_in_a_keyphrase(): void
    {
        $this->assertTrue(Task_Runner::looks_like_code_fragment("data }, 'p_core_array }"));
        $this->assertTrue(Task_Runner::looks_like_code_fragment('h5, true); ?>'));
        $this->assertTrue(Task_Runner::looks_like_code_fragment('items.map(x => x)'));
        $this->assertTrue(Task_Runner::looks_like_code_fragment('<div>oops</div>'));
    }

    /** @test */
    public function leaves_legitimate_keyphrases_alone(): void
    {
        // Real keyphrases — including ones with apostrophes/commas — must NOT
        // be flagged, or we'd needlessly drop a valid focus keyword.
        $this->assertFalse(Task_Runner::looks_like_code_fragment('internal linking strategy'));
        $this->assertFalse(Task_Runner::looks_like_code_fragment("don't stop optimizing"));
        $this->assertFalse(Task_Runner::looks_like_code_fragment('SEO: a practical guide'));
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Category canonicalization key — the deterministic backstop that stops
    //  auto-mode from spawning a duplicate category per near-variant. The bug:
    //  jaba-knives.at reached 48 categories for 26 posts. See
    //  `resolve_auto_category_terms()` + the cloud reuse-first prompt.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function normalize_term_key_collapses_formatting_variants(): void
    {
        // Case, hyphen/space and trailing whitespace are all noise.
        $this->assertSame(
            Task_Runner::normalize_term_key('Messerwissen'),
            Task_Runner::normalize_term_key('Messer-Wissen'),
        );
        $this->assertSame(
            Task_Runner::normalize_term_key('Messerwissen'),
            Task_Runner::normalize_term_key('  messer wissen '),
        );
        // "&" and the "und"/"and" conjunctions fold to the same key.
        $this->assertSame(
            Task_Runner::normalize_term_key('Pflege & Zubehör'),
            Task_Runner::normalize_term_key('Pflege und Zubehör'),
        );
    }

    /** @test */
    public function normalize_term_key_keeps_distinct_categories_apart(): void
    {
        // Conservative on purpose — it merges spelling variants of the same
        // words, never semantic synonyms (that judgement is the model's job).
        $this->assertNotSame(
            Task_Runner::normalize_term_key('Kaufberatung'),
            Task_Runner::normalize_term_key('Kaufberatung & Tipps'),
        );
        $this->assertNotSame(
            Task_Runner::normalize_term_key('Messerpflege'),
            Task_Runner::normalize_term_key('Messerpflege & Zubehör'),
        );
        // Symbol-only input yields an empty key (callers skip it).
        $this->assertSame('', Task_Runner::normalize_term_key('!!!'));
    }
}
