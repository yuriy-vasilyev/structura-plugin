<?php

namespace Structura\Tests\Unit\Scheduler;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Core\Site_Reachability;
use Structura\Scheduler\Context_Builder;
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
 *   3. `receive_cloud_blueprint()` — a bad signature is a 401, and a
 *      verified request clears a cached "unreachable" verdict (2026-11-13).
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
    //  NEW SCENE FOR AN EMPTY PROMPT (2026-11-10)
    //
    //  With an empty prompt the cloud's writer picks the scene and returns
    //  it as `topic`. The new attachment carries that scene, not the stored
    //  one the request sent as the scene to move away from, so the regen
    //  modal shows the right current scene next time.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function the_new_attachment_carries_the_scene_the_cloud_chose(): void
    {
        $dir = sys_get_temp_dir() . '/structura-regen-' . uniqid();
        mkdir($dir);
        Functions\when('wp_parse_url')->justReturn('example.test');
        Functions\when('get_site_url')->justReturn('https://example.test');
        Functions\when('esc_html')->returnArg();
        Functions\when('wp_upload_dir')->justReturn(['path' => $dir]);
        Functions\when('wp_check_filetype')->justReturn(['ext' => 'png', 'type' => 'image/png']);
        Functions\when('media_handle_sideload')->justReturn(555);
        Functions\when('set_post_thumbnail')->justReturn(true);
        Functions\when('wp_get_attachment_image_url')->justReturn('https://example.test/cake.png');
        $stamped = [];
        Functions\when('update_post_meta')->alias(function ($id, $key, $value) use (&$stamped) {
            $stamped[$id][$key] = $value;
            return true;
        });
        $this->stub_log_service();
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')
            ->andReturn(['plan' => 'cloud', 'license_key' => 'lic']);
        Mockery::mock('alias:Structura\Core\Image_Processor')
            ->shouldReceive('process')
            ->andReturnUsing(static function ($tmp) {
                return $tmp;
            });
        $sent = null;
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->andReturnUsing(function ($route, $payload) use (&$sent) {
                $sent = $payload;
                return ['code' => 200, 'body' => [
                    'success' => true,
                    'dataUri' => 'data:image/png;base64,' . base64_encode($this->tiny_png()),
                    'topic'   => 'A tiered cake on a kitchen scale',
                ]];
            });

        try {
            (new Task_Runner())->generate_post_images(
                42,
                'featured',
                [
                    'prompt'       => '',
                    'slot'         => 'featured',
                    'post_title'   => 'How to price a wedding cake',
                    'post_excerpt' => 'Costs, margins and what to charge.',
                    'topic'        => 'A laptop on a desk',
                    'alt'          => 'How to price a wedding cake',
                ],
                ['id' => 7, 'intelligence' => []]
            );
        } finally {
            array_map('unlink', glob($dir . '/*') ?: []);
            rmdir($dir);
        }

        $this->assertSame('', $sent['prompt']);
        $this->assertSame('A laptop on a desk', $sent['topic']);
        $this->assertSame('How to price a wedding cake', $sent['postTitle']);
        $this->assertSame('Costs, margins and what to charge.', $sent['postExcerpt']);
        $this->assertSame('A tiered cake on a kitchen scale', $stamped[555]['_structura_image_topic']);
    }

    /** A PNG header past the 100-byte floor `process_and_import_image` checks. */
    private function tiny_png(): string
    {
        $chunk = static function (string $type, string $data): string {
            return pack('N', strlen($data)) . $type . $data . pack('N', crc32($type . $data));
        };
        return "\x89PNG\r\n\x1a\n"
            . $chunk('IHDR', pack('NNCCCCC', 1, 1, 8, 6, 0, 0, 0))
            . $chunk('tEXt', "Comment\0" . str_repeat('x', 64))
            . $chunk('IDAT', (string) gzcompress("\0\0\0\0\0"))
            . $chunk('IEND', '');
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

    // ──────────────────────────────────────────────────────────────────────
    //  THE PULSE GENERATES ON TIME (2026-11-13)
    //
    //  The pulse used to schedule the generation 0 to 90 minutes later at
    //  random. Customers who set 17:00 saw nothing at 17:00 and wrote in,
    //  so the pulse now generates in the same call. The
    //  `_jittered` hook stays registered: manual "Generate Now" runs enqueue
    //  it, and an older plugin may have left one queued before an update.
    //
    //  Each test fires the hook the way Action Scheduler does and runs the
    //  real Campaign_Cloud_Reader; only the HTTP edge (Cloud_Client), the
    //  stored license and the log table are faked.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function a_pulse_generates_in_the_same_call_and_schedules_nothing(): void
    {
        $posted = [];
        $this->fake_cloud($posted, $this->cloud_campaign());
        $this->stub_log_service();
        // Nothing an older plugin queued is pending.
        Functions\when('as_get_scheduled_actions')->justReturn([]);
        $this->expectFn('as_schedule_single_action')->never();
        $this->expectFn('as_enqueue_async_action')->never();

        $this->fire_hook('structura_run_campaign_step', ['campaign_id' => 'camp-17']);

        $generation = $this->posts_to($posted, '/executeCloudCampaignStep');
        $this->assertCount(1, $generation, 'The pulse must start the generation itself, not schedule it.');
        $this->assertSame('camp-17', $generation[0]['campaignId']);
        // No run id, so the cloud mints one and records the run as autonomous.
        $this->assertArrayNotHasKey('campaign_run_id', $generation[0]);
        $this->assertCount(1, $this->posts_to($posted, '/getCampaign'), 'One campaign read per pulse.');
    }

    /** @test */
    public function a_pulse_for_a_paused_campaign_does_not_generate(): void
    {
        $posted = [];
        $this->fake_cloud($posted, $this->cloud_campaign(['status' => 'paused']));
        $this->stub_log_service();
        $this->expectFn('as_schedule_single_action')->never();

        $this->fire_hook('structura_run_campaign_step', ['campaign_id' => 'camp-17']);

        $this->assertSame([], $this->posts_to($posted, '/executeCloudCampaignStep'));
    }

    /** @test */
    public function a_pulse_for_a_deleted_campaign_does_not_generate(): void
    {
        $posted = [];
        $this->fake_cloud($posted, null);
        $this->stub_log_service();
        $this->expectFn('as_schedule_single_action')->never();

        $this->fire_hook('structura_run_campaign_step', ['campaign_id' => 'camp-17']);

        $this->assertCount(1, $this->posts_to($posted, '/getCampaign'));
        $this->assertSame([], $this->posts_to($posted, '/executeCloudCampaignStep'));
    }

    /** @test */
    public function a_pulse_for_a_campaign_at_its_quota_completes_it_instead_of_generating(): void
    {
        $posted = [];
        $this->fake_cloud($posted, $this->cloud_campaign([
            'endMode'        => 'quota',
            'endValue'       => 3,
            'postsPublished' => 3,
        ]));
        $this->stub_log_service();
        $unscheduled = [];
        Functions\when('as_unschedule_all_actions')->alias(function ($hook) use (&$unscheduled) {
            $unscheduled[] = $hook;
        });

        $this->fire_hook('structura_run_campaign_step', ['campaign_id' => 'camp-17']);

        $this->assertSame([], $this->posts_to($posted, '/executeCloudCampaignStep'));
        $this->assertSame(
            [['status' => 'completed']],
            array_column($this->posts_to($posted, '/patchCampaign'), 'campaign')
        );
        $this->assertContains('structura_run_campaign_step', $unscheduled);
    }

    /** @test */
    public function a_failed_generation_does_not_fail_the_recurring_pulse(): void
    {
        $posted = [];
        $this->fake_cloud($posted, $this->cloud_campaign(), new \RuntimeException('socket closed'));
        $logs = [];
        $this->capture_logs($logs);

        // A throw would mark the recurring action failed, and Action
        // Scheduler stops rescheduling a recurring action that keeps failing.
        $this->fire_hook('structura_run_campaign_step', ['campaign_id' => 'camp-17']);

        $this->assertCount(1, $this->posts_to($posted, '/executeCloudCampaignStep'));
        $this->assertContains(['error', 'socket closed'], $logs);
    }

    /** @test */
    public function a_delayed_step_queued_by_an_older_plugin_still_generates(): void
    {
        $posted = [];
        $this->fake_cloud($posted, $this->cloud_campaign());
        $this->stub_log_service();

        // Plugins before 2026-11-13 queued it with the campaign id alone.
        $this->fire_hook('structura_run_campaign_step_jittered', ['campaign_id' => 'camp-17']);

        $generation = $this->posts_to($posted, '/executeCloudCampaignStep');
        $this->assertCount(1, $generation);
        $this->assertSame('camp-17', $generation[0]['campaignId']);
        $this->assertArrayNotHasKey('campaign_run_id', $generation[0]);
    }

    /** @test */
    public function a_manual_run_forwards_its_run_id_to_the_cloud(): void
    {
        $posted = [];
        $this->fake_cloud($posted, $this->cloud_campaign());
        $this->stub_log_service();

        // The args Rest_Api::run_task enqueues (RunTaskTest pins that side).
        $this->fire_hook('structura_run_campaign_step_jittered', [
            'campaign_id'     => 'camp-17',
            'campaign_run_id' => 'run-uuid',
        ]);

        $generation = $this->posts_to($posted, '/executeCloudCampaignStep');
        $this->assertCount(1, $generation);
        $this->assertSame('run-uuid', $generation[0]['campaign_run_id']);
    }

    /** @test */
    public function a_failed_manual_run_still_fails_its_action(): void
    {
        $posted = [];
        $this->fake_cloud($posted, $this->cloud_campaign(), new \RuntimeException('socket closed'));
        $this->stub_log_service();

        $this->expectException(\RuntimeException::class);

        $this->fire_hook('structura_run_campaign_step_jittered', [
            'campaign_id'     => 'camp-17',
            'campaign_run_id' => 'run-uuid',
        ]);
    }

    /**
     * Register the runner's hooks through `init()`, then fire `$hook` the way
     * Action Scheduler does: arg values spread positionally, cut to the
     * registered `$accepted_args`.
     *
     * @param array<string, mixed> $args Action Scheduler action args.
     */
    private function fire_hook(string $hook, array $args): void
    {
        $registered = [];
        Functions\when('add_action')->alias(
            function ($name, $callback, $priority = 10, $accepted_args = 1) use (&$registered) {
                $registered[$name] = [$callback, $accepted_args];
                return true;
            }
        );
        Functions\when('rest_url')->justReturn('https://example.test/wp-json/structura/v1/webhook/receive-blueprint');

        $context_builder = Mockery::mock(Context_Builder::class);
        $context_builder->shouldReceive('build_cloud_context')->andReturn([]);
        (new Task_Runner($context_builder))->init();

        [$callback, $accepted_args] = $registered[$hook];
        call_user_func_array($callback, array_slice(array_values($args), 0, $accepted_args));
    }

    /**
     * Fake the cloud behind `Cloud_Client::post`: `/getCampaign` answers with
     * `$campaign` (null for a deleted campaign), `/executeCloudCampaignStep`
     * throws `$generation_error` when given, every other call succeeds.
     * Each call is appended to `$posted` as `['route' => …, 'payload' => …]`.
     *
     * @param array<int, array<string, mixed>> $posted
     * @param array<string, mixed>|null        $campaign
     */
    private function fake_cloud(array &$posted, ?array $campaign, ?\Throwable $generation_error = null): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'lic', 'secret' => 'sek']);
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')
            ->andReturn(['plan' => 'cloud', 'license_key' => 'lic']);
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->andReturnUsing(function ($route, $payload) use (&$posted, $campaign, $generation_error) {
                $posted[] = ['route' => $route, 'payload' => $payload];
                if ($route === '/getCampaign') {
                    return ['code' => 200, 'body' => ['campaign' => $campaign]];
                }
                if ($route === '/executeCloudCampaignStep' && $generation_error !== null) {
                    throw $generation_error;
                }
                return ['code' => 200, 'body' => ['success' => true]];
            });
    }

    /**
     * An active cloud campaign doc as `/getCampaign` returns it.
     *
     * @param array<string, mixed> $overrides
     */
    private function cloud_campaign(array $overrides = []): array
    {
        return array_merge([
            'campaignId'   => 'camp-17',
            'status'       => 'active',
            'textProvider' => 'gemini',
            'language'     => 'en',
            'cronSchedule' => '0 17 * * *',
        ], $overrides);
    }

    /**
     * Payloads posted to `$route`, in order.
     *
     * @param array<int, array<string, mixed>> $posted
     */
    private function posts_to(array $posted, string $route): array
    {
        $payloads = [];
        foreach ($posted as $call) {
            if ($call['route'] === $route) {
                $payloads[] = $call['payload'];
            }
        }
        return $payloads;
    }

    /**
     * Record `Log_Service::add` calls in `$logs` as `[level, message]` pairs.
     *
     * @param array<int, array{0: string, 1: string}> $logs
     */
    private function capture_logs(array &$logs): void
    {
        Mockery::mock('alias:Structura\Core\Log_Service')
            ->shouldReceive('add')
            ->andReturnUsing(function ($level, $message) use (&$logs) {
                $logs[] = [$level, $message];
            });
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

    // ──────────────────────────────────────────────────────────────────────
    //  WEBHOOK RECEIVER (2026-11-13, first AppSumo site)
    //
    //  An unsigned POST to /webhook/receive-blueprint was a fatal 500: the
    //  signature-mismatch throw passed the string 'webhook' as Exception's
    //  `$previous`. A bad signature is now a plain 401.
    //
    //  The same site showed "Structura Cloud can't reach this site" while
    //  the cloud was delivering to it. Only the cloud holds the signing
    //  secret, so a request that verifies clears a cached "unreachable"
    //  verdict, and writes nothing when there is none to clear.
    // ──────────────────────────────────────────────────────────────────────

    private const WEBHOOK_SECRET = 'whsec-receiver-test';

    private const PULSE = ['message' => 'Pulse check initiated.', 'type' => 'pulse_check'];

    /** A blueprint for a run whose post already exists (post 42). */
    private const DELIVERY = [
        'campaign_id'     => 'cmp-1',
        'campaign_run_id' => 'run-1',
        'ai_output'       => ['title' => 'A delivered post'],
    ];

    private const UNREACHABLE = ['ok' => false, 'checked_at' => 1, 'message' => 'Forbidden'];

    /** @test */
    public function an_unsigned_webhook_gets_a_401_and_leaves_the_verdict_alone(): void
    {
        $this->stage_webhook_receiver(self::UNREACHABLE);
        $this->expectFn('update_option')->never();

        $response = (new Task_Runner())->receive_cloud_blueprint($this->webhook_request(self::PULSE, null));

        $this->assert_rejected_with_401($response);
    }

    /** @test */
    public function a_wrongly_signed_webhook_gets_a_401_and_leaves_the_verdict_alone(): void
    {
        $this->stage_webhook_receiver(self::UNREACHABLE);
        $this->expectFn('update_option')->never();

        $response = (new Task_Runner())->receive_cloud_blueprint($this->webhook_request(
            self::DELIVERY,
            hash_hmac('sha256', (string) json_encode(self::DELIVERY), 'not-the-site-secret')
        ));

        $this->assert_rejected_with_401($response);
    }

    /**
     * @return array<string, array{0: array<string, mixed>}>
     */
    public function verified_cloud_requests(): array
    {
        return [
            'pulse check'        => [self::PULSE],
            'blueprint delivery' => [self::DELIVERY],
        ];
    }

    /**
     * @test
     * @dataProvider verified_cloud_requests
     *
     * @param array<string, mixed> $payload
     */
    public function a_verified_request_clears_a_cached_unreachable_verdict(array $payload): void
    {
        $this->stage_webhook_receiver(self::UNREACHABLE);
        $writes = [];
        $this->capture_option_writes($writes);

        $response = (new Task_Runner())->receive_cloud_blueprint($this->signed_request($payload));

        $this->assertTrue($response['success']);
        $this->assertCount(1, $writes);
        $this->assertSame(Site_Reachability::OPTION, $writes[0]['option']);
        $this->assertTrue($writes[0]['value']['ok']);
        $this->assertGreaterThan(self::UNREACHABLE['checked_at'], $writes[0]['value']['checked_at']);
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: mixed}>
     */
    public function verified_requests_with_nothing_to_clear(): array
    {
        $reachable = ['ok' => true, 'checked_at' => 1, 'message' => 'Pulse verified!'];

        return [
            'pulse check, cached reachable'        => [self::PULSE, $reachable],
            'pulse check, never probed'            => [self::PULSE, false],
            'blueprint delivery, cached reachable' => [self::DELIVERY, $reachable],
            'blueprint delivery, never probed'     => [self::DELIVERY, false],
        ];
    }

    /**
     * @test
     * @dataProvider verified_requests_with_nothing_to_clear
     *
     * @param array<string, mixed> $payload
     * @param mixed                $cached_verdict `get_option` value; false when absent.
     */
    public function a_verified_request_writes_nothing_without_an_unreachable_verdict(array $payload, $cached_verdict): void
    {
        $this->stage_webhook_receiver($cached_verdict);
        $this->expectFn('update_option')->never();

        $response = (new Task_Runner())->receive_cloud_blueprint($this->signed_request($payload));

        $this->assertTrue($response['success']);
    }

    /**
     * Site secret, cached reachability verdict and the WP edges the receiver
     * touches. Site_Reachability itself runs for real.
     *
     * @param mixed $cached_verdict `get_option` value for the verdict; false when absent.
     */
    private function stage_webhook_receiver($cached_verdict): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['secret' => self::WEBHOOK_SECRET]);
        $this->stub_log_service();
        Functions\when('rest_ensure_response')->returnArg();
        Functions\when('get_option')->alias(function ($name, $default = false) use ($cached_verdict) {
            return $name === Site_Reachability::OPTION ? $cached_verdict : $default;
        });
        if ( ! class_exists('WP_Query')) {
            class_alias(Run_Already_Applied_Query::class, 'WP_Query');
        }
    }

    /**
     * Record every `update_option` call into `$writes`.
     *
     * @param array<int, array{option: string, value: mixed}> $writes
     */
    private function capture_option_writes(array &$writes): void
    {
        Functions\when('update_option')->alias(function ($option, $value) use (&$writes) {
            $writes[] = ['option' => $option, 'value' => $value];
            return true;
        });
    }

    /**
     * Returns a request carrying `$payload` signed with the site's secret.
     *
     * @param array<string, mixed> $payload
     */
    private function signed_request(array $payload): object
    {
        return $this->webhook_request(
            $payload,
            hash_hmac('sha256', (string) json_encode($payload), self::WEBHOOK_SECRET)
        );
    }

    /**
     * Returns a request shaped like the `WP_REST_Request` the receiver reads.
     *
     * @param array<string, mixed> $payload
     */
    private function webhook_request(array $payload, ?string $signature): object
    {
        // PHP 7.4-compatible: no constructor property promotion.
        return new class((string) json_encode($payload), $signature) {
            /** @var string */
            private $body;

            /** @var string|null */
            private $signature;

            public function __construct(string $body, ?string $signature)
            {
                $this->body      = $body;
                $this->signature = $signature;
            }

            public function get_header(string $key): ?string
            {
                return $key === 'x-structura-signature' ? $this->signature : null;
            }

            public function get_body(): string
            {
                return $this->body;
            }

            public function get_json_params(): array
            {
                return json_decode($this->body, true);
            }
        };
    }

    /**
     * @param mixed $response
     */
    private function assert_rejected_with_401($response): void
    {
        $this->assertInstanceOf(\WP_Error::class, $response);
        $this->assertSame(['status' => 401], $response->get_error_data());
    }
}

/**
 * Stands in for `\WP_Query` in the receiver tests: every query finds post 42,
 * so `apply_blueprint` takes its "run already applied" exit.
 */
class Run_Already_Applied_Query
{
    /** @var int[] */
    public $posts = [42];

    /**
     * @param array<string, mixed> $args
     */
    public function __construct(array $args = [])
    {
    }

    public function have_posts(): bool
    {
        return true;
    }
}
