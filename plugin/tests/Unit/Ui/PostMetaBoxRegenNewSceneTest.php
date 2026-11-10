<?php

namespace Structura\Tests\Unit\Ui;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Tests\Unit\TestCase;
use Structura\Ui\Post_Meta_Box;

/**
 * Regenerate image with an empty prompt (2026-11-10). Both meta-box regen
 * handlers used to resolve the stored scene into `prompt`, and posts written
 * before 2026-11-09 mostly store the laptop-on-a-desk cliché, so the regen
 * gave the same picture again. An empty prompt now goes out empty, with the
 * real slot, the post's title and excerpt, and the stored scene as `topic`,
 * so the cloud's writer suggests a new scene. A typed prompt is sent as
 * before.
 *
 * The handlers and `Task_Runner` run for real up to the cloud call; the
 * `/executeCloudImageStep` payload is captured there and the call throws.
 *
 * @covers \Structura\Ui\Post_Meta_Box::ajax_regenerate_image
 * @covers \Structura\Ui\Post_Meta_Box::ajax_regenerate_body_image
 * @covers \Structura\Scheduler\Task_Runner::generate_post_images
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class PostMetaBoxRegenNewSceneTest extends TestCase
{
    private const STORED = 'A laptop on a desk next to a notebook and a cup of coffee';

    protected function tearDown(): void
    {
        $_POST = [];
        Mockery::close();
        parent::tearDown();
    }

    /**
     * Run `$handler` for post 42 (featured attachment 77, body attachment 88)
     * with `$fields` as the request, and return the payload sent to
     * `/executeCloudImageStep`, or null when none was sent.
     *
     * @param string               $handler Handler method on Post_Meta_Box.
     * @param array<string, mixed> $fields  Request fields besides nonce and post id.
     * @param string               $excerpt The post's excerpt.
     */
    private function capture_payload(string $handler, array $fields, string $excerpt = 'Costs, margins and what to charge.'): ?array
    {
        $_POST = array_merge(['nonce' => 'n', 'post_id' => '42'], $fields);
        Functions\when('check_ajax_referer')->justReturn(true);
        Functions\when('current_user_can')->justReturn(true);
        Functions\when('absint')->alias(static function ($value) {
            return abs((int) $value);
        });
        Functions\when('get_post')->justReturn((object) [
            'ID'           => 42,
            'post_excerpt' => $excerpt,
            'post_content' => '<!-- wp:paragraph --><p>What a <strong>tiered</strong> cake costs to make.</p><!-- /wp:paragraph --><p>Second.</p>',
        ]);
        Functions\when('get_post_type')->justReturn('attachment');
        Functions\when('get_post_thumbnail_id')->justReturn(77);
        Functions\when('get_the_title')->justReturn('How to price a wedding cake');
        Functions\when('get_post_field')->justReturn('How to price a wedding cake');
        Functions\when('wp_html_excerpt')->alias(static function ($text, $count) {
            return mb_substr(strip_tags((string) $text), 0, $count);
        });
        Functions\when('sanitize_title')->returnArg();
        Functions\when('sanitize_file_name')->returnArg();
        Functions\when('remove_filter')->justReturn(true);
        Functions\when('get_site_url')->justReturn('https://example.test');
        Functions\when('get_post_meta')->alias(static function ($id, $key) {
            $meta = [
                42 => ['_structura_campaign_run_id' => 'run-1'],
                77 => ['_structura_image_topic' => self::STORED, '_structura_image_slot' => 'featured'],
                88 => [
                    '_structura_image_topic'   => 'A notebook beside a pen',
                    '_structura_image_slot'    => 'body-0',
                    '_wp_attachment_image_alt' => 'Notebook',
                ],
            ];
            return $meta[(int) $id][$key] ?? '';
        });
        Functions\when('wp_send_json_error')->alias(static function () {
            throw new \RuntimeException('wp_send_json_error');
        });

        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')
            ->andReturn(['plan' => 'cloud', 'license_key' => 'lic']);
        Mockery::mock('alias:Structura\Core\Log_Service')
            ->shouldReceive('add')
            ->zeroOrMoreTimes();

        $captured = null;
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->andReturnUsing(function ($route, $payload) use (&$captured) {
                if ($route === '/executeCloudImageStep') {
                    $captured = $payload;
                }
                throw new \RuntimeException('stop after capture');
            });

        try {
            (new Post_Meta_Box())->{$handler}();
        } catch (\RuntimeException $e) {
            // The capture throws; the handler answers with wp_send_json_error.
        }

        return $captured;
    }

    /** @test */
    public function an_empty_featured_prompt_asks_the_cloud_for_a_new_scene(): void
    {
        $payload = $this->capture_payload('ajax_regenerate_image', ['custom_prompt' => '']);

        $this->assertIsArray($payload, 'The regen must reach the cloud.');
        $this->assertSame('', $payload['prompt']);
        $this->assertSame('featured', $payload['slot']);
        $this->assertSame(self::STORED, $payload['topic'], 'The stored scene travels as the one to move away from.');
        $this->assertSame('How to price a wedding cake', $payload['postTitle']);
        $this->assertSame('Costs, margins and what to charge.', $payload['postExcerpt']);
    }

    /** @test */
    public function a_typed_featured_prompt_is_sent_as_before(): void
    {
        $payload = $this->capture_payload('ajax_regenerate_image', ['custom_prompt' => 'A red kite over a beach']);

        $this->assertSame('A red kite over a beach', $payload['prompt']);
        $this->assertSame('A red kite over a beach', $payload['topic']);
        $this->assertSame('featured', $payload['slot']);
        $this->assertArrayNotHasKey('postTitle', $payload);
        $this->assertArrayNotHasKey('postExcerpt', $payload);
    }

    /** @test */
    public function an_empty_body_prompt_sends_the_real_slot_and_that_image_s_scene(): void
    {
        // The handler passes `featured` as the image type so the new
        // attachment is not injected; the cloud must still see the body slot.
        $payload = $this->capture_payload('ajax_regenerate_body_image', ['custom_prompt' => '', 'attachment_id' => '88']);

        $this->assertSame('', $payload['prompt']);
        $this->assertSame('body-0', $payload['slot']);
        $this->assertSame('A notebook beside a pen', $payload['topic']);
        $this->assertSame('How to price a wedding cake', $payload['postTitle']);
    }

    /** @test */
    public function filling_a_missing_body_image_has_no_scene_to_avoid_and_reads_the_first_paragraph(): void
    {
        $payload = $this->capture_payload(
            'ajax_regenerate_body_image',
            ['custom_prompt' => '', 'attachment_id' => '0', 'slot' => 'body-0'],
            ''
        );

        $this->assertSame('', $payload['prompt']);
        $this->assertSame('body-0', $payload['slot']);
        $this->assertArrayNotHasKey('topic', $payload);
        $this->assertSame('What a tiered cake costs to make.', $payload['postExcerpt']);
    }

    /** @test */
    public function the_modal_offers_the_stored_scene_with_reuse_and_an_empty_prompt(): void
    {
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_plan')->andReturn('cloud')
            ->getMock()
            ->shouldReceive('can_generate_featured_image')->andReturn(true)
            ->getMock()
            ->shouldReceive('can_generate_body_images')->andReturn(false);
        Functions\when('get_post_meta')->alias(static function ($id, $key = '', $single = false) {
            return (int) $id === 77 && $key === '_structura_image_topic' ? self::STORED : '';
        });
        Functions\when('get_post_thumbnail_id')->justReturn(77);
        Functions\when('wp_get_attachment_image_url')->justReturn('https://example.test/old.webp');
        Functions\when('admin_url')->alias(static function ($path = '') {
            return 'https://example.test/wp-admin/' . $path;
        });
        Functions\when('esc_html_e')->alias(static function ($text, $domain = 'default') {
            echo htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8');
        });
        Functions\when('esc_attr_e')->alias(static function ($text, $domain = 'default') {
            echo htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8');
        });

        ob_start();
        (new Post_Meta_Box())->render(new \WP_Post(42));
        $html = (string) ob_get_clean();

        // The trigger carries the stored scene; post-meta-box.js shows it.
        $this->assertStringContainsString('data-topic="' . self::STORED . '"', $html);
        $this->assertStringContainsString('<p id="structura-modal-current-scene" class="description" hidden>', $html);
        $this->assertStringContainsString('data-template="Current scene: %s"', $html);
        $this->assertStringContainsString('<button type="button" id="structura-modal-reuse"', $html);
        $this->assertSame(1, preg_match('/id="structura-modal-prompt".*?placeholder="([^"]*)"/s', $html, $placeholder));
        $this->assertSame('e.g. a brass compass needle being polished on a hill', $placeholder[1]);
        $this->assertDoesNotMatchRegularExpression('/<textarea[^>]*>[^<]+<\/textarea>/', $html, 'The prompt opens empty.');
    }
}
