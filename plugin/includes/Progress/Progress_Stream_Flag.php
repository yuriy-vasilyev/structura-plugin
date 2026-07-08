<?php

/**
 * TOMBSTONE — please delete this file.
 *
 * Progress_Stream_Flag was removed on 2026-04-22. The progress-stream
 * feature is a default UI surface; the kill switch had no admin affordance
 * and nobody would ever have flipped it. Removing the flag simplifies the
 * error branch in CampaignRunsTab (which was laundering real 500s as
 * "feature disabled").
 *
 * The file is retained only because this editing environment can't perform
 * an rm. Safe to delete in the next commit — Loader.php no longer
 * `require_once`s it.
 */

if ( ! defined('ABSPATH')) {
    exit;
}
