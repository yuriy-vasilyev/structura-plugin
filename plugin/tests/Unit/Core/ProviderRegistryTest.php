<?php

namespace Structura\Tests\Unit\Core;

use Mockery;
use Structura\Core\Provider_Registry;
use Structura\Tests\Unit\TestCase;

/**
 * @covers \Structura\Core\Provider_Registry
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class ProviderRegistryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Reset the static in-memory cache between tests
        $ref = new \ReflectionProperty(Provider_Registry::class, 'models_memo');
        $ref->setAccessible(true);
        $ref->setValue(null, null);

        $ref2 = new \ReflectionProperty(Provider_Registry::class, 'using_fallback');
        $ref2->setAccessible(true);
        $ref2->setValue(null, false);
    }

    protected function tearDown(): void
    {
        // Mockery alias mocks persist across tests within the same
        // process (Mockery's overload/alias mechanism). Closing here
        // matches the pattern in other Mockery-using suites in this
        // codebase (e.g. ChannelEventForwarderTest).
        Mockery::close();
        parent::tearDown();
    }

    // ──────────────────────────────────────────────────────────────────────
    //  CATALOG QUERIES
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_returns_all_registered_providers(): void
    {
        $all = Provider_Registry::get_all_providers();

        $this->assertArrayHasKey('openai', $all);
        $this->assertArrayHasKey('gemini', $all);
        $this->assertArrayHasKey('anthropic', $all);
        $this->assertCount(3, $all);
    }

    /** @test */
    public function it_returns_single_provider_by_id(): void
    {
        $openai = Provider_Registry::get_provider('openai');

        $this->assertIsArray($openai);
        $this->assertSame('openai', $openai['id']);
        $this->assertSame('OpenAI', $openai['name']);
    }

    /** @test */
    public function it_returns_null_for_unknown_provider(): void
    {
        $result = Provider_Registry::get_provider('nonexistent');

        $this->assertNull($result);
    }

    /** @test */
    public function it_returns_anthropic_provider_metadata(): void
    {
        $claude = Provider_Registry::get_provider('anthropic');

        $this->assertIsArray($claude);
        $this->assertSame('anthropic', $claude['id']);
        $this->assertSame('Anthropic Claude', $claude['name']);
        $this->assertSame(['text'], $claude['capabilities']);
        // 2026-10-06 (specs/open-providers.md): no per-provider plan floor.
        $this->assertArrayNotHasKey('min_tier', $claude);
        $this->assertSame('sk-ant-', $claude['key_prefix']);
        $this->assertSame('strict', $claude['schema_mode']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  CAPABILITIES
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function openai_has_text_and_image_capabilities(): void
    {
        $openai = Provider_Registry::get_provider('openai');

        $this->assertContains('text', $openai['capabilities']);
        $this->assertContains('image', $openai['capabilities']);
    }

    /** @test */
    public function gemini_has_text_and_image_capabilities(): void
    {
        $gemini = Provider_Registry::get_provider('gemini');

        $this->assertContains('text', $gemini['capabilities']);
        $this->assertContains('image', $gemini['capabilities']);
    }

    /** @test */
    public function anthropic_has_only_text_capability(): void
    {
        $claude = Provider_Registry::get_provider('anthropic');

        $this->assertContains('text', $claude['capabilities']);
        $this->assertNotContains('image', $claude['capabilities']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  TIER FILTERING
    // ──────────────────────────────────────────────────────────────────────

    /**
     * 2026-10-06 owner decision (specs/open-providers.md): every own-key
     * plan, anonymous included, may connect all three providers.
     *
     * @test
     * @dataProvider own_key_plans
     */
    public function own_key_plans_get_every_provider(string $plan): void
    {
        $providers = Provider_Registry::get_providers_for_tier($plan);

        $this->assertSame(['openai', 'gemini', 'anthropic'], array_keys($providers));
    }

    public function own_key_plans(): array
    {
        return [['none'], ['free'], ['byok']];
    }

    /** @test */
    public function provider_descriptions_name_no_models(): void
    {
        $this->assertSame('Text and images', Provider_Registry::get_provider('openai')['description']);
        $this->assertSame('Text and images', Provider_Registry::get_provider('gemini')['description']);
        $this->assertSame('Text', Provider_Registry::get_provider('anthropic')['description']);
    }

    /** @test */
    public function pro_tier_gets_all_providers(): void
    {
        $providers = Provider_Registry::get_providers_for_tier('byok');

        $this->assertArrayHasKey('openai', $providers);
        $this->assertArrayHasKey('gemini', $providers);
        $this->assertArrayHasKey('anthropic', $providers);
    }

    /** @test */
    public function cloud_tier_gets_all_providers(): void
    {
        $providers = Provider_Registry::get_providers_for_tier('cloud');

        $this->assertArrayHasKey('openai', $providers);
        $this->assertArrayHasKey('gemini', $providers);
        $this->assertArrayHasKey('anthropic', $providers);
    }

    /** @test */
    public function agency_tier_gets_all_providers(): void
    {
        $providers = Provider_Registry::get_providers_for_tier('cloud_pro');
        $this->assertCount(3, $providers, "Tier 'cloud_pro' should access all 3 providers");
    }

    /** @test */
    public function unknown_tier_gets_every_provider_like_none(): void
    {
        $providers = Provider_Registry::get_providers_for_tier('unknown_tier');

        $this->assertSame(['openai', 'gemini', 'anthropic'], array_keys($providers));
    }

    // ──────────────────────────────────────────────────────────────────────
    //  CAPABILITY + TIER FILTERING
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_filters_text_providers_by_tier(): void
    {
        $text_free = Provider_Registry::get_providers_by_capability('text', 'free');
        $text_pro  = Provider_Registry::get_providers_by_capability('text', 'byok');

        $this->assertCount(3, $text_free);   // every provider since 2026-10-06
        $this->assertCount(3, $text_pro);
    }

    /** @test */
    public function it_filters_image_providers_by_tier(): void
    {
        $image_none = Provider_Registry::get_providers_by_capability('image', 'none');
        $image_free = Provider_Registry::get_providers_by_capability('image', 'free');
        $image_pro  = Provider_Registry::get_providers_by_capability('image', 'byok');

        // Capability, not plan (2026-10-06): OpenAI and Gemini make
        // images; Anthropic is text-only at every tier. Whether `none`
        // may GENERATE images is a plan feature enforced by the cloud.
        $this->assertCount(2, $image_none);  // openai + gemini
        $this->assertCount(2, $image_free);  // openai + gemini
        $this->assertCount(2, $image_pro);   // openai + gemini
    }

    /** @test */
    public function anthropic_never_appears_in_image_providers(): void
    {
        // Even at the highest tier, anthropic should never be an image provider
        $image = Provider_Registry::get_providers_by_capability('image', 'cloud_pro');

        $this->assertArrayNotHasKey('anthropic', $image);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  ACCESS VALIDATION
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_validates_openai_accessible_at_any_tier(): void
    {
        $this->assertTrue(Provider_Registry::validate_provider_access('openai', 'none'));
        $this->assertTrue(Provider_Registry::validate_provider_access('openai', 'free'));
        $this->assertTrue(Provider_Registry::validate_provider_access('openai', 'byok'));
    }

    /**
     * @test
     * @dataProvider own_key_plans
     */
    public function it_validates_every_provider_on_every_own_key_plan(string $plan): void
    {
        $this->assertTrue(Provider_Registry::validate_provider_access('gemini', $plan));
        $this->assertTrue(Provider_Registry::validate_provider_access('anthropic', $plan));
    }

    /** @test */
    public function it_rejects_unknown_provider_access(): void
    {
        $this->assertFalse(Provider_Registry::validate_provider_access('nonexistent', 'cloud_pro'));
    }

    // ──────────────────────────────────────────────────────────────────────
    //  CAMPAIGN PROVIDER VALIDATION
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Helper: stub `Cloud_Client::get_provider_bindings` to return a
     * map keyed by provider id. Mockery's `alias` mode replaces the
     * static method on the real class for the duration of the test —
     * Brain Monkey's `Functions\expect` only handles global / namespaced
     * functions, not class methods.
     */
    private function stubBindings(array $providerIds): void
    {
        $bindings = [];
        foreach ($providerIds as $id) {
            $bindings[$id] = [
                'credId'      => "fake-{$id}",
                'credLabel'   => "{$id} key",
                'credAddedAt' => null,
            ];
        }
        $mock = Mockery::mock('alias:Structura\\Core\\Cloud_Client');
        $mock->shouldReceive('get_provider_bindings')->andReturn($bindings);
    }

    /** @test */
    public function it_validates_campaign_with_accessible_connected_providers(): void
    {
        $this->stubBindings(['openai', 'anthropic']);

        $result = Provider_Registry::validate_campaign_providers([
            'textProvider'  => 'openai',
            'imageProvider' => 'openai',
        ], 'byok');

        $this->assertTrue($result['text_ok']);
        $this->assertTrue($result['image_ok']);
        $this->assertEmpty($result['issues']);
    }

    /** @test */
    public function it_accepts_anthropic_text_on_free_and_none(): void
    {
        $this->stubBindings(['anthropic']);

        foreach (['free', 'none'] as $plan) {
            $result = Provider_Registry::validate_campaign_providers([
                'textProvider' => 'anthropic',
            ], $plan);

            $this->assertTrue($result['text_ok'], $plan);
            $this->assertEmpty($result['issues'], $plan);
        }
    }

    /** @test */
    public function it_flags_an_unknown_text_provider(): void
    {
        $this->stubBindings([]);

        $result = Provider_Registry::validate_campaign_providers([
            'textProvider' => 'mistral',
        ], 'byok');

        $this->assertFalse($result['text_ok']);
        $this->assertNotEmpty($result['issues']);
    }

    /** @test */
    public function it_flags_disconnected_text_provider(): void
    {
        // No bindings at all on the activation.
        $this->stubBindings([]);

        $result = Provider_Registry::validate_campaign_providers([
            'textProvider' => 'anthropic',
        ], 'byok');

        $this->assertFalse($result['text_ok']);
        $this->assertStringContainsString('not connected', $result['issues'][0]);
    }

    /** @test */
    public function it_marks_image_not_ok_when_no_image_provider_set(): void
    {
        $this->stubBindings(['openai', 'gemini', 'anthropic']);

        $result = Provider_Registry::validate_campaign_providers([
            'textProvider' => 'openai',
            // no imageProvider
        ], 'byok');

        $this->assertTrue($result['text_ok']);
        $this->assertFalse($result['image_ok']); // no image provider = disabled, not error
        $this->assertEmpty($result['issues']);     // not an error, just disabled
    }

    /** @test */
    public function it_flags_an_image_provider_that_makes_no_images_as_not_connected_or_unknown(): void
    {
        // Unknown image provider ids still fail the access check.
        $this->stubBindings(['openai']);

        $result = Provider_Registry::validate_campaign_providers([
            'textProvider'  => 'openai',
            'imageProvider' => 'midjourney',
        ], 'none');

        $this->assertTrue($result['text_ok']);
        $this->assertFalse($result['image_ok']);
        $this->assertNotEmpty($result['issues']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  CONNECTION STATE
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_returns_connected_providers_by_binding(): void
    {
        $this->stubBindings(['openai', 'gemini']);

        $connected = Provider_Registry::get_connected_providers('free');

        $this->assertArrayHasKey('openai', $connected);
        $this->assertArrayHasKey('gemini', $connected);
        $this->assertArrayNotHasKey('anthropic', $connected); // no binding
    }

    /** @test */
    public function it_counts_a_bound_anthropic_key_on_free_and_none(): void
    {
        // Before 2026-10-06 a Free or anonymous site's Anthropic binding
        // was dropped here.
        $this->stubBindings(['openai', 'anthropic']);

        $this->assertArrayHasKey('anthropic', Provider_Registry::get_connected_providers('free'));
        $this->assertArrayHasKey('anthropic', Provider_Registry::get_connected_providers('none'));
    }

    /** @test */
    public function has_text_provider_returns_true_when_text_capable_connected(): void
    {
        $this->stubBindings(['openai']);

        $this->assertTrue(Provider_Registry::has_text_provider('free'));
    }

    /** @test */
    public function has_text_provider_returns_false_when_no_keys(): void
    {
        $this->stubBindings([]);

        $this->assertFalse(Provider_Registry::has_text_provider('byok'));
    }

    /** @test */
    public function has_image_provider_returns_true_when_image_capable_connected(): void
    {
        $this->stubBindings(['openai']);

        $this->assertTrue(Provider_Registry::has_image_provider('free'));
    }

    /** @test */
    public function has_image_provider_returns_false_when_only_text_provider_connected(): void
    {
        // Only anthropic has a binding, and it only supports text.
        $this->stubBindings(['anthropic']);

        $this->assertFalse(Provider_Registry::has_image_provider('byok'));
    }

    // Adapter-resolution tests retired in Phase 4 of
    // `specs/v2/cloud-only-generation.md` — the in-process adapter
    // classes are gone. The cloud's `resolveProviderKeyForTier` is the
    // sole resolver now; nothing on the plugin side instantiates
    // adapters.
}
