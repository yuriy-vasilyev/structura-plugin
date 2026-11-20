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
 *   - Registry rules with `placement: "content"` (the References list) get a
 *     switch row here too: they decide what goes into the post.
 *
 * Visual treatment matches the grid block that was previously inlined at the
 * top of AdvancedSettings (12px icon + tiny uppercase label + Select / Input).
 */

import { useMemo } from "react";
import { __ } from "@wordpress/i18n";
import { BookOpen, FileStack, Loader2, Send, UserCheck } from "lucide-react";
import { cn, InputField, Select, Switch } from "@structura/ui";
import {
  clampPostLength,
  FREE_POST_LENGTH_MAX,
  POST_LENGTH_MAX,
  POST_LENGTH_MIN,
} from "@structura/types";
import { useCampaignForm } from "@/features/campaigns/context/CampaignContext";
import { useSitePersonasQuery } from "@/features/personas";
import { SeoRuleName, useLicense, useSeoRules } from "@/features/settings";
import { isContentSettingRule } from "@/features/settings/api/useSeoRules";
import { CampaignLanguageField } from "@/features/campaigns/components/CampaignLanguageField";
import { NeedsAuthorityLinksHint } from "@/features/campaigns/components/NeedsAuthorityLinksHint";
import { isSeoRuleUnavailable, withSeoRule } from "@/features/campaigns/helpers";
import { CampaignPostStatus } from "@/features/campaigns/types";

const POST_STATUS_OPTIONS: Array<{ value: CampaignPostStatus; label: string }> = [
  { value: "publish", label: __("Publish immediately", "structura") },
  { value: "draft", label: __("Save as draft", "structura") },
  // "Pending review" was removed 2026-07-09 — WP treated it as a draft.
];

export interface CoreContentSettingsProps {
  /**
   * The campaign Setup step owns the language itself (it drives the setup
   * draft and carries the "From your site" pill), so it hides the copy here
   * rather than showing the same control twice.
   */
  showLanguage?: boolean;
}

export const CoreContentSettings = ({ showLanguage = true }: CoreContentSettingsProps = {}) => {
  const { formData, updateForm } = useCampaignForm();
  const { isPaidLicense, isLicensed } = useLicense();
  const { rules } = useSeoRules();
  const { intelligence, structure } = formData;
  // Registry rules that shape what goes into the post (the References list)
  // sit here, always visible, rather than in Advanced Settings > SEO
  // Directives (owner, 2026-11-20).
  const contentRules = rules
    ? Object.entries(rules).filter(([, rule]) => isContentSettingRule(rule))
    : [];
  const maxPostLength = isPaidLicense ? POST_LENGTH_MAX : FREE_POST_LENGTH_MAX;
  // Site-scoped: the whole workspace library here listed every sibling
  // site's voice on a multi-site workspace (2026-09-22).
  const { data: personas, isLoading: loadingPersonas } = useSitePersonasQuery(
    intelligence.personaId,
  );

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

  return (
    <div className="space-y-3">
      {/* Language sits above the grid, full width: the picker reveals an
          inline catalogue list and an honest note for unsupported languages,
          neither of which fits a quarter-width cell. */}
      {showLanguage && (
        <CampaignLanguageField
          value={intelligence.language}
          onChange={(code) => updateForm("intelligence", { language: code })}
          className="max-w-md"
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">

      {/* Post Length */}
      <div className="space-y-1.5">
        <span className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-neutral-400 uppercase">
          <FileStack size={12} className="text-brand-500" />
          {__("Post Length", "structura")}
        </span>
        {/*
          The cloud clamps every plan's length (`clampPostLength`): Free +
          anonymous None to 500, paid to 3000. Mirror the cap on the input
          so the user sees the ceiling instead of typing 2700 and silently
          receiving ~500; the 300 floor applies on blur, since on every
          keystroke it would make the field untypeable. The explanatory
          help text lives in a full-width block below the grid — the 4-col
          cell is too narrow to render a translated sentence without
          wrapping into an unreadable shape.
        */}
        <InputField
          label={__("Words", "structura")}
          hiddenLabel
          type="number"
          value={intelligence.postLength}
          min={POST_LENGTH_MIN}
          max={maxPostLength}
          onChange={(e) => {
            const parsed = parseInt(e.target.value);
            const next = Number.isFinite(parsed) ? parsed : 0;
            updateForm("intelligence", { postLength: Math.min(next, maxPostLength) });
          }}
          onBlur={() =>
            updateForm("intelligence", {
              postLength: clampPostLength(intelligence.postLength, { paid: isPaidLicense }),
            })
          }
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
            "Free and anonymous installs are capped at 500 words per post. Paid plans have no word limit.",
            "structura"
          )}
        </p>
      )}

      {contentRules.map(([name, rule]) => {
        const ruleName = name as SeoRuleName;
        const isProLocked = ["byok", "cloud"].includes(rule.plan) && !isPaidLicense;
        const isFreeLocked = rule.plan === "free" && !isLicensed;
        const needsAuthority =
          !isProLocked && !isFreeLocked && isSeoRuleUnavailable(ruleName, intelligence.seoRules);
        const isDisabled = isProLocked || isFreeLocked || needsAuthority;
        return (
          <div key={name} className="space-y-1">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2.5 dark:border-neutral-700">
              <div className={cn("min-w-0 space-y-0.5", isDisabled && "opacity-50")}>
                <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-800 dark:text-neutral-200">
                  <BookOpen size={12} className="shrink-0 text-brand-500" />
                  {rule.label}
                  {isProLocked && (
                    <span className="shrink-0 rounded-full bg-brand-50 px-1.5 py-0.5 text-[8px] font-black text-brand-600 uppercase dark:bg-brand-950/30 dark:text-brand-400">
                      {__("Pro", "structura")}
                    </span>
                  )}
                </span>
                <p className="m-0! text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                  {rule.description}
                </p>
              </div>
              <Switch
                label={rule.label}
                hiddenLabel
                checked={intelligence.seoRules[ruleName] === true}
                onChange={(checked) =>
                  updateForm("intelligence", {
                    seoRules: withSeoRule(intelligence.seoRules, ruleName, checked),
                  })
                }
                disabled={isDisabled}
              />
            </div>
            {needsAuthority && <NeedsAuthorityLinksHint />}
          </div>
        );
      })}
    </div>
  );
};
