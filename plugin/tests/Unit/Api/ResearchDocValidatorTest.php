<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for {@see Rest_Api::validate_research_doc_file()} — the local
 * rejection matrix of the research-doc upload proxy. Codes/message keys must
 * mirror the cloud's typed `attachments.*` rejects so the SPA renders one
 * consistent inline error regardless of which side rejected first.
 *
 * @covers \Structura\Api\Rest_Api::validate_research_doc_file
 */
class ResearchDocValidatorTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Functions\when('wp_basename')->alias('basename');
        Functions\when('sanitize_file_name')->alias(
            static function ($name) {
                return preg_replace('/[^A-Za-z0-9 ._\-]/', '', (string) $name);
            }
        );
    }

    private function file(array $overrides = []): array
    {
        return array_merge(
            ['name' => 'research.pdf', 'size' => 1024, 'error' => 0, 'type' => 'application/pdf'],
            $overrides
        );
    }

    /** @test */
    public function it_accepts_supported_extensions_and_returns_the_sanitized_name(): void
    {
        foreach (['a.pdf', 'b.docx', 'c.txt', 'd.md', 'e.html', 'f.htm', 'G.PDF'] as $name) {
            $result = Rest_Api::validate_research_doc_file($this->file(['name' => $name]));
            $this->assertIsString($result, "expected {$name} to validate");
        }

        // Path components are stripped, not trusted.
        $result = Rest_Api::validate_research_doc_file($this->file(['name' => '../../evil.pdf']));
        $this->assertSame('evil.pdf', $result);
    }

    /** @test */
    public function it_rejects_unsupported_extensions_with_the_typed_key(): void
    {
        foreach (['survey.xlsx', 'archive.zip', 'noext'] as $name) {
            $error = Rest_Api::validate_research_doc_file($this->file(['name' => $name]));
            $this->assertInstanceOf(\WP_Error::class, $error, "expected {$name} to be rejected");
            $this->assertSame('attachments_unsupported_type', $error->get_error_code());
            $this->assertSame('attachments.unsupportedType', $error->get_error_data()['message_key'] ?? null);
        }
    }

    /** @test */
    public function it_rejects_oversized_and_empty_files(): void
    {
        $tooBig = Rest_Api::validate_research_doc_file($this->file(['size' => 10485761]));
        $this->assertInstanceOf(\WP_Error::class, $tooBig);
        $this->assertSame('attachments.tooLarge', $tooBig->get_error_data()['message_key'] ?? null);

        $empty = Rest_Api::validate_research_doc_file($this->file(['size' => 0]));
        $this->assertInstanceOf(\WP_Error::class, $empty);
    }

    /** @test */
    public function it_rejects_missing_files_and_php_upload_errors(): void
    {
        $this->assertInstanceOf(\WP_Error::class, Rest_Api::validate_research_doc_file(null));
        $this->assertInstanceOf(\WP_Error::class, Rest_Api::validate_research_doc_file([]));

        // UPLOAD_ERR_PARTIAL and friends must not slip through on size alone.
        $partial = Rest_Api::validate_research_doc_file($this->file(['error' => UPLOAD_ERR_PARTIAL]));
        $this->assertInstanceOf(\WP_Error::class, $partial);
        $this->assertSame('attachments_upload_failed', $partial->get_error_code());
    }
}
