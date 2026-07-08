<?php

namespace Structura\Tests\Unit\Core;

use Brain\Monkey\Functions;
use Structura\Core\Public_Site_Profile;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for {@see Public_Site_Profile}.
 *
 * The class is split for testability into a pure value object (this file)
 * and a `load()` static factory that reads WP getters
 * (covered indirectly by {@see \Structura\Tests\Unit\Scheduler\ContextBuilderTest}).
 *
 * The value object itself has zero WP coupling — `permalink_for_post()`
 * only reads `get_post_field`, and `to_site_identity_payload()` just
 * shapes the in-memory state. So most tests construct the object
 * directly with a values array and assert against return values.
 *
 * Spec: `specs/site-identity-headless.md` §3.
 *
 * @covers \Structura\Core\Public_Site_Profile
 */
class PublicSiteProfileTest extends TestCase
{
    private const POST_ID = 42;

    /**
     * Construct a profile with permalink-related fields set to specific
     * values; everything else defaults. Tests of the wire payload set
     * brand fields directly via the array.
     *
     * @param array<string, mixed> $overrides
     */
    private function profile(array $overrides = []): Public_Site_Profile
    {
        return new Public_Site_Profile(array_merge([
            'name'                 => 'Test Site',
            'tagline'              => 'A great demo',
            'language'             => 'en-US',
            'logoUrl'              => 'https://cms.example.com/logo.png',
            'homeUrl'              => 'https://cms.example.com',
            'publicUrl'            => 'https://www.example.com',
            'isHeadless'           => true,
            'description'          => '',
            'keyPages'             => [],
            'permalinkStrategy'    => Public_Site_Profile::STRATEGY_PREFIX_SWAP,
            'permalinkTemplate'    => '',
            'defaultPermalinkLang' => 'en',
        ], $overrides));
    }

    // ── permalink_for_post ───────────────────────────────────────────

    /** @test */
    public function inherit_strategy_returns_get_permalink_unchanged(): void
    {
        // The default for non-headless installs. `get_post_field` should
        // not be touched — `get_permalink()` is the source of truth.
        $profile = $this->profile([
            'permalinkStrategy' => Public_Site_Profile::STRATEGY_INHERIT,
        ]);

        $this->expectFn('get_post_field')->never();
        $this->expectFn('get_permalink')
            ->with(self::POST_ID)
            ->andReturn('https://customer.example.com/my-post/');

        $this->assertSame(
            'https://customer.example.com/my-post/',
            $profile->permalink_for_post(self::POST_ID)
        );
    }

    /** @test */
    public function prefix_swap_composes_public_url_with_lang_and_slug(): void
    {
        $profile = $this->profile([
            'publicUrl'            => 'https://www.example.com',
            'defaultPermalinkLang' => 'en',
        ]);

        $this->expectFn('get_post_field')
            ->with('post_name', self::POST_ID)
            ->andReturn('my-post');

        $this->assertSame(
            'https://www.example.com/en/blog/my-post',
            $profile->permalink_for_post(self::POST_ID)
        );
    }

    /** @test */
    public function prefix_swap_uses_resolved_default_lang_when_field_empty(): void
    {
        // `defaultPermalinkLang` resolution happens in load() — when
        // constructing directly with an empty string, the helper falls
        // back to 'en'. Pin the fallback so a regression that drops
        // the safety net doesn't ship `//blog/{slug}` URLs.
        $profile = $this->profile([
            'defaultPermalinkLang' => '',
        ]);

        $this->expectFn('get_post_field')
            ->with('post_name', self::POST_ID)
            ->andReturn('hello');

        $this->assertSame(
            'https://www.example.com/en/blog/hello',
            $profile->permalink_for_post(self::POST_ID)
        );
    }

    /** @test */
    public function template_strategy_substitutes_tokens(): void
    {
        $profile = $this->profile([
            'permalinkStrategy' => Public_Site_Profile::STRATEGY_TEMPLATE,
            'permalinkTemplate' => '/news/{year}/{month}/{slug}',
        ]);

        $this->expectFn('get_post_field')
            ->with('post_name', self::POST_ID)
            ->andReturn('big-news');
        // Brain Monkey 2.7 + Mockery 1.6 don't dispatch multiple
        // `expect()->with()` chains on the same function — see the
        // analogous workaround in DebugModeTest. Use `when()->alias`
        // to switch on the format arg ourselves.
        Functions\when('get_post_time')->alias(function ($format) {
            return [
                'Y' => '2026',
                'm' => '04',
            ][$format] ?? '';
        });

        $this->assertSame(
            'https://www.example.com/news/2026/04/big-news',
            $profile->permalink_for_post(self::POST_ID)
        );
    }

