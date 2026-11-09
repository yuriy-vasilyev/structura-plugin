/**
 * "Your own signature" (visual-signatures handoff §3.5; spec §6, §8): the
 * builder that replaces the picker grid. Name, Medium, four fields with help
 * lines and phrase chips, and "Draft from my site", which drafts Technique
 * and Avoid from the site in the chosen medium and never sets the medium.
 */
import { useState, type RefObject } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Badge, Button, InputField, Tabs, TextArea, ToggleChip, useToast } from "@structura/ui";

import { useMagicSuggest } from "@/hooks/useMagicSuggest";
import type { AIProvider } from "@/features/campaigns/types";
import type { ContextField } from "@/features/campaigns/components/SuggestStrategySection";
import type { VisualMedium } from "../api/useVisualPresets";
import { BUILDER_CHIPS, FIELD_COPY, MEDIUM_HELP, mediumLabel } from "./signatureCopy";
import {
  addPhrase,
  BUILDER_FIELDS,
  hasPhrase,
  parseDraftedStyle,
  removePhrase,
  type BuilderField,
  type CustomSignatureDraft,
} from "./signatureModel";

const MEDIA: VisualMedium[] = ["photography", "illustration", "3d_render"];

/** German capitalises nouns, so an added chip keeps its first letter. */
function chipKeepsCase(): boolean {
  return (
    typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("de")
  );
}

/** Props for {@link SignatureBuilder}. */
export interface SignatureBuilderProps {
  /** Id for the builder heading. */
  headingId: string;
  /** The heading, focused when the builder opens. */
  headingRef: RefObject<HTMLHeadingElement>;
  /** The Name input, focused when a save finds it empty. */
  nameRef: RefObject<HTMLInputElement>;
  /** The four field textareas, focused when a save finds one empty. */
  fieldRefs: Record<BuilderField, RefObject<HTMLTextAreaElement>>;
  /** The custom signature being built. */
  draft: CustomSignatureDraft;
  /** Applies a change to the latest draft (a draft answer can land after other edits). */
  onUpdate: (update: (draft: CustomSignatureDraft) => CustomSignatureDraft) => void;
  /** Fields a save or preview found empty; each shows its error until edited. */
  errors: ReadonlySet<"name" | BuilderField>;
  /** Clears a field's error once the user edits it. */
  onFieldEdited: (field: "name" | BuilderField) => void;
  /** "All signatures": back to the grid, keeping the draft. */
  onBack: () => void;
  /** Text provider and sources for "Draft from my site". */
  draftProvider: string;
  draftSources: ContextField[];
}

