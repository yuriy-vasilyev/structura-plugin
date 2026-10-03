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
 *   - the BYOK tier models of the 2026-10-02 refresh are listed and the
 *     superseded ids are not.
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
            'openai'    => ['text' => 'gpt-5.6-sol', 'fast' => 'gpt-5.4-mini', 'image' => 'gpt-image-1-mini'],
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

    /** @test */
    public function the_refreshed_tier_models_are_listed_and_the_superseded_ones_are_not(): void
    {
        $text = array_merge(
            ...array_map(
                static function (string $p): array {
                    return array_column(Provider_Registry::get_models($p, 'text'), 'id');
                },
                self::PROVIDERS
            )
        );

        foreach (['claude-sonnet-5-5', 'claude-opus-5-5', 'gpt-5.6-sol', 'gpt-6-astra', 'gemini-3.8-flash', 'gemini-3.1-pro-preview'] as $id) {
            $this->assertContains($id, $text);
        }
        foreach (['claude-sonnet-5', 'claude-opus-4-8', 'gpt-5.4-mini', 'gpt-5.2-2025-12-11', 'gemini-3.5-flash', 'claude-sonnet-4-6', 'dall-e-3'] as $id) {
            $this->assertNotContains($id, $text);
        }
    }
}
