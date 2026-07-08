<?php

namespace Structura\Tests\Unit\Api;

use Structura\Api\Persona_Shape_Transformer;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for Persona_Shape_Transformer.
 *
 * Tests round-trip conversions between WP shape and cloud flat
 * shape. Ensures data integrity during cloud proxy migration
 * (Phase 1.0g). Pure data transformations — no WP fixtures needed,
 * so the suite extends the Brain Monkey base TestCase like the rest
 * of the Unit directory.
 */
class Persona_Shape_Transformer_Test extends TestCase
{
    /**
     * Test: cloud_to_wp preserves all fields and a nanoid string id.
     *
     * Critical: cloud personaId is a nanoid (e.g. "4r9TBGo0Pj_RDioJQGyib").
     * The transformer must NOT cast to int (would yield 0).
     */
    public function test_cloud_to_wp_preserves_nanoid_id_and_all_fields()
    {
        $cloud = [
            'personaId'     => '4r9TBGo0Pj_RDioJQGyib',
            'name'          => 'Friendly Mentor',
            'systemPrompt'  => 'You are a friendly, patient mentor who explains complex topics simply.',
            'tone'          => 'conversational',
            'readingLevel'  => 'grade_8',
            'authorId'      => 42,
        ];

        $wp = Persona_Shape_Transformer::cloud_to_wp($cloud);

        $this->assertSame('4r9TBGo0Pj_RDioJQGyib', $wp['id']);
        $this->assertSame('Friendly Mentor', $wp['name']);
        $this->assertSame(
            'You are a friendly, patient mentor who explains complex topics simply.',
            $wp['system_prompt']
        );
        $this->assertSame('conversational', $wp['tone']);
        $this->assertSame('grade_8', $wp['reading_level']);
        $this->assertSame(42, $wp['author_id']);
    }

    /**
     * Test: cloud_to_wp falls back to defaults on missing fields.
     */
    public function test_cloud_to_wp_handles_missing_fields()
    {
        $wp = Persona_Shape_Transformer::cloud_to_wp([]);

        $this->assertSame('', $wp['id']);
        $this->assertSame('', $wp['name']);
        $this->assertSame('', $wp['system_prompt']);
        $this->assertSame('professional', $wp['tone']);
        $this->assertSame('grade_12', $wp['reading_level']);
        $this->assertSame(1, $wp['author_id']);
    }

    /**
     * Test: wp_input_to_cloud transforms snake_case input to camelCase cloud shape.
     */
    public function test_wp_input_to_cloud_camel_cases_keys()
    {
        $wp_input = [
            'name'          => 'Technical Writer',
            'system_prompt' => 'Write detailed technical documentation.',
            'tone'          => 'formal',
            'reading_level' => 'grade_16',
            'author_id'     => 7,
        ];

        $cloud = Persona_Shape_Transformer::wp_input_to_cloud($wp_input);

        $this->assertSame('Technical Writer', $cloud['name']);
        $this->assertSame('Write detailed technical documentation.', $cloud['systemPrompt']);
        $this->assertSame('formal', $cloud['tone']);
        $this->assertSame('grade_16', $cloud['readingLevel']);
        $this->assertSame(7, $cloud['authorId']);
    }

    /**
     * Test: wp_input_to_cloud applies sanitisation (trims tags, etc.).
     */
    public function test_wp_input_to_cloud_sanitises_values()
    {
        $wp_input = [
            'name'          => "  Friendly Mentor  <script>alert('x')</script>",
            'system_prompt' => "You are <b>friendly</b>",
            'tone'          => 'CONVERSATIONAL@@@',
            'reading_level' => 'grade-8!!!',
            'author_id'     => '42abc',
        ];

        $cloud = Persona_Shape_Transformer::wp_input_to_cloud($wp_input);

        $this->assertStringNotContainsString('<script>', $cloud['name']);
        $this->assertStringNotContainsString('<b>', $cloud['systemPrompt']);
        $this->assertSame('conversational', $cloud['tone']);
        $this->assertSame('grade-8', $cloud['readingLevel']);
        $this->assertSame(42, $cloud['authorId']);
    }

    /**
     * Test: wp_cluster_to_cloud (used during migration) converts numeric WP post id
     * to a string for the cloud personaId field.
     */
    public function test_wp_cluster_to_cloud_stringifies_wp_post_id()
    {
        $wp_persona = [
            'id'            => 123,
            'name'          => 'Migrated Persona',
            'system_prompt' => 'Original system prompt.',
            'tone'          => 'professional',
            'reading_level' => 'grade_12',
            'author_id'     => 1,
        ];

        $cloud = Persona_Shape_Transformer::wp_cluster_to_cloud($wp_persona);

        $this->assertSame('123', $cloud['personaId']);
        $this->assertIsString($cloud['personaId']);
        $this->assertSame('Migrated Persona', $cloud['name']);
        $this->assertSame('Original system prompt.', $cloud['systemPrompt']);
        $this->assertSame(1, $cloud['authorId']);
    }

    /**
     * Test: round-trip cloud → wp → cloud (via wp_input_to_cloud) preserves
     * all writable fields. Note: the round-trip drops the id since
     * wp_input_to_cloud doesn't take an id (id is path-driven on the cloud).
     */
    public function test_round_trip_cloud_to_wp_to_cloud_preserves_writables()
    {
        $original_cloud = [
            'personaId'     => 'nano-id-xyz',
            'name'          => 'Casual Voice',
            'systemPrompt'  => 'Write like a friend texting.',
            'tone'          => 'conversational',
            'readingLevel'  => 'grade_6',
            'authorId'      => 8,
        ];

        $wp = Persona_Shape_Transformer::cloud_to_wp($original_cloud);

        // SPA writes use the snake_case shape via wp_input_to_cloud
        $wp_input = [
            'name'          => $wp['name'],
            'system_prompt' => $wp['system_prompt'],
            'tone'          => $wp['tone'],
            'reading_level' => $wp['reading_level'],
            'author_id'     => $wp['author_id'],
        ];

        $round_tripped = Persona_Shape_Transformer::wp_input_to_cloud($wp_input);

        $this->assertSame('Casual Voice', $round_tripped['name']);
        $this->assertSame('Write like a friend texting.', $round_tripped['systemPrompt']);
        $this->assertSame('conversational', $round_tripped['tone']);
        $this->assertSame('grade_6', $round_tripped['readingLevel']);
        $this->assertSame(8, $round_tripped['authorId']);
    }
}
