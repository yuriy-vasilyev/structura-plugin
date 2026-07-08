<?php

namespace Structura\Core;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Registry for UI metadata of the small set of SEO rules users can toggle.
 *
 * ## Why this list is so short
 *
 * Historically this registry listed every SEO check Structura runs (~24 rules).
 * We've since moved almost all of them server-side, for two reasons:
 *
 *   1. **Competitive moat.** The rule names (keyphrase density, passive voice,
 *      etc.) are public Yoast/RankMath checks. But the *prompt wording* that
 *      reliably keeps posts green — buffer targets, ordering, hard-requirement
 *      framing — is the actual IP. Keeping that on the cloud means competitors
 *      can't copy it by reading the plugin source.
 *   2. **Defaults that just work.** Users shouldn't have to know what
 *      "transition words ≥35%" means to get a Yoast-green post. Readability,
 *      keyphrase placement, SERP analysis etc. are now always-on based on
 *      license tier, handled in `functions/src/ai/instruction-builder.ts`
 *      (see ALWAYS_ON_RULES_BY_TIER).
 *
 * The rules that remain here are the ones where user choice is meaningful —
 * they change the *shape* of the post (FAQ section, Action Steps, link
 * strategy, numbers in the title) rather than its SEO compliance. Giving users
 * control over structural choices prevents every generated post from looking
 * identical.
 */
class SEO_Rules_Registry
{
    /**
     * Get the master list of user-toggleable rules for the UI.
     *
     * PRO status is enforced by the cloud, but reflected here for UI badges.
     */
    public static function get_all(): array
    {
        return [
            // --- STRUCTURAL ADDITIONS (Pro) ---
            //
            // These change the actual layout of the post — FAQ block, numbered
            // Action Steps, pulled statistics, numeric titles. Worth exposing
            // as toggles so users can keep their content varied.
            'include_faq_section'        => [
                'label'       => __('Include FAQ section', 'structura'),
                'description' => __('Append a FAQ section with FAQPage schema markup for Google rich results.', 'structura'),
                'plan'        => 'byok',
            ],
            'include_action_steps'       => [
                'label'       => __('Include action steps', 'structura'),
                'description' => __('Add a numbered Action Steps section with HowTo schema markup for Google rich results.', 'structura'),
                'plan'        => 'byok',
            ],
            'include_statistics'         => [
                'label'       => __('Include statistics', 'structura'),
                'description' => __('Integrate relevant statistics to support the content.', 'structura'),
                'plan'        => 'byok',
            ],
            'number_in_title'            => [
                'label'       => __('Include a number in the title', 'structura'),
                'description' => __('Add a number to the meta title to increase click-through rates.', 'structura'),
                'plan'        => 'byok',
            ],

            // --- LINK STRATEGY (Pro) ---
            //
            // Some sites prefer hand-curated internal linking, or have a
            // strict no-outbound-link policy. These toggles respect that.
            'internal_link_optimization' => [
                'label'       => __('Internal link optimization', 'structura'),
                'description' => __('Incorporate relevant internal links based on site context.', 'structura'),
                'plan'        => 'byok',
            ],
            'outbound_link_authority'    => [
                'label'       => __('Outbound link authority', 'structura'),
                'description' => __('Add outbound links to high-authority external sources.', 'structura'),
                'plan'        => 'byok',
            ],

            // --- WRITING QUALITY (Pro) ---
            //
            // Style-level directives users may legitimately want off: a
            // playful lifestyle blog might not want practitioner-toned E-E-A-T
            // framing, and entity coverage trades a wider scope per post for
            // tighter single-angle pieces.
            'eeat_signals'               => [
                'label'       => __('E-E-A-T writing signals', 'structura'),
                'description' => __('Write with experience-first signals aligned with Google\'s helpful-content guidance: concrete specifics, answer-first sections, honest trade-offs, no filler.', 'structura'),
                'plan'        => 'byok',
            ],
            'entity_coverage'            => [
                'label'       => __('Entity coverage', 'structura'),
                'description' => __('Cover the key concepts and sub-topics that top-ranking pages cover, based on live search research.', 'structura'),
                'plan'        => 'byok',
            ],
        ];
    }
}
