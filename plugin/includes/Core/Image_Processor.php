<?php

namespace Structura\Core;

class Image_Processor
{
    /**
     * @throws \Exception
     */
    public static function process(string $source_path, string $preferred_name = null): string
    {
        if ( ! License_Manager::can_generate_images()) {
            return $source_path;
        }

        // Use absolute path for safety
        $source_path = realpath($source_path) ?: $source_path;

        if ( ! file_exists($source_path)) {
            throw new \Exception(esc_html("Source image not found: " . $source_path));
        }

        $original_size = filesize($source_path);

        // Format is tier-gated: WebP (smaller, modern, perceived as a
        // "polish" feature) is reserved for paid tiers. Free tier falls
        // back to JPEG so the resulting attachment doesn't look like a
        // Pro deliverable in wp-admin. Pro / Cloud / Cloud Pro continue
        // honouring the `structura_visual_format` setting (which defaults
        // to webp). Spec: see the Free-vs-Pro audit conversation that
        // motivated this — keyphrase + internal-link gating in the cloud
        // and image-format gating here together create a visible
        // delivery delta between Free and paid.
        $target_format = License_Manager::is_pro()
            ? get_option('structura_visual_format', 'webp')
            : 'jpg';
        $path_info     = pathinfo($source_path);

        // Ensure we don't have double extensions from temp files
        $clean_base = $preferred_name ? sanitize_file_name($preferred_name) : 'img-' . uniqid();
        $new_path   = $path_info['dirname'] . '/' . $clean_base . '.' . $target_format;

        $editor = wp_get_image_editor($source_path);
        if (is_wp_error($editor)) {
            // Log why the editor failed (e.g., missing GD or Imagick)
            if (defined('WP_DEBUG') && WP_DEBUG) {
                // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- WP_DEBUG-gated, surfaces missing GD/Imagick when admins debug image-generation failures.
                error_log("[Structura] Image Editor Error: " . $editor->get_error_message());
            }

            return $source_path;
        }

        $editor->set_quality($target_format === 'webp' ? 80 : 85);
        $saved = $editor->save($new_path);

        if ( ! is_wp_error($saved)) {
            $new_size = filesize($saved['path']);
            self::update_stats(max(0, $original_size - $new_size));
            wp_delete_file($source_path);

            return $saved['path'];
        }

        return $source_path;
    }

    private static function update_stats($bytes)
    {
        update_option('structura_stat_compressed_images', (int)get_option('structura_stat_compressed_images', 0) + 1);
        update_option('structura_stat_saved_bytes', (int)get_option('structura_stat_saved_bytes', 0) + $bytes);
    }


    /**
     * Deletes temporary AI files after successful sideloading.
     */
    public static function cleanup(string $file_path): void
    {
        if (file_exists($file_path)) {
            wp_delete_file($file_path);
        }
    }
}