    /** @test */
    public function template_strategy_with_absolute_template_passes_through(): void
    {
        // Escape hatch for unusual front-ends — operator can hardcode
        // a fully-qualified URL template that ignores publicUrl.
        $profile = $this->profile([
            'permalinkStrategy' => Public_Site_Profile::STRATEGY_TEMPLATE,
            'permalinkTemplate' => 'https://other.example.com/p/{slug}',
        ]);

        $this->expectFn('get_post_field')
            ->with('post_name', self::POST_ID)
            ->andReturn('my-post');
        $this->expectFn('get_post_time')
            ->with('Y', true, self::POST_ID)
            ->andReturn('2026');
        $this->expectFn('get_post_time')
            ->with('m', true, self::POST_ID)
            ->andReturn('04');

        $this->assertSame(
            'https://other.example.com/p/my-post',
            $profile->permalink_for_post(self::POST_ID)
        );
    }

    /** @test */
    public function empty_slug_falls_back_to_get_permalink_for_every_strategy(): void
    {
        // Auto-drafts and just-inserted posts may have `post_name === ""`.
        // Returning `/en/blog/` (trailing empty segment) would 404 on the
        // public site and poison every downstream generation that
        // referenced this post.
        foreach ([
            Public_Site_Profile::STRATEGY_PREFIX_SWAP,
            Public_Site_Profile::STRATEGY_TEMPLATE,
        ] as $strategy) {
            $profile = $this->profile(['permalinkStrategy' => $strategy]);

            $this->expectFn('get_post_field')
                ->with('post_name', self::POST_ID)
                ->andReturn('');
            $this->expectFn('get_permalink')
                ->with(self::POST_ID)
                ->andReturn('https://cms.example.com/?p=42');

            $this->assertSame(
                'https://cms.example.com/?p=42',
                $profile->permalink_for_post(self::POST_ID),
                "Empty slug fallback for strategy={$strategy}"
            );
        }
    }

    /** @test */
    public function zero_post_id_returns_empty_string(): void
    {
        // Defensive — callers occasionally pass 0 for "no post" sentinel
        // (e.g. cron contexts before a post is materialised). Returning
        // empty rather than calling `get_permalink(0)` keeps WP from
        // emitting a notice about the missing post.
        $profile = $this->profile();
        $this->assertSame('', $profile->permalink_for_post(0));
    }

    // ── to_site_identity_payload ─────────────────────────────────────

    /** @test */
    public function payload_for_non_headless_install_emits_legacy_shape_only(): void
    {
        // Customer-side: keeping the activation doc lean for the 95%
        // case. Pre-1.x cloud readers see the same shape they always
        // did. Pre-1.x plugins syncing pre-1.x clouds: unchanged.
        $profile = $this->profile([
            'isHeadless' => false,
            'publicUrl'  => 'https://www.example.com', // would be ignored
        ]);

        $payload = $profile->to_site_identity_payload();

        $this->assertSame([
            'name'     => 'Test Site',
            'tagline'  => 'A great demo',
            'language' => 'en-US',
            'logoUrl'  => 'https://cms.example.com/logo.png',
            'homeUrl'  => 'https://cms.example.com',
        ], $payload);
    }

    /** @test */
    public function payload_for_headless_install_emits_extended_shape(): void
    {
        $profile = $this->profile([
            'isHeadless'           => true,
            'publicUrl'            => 'https://www.example.com',
            'description'          => 'A site about things.',
            'keyPages'             => [
                ['url' => 'https://www.example.com/about', 'label' => 'About', 'role' => 'about'],
            ],
            'permalinkStrategy'    => Public_Site_Profile::STRATEGY_PREFIX_SWAP,
            'permalinkTemplate'    => '',
            'defaultPermalinkLang' => 'en',
        ]);

        $payload = $profile->to_site_identity_payload();

        $this->assertSame('https://cms.example.com', $payload['homeUrl']);
        $this->assertSame('https://www.example.com', $payload['publicUrl']);
        $this->assertTrue($payload['isHeadless']);
        $this->assertSame('A site about things.', $payload['description']);
        $this->assertSame(
            [['url' => 'https://www.example.com/about', 'label' => 'About', 'role' => 'about']],
            $payload['keyPages']
        );
        $this->assertSame(Public_Site_Profile::STRATEGY_PREFIX_SWAP, $payload['permalinkStrategy']);
        $this->assertSame('en', $payload['defaultPermalinkLang']);
    }

    // ── sanitize_key_pages (via constructor) ─────────────────────────

    /** @test */
    public function constructor_drops_keypages_with_invalid_url(): void
    {
        $profile = new Public_Site_Profile([
            'keyPages' => [
                ['url' => 'not-a-url',  'label' => 'About',   'role' => 'about'],
                ['url' => 'https://ok', 'label' => 'Pricing', 'role' => 'pricing'],
            ],
        ]);

        $this->assertCount(1, $profile->keyPages);
        $this->assertSame('Pricing', $profile->keyPages[0]['label']);
    }

