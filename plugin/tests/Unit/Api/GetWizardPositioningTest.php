<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * Wire contract of {@see Rest_Api::get_wizard_positioning()}, the wp-admin
 * proxy in front of the cloud's `getWizardPositioning`
 * (specs/site-reading.md §11, wp-admin positioning round two).
 *
 * 2026-11-13: the Site → Info card lists the site's stored pages before any
 * draft. The cloud's read now carries them as an optional `pages`, which the
 * proxy passes through with the same sanitizer and cap as a draft's pages.
 *
 * @covers \Structura\Api\Rest_Api::get_wizard_positioning
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class GetWizardPositioningTest extends TestCase
{
    private const POSITIONING = [
        'what'       => 'Hand-forged kitchen knives.',
        'who'        => 'Home cooks.',
        'problem'    => 'Dull blades.',
        'source'     => 'ai_draft',
        'capturedAt' => '2026-11-01T00:00:00.000Z',
    ];

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
     * Answers the one cloud read with `$body`.
     *
     * @param array<string, mixed> $body Cloud response body.
     */
    private function cloud_answers(array $body): void
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->with('/getWizardPositioning', ['licenseKey' => 'ST-TEST-KEY'], Mockery::any())
            ->andReturn(['code' => 200, 'body' => $body, 'raw' => null]);
    }

    /** @test */
    public function it_passes_the_stored_pages_through_sanitized_and_capped_at_seven(): void
    {
        $pages = [
            ['url' => 'https://knives.test', 'label' => 'knives.test', 'role' => 'home'],
            ['url' => 'javascript:alert(1)', 'label' => 'Bad', 'role' => 'service'],
            ['url' => 'https://knives.test/pricing', 'label' => '<b>Pricing</b>', 'role' => 'pricing'],
            ['url' => 'https://knives.test/jobs', 'label' => 'Jobs', 'role' => 'careers'],
            'not a page',
        ];
        for ($i = 1; $i <= 6; $i++) {
            $pages[] = ['url' => "https://knives.test/knife-{$i}", 'label' => "Knife {$i}", 'role' => 'product'];
        }
        $this->cloud_answers(['positioning' => self::POSITIONING, 'pages' => $pages]);

        $result = (new Rest_Api())->get_wizard_positioning(null);

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
        $this->assertSame(self::POSITIONING, $result['positioning']);
    }

    /** @test */
    public function an_answer_without_pages_stays_as_it_was(): void
    {
        $this->cloud_answers(['positioning' => self::POSITIONING]);

        $result = (new Rest_Api())->get_wizard_positioning(null);

        $this->assertSame(['positioning' => self::POSITIONING], $result);
    }

    /** @test */
    public function it_drops_pages_that_are_not_a_list(): void
    {
        $this->cloud_answers(['positioning' => null, 'pages' => 'nope']);

        $result = (new Rest_Api())->get_wizard_positioning(null);

        $this->assertSame(['positioning' => null], $result);
    }
}
