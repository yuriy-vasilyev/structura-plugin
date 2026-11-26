<?php

namespace Structura\Tests\Unit\Ui;

use Mockery;
use Structura\Tests\Unit\TestCase;
use Structura\Ui\Post_Meta_Box;

/**
 * The regenerate-image modal's choice since 2026-11-25 (owner decision,
 * specs/byok-ai-guidance.md §2.2): no model or tier is picked, so the
 * modal offers the image provider only, and only when there is a choice.
 * Until then it listed "Top (name)" / "Standard (name)" per connected image
 * provider behind "Use default model".
 *
 *   - two or more connected image providers on an own-key plan: one row
 *     per provider, no tier and no model;
 *   - one connected image provider: no rows, the modal shows no picker;
 *   - managed plans (Cloud): no rows, Structura binds the image model there;
 *   - text-only providers never appear.
 *
 * @covers \Structura\Ui\Post_Meta_Box::build_image_provider_choices
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class PostMetaBoxImageProviderChoiceTest extends TestCase
{
    private const OPENAI    = ['id' => 'openai', 'name' => 'OpenAI', 'capabilities' => ['text', 'image']];
    private const GEMINI    = ['id' => 'gemini', 'name' => 'Google Gemini', 'capabilities' => ['text', 'image']];
    private const ANTHROPIC = ['id' => 'anthropic', 'name' => 'Anthropic Claude', 'capabilities' => ['text']];

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @test */
    public function two_connected_image_providers_give_one_row_each_with_no_tier_or_model(): void
    {
        $this->connected(['openai' => self::OPENAI, 'gemini' => self::GEMINI, 'anthropic' => self::ANTHROPIC]);

        $this->assertSame(
            [
                ['provider' => 'openai', 'providerName' => 'OpenAI'],
                ['provider' => 'gemini', 'providerName' => 'Google Gemini'],
            ],
            Post_Meta_Box::build_image_provider_choices('byok')
        );
    }

    /** @test */
    public function one_connected_image_provider_gives_nothing_to_choose(): void
    {
        $this->connected(['openai' => self::OPENAI, 'anthropic' => self::ANTHROPIC]);

        $this->assertSame([], Post_Meta_Box::build_image_provider_choices('byok'));
        $this->assertSame([], Post_Meta_Box::build_image_provider_choices('free'));
    }

    /** @test */
    public function managed_plans_get_no_rows_even_with_two_providers(): void
    {
        $this->connected(['openai' => self::OPENAI, 'gemini' => self::GEMINI]);

        $this->assertSame([], Post_Meta_Box::build_image_provider_choices('cloud'));
        $this->assertSame([], Post_Meta_Box::build_image_provider_choices('cloud_pro'));
    }

    /**
     * Alias-mock Provider_Registry with a fixed connected-provider map.
     *
     * @param array<string, array<string, mixed>> $connected
     */
    private function connected(array $connected): void
    {
        Mockery::mock('alias:Structura\Core\Provider_Registry')
            ->shouldReceive('get_connected_providers')
            ->andReturn($connected);
    }
}