    /** @test */
    public function constructor_drops_keypages_with_unknown_role(): void
    {
        $profile = new Public_Site_Profile([
            'keyPages' => [
                ['url' => 'https://example.com/x', 'label' => 'X', 'role' => 'mysterious'],
                ['url' => 'https://example.com/y', 'label' => 'Y', 'role' => 'about'],
            ],
        ]);

        $this->assertCount(1, $profile->keyPages);
        $this->assertSame('Y', $profile->keyPages[0]['label']);
    }

    /** @test */
    public function constructor_caps_keypages_at_max(): void
    {
        // 8 + 2 over the cap; only 8 survive.
        $items = [];
        for ($i = 0; $i < 10; $i++) {
            $items[] = [
                'url'   => "https://example.com/p{$i}",
                'label' => "P{$i}",
                'role'  => 'other',
            ];
        }
        $profile = new Public_Site_Profile(['keyPages' => $items]);

        $this->assertCount(Public_Site_Profile::KEY_PAGES_MAX, $profile->keyPages);
    }

    // ── sanitize_strategy (via constructor) ──────────────────────────

    /** @test */
    public function constructor_coerces_unknown_strategy_to_inherit(): void
    {
        // A fuzzy / future-cloud value lands here. Falling back to
        // INHERIT is the safe default — preserves `get_permalink()`
        // behaviour rather than leaking malformed URLs into AI prompts.
        $profile = new Public_Site_Profile([
            'permalinkStrategy' => 'someUnknownStrategy',
        ]);

        $this->assertSame(Public_Site_Profile::STRATEGY_INHERIT, $profile->permalinkStrategy);
    }

    // ── landing_urls_from_key_pages ──────────────────────────────────

    /** @test */
    public function landing_urls_returns_first_three_keypage_urls(): void
    {
        $profile = new Public_Site_Profile([
            'keyPages' => [
                ['url' => 'https://example.com/a', 'label' => 'A', 'role' => 'about'],
                ['url' => 'https://example.com/b', 'label' => 'B', 'role' => 'features'],
                ['url' => 'https://example.com/c', 'label' => 'C', 'role' => 'pricing'],
                ['url' => 'https://example.com/d', 'label' => 'D', 'role' => 'other'],
            ],
        ]);

        $this->assertSame(
            ['https://example.com/a', 'https://example.com/b', 'https://example.com/c'],
            $profile->landing_urls_from_key_pages()
        );
    }

    /** @test */
    public function landing_urls_returns_empty_array_when_no_keypages(): void
    {
        $profile = new Public_Site_Profile(['keyPages' => []]);
        $this->assertSame([], $profile->landing_urls_from_key_pages());
    }

    // ── seed_from_constant_if_missing ────────────────────────────────

    /** @test */
    public function seed_is_a_noop_when_constant_undefined(): void
    {
        // `STRUCTURA_MARKETING_SITE_URL` is rarely defined in tests; if
        // it ever is (parallel test file), this assertion becomes a
        // no-op rather than a false negative.
        if (defined('STRUCTURA_MARKETING_SITE_URL')) {
            $this->markTestSkipped('Constant already defined — skip noop assertion.');
        }

        $this->expectFn('add_option')->never();

        Public_Site_Profile::seed_from_constant_if_missing();
        $this->addToAssertionCount(1); // assert no side effect
    }

    /** @test */
    public function seed_writes_option_when_constant_defined_and_option_missing(): void
    {
        if ( ! defined('STRUCTURA_MARKETING_SITE_URL')) {
            define('STRUCTURA_MARKETING_SITE_URL', 'https://www.example.com');
        }

        $this->expectFn('get_option')
            ->with(Public_Site_Profile::OPTION_NAME, null)
            ->andReturn(null);

        $this->expectFn('add_option')
            ->with(
                Public_Site_Profile::OPTION_NAME,
                \Mockery::on(function ($value) {
                    return is_array($value)
                        && $value['isHeadless'] === true
                        && $value['publicUrl'] === 'https://www.example.com'
                        && $value['permalinkStrategy'] === Public_Site_Profile::STRATEGY_PREFIX_SWAP
                        && $value['defaultPermalinkLang'] === 'en';
                })
            )
            ->andReturn(true);

        Public_Site_Profile::seed_from_constant_if_missing();
        // The real assertions are the two expectFn() expectations above
        // (Mockery verifies them in tearDown, invisibly to PHPUnit's
        // counter) — register one so the test isn't flagged risky.
        // Same convention as the noop test above.
        $this->addToAssertionCount(1);
    }
}