/** SignatureBuilder: the custom signature form. No save of its own; the page header's Save saves it. */
export function SignatureBuilder({
  headingId,
  headingRef,
  nameRef,
  fieldRefs,
  draft,
  onUpdate,
  errors,
  onFieldEdited,
  onBack,
  draftProvider,
  draftSources,
}: SignatureBuilderProps) {
  const { suggest, isSuggesting: drafting } = useMagicSuggest();
  const { errorToast } = useToast();
  const [hasDrafted, setHasDrafted] = useState(() => Object.keys(draft.drafted).length > 0);
  const [draftStatus, setDraftStatus] = useState("");

  const editField = (field: BuilderField, value: string) => {
    onFieldEdited(field);
    onUpdate((current) => {
      const drafted = { ...current.drafted };
      delete drafted[field];
      return { ...current, fields: { ...current.fields, [field]: value }, drafted };
    });
  };

  const toggleChip = (field: BuilderField, phrase: string, on: boolean) => {
    onFieldEdited(field);
    onUpdate((current) => {
      const value = current.fields[field];
      const next = on ? addPhrase(value, phrase, chipKeepsCase()) : removePhrase(value, phrase);
      const drafted = { ...current.drafted };
      delete drafted[field];
      return { ...current, fields: { ...current.fields, [field]: next }, drafted };
    });
  };

  const handleDraft = async () => {
    setDraftStatus(__("Drafting from your site.", "structura"));
    // The visual-style pass drafts FOR the chosen medium; the screenshot and
    // logo never choose it (spec §6, the 2026-10-05 lesson).
    const data = (await suggest("visual", {
      provider: draftProvider as AIProvider,
      context: draftSources,
      medium: draft.medium,
    })) as { prompt?: unknown } | null;
    // null: useMagicSuggest already showed the error.
    if (data === null) {
      setDraftStatus("");
      return;
    }
    const { technique, avoid } = parseDraftedStyle(
      typeof data.prompt === "string" ? data.prompt : ""
    );
    if (!technique && !avoid) {
      setDraftStatus("");
      errorToast(
        __(
          "Couldn’t draft from your site right now. Try again, or fill the fields yourself.",
          "structura"
        )
      );
      return;
    }
    // Motifs and composition stay as they are: the pass describes a
    // treatment, not a cast or a framing, so the user fills those.
    onUpdate((current) => ({
      ...current,
      fields: {
        ...current.fields,
        ...(technique ? { technique } : {}),
        ...(avoid ? { avoid } : {}),
      },
      drafted: {
        ...current.drafted,
        ...(technique ? { technique: true as const } : {}),
        ...(avoid ? { avoid: true as const } : {}),
      },
    }));
    if (technique) onFieldEdited("technique");
    if (avoid) onFieldEdited("avoid");
    setHasDrafted(true);
    setDraftStatus(__("Drafted the technique and what to avoid from your site.", "structura"));
  };

  const fieldError = __("Fill this in to save the signature.", "structura");

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6">
      <div>
        <Button variant="link" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {__("All signatures", "structura")}
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5">
        <div className="flex max-w-[62ch] min-w-0 flex-col gap-1">
          <h3
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="m-0! text-base font-bold tracking-tight text-neutral-900 focus:outline-none dark:text-white"
          >
            {__("Your own signature", "structura")}
          </h3>
          <p className="m-0! text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {__(
              "Five fields fix the look of every image. Draft them from your site, then change anything.",
              "structura"
            )}
          </p>
        </div>
        <Button
          variant={hasDrafted ? "transparent" : "secondary"}
          size="sm"
          loading={drafting}
          onClick={handleDraft}
        >
          <Sparkles aria-hidden="true" />
          {drafting
            ? __("Drafting from your site", "structura")
            : hasDrafted
              ? __("Draft again", "structura")
              : __("Draft from my site", "structura")}
        </Button>
      </div>
      <span role="status" className="sr-only">
        {draftStatus}
      </span>

      <div className="max-w-[420px]">
        <InputField
          ref={nameRef}
          labelStyle="prominent"
          label={__("Name", "structura")}
          placeholder={__("For example: Northfield sketchbook", "structura")}
          description={__("Shown on its card in your library.", "structura")}
          value={draft.name}
          error={
            errors.has("name") ? __("Name this signature to save it.", "structura") : undefined
          }
          onChange={(event) => {
            const name = event.target.value;
            onFieldEdited("name");
            onUpdate((current) => ({ ...current, name }));
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold text-neutral-900 dark:text-white">
          {__("Medium", "structura")}
        </span>
        <Tabs
          semantics="radio"
          aria-label={__("Medium", "structura")}
          items={MEDIA.map((medium) => ({ id: medium, label: mediumLabel(medium) }))}
          value={draft.medium}
          onChange={(medium) =>
            onUpdate((current) => ({ ...current, medium: medium as VisualMedium }))
          }
          disabled={drafting}
        />
        <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
          {MEDIUM_HELP[draft.medium]}
        </p>
      </div>

      {BUILDER_FIELDS.map((field) => {
        const copy = FIELD_COPY[field];
        const value = draft.fields[field];
        return (
          <div key={field} className="flex flex-col gap-1.5">
            <TextArea
              ref={fieldRefs[field]}
              labelStyle="prominent"
              label={copy.label}
              description={copy.help}
              placeholder={copy.placeholder}
              rows={3}
              value={value}
              loading={drafting}
              error={errors.has(field) ? fieldError : undefined}
              labelAdornment={
                draft.drafted[field] ? (
                  <Badge intent="indigo" size="xs">
                    <Sparkles size={10} aria-hidden="true" />
                    {__("Drafted", "structura")}
                  </Badge>
                ) : undefined
              }
              onChange={(event) => editField(field, event.target.value)}
            />
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span aria-hidden="true" className="text-xs text-neutral-500 dark:text-neutral-400">
                {__("Add", "structura")}
              </span>
              {BUILDER_CHIPS[draft.medium][field].map((phrase) => (
                <ToggleChip
                  key={phrase}
                  pressed={hasPhrase(value, phrase)}
                  onPressedChange={(on) => toggleChip(field, phrase, on)}
                  disabled={drafting}
                  aria-label={sprintf(
                    /* translators: 1: a phrase such as "Soft window light", 2: a field name such as "Technique" */
                    __("Add “%1$s” to %2$s", "structura"),
                    phrase,
                    copy.label
                  )}
                >
                  {phrase}
                </ToggleChip>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
