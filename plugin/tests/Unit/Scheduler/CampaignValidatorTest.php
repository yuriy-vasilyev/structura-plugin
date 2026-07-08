<?php

namespace Structura\Tests\Unit\Scheduler;

use Structura\Scheduler\Campaign_Validator;
use Structura\Tests\Unit\TestCase;

/**
 * @covers \Structura\Scheduler\Campaign_Validator
 */
class CampaignValidatorTest extends TestCase
{
    // ──────────────────────────────────────────────────────────────────────
    //  HAPPY PATH
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_validates_a_complete_valid_payload(): void
    {
        $result = Campaign_Validator::validate($this->validPayload());

        $this->assertIsArray($result, 'Expected clean array, got WP_Error');
        $this->assertSame('Test Campaign', $result['name']);
        // `provider` is no longer stored (dead field since the split).
        // Only the split fields make it to storage.
        $this->assertArrayNotHasKey('provider', $result);
        $this->assertSame('gemini', $result['text_provider']);
    }

    /** @test */
    public function it_returns_sanitized_values(): void
    {
        $result = Campaign_Validator::validate($this->validPayload([
            'name'  => '  <b>Injected</b> Name  ',
            'topic' => '  <script>alert(1)</script> A valid topic that is long enough for the validator  ',
        ]));

        $this->assertIsArray($result);
        $this->assertSame('Injected Name', $result['name']);
        $this->assertStringNotContainsString('<script>', $result['topic']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  REQUIRED FIELDS
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_rejects_empty_name(): void
    {
        $result = Campaign_Validator::validate($this->validPayload(['name' => '']));

        $this->assertInstanceOf(\WP_Error::class, $result);
        $data = $result->get_error_data();
        $this->assertArrayHasKey('name', $data['fields']);
    }

    /** @test */
    public function it_rejects_short_topic(): void
    {
        $result = Campaign_Validator::validate($this->validPayload(['topic' => 'Too short']));

        $this->assertInstanceOf(\WP_Error::class, $result);
        $data = $result->get_error_data();
        $this->assertArrayHasKey('topic', $data['fields']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  CAMPAIGN MODE
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_accepts_valid_campaign_modes(): void
    {
        foreach (['traffic_magnet', 'quick_wins', 'conversion', 'authority'] as $mode) {
            $result = Campaign_Validator::validate($this->validPayload(['campaign_mode' => $mode]));
            $this->assertIsArray($result);
            $this->assertSame($mode, $result['campaign_mode']);
        }
    }

    /** @test */
    public function it_defaults_invalid_campaign_mode_to_traffic_magnet(): void
    {
        $result = Campaign_Validator::validate($this->validPayload(['campaign_mode' => 'invalid_mode']));

        $this->assertIsArray($result);
        $this->assertSame('traffic_magnet', $result['campaign_mode']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  CRON VALIDATION
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_accepts_valid_cron_expressions(): void
    {
        $expressions = [
            '0 9 * * 1',       // Weekly Monday 9am
            '30 8 * * 1-5',    // Weekdays 8:30am
            '0 0 1 * *',       // Monthly
            '*/15 * * * *',    // Every 15 minutes
        ];

        foreach ($expressions as $cron) {
            $result = Campaign_Validator::validate($this->validPayload(['cron_schedule' => $cron]));
            $this->assertIsArray($result, "Cron expression '$cron' should be valid");
        }
    }

    /** @test */
    public function it_rejects_invalid_cron_expressions(): void
    {
        $invalid = [
            '0 9 * *',          // Only 4 fields
            '0 9 * * * *',      // 6 fields
            'every monday',     // Not cron
            '',                 // Empty
        ];

        foreach ($invalid as $cron) {
            $result = Campaign_Validator::validate($this->validPayload(['cron_schedule' => $cron]));
            $this->assertInstanceOf(\WP_Error::class, $result, "Cron expression '$cron' should be invalid");
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  END CONDITIONS
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_defaults_invalid_end_mode_to_infinite(): void
    {
        $result = Campaign_Validator::validate($this->validPayload(['end_mode' => 'garbage']));

        $this->assertIsArray($result);
        $this->assertSame('infinite', $result['end_mode']);
    }

    /** @test */
    public function it_rejects_quota_mode_with_zero_posts(): void
    {
        $result = Campaign_Validator::validate($this->validPayload([
            'end_mode'  => 'quota',
            'end_posts' => 0,
        ]));

        $this->assertInstanceOf(\WP_Error::class, $result);
        $data = $result->get_error_data();
        $this->assertArrayHasKey('end_posts', $data['fields']);
    }

    /** @test */
    public function it_rejects_quota_mode_with_negative_posts(): void
    {
        $result = Campaign_Validator::validate($this->validPayload([
            'end_mode'  => 'quota',
            'end_posts' => -5,
        ]));

        $this->assertInstanceOf(\WP_Error::class, $result);
    }

    /** @test */
    public function it_accepts_quota_mode_with_positive_posts(): void
    {
        $result = Campaign_Validator::validate($this->validPayload([
            'end_mode'  => 'quota',
            'end_posts' => 25,
        ]));

        $this->assertIsArray($result);
        $this->assertSame(25, $result['end_posts']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  INTELLIGENCE FIELDS
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_enforces_minimum_post_length(): void
    {
        $result = Campaign_Validator::validate($this->validPayload(['post_length' => 50]));

        $this->assertIsArray($result);
        $this->assertSame(300, $result['post_length'], 'Post length below 300 should be clamped to 300');
    }

    /** @test */
    public function it_handles_random_persona_id(): void
    {
        $result = Campaign_Validator::validate($this->validPayload(['persona_id' => 'random']));

        $this->assertIsArray($result);
        $this->assertSame('random', $result['persona_id']);
    }

    /** @test */
    public function it_casts_numeric_persona_id_to_int(): void
    {
        $result = Campaign_Validator::validate($this->validPayload(['persona_id' => '42']));

        $this->assertIsArray($result);
        $this->assertSame(42, $result['persona_id']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  BOOLEAN FIELDS
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_casts_boolean_fields_correctly(): void
    {
        $result = Campaign_Validator::validate($this->validPayload([
            'featured_image'      => 'true',
            'body_images'         => '1',
            'replace_long_dashes' => 0,
            'disable_emojis'      => 'yes',
        ]));

        $this->assertIsArray($result);
        $this->assertTrue($result['featured_image']);
        $this->assertTrue($result['body_images']);
        $this->assertFalse($result['replace_long_dashes']);
        // filter_var('yes', FILTER_VALIDATE_BOOLEAN) === false
        // This documents the actual behaviour — "yes" is NOT truthy for FILTER_VALIDATE_BOOLEAN
    }

    /**
     * Pre-generation toggle round-trip — regression test for Yurii's
     * 2026-05-08 incident where toggling OFF in the campaign edit form
     * silently didn't persist. Cause: the validator never read the
     * field from the input, so the cleaned payload didn't contain it,
     * and the transformer's downstream `?? true` defaulted it back ON.
     *
     * @test
     */
    public function it_persists_pregeneration_enabled_false_through_the_validator(): void
    {
        $result = Campaign_Validator::validate($this->validPayload([
            'pregeneration_enabled' => false,
        ]));

        $this->assertArrayHasKey('pregeneration_enabled', $result);
        $this->assertFalse($result['pregeneration_enabled']);
    }

    /** @test */
    public function it_defaults_pregeneration_enabled_to_true_when_field_is_absent(): void
    {
        // Phase 1.0a default — new campaigns opt in unless the form
        // explicitly opts out. Validator must mirror that.
        $payload = $this->validPayload();
        unset($payload['pregeneration_enabled']);

        $result = Campaign_Validator::validate($payload);

        $this->assertTrue($result['pregeneration_enabled']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  SEO RULES
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_sanitizes_seo_rules_to_booleans(): void
    {
        $result = Campaign_Validator::validate($this->validPayload([
            'seo_optimization_rules' => [
                'use_keyphrase'    => 1,
                'optimize_headers' => 'yes',
                'add_meta'         => 0,
            ],
        ]));

        $this->assertIsArray($result);
        $this->assertTrue($result['seo_optimization_rules']['use_keyphrase']);
        $this->assertTrue($result['seo_optimization_rules']['optimize_headers']);
        $this->assertFalse($result['seo_optimization_rules']['add_meta']);
    }

    /** @test */
    public function it_handles_non_array_seo_rules(): void
    {
        $result = Campaign_Validator::validate($this->validPayload([
            'seo_optimization_rules' => 'not-an-array',
        ]));

        $this->assertIsArray($result);
        $this->assertSame([], $result['seo_optimization_rules']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  TAXONOMY FIELDS
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_casts_taxonomy_ids_to_integers(): void
    {
        $result = Campaign_Validator::validate($this->validPayload([
            'allowed_categories' => ['1', '2', '3'],
            'allowed_tags'       => ['10', '20'],
        ]));

        $this->assertIsArray($result);
        $this->assertSame([1, 2, 3], $result['allowed_categories']);
        $this->assertSame([10, 20], $result['allowed_tags']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  MULTIPLE ERRORS
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_collects_multiple_validation_errors(): void
    {
        $result = Campaign_Validator::validate($this->validPayload([
            'name'          => '',
            'topic'         => 'short',
            'cron_schedule' => 'bad',
            'end_mode'      => 'quota',
            'end_posts'     => 0,
        ]));

        $this->assertInstanceOf(\WP_Error::class, $result);
        $data = $result->get_error_data();

        $this->assertArrayHasKey('name', $data['fields']);
        $this->assertArrayHasKey('topic', $data['fields']);
        $this->assertArrayHasKey('cron_schedule', $data['fields']);
        $this->assertArrayHasKey('end_posts', $data['fields']);
        $this->assertSame(422, $data['status']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  PROVIDER SPLIT (text_provider / image_provider)
    //
    //  Contract after the text/image provider split:
    //   - text_provider is MANDATORY — missing = WP_Error (422).
    //   - image_provider is OPTIONAL — absent = null (campaign runs
    //     text-only). Present but not image-capable = WP_Error (422).
    //     No silent fallback to openai — that's the bug class we're
    //     stamping out.
    //   - Legacy `provider` in the payload is accepted as a read-only
    //     fallback for text_provider but is NEVER written to storage.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_extracts_text_provider_from_payload(): void
    {
        $result = Campaign_Validator::validate($this->validPayload([
            'provider'      => 'openai',
            'text_provider' => 'anthropic',
        ]));

        $this->assertIsArray($result);
        $this->assertSame('anthropic', $result['text_provider']);
    }

    /** @test */
    public function it_falls_back_text_provider_to_legacy_provider(): void
    {
        $result = Campaign_Validator::validate($this->validPayload([
            'provider' => 'gemini',
            // text_provider intentionally absent
        ]));

        $this->assertIsArray($result);
        $this->assertSame('gemini', $result['text_provider']);
    }

    /** @test */
    public function it_rejects_when_text_provider_and_legacy_provider_both_absent(): void
    {
        $payload = $this->validPayload();
        unset($payload['provider'], $payload['text_provider']);

        $result = Campaign_Validator::validate($payload);

        $this->assertInstanceOf(\WP_Error::class, $result);
        $data = $result->get_error_data();
        $this->assertArrayHasKey('text_provider', $data['fields']);
    }

    /** @test */
    public function it_extracts_image_provider_from_payload(): void
    {
        $result = Campaign_Validator::validate($this->validPayload([
            'image_provider' => 'gemini',
        ]));

        $this->assertIsArray($result);
        $this->assertSame('gemini', $result['image_provider']);
    }

    /** @test */
    public function it_rejects_text_only_provider_as_image_provider(): void
    {
        // Anthropic has no image capability → validation error (was a
        // silent fallback to openai; that's the bug this class of tests
        // now pins closed).
        $result = Campaign_Validator::validate($this->validPayload([
            'provider'       => 'anthropic',
            'image_provider' => 'anthropic',
        ]));

        $this->assertInstanceOf(\WP_Error::class, $result);
        $data = $result->get_error_data();
        $this->assertArrayHasKey('image_provider', $data['fields']);
    }

    /** @test */
    public function it_allows_openai_as_image_provider(): void
    {
        $result = Campaign_Validator::validate($this->validPayload([
            'image_provider' => 'openai',
        ]));

        $this->assertIsArray($result);
        $this->assertSame('openai', $result['image_provider']);
    }

    /** @test */
    public function it_allows_gemini_as_image_provider(): void
    {
        $result = Campaign_Validator::validate($this->validPayload([
            'image_provider' => 'gemini',
        ]));

        $this->assertIsArray($result);
        $this->assertSame('gemini', $result['image_provider']);
    }

    /** @test */
    public function it_rejects_unknown_image_provider(): void
    {
        $result = Campaign_Validator::validate($this->validPayload([
            'image_provider' => 'nonexistent_provider',
        ]));

        $this->assertInstanceOf(\WP_Error::class, $result);
        $data = $result->get_error_data();
        $this->assertArrayHasKey('image_provider', $data['fields']);
    }

    /** @test */
    public function it_stores_null_image_provider_when_absent(): void
    {
        // image_provider is optional. A campaign that doesn't ship it
        // stores null and generates text-only. NO fallback to openai.
        $payload = $this->validPayload([
            'provider' => 'openai',
        ]);
        unset($payload['image_provider']);

        $result = Campaign_Validator::validate($payload);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('image_provider', $result);
        $this->assertNull($result['image_provider']);
    }

    /** @test */
    public function it_stores_null_image_provider_even_when_legacy_provider_is_text_only(): void
    {
        // Legacy `provider: anthropic` no longer bleeds into image_provider
        // either as-is (would break image capability) or as a silent
        // openai default. image_provider simply stays null.
        $payload = $this->validPayload([
            'provider' => 'anthropic',
        ]);
        unset($payload['image_provider']);

        $result = Campaign_Validator::validate($payload);

        $this->assertIsArray($result);
        $this->assertNull($result['image_provider']);
    }

    /** @test */
    public function it_sanitizes_provider_keys(): void
    {
        $result = Campaign_Validator::validate($this->validPayload([
            'provider'       => 'OpenAI',         // uppercase
            'text_provider'  => 'Anthropic',       // uppercase
            'image_provider' => 'OpenAI',          // uppercase (valid image provider)
        ]));

        $this->assertIsArray($result);
        $this->assertArrayNotHasKey('provider', $result, 'Legacy provider must not leak into storage');
        $this->assertSame('anthropic', $result['text_provider']);
        $this->assertSame('openai', $result['image_provider']);
    }

    /** @test */
    public function it_handles_full_provider_split_payload_with_claude_text_and_gemini_image(): void
    {
        $result = Campaign_Validator::validate($this->validPayload([
            'provider'       => 'anthropic',
            'text_provider'  => 'anthropic',
            'image_provider' => 'gemini',
            'text_model'     => 'claude-sonnet-4-5-20250514',
            'image_model'    => 'imagen-3.0-generate-002',
        ]));

        $this->assertIsArray($result);
        $this->assertSame('anthropic', $result['text_provider']);
        $this->assertSame('gemini', $result['image_provider']);
        $this->assertSame('claude-sonnet-4-5-20250514', $result['text_model']);
        $this->assertSame('imagen-3.0-generate-002', $result['image_model']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  FIXTURE
    // ──────────────────────────────────────────────────────────────────────

    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'name'                   => 'Test Campaign',
            'topic'                  => 'A sufficiently long topic about AI content generation strategies',
            'campaign_mode'          => 'traffic_magnet',
            'provider'               => 'gemini',
            'text_model'             => 'gemini-pro',
            'image_model'            => 'imagen-3',
            'persona_id'             => 1,
            'language'               => 'en',
            'post_length'            => 1200,
            'replace_long_dashes'    => false,
            'disable_emojis'         => false,
            'seo_optimization_rules' => ['use_keyphrase' => true],
            'enabled_blocks'         => ['core/paragraph', 'core/heading', 'core/list'],
            'featured_image'         => true,
            'body_images'            => false,
            'enable_disclosure'      => true,
            'disclosure_text'        => 'This post was generated by AI.',
            'category_mode'          => 'auto',
            'allowed_categories'     => [],
            'tag_mode'               => 'auto',
            'allowed_tags'           => [],
            'cron_schedule'          => '0 9 * * 1',
            'end_mode'               => 'quota',
            'end_posts'              => 10,
            'end_date'               => '',
        ], $overrides);
    }
}
