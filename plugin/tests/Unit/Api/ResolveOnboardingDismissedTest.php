<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * Regression tests for {@see Rest_Api::resolve_onboarding_dismissed()}.
 *
 * wp.org QA, 2026-09-03: the Dashboard's "Finish your Structura setup —
 * 6 steps left" resume tile was gated ONLY by the per-user
 * `structura_guide_dismissed` meta, while wizard completion/dismissal
 * writes the site-wide `structura_onboarding_dismissed` option. A
 * customer who completed the wizard while ANONYMOUS (whose completion
 * lives solely in the option — anonymous installs have no cloud wizard
 * state) then claimed a license and was told, without explanation, that
 * six setup steps remained. Either signal must suppress the tile.
 *
 * @covers \Structura\Api\Rest_Api::resolve_onboarding_dismissed
 */
class ResolveOnboardingDismissedTest extends TestCase
{
    private function stub(bool $userMeta, string $option): void
    {
        Functions\when('get_current_user_id')->justReturn(1);
        Functions\when('get_user_meta')->justReturn($userMeta ? '1' : '');
        Functions\when('get_option')->justReturn($option);
    }

    /** @test */
    public function the_site_wide_wizard_flag_alone_suppresses_the_tile(): void
    {
        // The exact regression: anonymous-era completion (option "1"),
        // user meta never written.
        $this->stub(false, '1');
        $this->assertTrue(Rest_Api::resolve_onboarding_dismissed());
    }

    /** @test */
    public function the_per_user_guide_dismissal_alone_suppresses_the_tile(): void
    {
        $this->stub(true, '');
        $this->assertTrue(Rest_Api::resolve_onboarding_dismissed());
    }

    /** @test */
    public function a_fresh_install_with_neither_signal_shows_the_tile(): void
    {
        // Also the deliberate re-onboard state: disconnect deletes the
        // option, and a fresh workspace has no completion signal at all.
        $this->stub(false, '');
        $this->assertFalse(Rest_Api::resolve_onboarding_dismissed());
    }
}
