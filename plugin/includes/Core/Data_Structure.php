<?php

namespace Structura\Core;

if ( ! defined('ABSPATH')) {
    exit;
}

class Data_Structure
{

    public static function init()
    {
        add_action('init', [__CLASS__, 'register_persona_cpt']);
    }

    public static function register_persona_cpt(): void
    {
        register_post_type('structura_persona', [
            'labels'          => [
                'name'          => __('Personas', 'structura'),
                'singular_name' => __('Persona', 'structura'),
            ],
            'public'          => false,
            'show_ui'         => false,
            'show_in_rest'    => true,
            'supports'        => ['title', 'custom-fields'],
            'capability_type' => 'post',
            'map_meta_cap'    => true,
        ]);
    }
}