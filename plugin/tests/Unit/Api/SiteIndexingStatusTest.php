<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for `Rest_Api::get_site_indexing_status` — the
 * `/site/indexing-status` REST handler that exposes WP's `blog_public`
 * option to the client.
 *
 * Primary caller: the IndexNow install modal, which surfaces a warning
 * when the site is discouraged from search engines. Pinging Bing about
 * a noindex site is counterproductive, so the endpoint is the mechanism
 * that lets the client warn before the user commits to the install.
 *
 * Wire contract pinned here:
 *
 *   1. `blog_public = 1` (default) → `blogPublic: true`,
 *      `discourageSearchEngines: false`.
 *   2. `blog_public = 0` (checkbox ticked in WP admin) →
 *      `blogPublic: false`, `discourageSearchEngines: true`.
 *   3. Value is coerced through `(int)` — many WP installs store the
 *      option as a stringy `"0"` / `"1"` (wp_options is LONGTEXT). The
 *      string cases must map exactly like the integer ones.
 *
 * @covers \Structura\Api\Rest_Api::get_site_indexing_status
 */
class SiteIndexingStatusTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Pass the response payload through verbatim so the test can
        // inspect the shape without a real WP_REST_Response.
        Functions\stubs([
            'rest_ensure_response' => function ($data) { return $data; },
        ]);
    }

    /** @test */
    public function it_reports_indexable_when_blog_public_is_one(): void
    {
        $this->expectFn('get_option')
            ->once()
            ->with('blog_public', 1)
            ->andReturn(1);

        $response = (new Rest_Api())->get_site_indexing_status();

        $this->assertSame(
            [
                'success'                 => true,
                'blogPublic'              => true,
                'discourageSearchEngines' => false,
            ],
            $response,
        );
    }

    /** @test */
    public function it_reports_discouraged_when_blog_public_is_zero(): void
    {
        $this->expectFn('get_option')
            ->once()
            ->with('blog_public', 1)
            ->andReturn(0);

        $response = (new Rest_Api())->get_site_indexing_status();

        $this->assertSame(
            [
                'success'                 => true,
                'blogPublic'              => false,
                'discourageSearchEngines' => true,
            ],
            $response,
        );
    }

    /**
     * WP frequently returns the option as a string ("0" / "1") because
     * wp_options stores values as LONGTEXT. A naive === comparison would
     * break the endpoint on those installs; the `(int)` coercion in the
     * handler is what keeps the contract.
     *
     * @test
     */
    public function it_coerces_string_zero_to_discouraged(): void
    {
        $this->expectFn('get_option')
            ->once()
            ->with('blog_public', 1)
            ->andReturn('0');

        $response = (new Rest_Api())->get_site_indexing_status();

        $this->assertFalse($response['blogPublic']);
        $this->assertTrue($response['discourageSearchEngines']);
    }

    /** @test */
    public function it_coerces_string_one_to_indexable(): void
    {
        $this->expectFn('get_option')
            ->once()
            ->with('blog_public', 1)
            ->andReturn('1');

        $response = (new Rest_Api())->get_site_indexing_status();

        $this->assertTrue($response['blogPublic']);
        $this->assertFalse($response['discourageSearchEngines']);
    }
}
