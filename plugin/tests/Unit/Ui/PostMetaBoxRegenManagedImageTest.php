<?php

namespace Structura\Tests\Unit\Ui;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Tests\Unit\TestCase;
use Structura\Ui\Post_Meta_Box;

/**
 * `Post_Meta_Box::resolve_campaign_for_regen` on a post with no stamped
 * image provider (managed image binding, 2026-10-06,
 * specs/managed-ai-lineup.md §2.4).
 *
 * Bug: on Cloud and Cloud Pro the stub was filled with the plugin's own
 * managed default (`gemini` / `openai`), which no longer matched the binding.
 * Now a managed plan gets a stub with no image provider (the cloud picks
 * the model); an own-key plan still gets null.
 *
 * @covers \Structura\Ui\Post_Meta_Box::resolve_campaign_for_regen
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class PostMetaBoxRegenManagedImageTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function given_plan_and_no_stamped_provider(string $plan): void
    {
        Functions\when('get_post_meta')->justReturn('');
        Functions\when('get_the_title')->justReturn('A post');
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')
            ->andReturn(['plan' => $plan]);
    }

    /** @test */
    public function a_managed_plan_regenerates_without_filling_in_an_image_provider(): void
    {
        $this->given_plan_and_no_stamped_provider('cloud');

        $campaign = Post_Meta_Box::resolve_campaign_for_regen(9, 0);

        $this->assertIsArray($campaign);
        $this->assertArrayNotHasKey('imageProvider', $campaign['intelligence']);
    }

    /** @test */
    public function an_own_key_plan_without_a_stamped_provider_still_has_nothing_to_regenerate(): void
    {
        $this->given_plan_and_no_stamped_provider('byok');

        $this->assertNull(Post_Meta_Box::resolve_campaign_for_regen(9, 0));
    }
}
