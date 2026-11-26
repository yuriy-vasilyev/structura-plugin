<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * No site picks a model or a tier since 2026-11-25 (owner decision,
 * specs/byok-ai-guidance.md §2.2): the provider wizard's model dropdowns
 * and its "Use recommended model" switch are gone, and the cloud runs each
 * provider's Standard model. The settings save no longer writes
 * `structura_{text,image}_{model,tier}_{provider}` and the settings payload
 * no longer reads them back. The default providers still save.
 *
 * @covers \Structura\Api\Rest_Api::update_settings
 * @covers \Structura\Api\Rest_Api::build_settings_payload
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class ProviderSettingsNoModelTest extends TestCase
{
    /** @var array<string,mixed> */
    private array $options = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->options = [];

        Functions\stubs([
            'rest_ensure_response' => function ($data) { return $data; },
            'sanitize_text_field'  => function ($v) { return is_string($v) ? trim($v) : ''; },
            'sanitize_key'         => function ($v) { return strtolower(preg_replace('/[^a-z0-9_\-]/i', '', (string)$v)); },
            'get_current_user_id'  => 1,
            'get_user_meta'        => '',
            // A warm model cache, so no cloud call happens.
            'get_transient'        => [
                'openai'    => ['defaults' => ['text' => 'gpt-5.6-sol', 'image' => 'gpt-image-1-mini']],
                'gemini'    => ['defaults' => ['text' => 'gemini-3.8-flash', 'image' => 'gemini-3.1-flash-image']],
                'anthropic' => ['defaults' => ['text' => 'claude-sonnet-5-5']],
            ],
        ]);
        Functions\when('update_option')->alias(function ($key, $value) {
            $this->options[$key] = $value;
            return true;
        });
        Functions\when('get_option')->alias(function ($key, $default = false) {
            return array_key_exists($key, $this->options) ? $this->options[$key] : $default;
        });

        $license = Mockery::mock('alias:Structura\Core\License_Manager');
        $license->shouldReceive('get_plan')->andReturn('free');
        $license->shouldReceive('get_license_data')->andReturn(['plan' => 'free']);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('get_provider_bindings')->andReturn([]);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @test */
    public function a_save_that_still_carries_models_or_tiers_writes_none_of_them(): void
    {
        (new Rest_Api())->update_settings($this->request([
            'ai' => [
                'anthropic' => ['text_model' => 'claude-opus-5-5', 'text_tier' => 'top'],
                'gemini'    => ['image_model' => 'gemini-3-pro-image', 'image_tier' => 'top'],
                'defaults'  => ['text_provider' => 'anthropic', 'image_provider' => 'gemini'],
            ],
        ]));

        foreach (array_keys($this->options) as $key) {
            $this->assertDoesNotMatchRegularExpression('/^structura_(text|image)_(model|tier)_/', $key);
        }
        // The default providers still save.
        $this->assertSame('anthropic', $this->options['structura_default_text_provider']);
        $this->assertSame('gemini', $this->options['structura_default_image_provider']);
    }

    /** @test */
    public function the_settings_payload_carries_no_model_or_tier_even_for_a_site_that_stored_one(): void
    {
        $this->options['structura_text_model_openai'] = 'gpt-6-astra';
        $this->options['structura_text_tier_openai']  = 'top';

        $payload = Rest_Api::build_settings_payload([]);

        foreach ($payload['ai']['providers'] as $provider) {
            foreach (['text_model', 'image_model', 'text_tier', 'image_tier'] as $key) {
                $this->assertArrayNotHasKey($key, $provider);
            }
            $this->assertArrayHasKey('connected', $provider);
            $this->assertArrayHasKey('capabilities', $provider);
        }
        // Every provider is listed on Free since 2026-10-06.
        $this->assertSame(['openai', 'gemini', 'anthropic'], array_keys($payload['ai']['providers']));
    }

    private function request(array $params): object
    {
        return new class($params) {
            private array $params;

            public function __construct(array $params)
            {
                $this->params = $params;
            }

            public function get_json_params(): array
            {
                return $this->params;
            }
        };
    }
}
