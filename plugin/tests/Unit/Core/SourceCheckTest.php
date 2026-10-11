<?php

namespace Structura\Tests\Unit\Core;

use Structura\Core\Source_Check;
use Structura\Tests\Unit\TestCase;

/**
 * Source check notes on a WordPress post (specs/source-check.md §9.3):
 * the wire object is stored sanitised, only `open` notes count, and the
 * editor's status patch accepts known ids and enum statuses only.
 *
 * @covers \Structura\Core\Source_Check
 */
class SourceCheckTest extends TestCase
{
    private function wire(): array
    {
        return [
            'checkedAt'   => '2026-10-11T10:00:00.000Z',
            'sourceCount' => 2,
            'hasBrief'    => true,
            'notes'       => [
                [
                    'id'         => 'n1',
                    'n'          => 1,
                    'where'      => 'body',
                    'quote'      => 'lowers the price',
                    'category'   => 'OVERCLAIM',
                    'reason'     => 'Too strong.',
                    'suggestion' => 'can lower the price',
                    'status'     => 'open',
                    'source'     => ['url' => 'https://acme.example/terms', 'site' => 'acme.example', 'title' => 'Terms', 'readAt' => '2026-10-11T09:00:00.000Z'],
                ],
                [
                    'id'         => 'n2',
                    'n'          => 2,
                    'where'      => 'metaDescription',
                    'quote'      => 'OCC 3',
                    'category'   => 'UNSUPPORTED_SPECIFIC',
                    'reason'     => 'No source gives a code.',
                    'suggestion' => '',
                    'status'     => 'open',
                    'source'     => ['notFoundIn' => 2],
                ],
                [
                    'id'         => 'n3',
                    'n'          => 3,
                    'where'      => 'somewhere-else',
                    'quote'      => 'x',
                    'category'   => 'MADE_UP',
                    'reason'     => '',
                    'suggestion' => null,
                    'status'     => 'bogus',
                    'source'     => ['brief' => true],
                ],
                ['n' => 4, 'quote' => 'no id'],
            ],
            'changes'     => [
                [
                    'id'       => 'c1',
                    'where'    => 'body',
                    'before'   => 'Pharmacists must enter OCC 3.',
                    'after'    => '',
                    'category' => 'UNSUPPORTED_SPECIFIC',
                    'reason'   => 'No source gives a code.',
                    'status'   => 'applied',
                    'source'   => ['notFoundIn' => 2],
                ],
            ],
        ];
    }

    /** @test */
    public function sanitize_keeps_the_wire_shape_and_falls_back_on_unknown_values(): void
    {
        $stored = Source_Check::sanitize($this->wire());

        $this->assertSame('2026-10-11T10:00:00.000Z', $stored['checkedAt']);
        $this->assertSame(2, $stored['sourceCount']);
        $this->assertTrue($stored['hasBrief']);
        $this->assertCount(3, $stored['notes'], 'the entry without an id is dropped');

        $this->assertSame('can lower the price', $stored['notes'][0]['suggestion']);
        $this->assertSame(['url' => 'https://acme.example/terms', 'site' => 'acme.example', 'title' => 'Terms', 'readAt' => '2026-10-11T09:00:00.000Z'], $stored['notes'][0]['source']);

        // "" (remove the sentence) and null (no suggestion) stay apart.
        $this->assertSame('', $stored['notes'][1]['suggestion']);
        $this->assertSame(['notFoundIn' => 2], $stored['notes'][1]['source']);
        $this->assertNull($stored['notes'][2]['suggestion']);

        $this->assertSame('body', $stored['notes'][2]['where']);
        $this->assertSame('UNSUPPORTED_SPECIFIC', $stored['notes'][2]['category']);
        $this->assertSame('open', $stored['notes'][2]['status']);
        $this->assertSame(['brief' => true], $stored['notes'][2]['source']);

        $this->assertSame('', $stored['changes'][0]['after']);
        $this->assertSame('applied', $stored['changes'][0]['status']);
    }

    /** @test */
    public function sanitize_returns_null_without_a_notes_array(): void
    {
        $this->assertNull(Source_Check::sanitize('nope'));
        $this->assertNull(Source_Check::sanitize(['checkedAt' => 'x']));
        $this->assertNull(Source_Check::sanitize(['notes' => 'x']));
    }

    /** @test */
    public function only_open_notes_count(): void
    {
        $stored = Source_Check::sanitize($this->wire());
        $this->assertSame(3, Source_Check::open_count($stored));

        $stored['notes'][0]['status'] = 'dismissed';
        $stored['notes'][1]['status'] = 'outdated';
        $this->assertSame(1, Source_Check::open_count($stored));
    }

    /** @test */
    public function status_patch_stamps_resolutions_and_ignores_what_it_does_not_know(): void
    {
        $stored  = Source_Check::sanitize($this->wire());
        $patched = Source_Check::apply_status_patch(
            $stored,
            ['notes' => [
                ['id' => 'n1', 'status' => 'dismissed'],
                ['id' => 'n2', 'status' => 'bogus'],
                ['id' => 'ghost', 'status' => 'dismissed'],
                'not an item',
            ]],
            7,
            '2026-10-11T12:00:00+00:00'
        );

        $this->assertSame('dismissed', $patched['notes'][0]['status']);
        $this->assertSame('2026-10-11T12:00:00+00:00', $patched['notes'][0]['resolvedAt']);
        $this->assertSame(7, $patched['notes'][0]['resolvedBy']);
        $this->assertSame('open', $patched['notes'][1]['status']);
        $this->assertArrayNotHasKey('resolvedAt', $patched['notes'][1]);
        $this->assertCount(3, $patched['notes']);
        $this->assertSame(2, Source_Check::open_count($patched));

        // Undo: back to open clears the stamp.
        $undone = Source_Check::apply_status_patch($patched, ['notes' => [['id' => 'n1', 'status' => 'open']]], 7, '2026-10-11T12:05:00+00:00');
        $this->assertSame('open', $undone['notes'][0]['status']);
        $this->assertArrayNotHasKey('resolvedAt', $undone['notes'][0]);
        $this->assertArrayNotHasKey('resolvedBy', $undone['notes'][0]);
    }

    /** @test */
    public function labels_cover_every_category_and_area(): void
    {
        $this->assertSame('Overpromises', Source_Check::type_label('OVERCLAIM'));
        $this->assertSame('Contradicts a source', Source_Check::type_label('CONTRADICTED'));
        $this->assertSame('Too absolute', Source_Check::type_label('UNSUPPORTED_CATEGORICAL'));
        $this->assertSame('Against your brief', Source_Check::type_label('BRIEF_VIOLATION'));
        $this->assertSame('Unsourced detail', Source_Check::type_label('UNSUPPORTED_SPECIFIC'));
        $this->assertSame('Unsourced detail', Source_Check::type_label('???'));
        $this->assertSame('Meta description', Source_Check::where_label('metaDescription'));
        $this->assertSame('Excerpt', Source_Check::where_label('excerpt'));
        $this->assertSame('Post body', Source_Check::where_label('body'));
    }
}
