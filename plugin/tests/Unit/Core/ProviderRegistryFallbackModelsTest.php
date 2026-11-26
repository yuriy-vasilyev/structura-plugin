<?php

namespace Structura\Tests\Unit\Core;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Core\Provider_Registry;
use Structura\Tests\Unit\TestCase;

/**
 * Pin the bundled `config/models.json`, the offline copy of the served
 * model catalog that {@see Provider_Registry} reads when the cloud's
 * `/getAvailableModels` is unreachable.
 *
 * The file is hand-kept and had drifted to retired ids (GPT-5.2, Claude
 * Sonnet 4.6, DALL-E 3). Brought in line with the served catalog on
 * 2026-10-02 (specs/byok-ai-guidance.md §2). Tests run through the public
 * entry points with the cloud call failing, so the registry really reads
 * the file:
 *
 *   - the file parses and every provider is present;
 *   - text and image defaults are listed models of the right capability;
 *   - every listed model has a manifest entry;
 *   - since 2026-11-25 each provider lists one text and one image model, the
 *     Standard one, as the served catalog does (specs/byok-ai-guidance.md
 *     §2.2), and no superseded, Top, cheap or untiered id.
 *
 * @covers \Structura\Core\Provider_Registry::get_models
 * @covers \Structura\Core\Provider_Registry::get_default_model
 * @covers \Structura\Core\Provider_Registry::get_model_manifest
 * @covers \Structura\Core\Provider_Registry::is_using_fallback
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class ProviderRegistryFallbackModelsTest extends TestCase
{
    private const PROVIDERS = ['openai', 'gemini', 'anthropic'];

    protected function setUp(): void
    {
        parent::setUp();

        if ( ! defined('STRUCTURA_PATH')) {
            define('STRUCTURA_PATH', dirname(__DIR__, 3) . '/');
        }

        // Cloud unreachable, nothing cached: the registry falls back to
        // the bundled file.
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post_json')
            ->andReturn(new \WP_Error('http_request_failed', 'offline'));
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @test */
    public function the_bundled_file_parses_and_is_the_source(): void
    {
        $raw = json_decode((string) file_get_contents(STRUCTURA_PATH . 'config/models.json'), true);

        $this->assertSame(JSON_ERROR_NONE, json_last_error());
        $this->assertSame(self::PROVIDERS, array_keys($raw));
        $this->assertNotEmpty(Provider_Registry::get_models('openai', 'text'));
        $this->assertTrue(Provider_Registry::is_using_fallback());
    }

    /** @test */
    public function text_and_image_defaults_are_listed_models(): void
    {
        foreach (self::PROVIDERS as $provider) {
            foreach (['text', 'image'] as $capability) {
                $default = Provider_Registry::get_default_model($provider, $capability);
                $listed  = array_column(Provider_Registry::get_models($provider, $capability), 'id');

                if ($provider === 'anthropic' && $capability === 'image') {
                    // Anthropic has no image models; its default is blank.
                    $this->assertSame('', $default);
                    $this->assertSame([], $listed);
                    continue;
                }

                $this->assertContains($default, $listed, "$provider $capability default is not listed");
            }
        }
    }

    /** @test */
    public function defaults_match_the_served_catalog(): void
    {
        $expected = [
            'openai'    => ['text' => 'gpt-5.6-sol', 'fast' => 'gpt-5.4-mini', 'image' => 'gpt-image-2.6-flare'],
            'gemini'    => ['text' => 'gemini-3.8-flash', 'fast' => 'gemini-3.5-flash', 'image' => 'gemini-3.1-flash-image'],
            'anthropic' => ['text' => 'claude-sonnet-5-5', 'fast' => 'claude-haiku-4-5-20251001', 'image' => ''],
        ];

        foreach ($expected as $provider => $roles) {
            foreach ($roles as $role => $id) {
                $this->assertSame($id, Provider_Registry::get_default_model($provider, $role), "$provider $role");
            }
        }
    }

    /** @test */
    public function every_listed_model_has_a_manifest_entry(): void
    {
        foreach (self::PROVIDERS as $provider) {
            foreach (['text', 'image'] as $capability) {
                foreach (Provider_Registry::get_models($provider, $capability) as $model) {
                    $manifest = Provider_Registry::get_model_manifest($model['id']);
                    $this->assertIsArray($manifest, "{$model['id']} has no manifest entry");
                    $this->assertArrayHasKey('endpoint', $manifest);
                }
            }
        }
    }

    /**
     * No customer picks a model or a tier since 2026-11-25 (owner decision,
     * specs/byok-ai-guidance.md §2.2): the cloud runs each provider's Standard
     * model, so the offline catalog lists that one model per role, like the
     * served one, and an old wizard offers nothing the cloud would ignore.
     *
     * @test
     */
    public function each_provider_lists_only_its_standard_text_model(): void
    {
        $this->assertSame(['gpt-5.6-sol'], array_column(Provider_Registry::get_models('openai', 'text'), 'id'));
        $this->assertSame(['gemini-3.8-flash'], array_column(Provider_Registry::get_models('gemini', 'text'), 'id'));
        $this->assertSame(['claude-sonnet-5-5'], array_column(Provider_Registry::get_models('anthropic', 'text'), 'id'));

        foreach (self::PROVIDERS as $provider) {
            $listed = array_column(Provider_Registry::get_models($provider, 'text'), 'id');
            $this->assertSame([Provider_Registry::get_default_model($provider, 'text')], $listed);
        }

        $text = array_merge(
            ...array_map(
                static function (string $p): array {
                    return array_column(Provider_Registry::get_models($p, 'text'), 'id');
                },
                self::PROVIDERS
            )
        );
        $gone = [
            // Top tier, cheap tier and untiered ids, unlisted 2026-11-25.
            'claude-opus-5-5', 'gpt-6-astra', 'gemini-3.1-pro-preview', 'claude-haiku-4-5-20251001',
            'gpt-5-nano-2025-08-07', 'gemini-3.1-flash-lite', 'gpt-4o', 'gpt-4o-mini', 'gemini-2.5-pro',
            // Superseded 2026-10-02 and older retirees.
            'claude-sonnet-5', 'claude-opus-4-8', 'gpt-5.4-mini', 'gpt-5.2-2025-12-11', 'gemini-3.5-flash', 'claude-sonnet-4-6', 'dall-e-3',
        ];
        foreach ($gone as $id) {
            $this->assertNotContains($id, $text);
            $this->assertNull(Provider_Registry::get_model_manifest($id), "$id still has a manifest entry");
        }
    }

    /**
     * Own-key OpenAI images run on one model since 2026-11-25
     * (specs/byok-ai-guidance.md §2.1): GPT Image 1 Mini (shut down
     * 2026-12-01) and GPT Image 2 left the served catalog.
     *
     * @test
     */
    public function openai_offers_one_image_model_and_not_the_retired_ones(): void
    {
        $image = array_column(Provider_Registry::get_models('openai', 'image'), 'id');

        $this->assertSame(['gpt-image-2.6-flare'], $image);
        foreach (['gpt-image-1-mini', 'gpt-image-2'] as $retired) {
            $this->assertNull(Provider_Registry::get_model_manifest($retired), "$retired still has a manifest entry");
        }
        // Gemini's Top image model left with the tier picker (2026-11-25).
        $this->assertSame(['gemini-3.1-flash-image'], array_column(Provider_Registry::get_models('gemini', 'image'), 'id'));
        $this->assertNull(Provider_Registry::get_model_manifest('gemini-3-pro-image'));
    }
}
