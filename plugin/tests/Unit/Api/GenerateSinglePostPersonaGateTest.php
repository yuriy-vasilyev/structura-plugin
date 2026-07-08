<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for the persona-presence gate in
 * {@see Rest_Api::generate_single_post()}.
 *
 * Single-post "Generate Now" has no dedicated cloud create endpoint to
 * gate (it shares campaign-step execution), so the plugin is the server
 * trust boundary: a workspace with zero personas must be refused before
 * a run is minted, because the run would otherwise degrade to a generic
 * voice and silently defeat the personas feature. Fresh workspaces are
 * auto-seeded with a "House voice" persona, so this is normally
 * unreachable; a failed seed or a deleted last persona land here.
 *
 * Pinned branches:
 *   - Confirmed-empty persona list → `personas_required` 403, no run
 *     minted (the gate returns before provider validation).
 *   - At least one persona → the gate falls through; the request then
 *     hits the NEXT validation (`missing_text_provider`), proving the
 *     persona gate did not block.
 *
 * @covers \Structura\Api\Rest_Api::generate_single_post
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class GenerateSinglePostPersonaGateTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @test */
    public function it_refuses_to_generate_when_the_workspace_has_zero_personas(): void
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->with('/listPersonas', [], Mockery::any())
            ->andReturn(['code' => 200, 'body' => ['personas' => []], 'raw' => null]);

        $rest   = new Rest_Api();
        $result = $rest->generate_single_post($this->make_request(['topic' => 'A valid objective here']));

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('personas_required', $result->get_error_code());
        $data = $result->get_error_data();
        $this->assertSame(403, $data['status'] ?? null);
    }

    /** @test */
    public function it_falls_through_to_provider_validation_when_a_persona_exists(): void
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->with('/listPersonas', [], Mockery::any())
            ->andReturn([
                'code' => 200,
                'body' => ['personas' => [['personaId' => 'p1', 'name' => 'House voice']]],
                'raw'  => null,
            ]);

        // Topic present + persona present + NO text_provider. The persona
        // gate must pass and the request must reach the next guard, which
        // rejects the missing text provider — proving the gate let it by.
        $rest   = new Rest_Api();
        $result = $rest->generate_single_post($this->make_request(['topic' => 'A valid objective here']));

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('missing_text_provider', $result->get_error_code());
    }

    /**
     * Minimal `WP_REST_Request` stand-in exposing `get_json_params()`,
     * the only accessor `generate_single_post` reaches before the gate.
     * PHP 7.4-compatible (no promoted constructor params — the CI matrix
     * still parses 7.4).
     *
     * @param array<string, mixed> $params
     */
    private function make_request(array $params): object
    {
        return new class($params) {
            /** @var array<string, mixed> */
            private $params;

            /** @param array<string, mixed> $params */
            public function __construct(array $params)
            {
                $this->params = $params;
            }

            /** @return array<string, mixed> */
            public function get_json_params(): array
            {
                return $this->params;
            }
        };
    }
}
