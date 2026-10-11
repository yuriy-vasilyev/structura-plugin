<?php

namespace Structura\Tests\Unit\Ui;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Core\Source_Check;
use Structura\Tests\Unit\TestCase;
use Structura\Ui\Post_Meta_Box;

/**
 * The Source check section inside the Structura meta box and its status
 * handler (specs/source-check.md §9.3, §9.4). Rendered through the public
 * `render()` entry point with the license plan, post meta and WP output
 * helpers stubbed at the edge.
 *
 * @covers \Structura\Ui\Post_Meta_Box::render
 * @covers \Structura\Ui\Post_Meta_Box::ajax_source_check_status
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class PostMetaBoxSourceCheckTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function source_check(): array
    {
        return [
            'checkedAt'   => '2026-10-11T10:00:00.000Z',
            'sourceCount' => 2,
            'hasBrief'    => true,
            'notes'       => [
                [
                    'id'         => 'n2',
                    'n'          => 2,
                    'where'      => 'body',
                    'quote'      => 'Pharmacists must enter <strong>OCC 3</strong>.',
                    'category'   => 'UNSUPPORTED_SPECIFIC',
                    'reason'     => 'No source gives a code.',
                    'suggestion' => '',
                    'status'     => 'outdated',
                    'source'     => ['notFoundIn' => 2],
                ],
                [
                    'id'         => 'n1',
                    'n'          => 1,
                    'where'      => 'body',
                    'quote'      => 'lowers the price',
                    'category'   => 'OVERCLAIM',
                    'reason'     => 'Too strong.',
                    'suggestion' => 'can lower the price',
                    'status'     => 'open',
                    'source'     => ['url' => 'https://acme.example/terms', 'site' => 'acme.example', 'title' => 'Terms', 'readAt' => ''],
                ],
                [
                    'id'         => 'n3',
                    'n'          => 3,
                    'where'      => 'excerpt',
                    'quote'      => 'always works',
                    'category'   => 'UNSUPPORTED_CATEGORICAL',
                    'reason'     => 'Too absolute.',
                    'suggestion' => null,
                    'status'     => 'dismissed',
                    'resolvedAt' => '2026-10-11T11:00:00+00:00',
                    'resolvedBy' => 7,
                ],
            ],
            'changes'     => [
                [
                    'id'       => 'c1',
                    'where'    => 'body',
                    'before'   => 'Patients must pay full price.',
                    'after'    => '',
                    'category' => 'CONTRADICTED',
                    'reason'   => 'acme.example lists a bridge route.',
                    'status'   => 'applied',
                ],
            ],
        ];
    }

    /** @test */
    public function renders_open_notes_first_with_the_count_and_the_resolved_and_changed_disclosures(): void
    {
        $html = $this->render_with($this->source_check());

        $this->assertStringContainsString('id="structura-source-check"', $html);
        $this->assertStringContainsString('data-open-count="1"', $html);
        $this->assertStringContainsString('1 to review', $html);
        $this->assertStringContainsString('Compared with 2 sources and your brief', $html);
        $this->assertStringContainsString('Oct 11, 2026', $html);

        // Reading order by `n`, open and outdated in the open list, dismissed under the disclosure.
        $this->assertLessThan(strpos($html, 'data-note-id="n2"'), strpos($html, 'data-note-id="n1"'));
        $this->assertLessThan(strpos($html, 'data-note-id="n3"'), strpos($html, 'data-note-id="n2"'));
        $this->assertLessThan(strpos($html, 'data-note-id="n3"'), strpos($html, 'data-sc-resolved-list'));
        $this->assertStringContainsString('1 resolved', $html);

        // Labels, the quote without inline tags, the suggestion variants and the source line.
        $this->assertStringContainsString('Overpromises', $html);
        $this->assertStringContainsString('can lower the price', $html);
        $this->assertStringContainsString('Pharmacists must enter OCC 3.', $html);
        $this->assertStringNotContainsString('<strong>OCC 3</strong>', $html);
        $this->assertStringContainsString('Suggestion: remove this sentence.', $html);
        $this->assertStringContainsString('href="https://acme.example/terms"', $html);
        $this->assertStringContainsString('Not found in any of the 2 sources read', $html);
        $this->assertStringContainsString('data-status="outdated"', $html);

        // Accept only where there is a suggestion: a replacement, or "" for remove.
        $n1 = substr($html, strpos($html, 'data-note-id="n1"'), strpos($html, 'data-note-id="n3"') - strpos($html, 'data-note-id="n1"'));
        $this->assertSame(2, substr_count($n1, 'data-sc-action="accept"'));
        $this->assertStringContainsString('Remove sentence', $n1);
        $n3 = substr($html, strpos($html, 'data-note-id="n3"'));
        $this->assertStringNotContainsString('data-sc-action="accept"', $n3);

        // The change the check applied, as a strike-through and "removed".
        $this->assertStringContainsString('1 change made before delivery', $html);
        $this->assertStringContainsString('Patients must pay full price.', $html);
        $this->assertStringContainsString('Sentence removed', $html);
    }

    /** @test */
    public function renders_nothing_when_no_check_ran(): void
    {
        $this->assertStringNotContainsString('structura-source-check', $this->render_with(''));
    }

    /** @test */
    public function says_all_notes_resolved_when_every_note_is_handled(): void
    {
        $sc = $this->source_check();
        foreach ($sc['notes'] as $i => $note) {
            $sc['notes'][$i]['status'] = 'dismissed';
        }
        $html = $this->render_with($sc);

        $this->assertStringContainsString('data-open-count="0"', $html);
        $this->assertStringContainsString('All notes resolved', $html);
        $this->assertStringContainsString('3 resolved', $html);
    }

    /** @test */
    public function status_handler_refuses_a_user_who_cannot_edit_the_post(): void
    {
        Functions\when('check_ajax_referer')->justReturn(true);
        Functions\when('absint')->alias(static fn($v) => abs((int) $v));
        Functions\when('current_user_can')->justReturn(false);
        Functions\when('wp_send_json_error')->alias(static function ($payload) {
            throw new \RuntimeException('error:' . $payload['message']);
        });
        $_POST = ['nonce' => 'n', 'post_id' => '42', 'notes' => '[]'];

        $this->expectExceptionMessage('error:Permission denied.');
        (new Post_Meta_Box())->ajax_source_check_status();
    }

    /** @test */
    public function status_handler_persists_known_notes_and_answers_with_the_open_count(): void
    {
        Functions\when('check_ajax_referer')->justReturn(true);
        Functions\when('absint')->alias(static fn($v) => abs((int) $v));
        Functions\when('current_user_can')->justReturn(true);
        Functions\when('get_current_user_id')->justReturn(7);
        $sc = $this->source_check();
        Functions\when('get_post_meta')->alias(static function ($post_id, $key = '') use ($sc) {
            return $key === Source_Check::META_KEY ? $sc : '';
        });
        $saved = null;
        Functions\when('update_post_meta')->alias(static function ($post_id, $key, $value) use (&$saved) {
            $saved = [$post_id, $key, $value];
            return true;
        });
        $answer = null;
        Functions\when('wp_send_json_success')->alias(static function ($payload) use (&$answer) {
            $answer = $payload;
        });
        Functions\when('wp_send_json_error')->alias(static function ($payload) {
            throw new \RuntimeException('error:' . $payload['message']);
        });
        $_POST = [
            'nonce'   => 'n',
            'post_id' => '42',
            'notes'   => json_encode([['id' => 'n1', 'status' => 'dismissed'], ['id' => 'ghost', 'status' => 'dismissed']]),
        ];

        (new Post_Meta_Box())->ajax_source_check_status();

        $this->assertSame(42, $saved[0]);
        $this->assertSame(Source_Check::META_KEY, $saved[1]);
        $this->assertSame('dismissed', $saved[2]['notes'][1]['status']);
        $this->assertSame(7, $saved[2]['notes'][1]['resolvedBy']);
        $this->assertCount(3, $saved[2]['notes']);
        $this->assertSame(['openNoteCount' => 0], $answer);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Helpers
    // ──────────────────────────────────────────────────────────────────────

    /** @param mixed $source_check Value stored in `_structura_source_check`. */
    private function render_with($source_check): string
    {
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_plan')->andReturn('cloud_pro')
            ->getMock()
            ->shouldReceive('can_generate_featured_image')->andReturn(false)
            ->getMock()
            ->shouldReceive('can_generate_body_images')->andReturn(false);

        Functions\when('get_post_meta')->alias(static function ($post_id, $key = '', $single = false) use ($source_check) {
            return $key === Source_Check::META_KEY ? $source_check : '';
        });
        Functions\when('admin_url')->alias(static fn($path = '') => 'https://example.test/wp-admin/' . $path);
        Functions\when('esc_html_e')->alias(static function ($text, $domain = 'default') {
            echo htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8');
        });
        Functions\when('esc_attr_e')->alias(static function ($text, $domain = 'default') {
            echo htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8');
        });
        Functions\when('_n')->alias(static fn($single, $plural, $number, $domain = 'default') => $number === 1 ? $single : $plural);
        Functions\when('wp_date')->alias(static fn($format, $timestamp) => gmdate($format, $timestamp));

        ob_start();
        (new Post_Meta_Box())->render(new \WP_Post(42));

        return (string) ob_get_clean();
    }
}
