<?php

namespace Structura\Tests\Unit\Scheduler;

use Brain\Monkey\Functions;
use Structura\Core\Public_Site_Profile;
use Structura\Scheduler\Context_Builder;
use Structura\Tests\Unit\TestCase;

/**
 * Integration-style tests for `Context_Builder::public_permalink_for_post()`.
 *
 * The helper delegates to {@see Public_Site_Profile::permalink_for_post()};
 * the full strategy matrix (inherit / prefixSwap / template, edge cases)
 * lives in {@see \Structura\Tests\Unit\Core\PublicSiteProfileTest}. These
 * tests pin the static delegate end-to-end — every WP getter that
 * `Public_Site_Profile::load()` reads is stubbed, then we assert the
 * helper composes the right URL through the stack.
 *
 * Background: on Structura's own headless setup (`cms.structurawp.com`),
 * `get_permalink()` returns the authoring origin — not the public
 * `www.structurawp.com/en/blog/…` URL — and those CMS-origin URLs were
 * leaking into LLM-generated copy as dead internal links. Reported
 * 2026-04-24 on posts under `/en/blog/`.
 *
 * @covers \Structura\Scheduler\Context_Builder
 */
class ContextBuilderTest extends TestCase
{
    private const PUBLIC_URL = 'https://www.structurawp.com';
    private const POST_ID    = 42;

    /**
     * Default stubs for every WP getter that `Public_Site_Profile::load()`
     * touches. Tests override `get_option(OPTION_NAME, [])` to inject the
     * profile shape under test.
     */
    private function stub_wp_getters(): void
    {
        Functions\when('get_theme_mod')->justReturn(0);
        Functions\when('get_site_icon_url')->justReturn('');
        Functions\when('home_url')->justReturn('https://cms.structurawp.com/');
        Functions\when('get_bloginfo')->alias(function ($key) {
            // Brain Monkey passes the key only.
            switch ($key) {
                case 'name':        return 'Test Site';
                case 'description': return 'A great demo';
                case 'language':    return 'en-US';
                default:            return '';
            }
        });
    }

    /** @test */
    public function it_rewrites_to_marketing_site_when_profile_is_headless(): void
    {
        $this->stub_wp_getters();

        $this->expectFn('get_option')
            ->with(Public_Site_Profile::OPTION_NAME, [])
            ->andReturn([
                'isHeadless'           => true,
                'publicUrl'            => self::PUBLIC_URL,
                'permalinkStrategy'    => Public_Site_Profile::STRATEGY_PREFIX_SWAP,
                'defaultPermalinkLang' => 'en',
            ]);

        $this->expectFn('get_post_field')
            ->with('post_name', self::POST_ID)
            ->andReturn('best-wordpress-ai-content-automation-for-agencies');

        // get_permalink should NOT be touched on the happy path — if it
        // is, we're shipping the CMS origin to the LLM again.
        $this->expectFn('get_permalink')->never();

        $url = Context_Builder::public_permalink_for_post(self::POST_ID);

        $this->assertSame(
            'https://www.structurawp.com/en/blog/best-wordpress-ai-content-automation-for-agencies',
            $url
        );
    }

    /** @test */
    public function it_strips_trailing_slash_from_configured_public_url(): void
    {
        // Hosts sometimes write the base URL with a trailing slash
        // (`https://www.structurawp.com/`). The composed path must not
        // end up with `//en/blog/` — Next.js treats that as a different
        // route and redirects.
        $this->stub_wp_getters();

        $this->expectFn('get_option')
            ->with(Public_Site_Profile::OPTION_NAME, [])
            ->andReturn([
                'isHeadless'           => true,
                'publicUrl'            => 'https://www.structurawp.com/',
                'permalinkStrategy'    => Public_Site_Profile::STRATEGY_PREFIX_SWAP,
                'defaultPermalinkLang' => 'en',
            ]);

        $this->expectFn('get_post_field')
            ->with('post_name', self::POST_ID)
            ->andReturn('hello-world');

        $url = Context_Builder::public_permalink_for_post(self::POST_ID);

        $this->assertSame('https://www.structurawp.com/en/blog/hello-world', $url);
    }

    /** @test */
    public function it_falls_back_to_get_permalink_when_profile_is_not_headless(): void
    {
        // Customer sites (the common deployment target) don't enable
        // headless mode — `get_permalink()` there returns the right
        // public URL already, and we must not rewrite it.
        $this->stub_wp_getters();

        $this->expectFn('get_option')
            ->with(Public_Site_Profile::OPTION_NAME, [])
            ->andReturn([]);

        $this->expectFn('get_permalink')
            ->with(self::POST_ID)
            ->andReturn('https://customer.example.com/hello-world/');

        // No slug lookup when we're falling through to get_permalink().
        $this->expectFn('get_post_field')->never();

        $url = Context_Builder::public_permalink_for_post(self::POST_ID);

        $this->assertSame('https://customer.example.com/hello-world/', $url);
    }

    /** @test */
    public function it_falls_back_to_get_permalink_when_slug_is_empty(): void
    {
        // Auto-drafts and just-inserted posts may not have `post_name`
        // stamped yet. Returning `/en/blog/` (trailing empty segment)
        // would 404 on the marketing site and poison every downstream
        // generation that referenced this post, so we prefer the CMS
        // URL — worst case equivalent to pre-fix behaviour for that one
        // edge-case post.
        $this->stub_wp_getters();

        $this->expectFn('get_option')
            ->with(Public_Site_Profile::OPTION_NAME, [])
            ->andReturn([
                'isHeadless'           => true,
                'publicUrl'            => self::PUBLIC_URL,
                'permalinkStrategy'    => Public_Site_Profile::STRATEGY_PREFIX_SWAP,
                'defaultPermalinkLang' => 'en',
            ]);

        $this->expectFn('get_post_field')
            ->with('post_name', self::POST_ID)
            ->andReturn('');

        $this->expectFn('get_permalink')
            ->with(self::POST_ID)
            ->andReturn('https://cms.structurawp.com/?p=42');

        $url = Context_Builder::public_permalink_for_post(self::POST_ID);

        $this->assertSame('https://cms.structurawp.com/?p=42', $url);
    }
}
