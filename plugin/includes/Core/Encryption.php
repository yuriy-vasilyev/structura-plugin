<?php

namespace Structura\Core;

if ( ! defined('ABSPATH')) {
    exit;
}

class Encryption
{
    private const MASTER_KEY_OPTION = 'structura_enc_master_key';
    private static string $method = 'aes-256-cbc';

    public static function encrypt($data): string
    {
        if (empty($data)) {
            return '';
        }

        $key       = self::get_key();
        $iv_length = openssl_cipher_iv_length(self::$method);
        $iv        = openssl_random_pseudo_bytes($iv_length);

        $encrypted = openssl_encrypt($data, self::$method, $key, 0, $iv);

        return base64_encode($encrypted . '::' . $iv);
    }

    /**
     * Intelligent Key Retrieval
     * 1. Checks wp-config.php constant (Best Security)
     * 2. Checks wp_options (Best Usability)
     * 3. Generates new key if missing
     */
    private static function get_key(): string
    {
        // 1. Allow Power Users to override via wp-config.php
        if (defined('STRUCTURA_ENCRYPTION_KEY') && ! empty(STRUCTURA_ENCRYPTION_KEY)) {
            return STRUCTURA_ENCRYPTION_KEY;
        }

        // 2. Fetch the generated key from DB
        $stored_key = get_option(self::MASTER_KEY_OPTION);

        // 3. Generate if missing (First Run)
        if (empty($stored_key)) {
            // Generate a 64-char random string using WP's secure generator
            $stored_key = wp_generate_password(64, true, true);
            update_option(self::MASTER_KEY_OPTION, $stored_key, false); // false = autoload (load on every page)
        }

        return $stored_key;
    }

    public static function decrypt($data)
    {
        if (empty($data)) {
            return '';
        }

        $key = self::get_key();

        $data = base64_decode($data);
        if ( ! str_contains($data, '::')) {
            return '';
        }

        [$encrypted_data, $iv] = explode('::', $data, 2);

        return openssl_decrypt($encrypted_data, self::$method, $key, 0, $iv);
    }
}