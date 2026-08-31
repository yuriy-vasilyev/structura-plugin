<?php

namespace Structura\Tests\Unit\Ui;

use Mockery;
use ReflectionMethod;
use Structura\Tests\Unit\TestCase;
use Structura\Ui\Post_Meta_Box;

/**
 * Pin the image-regen TIER seam on {@see Post_Meta_Box}: the per-regen
 * `image_tier` sanitiser and the Top/Standard catalog builder that feeds
 * the modal.
 *
 * Why this matters: the regen modal no longer offers a raw model list — it
 * offers a quality tier (Top / Standard). The tier travels over admin-ajax
 * in `$_POST['image_tier']` (untrusted), and the two tiers the modal shows
 * are DERIVED server-side from the served catalog. Both the sanitiser
 * (reject anything outside {top, mid}) and the derivation (top = the
 * non-default image model, mid = the `default` one — NOT `recommended`,
 * which for Gemini points at the mid model) get pinned here.
 *
 * @covers \Structura\Ui\Post_Meta_Box::sanitize_image_tier_override
 * @covers \Structura\Ui\Post_Meta_Box::build_image_tier_catalog
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class PostMetaBoxImageTierTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    // ──────────────────────────────────────────────────────────────────────
    //  sanitize_image_tier_override
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_accepts_only_the_two_picker_tiers(): void
    {
        $this->assertSame('top', $this->sanitizeTier('top'));
        $this->assertSame('mid', $this->sanitizeTier('mid'));
    }

    /** @test */
    public function it_rejects_out_of_whitelist_or_malformed_tiers(): void
    {
        // 'cheap' is a real registry tier but is never picker-selectable;
        // 'flagship' isn't a tier at all; the rest are junk / injection.
        $this->assertNull($this->sanitizeTier('cheap'));
        $this->assertNull($this->sanitizeTier('flagship'));
        $this->assertNull($this->sanitizeTier(''));
        $this->assertNull($this->sanitizeTier(null));
        $this->assertNull($this->sanitizeTier(['top']));
        $this->assertNull($this->sanitizeTier(123));
        // Injected junk normalises to a non-tier string → rejected.
        $this->assertNull($this->sanitizeTier("top\n<script>"));

        // sanitize_key lowercases, so a stray-case 'TOP' normalises to the
        // valid 'top' rather than being rejected — harmless, the picker only
        // ever sends lowercase.
        $this->assertSame('top', $this->sanitizeTier('TOP'));
    }

    // ──────────────────────────────────────────────────────────────────────
    //  build_image_tier_catalog
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_derives_top_from_the_non_default_and_mid_from_the_default_image_model(): void
    {
        // Gemini is the regression guard: its `recommended` flag sits on the
        // MID Flash-Image (cost default), so a "top = recommended" derivation
        // would hide Pro-Image. Top must come from the non-default model.
        $this->mockRegistry(
            [
                'openai'    => ['id' => 'openai', 'name' => 'OpenAI', 'capabilities' => ['text', 'image']],
                'gemini'    => ['id' => 'gemini', 'name' => 'Google Gemini', 'capabilities' => ['text', 'image']],
                'anthropic' => ['id' => 'anthropic', 'name' => 'Anthropic', 'capabilities' => ['text']],
            ],
            [
                'openai' => [
                    ['id' => 'gpt-image-1-mini', 'name' => 'GPT Image 1 Mini', 'default' => true],
                    ['id' => 'gpt-image-2', 'name' => 'GPT Image 2', 'recommended' => true],
                ],
                'gemini' => [
                    // Flash-Image carries BOTH default + recommended.
                    ['id' => 'gemini-3.1-flash-image', 'name' => 'Gemini 3.1 Flash Image', 'default' => true, 'recommended' => true],
                    ['id' => 'gemini-3-pro-image', 'name' => 'Gemini 3 Pro Image'],
                ],
            ]
        );

        $rows = $this->buildCatalog('byok');

        // Anthropic (text-only) is filtered out entirely.
        foreach ($rows as $r) {
            $this->assertNotSame('anthropic', $r['provider']);
        }

        $this->assertSame('GPT Image 2', $this->rowModel($rows, 'openai', 'top'));
        $this->assertSame('GPT Image 1 Mini', $this->rowModel($rows, 'openai', 'mid'));
        // The fix: Gemini top is Pro-Image, NOT the recommended Flash-Image.
        $this->assertSame('Gemini 3 Pro Image', $this->rowModel($rows, 'gemini', 'top'));
        $this->assertSame('Gemini 3.1 Flash Image', $this->rowModel($rows, 'gemini', 'mid'));
    }

    /** @test */
    public function it_omits_a_tier_a_provider_cannot_place_and_skips_image_incapable_providers(): void
    {
        $this->mockRegistry(
            [
                'openai'    => ['id' => 'openai', 'name' => 'OpenAI', 'capabilities' => ['image']],
                'anthropic' => ['id' => 'anthropic', 'name' => 'Anthropic', 'capabilities' => ['text']],
            ],
            [
                // Only a single (default) image model → mid only, no top row.
                'openai' => [
                    ['id' => 'gpt-image-1-mini', 'name' => 'GPT Image 1 Mini', 'default' => true],
                ],
            ]
        );

        $rows = $this->buildCatalog('cloud');

        $this->assertSame('GPT Image 1 Mini', $this->rowModel($rows, 'openai', 'mid'));
        $this->assertNull($this->rowModel($rows, 'openai', 'top'));
        // Anthropic never appears — no image capability.
        $this->assertSame([], array_values(array_filter(
            $rows,
            static fn($r) => $r['provider'] === 'anthropic'
        )));
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Helpers
    // ──────────────────────────────────────────────────────────────────────

    /** Reflectively invoke the private static tier sanitiser. */
    private function sanitizeTier($raw)
    {
        $m = new ReflectionMethod(Post_Meta_Box::class, 'sanitize_image_tier_override');
        $m->setAccessible(true);
        return $m->invoke(null, $raw);
    }

    /** Reflectively invoke the private static catalog builder. */
    private function buildCatalog(string $tier): array
    {
        $m = new ReflectionMethod(Post_Meta_Box::class, 'build_image_tier_catalog');
        $m->setAccessible(true);
        return $m->invoke(null, $tier);
    }

    /** Find the model name for a (provider, tier) row, or null. */
    private function rowModel(array $rows, string $provider, string $tier): ?string
    {
        foreach ($rows as $r) {
            if ($r['provider'] === $provider && $r['tier'] === $tier) {
                return $r['modelName'];
            }
        }
        return null;
    }

    /**
     * Alias-mock Provider_Registry with a fixed connected-provider map and
     * per-provider image catalogs.
     *
     * @param array<string, array<string, mixed>>       $connected
     * @param array<string, array<int, array<string, mixed>>> $imageCatalogs keyed by provider id
     */
    private function mockRegistry(array $connected, array $imageCatalogs): void
    {
        $mock = Mockery::mock('alias:Structura\Core\Provider_Registry');
        $mock->shouldReceive('get_connected_providers')->andReturn($connected);
        foreach ($imageCatalogs as $provider => $catalog) {
            $mock->shouldReceive('get_models')->with($provider, 'image')->andReturn($catalog);
        }
        // Any provider without an explicit catalog resolves to empty.
        $mock->shouldReceive('get_models')->andReturn([]);
    }
}
