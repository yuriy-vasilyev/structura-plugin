<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * Wire contract of {@see Rest_Api::suggest_wizard_positioning()}, the
 * wp-admin proxy in front of the cloud's `suggestWizardPositioning`
 * (specs/site-reading.md §5a, §11).
 *
 * 2026-11-13: the positioning card's AI draft reads the site's pages, but
 * wp-admin never showed which, and its Re-draft could not ask for a fresh
 * selection. The proxy now forwards an optional re-select flag, waits longer
 * for that call, and passes the pages read through sanitized and capped.
 *
 * @covers \Structura\Api\Rest_Api::suggest_wizard_positioning
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class SuggestWizardPositioningTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Functions\stubs([
            'rest_ensure_response' => function ($data) { return $data; },
            // Honors the protocol list the way WordPress does: any other
            // scheme comes back empty.
            'esc_url_raw' => function ($url, $protocols = null) {
                $scheme = strtolower((string) parse_url((string) $url, PHP_URL_SCHEME));
                if (is_array($protocols) && ! in_array($scheme, $protocols, true)) {
                    return '';
                }
                return filter_var((string) $url, FILTER_SANITIZE_URL);
            },
        ]);
        $license = Mockery::mock('alias:Structura\Core\License_Manager');
        $license->shouldReceive('has_workspace')->andReturn(true);
        $license->shouldReceive('get_license_data')->andReturn(['license_key' => 'ST-TEST-KEY']);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /**
     * Expect one cloud call and capture its payload and options.
     *
     * @param array<string, mixed>      $body     Cloud response body.
     * @param array<string, mixed>|null $payload  Filled by reference.
     * @param array<string, mixed>|null $options  Filled by reference.
     */
    private function expect_cloud_call(array $body, ?array &$payload, ?array &$options): void
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->with(
                '/suggestWizardPositioning',
                Mockery::on(function ($sent) use (&$payload) {
                    $payload = $sent;
                    return true;
                }),
                Mockery::on(function ($sent) use (&$options) {
                    $options = $sent;
                    return true;
                })
            )
            ->andReturn(['code' => 200, 'body' => $body, 'raw' => null]);
    }

    /**
     * Minimal `WP_REST_Request` stand-in (PHP 7.4-compatible).
     *
     * @param array<string, mixed> $params JSON body.
     */
    private function make_request(array $params = []): object
    {
        return new class($params) {
            /** @var array<string, mixed> */
            private $params;

            public function __construct(array $params)
            {
                $this->params = $params;
            }

            /** @return array<string, mixed> */
            public function get_json_params(): array
            {
                return $this->params;
            }
        };
    }

    private const SUGGESTION = [
        'what'      => 'Hand-forged kitchen knives.',
        'who'       => 'Home cooks.',
        'problem'   => 'Dull blades.',
        'rationale' => 'From the homepage.',
    ];

    /** @test */
    public function a_plain_draft_sends_no_flag_and_keeps_the_short_wait(): void
    {
        $payload = null;
        $options = null;
        $this->expect_cloud_call(['suggestion' => self::SUGGESTION], $payload, $options);

        $result = (new Rest_Api())->suggest_wizard_positioning($this->make_request());

        $this->assertArrayNotHasKey('reselectPages', $payload);
        $this->assertSame('ST-TEST-KEY', $payload['licenseKey']);
        $this->assertSame(30, $options['timeout']);
        $this->assertSame(self::SUGGESTION, $result['suggestion']);
        $this->assertArrayNotHasKey('pages', $result);
    }

    /** @test */
    public function a_redraft_asks_for_a_fresh_selection_and_waits_longer(): void
    {
        $payload = null;
        $options = null;
        $this->expect_cloud_call(['suggestion' => self::SUGGESTION, 'pages' => []], $payload, $options);

        (new Rest_Api())->suggest_wizard_positioning($this->make_request(['reselectPages' => true]));

        $this->assertTrue($payload['reselectPages']);
        $this->assertSame(60, $options['timeout']);
    }

    /** @test */
    public function only_a_boolean_true_asks_for_a_fresh_selection(): void
    {
        $payload = null;
        $options = null;
        $this->expect_cloud_call(['suggestion' => self::SUGGESTION], $payload, $options);

        (new Rest_Api())->suggest_wizard_positioning($this->make_request(['reselectPages' => 'yes']));

        $this->assertArrayNotHasKey('reselectPages', $payload);
        $this->assertSame(30, $options['timeout']);
    }

    /** @test */
    public function it_passes_the_pages_read_through_sanitized_and_capped_at_seven(): void
    {
        $pages = [
            ['url' => 'https://knives.test', 'label' => 'knives.test', 'role' => 'home'],
            ['url' => 'javascript:alert(1)', 'label' => 'Bad', 'role' => 'service'],
            ['url' => 'https://knives.test/pricing', 'label' => '<b>Pricing</b>', 'role' => 'pricing'],
            ['url' => 'https://knives.test/jobs', 'label' => 'Jobs', 'role' => 'careers'],
            ['url' => 'https://knives.test/empty', 'label' => '   ', 'role' => 'about'],
            'not a page',
        ];
        for ($i = 1; $i <= 6; $i++) {
            $pages[] = ['url' => "https://knives.test/knife-{$i}", 'label' => "Knife {$i}", 'role' => 'product'];
        }
        $payload = null;
        $options = null;
        $this->expect_cloud_call(['suggestion' => self::SUGGESTION, 'pages' => $pages], $payload, $options);

        $result = (new Rest_Api())->suggest_wizard_positioning($this->make_request(['reselectPages' => true]));

        $this->assertSame(
            [
                ['url' => 'https://knives.test', 'label' => 'knives.test', 'role' => 'home'],
                ['url' => 'https://knives.test/pricing', 'label' => 'Pricing', 'role' => 'pricing'],
                ['url' => 'https://knives.test/jobs', 'label' => 'Jobs', 'role' => 'other'],
                ['url' => 'https://knives.test/knife-1', 'label' => 'Knife 1', 'role' => 'product'],
                ['url' => 'https://knives.test/knife-2', 'label' => 'Knife 2', 'role' => 'product'],
                ['url' => 'https://knives.test/knife-3', 'label' => 'Knife 3', 'role' => 'product'],
                ['url' => 'https://knives.test/knife-4', 'label' => 'Knife 4', 'role' => 'product'],
            ],
            $result['pages']
        );
        $this->assertSame(self::SUGGESTION, $result['suggestion']);
    }

    /** @test */
    public function it_drops_pages_that_are_not_a_list(): void
    {
        $payload = null;
        $options = null;
        $this->expect_cloud_call(['suggestion' => null, 'reason' => 'error', 'pages' => 'nope'], $payload, $options);

        $result = (new Rest_Api())->suggest_wizard_positioning($this->make_request());

        $this->assertArrayNotHasKey('pages', $result);
        $this->assertSame('error', $result['reason']);
    }
}
