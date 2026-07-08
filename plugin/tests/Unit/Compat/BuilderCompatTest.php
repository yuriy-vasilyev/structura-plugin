<?php

namespace Structura\Tests\Unit\Compat;

use Structura\Compat\Builder_Compat;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for Builder_Compat.
 *
 * These tests pin the opt-out meta contract because it's the tiny,
 * shared seam that `Task_Runner::insert_wordpress_post` depends on.
 * Every row here is gated on a real page-builder bug — flipping a value
 * or quietly removing a key can resurrect the "post renders blank"
 * regression that motivated the helper in the first place (client
 * report, 2026-04-23, Divi-powered site).
 *
 * Anything more integration-shaped (actually observing the meta land on
 * a real post) belongs in the plugin integration suite — this file only
 * pins the pure value contract.
 *
 * @covers \Structura\Compat\Builder_Compat
 */
class BuilderCompatTest extends TestCase
{
    /** @test */
    public function divi_use_builder_meta_is_off(): void
    {
        // If this is not exactly the string 'off', Divi's `the_content`
        // filter replaces Gutenberg rendering with its own shortcode
        // loader and the front-end body renders blank. Divi compares
        // the meta with `===` against string literals, so `false` or
        // `0` would silently miss the opt-out.
        $meta = Builder_Compat::opt_out_meta();
        $this->assertArrayHasKey('_et_pb_use_builder', $meta);
        $this->assertSame('off', $meta['_et_pb_use_builder']);
    }

    /** @test */
    public function wpbakery_js_status_meta_is_string_false(): void
    {
        // WPBakery also compares the flag as a string. Using a PHP
        // boolean would round-trip through WP meta as the empty string
        // and skip the opt-out branch on read.
        $meta = Builder_Compat::opt_out_meta();
        $this->assertArrayHasKey('_wpb_vc_js_status', $meta);
        $this->assertSame('false', $meta['_wpb_vc_js_status']);
    }

    /** @test */
    public function all_values_are_string_scalars(): void
    {
        // `meta_input` tolerates any scalar but both Divi and WPBakery
        // use strict string comparisons internally. Pin string-typing
        // here rather than re-discovering the coercion bug the hard
        // way on a customer site.
        foreach (Builder_Compat::opt_out_meta() as $key => $value) {
            $this->assertIsString(
                $value,
                "Builder_Compat::opt_out_meta()['$key'] must be a string scalar."
            );
        }
    }

    /** @test */
    public function opt_out_meta_shape_has_not_drifted(): void
    {
        // If this list changes, update Builder_Compat's class-level
        // docblock ("Currently-written opt-outs" bullet list) in the
        // same commit so future maintainers know which builders we
        // treat as auto-enabling vs opt-in. Adding a builder without
        // that context makes the file read like a kitchen sink rather
        // than a curated allow-list.
        $this->assertSame(
            ['_et_pb_use_builder', '_wpb_vc_js_status'],
            array_keys(Builder_Compat::opt_out_meta()),
            'Opt-out meta keys drifted — keep the docblock bullet list in sync.'
        );
    }
}
