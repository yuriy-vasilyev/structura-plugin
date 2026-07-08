<?php

namespace Structura\Tests\Unit\Ui;

use Mockery;
use ReflectionMethod;
use Structura\Tests\Unit\TestCase;
use Structura\Ui\Post_Meta_Box;

/**
 * Pin the per-regen image-provider override sanitization in
 * {@see Post_Meta_Box::sanitize_image_provider_override}.
 *
 * Why this seam matters: the post-meta-box modal now lets users pick
 * a model from any of their connected image providers — not just the
 * one the campaign was configured with. The override travels over
 * admin-ajax in `$_POST['image_provider']`, so untrusted input. If we
 * trusted it blindly, an attacker (or a confused client) could pin the
 * cloud to a provider the user hasn't configured, generating a Cloud
 * 500 instead of a clean fallback to the campaign default.
 *
 * The whitelist comes from {@see \Structura\Core\Provider_Registry::get_connected_providers}
 * — same source the picker itself reads, so by construction every
 * legitimate selection is accepted. Tests pin:
 *
 *   - Connected + image-capable providers pass through verbatim.
 *   - Connected providers without image capability (Anthropic) get
 *     rejected even though they're "connected" — Anthropic is text-
 *     only and the cloud's image-resolver throws on managed-tier
 *     image requests for it.
 *   - Unknown / unconnected providers return null (caller falls back
 *     to the campaign default).
 *   - Empty / non-string inputs return null without exploding.
 *   - Hostile characters get stripped before the catalog lookup so
 *     "openai\n<script>" still resolves to "openai" rather than
 *     leaking metadata into a downstream log line.
 *
 * @covers \Structura\Ui\Post_Meta_Box::sanitize_image_provider_override
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class PostMetaBoxImageProviderOverrideTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @test */
    public function it_accepts_a_connected_image_capable_provider(): void
    {
        $this->mock_license_tier('cloud_pro');
        $this->mock_connected_providers([
            'openai' => ['id' => 'openai', 'name' => 'OpenAI', 'capabilities' => ['text', 'image']],
            'gemini' => ['id' => 'gemini', 'name' => 'Google Gemini', 'capabilities' => ['text', 'image']],
        ]);

        $this->assertSame('gemini', $this->invoke('gemini'));
        $this->assertSame('openai', $this->invoke('openai'));
    }

    /** @test */
    public function it_rejects_a_connected_text_only_provider(): void
    {
        // Anthropic is "connected" (BYOK key bound) but has no image
        // capability. The picker server-side renderer also filters this
        // out, so a client sending "anthropic" is either stale or
        // hostile — either way, it must not reach the cloud.
        $this->mock_license_tier('byok');
        $this->mock_connected_providers([
            'openai'    => ['id' => 'openai', 'name' => 'OpenAI', 'capabilities' => ['text', 'image']],
            'anthropic' => ['id' => 'anthropic', 'name' => 'Anthropic', 'capabilities' => ['text']],
        ]);

        $this->assertNull($this->invoke('anthropic'));
    }

    /** @test */
    public function it_rejects_an_unconnected_provider(): void
    {
        // User only has OpenAI bound; submitting "gemini" must not
        // be forwarded — the cloud-side resolver would throw on
        // missing workspace credentials for BYOK or fail the
        // managed-tier provider check, but neither failure surfaces
        // as a useful message to the editor. Reject early.
        $this->mock_license_tier('byok');
        $this->mock_connected_providers([
            'openai' => ['id' => 'openai', 'name' => 'OpenAI', 'capabilities' => ['text', 'image']],
        ]);

        $this->assertNull($this->invoke('gemini'));
    }

    /** @test */
    public function it_returns_null_for_empty_or_nonstring_input(): void
    {
        // No connected-providers mock needed — these short-circuit
        // before the catalog lookup.
        $this->assertNull($this->invoke(null));
        $this->assertNull($this->invoke(''));
        $this->assertNull($this->invoke(['gemini']));
        $this->assertNull($this->invoke(123));
    }

    /** @test */
    public function it_strips_hostile_characters_before_lookup(): void
    {
        // The cloud handler logs the resolved provider id verbatim
        // in audit traces. Stripping non-alnum/dot/dash/underscore
        // before the catalog lookup prevents log forging via newline
        // or quote injection ("openai\n<script>" → "openai") AND
        // catches typos like " openai" so the user gets a working
        // gen instead of a confusing fallback.
        $this->mock_license_tier('cloud_pro');
        $this->mock_connected_providers([
            'openai' => ['id' => 'openai', 'name' => 'OpenAI', 'capabilities' => ['text', 'image']],
        ]);

        $this->assertSame('openai', $this->invoke("openai\n<script>alert(1)</script>"));
        $this->assertSame('openai', $this->invoke(" openai "));
    }

    /** @test */
    public function it_returns_null_when_no_providers_are_connected(): void
    {
        // Brand-new install before the user has bound any provider:
        // the picker shouldn't be visible (free tier hides it) but
        // the JS could still be a stale tab from a paid tier that
        // forwards the override regardless. Failing closed here keeps
        // a stale-tab edge case from leaking an unverified provider
        // id into the cloud payload.
        $this->mock_license_tier('cloud_pro');
        $this->mock_connected_providers([]);

        $this->assertNull($this->invoke('openai'));
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Helpers
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Reflectively invoke the private static helper. Keeping it private
     * matches the rest of the class's helper pattern and avoids
     * widening the public surface for a single internal sanitiser.
     */
    private function invoke($raw)
    {
        $method = new ReflectionMethod(Post_Meta_Box::class, 'sanitize_image_provider_override');
        $method->setAccessible(true);
        return $method->invoke(null, $raw);
    }

    private function mock_license_tier(string $plan): void
    {
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')
            ->andReturn([
                'plan'        => $plan,
                'is_pro'      => true,
                'is_licensed' => true,
                'license_key' => 'fixture-key',
                'upgrade_url' => 'https://app.structurawp.com/billing',
            ]);
    }

    /**
     * Stub `Provider_Registry::get_connected_providers` to return a
     * fixed map. Alias-mocks persist for the rest of the process which
     * is fine for this file — no other test mocks Provider_Registry.
     */
    private function mock_connected_providers(array $providers): void
    {
        Mockery::mock('alias:Structura\Core\Provider_Registry')
            ->shouldReceive('get_connected_providers')
            ->andReturn($providers);
    }
}
