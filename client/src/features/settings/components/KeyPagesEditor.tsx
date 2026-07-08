import { __ } from "@wordpress/i18n";
import { Plus, Trash2 } from "lucide-react";
import { Button, InputField, Select } from "@structura/ui";

import type { KeyPage, KeyPageRole } from "../api/usePublicSiteProfile";

interface KeyPagesEditorProps {
  /**
   * Maximum entries the operator can add. Mirrors
   * `Public_Site_Profile::KEY_PAGES_MAX` so the UI matches what the
   * server will accept; pushing past this just stops adding new rows.
   */
  max?: number;
  pages: KeyPage[];
  onChange: (pages: KeyPage[]) => void;
  disabled?: boolean;
}

/**
 * The role enum is open-ended cloud-side, but the UI exposes only the
 * named buckets we have copy for. `"other"` is the catch-all the AI
 * uses when no specific intent applies — exposing it here lets the
 * operator drop a page that doesn't fit elsewhere without losing it
 * from the list.
 *
 * Spec: `specs/site-identity-headless.md` §3.1.
 */
const ROLE_OPTIONS: Array<{ value: KeyPageRole; label: string }> = [
  { value: "about", label: __("About", "structura") },
  { value: "features", label: __("Features", "structura") },
  { value: "services", label: __("Services", "structura") },
  { value: "pricing", label: __("Pricing", "structura") },
  { value: "case_studies", label: __("Case studies", "structura") },
  { value: "blog_index", label: __("Blog index", "structura") },
  { value: "contact", label: __("Contact", "structura") },
  { value: "other", label: __("Other", "structura") },
];

/**
 * Editable list of high-value non-blog URLs. The AI uses these for
 * internal-link suggestions in headless mode, where Structura can't
 * see the public site's nav from inside WP and therefore depends on
 * the operator to surface the right pages.
 *
 * Component is intentionally dumb — owns no state of its own,
 * controlled entirely by the parent via `pages` + `onChange`. That
 * keeps the parent draft-state coherent (one source of truth) and
 * lets the test harness assert on shape rather than internal state.
 */
export const KeyPagesEditor = ({
  pages,
  onChange,
  max = 8,
  disabled = false,
}: KeyPagesEditorProps) => {
  const updateAt = (index: number, patch: Partial<KeyPage>) => {
    onChange(
      pages.map((page, i) => (i === index ? { ...page, ...patch } : page))
    );
  };

  const removeAt = (index: number) => {
    onChange(pages.filter((_, i) => i !== index));
  };

  const addRow = () => {
    if (pages.length >= max) return;
    // Default new entries to `other` so the role select always has a
    // valid value — operators usually pick the right role second after
    // pasting the URL, and `other` is a safe placeholder.
    onChange([...pages, { url: "", label: "", role: "other" }]);
  };

  return (
    <div className="space-y-3">
      {pages.length === 0 && (
        <p className="m-0! text-xs text-gray-500 dark:text-gray-400">
          {__(
            "No key pages yet. Add the about, pricing, or features pages on your public site so Structura can link to them from new posts.",
            "structura"
          )}
        </p>
      )}

      {pages.map((page, index) => (
        <div
          key={index}
          className="grid grid-cols-1 gap-2 rounded-xl border border-gray-200 p-3 sm:grid-cols-[2fr_1fr_auto_auto] dark:border-gray-800"
        >
          <InputField
            type="url"
            label={__("URL", "structura")}
            hiddenLabel
            placeholder="https://example.com/about"
            value={page.url}
            onChange={(e) => updateAt(index, { url: e.target.value })}
            disabled={disabled}
          />
          <InputField
            label={__("Label", "structura")}
            hiddenLabel
            placeholder={__("About", "structura")}
            value={page.label}
            onChange={(e) => updateAt(index, { label: e.target.value })}
            disabled={disabled}
          />
          <Select
            options={ROLE_OPTIONS}
            value={page.role}
            onValueChange={(val) => updateAt(index, { role: val as KeyPageRole })}
            size="sm"
            disabled={disabled}
            className="min-w-[140px]"
          >
            <Select.Trigger />
            <Select.Content>
              {ROLE_OPTIONS.map((opt) => (
                <Select.Item key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
          <Button
            variant="transparent"
            size="sm"
            onClick={() => removeAt(index)}
            disabled={disabled}
            aria-label={__("Remove key page", "structura")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <Button
        variant="secondary"
        size="sm"
        onClick={addRow}
        disabled={disabled || pages.length >= max}
      >
        <Plus className="mr-1.5 h-4 w-4" />
        {__("Add page", "structura")}
      </Button>
    </div>
  );
};
