<?php

namespace Structura\Tests\Unit\Core;

use Structura\Core\SEO_Rules_Registry;
use Structura\Tests\Unit\TestCase;

/**
 * @covers \Structura\Core\SEO_Rules_Registry
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class SeoRulesRegistryTest extends TestCase
{
    /**
     * The references list (specs/study-lookup.md §12.3) is a paid rule.
     *
     * @test
     */
    public function the_references_list_is_a_paid_rule(): void
    {
        $rules = SEO_Rules_Registry::get_all();

        $this->assertSame('byok', $rules['references_list']['plan'] ?? null);
        $this->assertSame('References list', $rules['references_list']['label']);
        // The wp-admin Generate page repeats this description; keep the two equal.
        $this->assertSame(
            'Add a list of the studies and sources a post cites, in full, at the end of the post.',
            $rules['references_list']['description']
        );
    }

    /**
     * Owner, 2026-11-20: the references list shapes what goes into the post,
     * so the campaign pages show it with the always-visible content settings,
     * not in SEO Directives. Every other rule stays in SEO Directives.
     *
     * @test
     */
    public function only_the_references_list_sits_with_the_content_settings(): void
    {
        $rules = SEO_Rules_Registry::get_all();

        $this->assertSame('content', $rules['references_list']['placement'] ?? null);
        foreach ($rules as $id => $rule) {
            if ($id !== 'references_list') {
                $this->assertArrayNotHasKey('placement', $rule, "$id stays in SEO Directives");
            }
        }
    }
}
