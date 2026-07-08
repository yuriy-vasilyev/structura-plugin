<?php

namespace Structura\Tests\Unit\Ui;

use Brain\Monkey\Functions;
use Structura\Tests\Unit\TestCase;
use Structura\Ui\Dashboard_Widget;

/**
 * Unit tests for Dashboard_Widget.
 *
 * We pin the `register()` gate because that's the decision point that
 * keeps the widget out of dashboards where it has no business
 * appearing. Render output is intentionally not asserted byte-for-byte
 * — the widget is HTML + inline CSS, and freezing the markup creates
 * noise without catching anything important.
 *
 * Spec: `specs/plugin-quiet-mode.md` §7.
 *
 * @covers \Structura\Ui\Dashboard_Widget
 */
class DashboardWidgetTest extends TestCase
{
    /** @test */
    public function register_skips_when_the_user_lacks_manage_options(): void
    {
        // Subscribers and editors never had Structura access; adding a
        // dashboard card they can't act on just adds clutter.
        Functions\when('current_user_can')->alias(function ($cap) {
            return $cap !== 'manage_options';
        });

        $this->expectFn('wp_add_dashboard_widget')->never();

        Dashboard_Widget::register();
        $this->assertTrue(true); // Brain Monkey's `never()` is the assertion
    }

    /** @test */
    public function register_adds_the_widget_when_capability_gate_passes(): void
    {
        Functions\when('current_user_can')->alias(function () { return true; });

        $this->expectFn('wp_add_dashboard_widget')
            ->once()
            ->with(
                Dashboard_Widget::WIDGET_ID,
                'Structura status',
                [Dashboard_Widget::class, 'render']
            );

        Dashboard_Widget::register();
        $this->assertTrue(true);
    }
}
