/**
 * Per-connection "every Nth post" cadence picker.
 *
 * Lets the user throttle a channel connection to dispatch on every Nth
 * qualifying event instead of every one. Read back as
 * `post_cadence_n` on the save payload.
 *
 * Semantics (matches cloud `ConnectionRecord.postCadenceN`):
 *   - `1`        — every event that passes the bindings filter dispatches.
 *                  This is the default for fresh installs and pre-cadence
 *                  legacy docs.
 *   - `2..50`    — dispatcher only fans this connection out on the Nth
 *                  qualifying event. Combined with a 4h frequency floor
 *                  so a burst of N posts in 10 minutes still gets
 *                  throttled.
 *
 * Range: the cloud clamps to `[1, 50]`; we mirror the same range here so
 * a bad client-side number is corrected at the form boundary instead of
 * silently truncated on submit.
 *
 * Spec: specs/integrations-store-spec.md §5.2 (binding section) + the
 * 2026-05-20 product ask to give LinkedIn/X connections explicit cadence
 * control instead of relying on the 4h floor alone.
 */

import { __, sprintf } from "@wordpress/i18n";
import { InputField } from "@structura/ui";

interface CadencePickerProps {
  value: number;
  onChange: (next: number) => void;
  /**
   * Optional label override. Defaults to "Post on every Nth post". A
   * caller embedding the picker inside a larger form section (e.g. the
   * post-OAuth configure modal) can swap the wording to suit the
   * surrounding context without forking the component.
   */
  label?: string;
  /**
   * Optional helper-line override. Defaults to the dispatch-centric
   * cadence explanation; the Video channel swaps in its quota-aware
   * wording ("Every published post gets a video while your monthly quota
   * lasts.") without forking the picker.
   */
  helper?: string;
  /** Optional id for the underlying input (label-for association). */
  id?: string;
}

const MIN_CADENCE = 1;
const MAX_CADENCE = 50;

export const CadencePicker = ({
  value,
  onChange,
  label,
  helper: helperOverride,
  id = "structura-cadence-picker",
}: CadencePickerProps) => {
  // Defensive: render `value` clamped so a malformed server-side value
  // (e.g. a hand-edited Firestore doc with cadence=0) shows up as `1`
  // rather than rejecting input or producing a confusing form state.
  const display = Math.max(MIN_CADENCE, Math.min(MAX_CADENCE, Math.floor(value || MIN_CADENCE)));

  const helper =
    helperOverride ??
    (display <= 1
      ? __(
          "Every published post fans out to this channel. Pick a higher number to throttle bursty campaigns.",
          "structura",
        )
      : sprintf(
          /* translators: %d = "every Nth" cadence number, e.g. 3. */
          __(
            "Posts every %dth time a qualifying campaign publishes. A 4-hour minimum gap also applies so a single burst can’t flood your feed.",
            "structura",
          ),
          display,
        ));

  return (
    <div className="space-y-1.5">
      <InputField
        id={id}
        type="number"
        label={label ?? __("Post on every Nth post", "structura")}
        value={String(display)}
        min={MIN_CADENCE}
        max={MAX_CADENCE}
        step={1}
        onChange={(e) => {
          const raw = (e.target as HTMLInputElement).value;
          // Empty input keeps the previous value visible until the user
          // types something usable. `parseInt` on a non-numeric returns
          // NaN; clamp gives us the floor either way.
          const parsed = parseInt(raw, 10);
          if (Number.isNaN(parsed)) return;
          onChange(Math.max(MIN_CADENCE, Math.min(MAX_CADENCE, parsed)));
        }}
      />
      {/* Helper line under the input — `InputField` doesn't expose a
          first-class helper slot, so the parent renders it. Matches the
          treatment used on other forms in the channels feature
          (CampaignBindingsPicker, the locale row). */}
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{helper}</p>
    </div>
  );
};
