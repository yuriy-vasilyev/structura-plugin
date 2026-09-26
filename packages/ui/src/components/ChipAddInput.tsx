/**
 * ChipAddInput — the compact "+ Add" field every per-item list uses
 * (keywords, authority domains, competitors, relevance keywords).
 *
 * One entry can carry several items: commas and line breaks split the text
 * so a pasted list ("a, b, c" or one per line) lands as one submit. The
 * parent receives the whole batch in a single call and returns the values it
 * rejected; those stay in the field for the user to fix while the accepted
 * ones are cleared. The hint under the field and the "Add 3" button label
 * make the batch behaviour visible before the user commits.
 *
 * Surface-neutral like {@link DiscoverableChipList}: no i18n inside (labels
 * carry English defaults, consumers pass `__()` / `t()`), no margin resets.
 */
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "./Button";
import { InputField } from "./InputField";

/**
 * Splits one manual-add entry into its individual values. Commas and line
 * breaks are separators so a pasted list adds every item in one go; blanks
 * and in-batch duplicates are dropped, order is preserved.
 */
export function splitChipInput(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const value = part.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** Visible strings of the add field, each with an English default. */
export interface ChipAddInputLabels {
  /** Submit button when the field holds a single value. */
  add: string;
  /** Submit button when the field holds several values, e.g. "Add 3". */
  addCount: (count: number) => string;
  /** Hint under the field explaining the comma separator. Empty string hides it. */
  separatorHint: string;
}

export const DEFAULT_CHIP_ADD_LABELS: ChipAddInputLabels = {
  add: "Add",
  addCount: (count) => `Add ${count}`,
  separatorHint: "Add several at once: separate them with commas.",
};

export interface ChipAddInputProps {
  /**
   * Receives every value in the entry (already split, trimmed, deduped).
   * Return the values that were rejected — they stay in the field so the
   * user can fix them. Return nothing when all were accepted.
   */
  onAdd: (values: string[]) => string[] | void;
  /** Accessible name of the field (rendered visually hidden). */
  label: string;
  placeholder?: string;
  /** Validation message, rendered like any field error. */
  error?: string;
  disabled?: boolean;
  labels?: Partial<ChipAddInputLabels>;
  /** Forwarded to the input for e2e selectors. */
  "data-testid"?: string;
}

export const ChipAddInput = forwardRef<HTMLInputElement, ChipAddInputProps>(
  function ChipAddInput(
    { onAdd, label, placeholder, error, disabled = false, labels: labelOverrides, ...rest },
    ref,
  ) {
    const labels = { ...DEFAULT_CHIP_ADD_LABELS, ...labelOverrides };
    const [input, setInput] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const pending = splitChipInput(input);

    const submit = () => {
      if (pending.length === 0 || disabled) return;
      const rejected = onAdd(pending) ?? [];
      setInput(rejected.join(", "));
      // Keep the caret in the field so a list can be typed item by item
      // without reaching for the mouse after each Add click.
      inputRef.current?.focus();
    };

    return (
      <div className="flex flex-col gap-1.5">
        <InputField
          ref={inputRef}
          label={label}
          hiddenLabel
          size="sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          error={error}
          data-testid={rest["data-testid"]}
          rightAdornment={
            <Button
              variant="transparent"
              size="sm"
              onClick={submit}
              disabled={pending.length === 0 || disabled}
            >
              <Plus size={14} className="mr-1" />
              {pending.length > 1 ? labels.addCount(pending.length) : labels.add}
            </Button>
          }
        />
        {labels.separatorHint ? (
          <span className="block text-xs text-neutral-400 dark:text-neutral-500">
            {labels.separatorHint}
          </span>
        ) : null}
      </div>
    );
  },
);
