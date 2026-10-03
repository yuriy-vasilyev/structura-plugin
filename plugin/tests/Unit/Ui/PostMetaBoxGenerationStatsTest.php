<?php

namespace Structura\Tests\Unit\Ui;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Tests\Unit\TestCase;
use Structura\Ui\Post_Meta_Box;

/**
 * Pin the meta box "Generation Stats" block on managed and BYOK plans.
 *
 * Since 2026-10-01 managed plans (Cloud, Cloud Pro) write with one AI
 * lineup chosen by Structura and are metered by posts, so their
 * customers never see a model id or a token count
 * (specs/managed-ai-lineup.md §3.3). The cloud also starts sending
 * `generation_meta.model: ""` for them, and an older post can still carry
 * the raw model id, so the plugin hides both lines by plan. On every plan
 * a blank model must not leave an empty stat line behind.
 *
 * Rendered through the public `render()` entry point with only the
 * license plan, post meta and WP output helpers stubbed at the edge.
 *
 * @covers \Structura\Ui\Post_Meta_Box::render
 * @covers \Structura\Ui\Post_Meta_Box::generation_stats_lines
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class PostMetaBoxGenerationStatsTest extends TestCase
{
    private const GENERATED_AT = '2026-09-30T08:15:00Z';

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @test */
    public function managed_plan_hides_the_model_and_token_lines_of_an_older_post(): void
    {
        // A post generated before the cloud blanked the model still
        // carries the raw id and usage in its meta.
        $html = $this->render_for('cloud_pro', [
            'model'        => 'claude-sonnet-5-5',
            'provider'     => 'anthropic',
            'usage'        => ['inputTokens' => 1200, 'outputTokens' => 3400],
            'generated_at' => self::GENERATED_AT,
        ]);

        $this->assertStringNotContainsString('claude-sonnet-5-5', $html);
        $this->assertStringNotContainsString('tokens used', $html);
        // The generated date stays, so the stats block is still there.
        $this->assertStringContainsString('structura-mb__stats', $html);
        $this->assertStringContainsString('Sep 30, 2026', $html);
        $this->assertSame(1, substr_count($html, 'class="structura-mb__stat"'));
    }

    /** @test */
    public function managed_plan_with_a_blank_model_from_the_new_cloud_renders_no_model_line(): void
    {
        $html = $this->render_for('cloud', [
            'model'        => '',
            'provider'     => '',
            'usage'        => ['inputTokens' => 10, 'outputTokens' => 20],
            'generated_at' => self::GENERATED_AT,
        ]);

        $this->assertStringNotContainsString('tokens used', $html);
        $this->assertSame(1, substr_count($html, 'class="structura-mb__stat"'));
    }

    /** @test */
    public function byok_plan_shows_the_model_and_token_lines(): void
    {
        $html = $this->render_for('byok', [
            'model'        => 'gpt-5.2',
            'provider'     => 'openai',
            'usage'        => ['inputTokens' => 1200, 'outputTokens' => 3400],
            'generated_at' => self::GENERATED_AT,
        ]);

        $this->assertStringContainsString('<span>gpt-5.2</span>', $html);
        $this->assertStringContainsString('4,600', $html);
        $this->assertStringContainsString('tokens used', $html);
        $this->assertSame(3, substr_count($html, 'class="structura-mb__stat"'));
    }

    /** @test */
    public function byok_plan_with_a_blank_model_renders_no_empty_model_line(): void
    {
        $html = $this->render_for('byok', [
            'model'        => '  ',
            'usage'        => ['inputTokens' => 100, 'outputTokens' => 50],
            'generated_at' => self::GENERATED_AT,
        ]);

        $this->assertStringNotContainsString('<span>  </span>', $html);
        $this->assertStringNotContainsString('<span></span>', $html);
        $this->assertStringContainsString('tokens used', $html);
        // Tokens + date only.
        $this->assertSame(2, substr_count($html, 'class="structura-mb__stat"'));
    }

    /** @test */
    public function no_generation_meta_renders_no_stats_block(): void
    {
        $html = $this->render_for('byok', '');

        $this->assertStringNotContainsString('structura-mb__stats', $html);
    }

    /** @test */
    public function stats_lines_are_blank_for_both_managed_plans_and_filled_for_byok(): void
    {
        $meta = [
            'model' => 'gemini-3.1-pro',
            'usage' => ['promptTokens' => 7, 'completionTokens' => 3],
        ];

        $this->assertSame(['model' => '', 'tokens' => 0], Post_Meta_Box::generation_stats_lines($meta, 'cloud'));
        $this->assertSame(['model' => '', 'tokens' => 0], Post_Meta_Box::generation_stats_lines($meta, 'cloud_pro'));
        $this->assertSame(
            ['model' => 'gemini-3.1-pro', 'tokens' => 10],
            Post_Meta_Box::generation_stats_lines($meta, 'byok')
        );
        $this->assertSame(['model' => '', 'tokens' => 0], Post_Meta_Box::generation_stats_lines('', 'byok'));
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Helpers
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Render the meta box for a post whose only Structura meta is the
     * given generation meta, under the given license plan.
     *
     * @param mixed $gen_meta Value stored in `_structura_generation_meta`.
     */
    private function render_for(string $plan, $gen_meta): string
    {
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_plan')->andReturn($plan)
            ->getMock()
            ->shouldReceive('can_generate_featured_image')->andReturn(false)
            ->getMock()
            ->shouldReceive('can_generate_body_images')->andReturn(false);

        Functions\when('get_post_meta')->alias(static function ($post_id, $key = '', $single = false) use ($gen_meta) {
            return $key === '_structura_generation_meta' ? $gen_meta : '';
        });
        Functions\when('admin_url')->alias(static function ($path = '') {
            return 'https://example.test/wp-admin/' . $path;
        });
        Functions\when('esc_html_e')->alias(static function ($text, $domain = 'default') {
            echo htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8');
        });
        Functions\when('esc_attr_e')->alias(static function ($text, $domain = 'default') {
            echo htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8');
        });
        Functions\when('wp_date')->alias(static function ($format, $timestamp) {
            return gmdate($format, $timestamp);
        });

        ob_start();
        (new Post_Meta_Box())->render(new \WP_Post(42));

        return (string) ob_get_clean();
    }
}
