/**
 * CoreContentSettings — shared "top of the knobs list" panel rendered in both
 * the Create and Edit campaign flows, positioned just ABOVE the collapsible
 * Advanced Settings.
 *
 * Why these four fields live here:
 *   - Language, Post Length, Persona, and Post Status are the everyday levers
 *     an author actually reaches for per campaign. Burying them inside
 *     "Advanced Settings" hid them behind an extra click even for core use.
 *   - Post Status in particular was previously a global WP option
 *     (`structura_post_status`, removed in 8ad567586). Putting it here gives
 *     agencies running many campaigns per site per-campaign control over the
 *     review workflow (e.g. drafts for the blog, auto-publish for releases).
 *
 * Visual treatment matches the grid block that was previously inlined at the
 * top of AdvancedSettings (12px icon + tiny uppercase label + Select / Input).
 */

import { useMemo } from "react";
import { __ } from "@wordpress/i18n";
import { FileStack, Languages, Loader2, Send, UserCheck } from "lucide-react";
import { InputField, Select } from "@structura/ui";
import { useCampaignForm } from "@/features/campaigns/context/CampaignContext";
import { usePersonasQuery } from "@/features/personas";
import { useLicense } from "@/features/settings";
import { LANGUAGES } from "@/data/languages";
import { CampaignPostStatus } from "@/features/campaigns/types";

const POST_STATUS_OPTIONS: Array<{ value: CampaignPostStatus; label: string }> = [
  { value: "publish", label: __("Publish immediately", "structura") },
  { value: "draft", label: __("Save as draft", "structura") },
  { value: "pending", label: __("Pending review", "structura") },
];

export const CoreContentSettings = () => {
  const { formData, updateForm } = useCampaignForm();
  const { isPaidLicense } = useLicense();
  const { data: personas = [], isLoading: loadingPersonas } = usePersonasQuery();

  const { intelligence, structure } = formData;

  const personaOptions = useMemo(
    () => [
      { value: "random", label: __("Random persona", "structura") },
      // 2026-05-01 — `String(p.id)` normalises legacy numeric ids
      // and cloud nanoids into one shape so the form's
      // `String(personaId)` value round-trips through `<Select>`'s
      // strict-equality option-find regardless of source.
      ...personas.map((p: any) => ({ value: String(p.id), label: p.name })),
    ],
    [personas],
  );

  const languageOptions = useMemo(
    () => [{ value: "default", label: __("System Default", "structura") }, ...LANGUAGES],
    [],
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* Language */}
      <div className="space-y-1.5">
        <span className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-neutral-400 uppercase">
          <Languages size={12} className="text-brand-500" />
          {__("Language", "structura")}
        </span>
        <Select
          value={intelligence.language}
          onValueChange={(val) => updateForm("intelligence", { language: val as string })}
          options={languageOptions}
        >
          <Select.Label hidden>{__("Language", "structura")}</Select.Label>
          <Select.Trigger placeholder={__("Select…", "structura")} />
          <Select.Content className="w-(--button-width)">
            {languageOptions.map((l) => (
              <Select.Item key={l.value} value={l.value}>
                {l.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>

      {/* Post Length */}
      <div className="space-y-1.5">
        <span className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-neutral-400 uppercase">
          <FileStack size={12} className="text-brand-500" />
          {__("Post Length", "structura")}
        </span>
        {/*
          Non-paid tiers (Free + anonymous None) have a 500-word
          server-side clamp in `functions/src/ai/instruction-builder.ts`.
          Mirror the cap on the input so the user sees the ceiling
          instead of typing 2700 and silently receiving ~500. The
          explanatory help text lives in a full-width block below the
          grid — the 4-col cell is too narrow to render a translated
          sentence without wrapping into an unreadable shape.
        */}
        <InputField
          label={__("Words", "structura")}
          hiddenLabel
          type="number"
          value={intelligence.postLength}
          max={!isPaidLicense ? 500 : undefined}
          onChange={(e) => {
            const parsed = parseInt(e.target.value);
            const next = Number.isFinite(parsed) ? parsed : 0;
            updateForm("intelligence", {
              postLength: !isPaidLicense ? Math.min(next, 500) : next,
            });
          }}
          rightAdornment={
            <span className="text-[10px] font-bold text-neutral-400 uppercase">
              {__("Words", "structura")}
            </span>
          }
        />
      </div>

      {/* Persona */}
      <div className="space-y-1.5">
        <span className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-neutral-400 uppercase">
          <UserCheck size={12} className="text-neutral-400" />
          {__("Persona", "structura")}
        </span>
        {loadingPersonas ? (
          <div className="flex h-10 items-center justify-center rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700">
            <Loader2 className="size-3 animate-spin text-neutral-400" />
          </div>
        ) : (
          <Select
            // 2026-05-01 — cloud personas use nanoid string ids;
            // `Number()` produces `NaN` for nanoids and the trigger
            // silently shows its placeholder after every click. Keep
            // the value as a string both ways; the cloud accepts
            // numeric legacy ids as numeric strings without complaint.
            value={intelligence.personaId === "random" ? "random" : String(intelligence.personaId)}
            onValueChange={(val) =>
              updateForm("intelligence", {
                personaId: val === "random" ? "random" : String(val),
              })
            }
            options={personaOptions}
          >
            <Select.Trigger placeholder={__("Choose…", "structura")} />
            <Select.Content className="w-(--button-width)">
              {personaOptions.map((opt) => (
                <Select.Item key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        )}
      </div>

      {/* Post Status */}
      <div className="space-y-1.5">
        <span className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-neutral-400 uppercase">
          <Send size={12} className="text-brand-500" />
          {__("Post Status", "structura")}
        </span>
        <Select
          value={structure.postStatus}
          onValueChange={(val) =>
            updateForm("structure", { postStatus: val as CampaignPostStatus })
          }
          options={POST_STATUS_OPTIONS}
        >
          <Select.Label hidden>{__("Post Status", "structura")}</Select.Label>
          <Select.Trigger placeholder={__("Select…", "structura")} />
          <Select.Content className="w-(--button-width)">
            {POST_STATUS_OPTIONS.map((opt) => (
              <Select.Item key={opt.value} value={opt.value}>
                {opt.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>
      </div>

      {!isPaidLicense && (
        <p className="m-0! text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
          {__(
            "Free and anonymous installs are capped at 500 words per post. Upgrade to Pro to publish longer posts.",
            "structura"
          )}
        </p>
      )}
    </div>
  );
};
