import { PERSONA_TEMPLATES as SHARED_PERSONA_TEMPLATES } from "@structura/types";

import { PersonaTemplate, ReadingLevelOption, ToneOption } from "@/features/personas";

import { __ } from "@wordpress/i18n";

export const TONE_OPTIONS: { value: ToneOption; label: string }[] = [
  { value: "professional", label: __("Professional", "structura") },
  { value: "casual", label: __("Casual", "structura") },
  { value: "humorous", label: __("Humorous", "structura") },
  { value: "authoritative", label: __("Authoritative", "structura") },
  { value: "enthusiastic", label: __("Enthusiastic", "structura") },
  { value: "empathetic", label: __("Empathetic", "structura") },
  { value: "controversial", label: __("Controversial", "structura") },
];

export const READING_LEVEL_OPTIONS: { value: ReadingLevelOption; label: string }[] = [
  { value: "grade_5", label: __("Grade 5 (Simple)", "structura") },
  { value: "grade_8", label: __("Grade 8 (Standard)", "structura") },
  { value: "grade_12", label: __("Grade 12 (Complex)", "structura") },
  { value: "phd", label: __("PhD (Academic)", "structura") },
];

/**
 * Starter persona library — sourced from `@structura/types` so the plugin
 * and the customer portal share one set. The data carries English template
 * names + system directives; `PersonaTemplate` is structurally identical to
 * the shared shape (see `client/src/features/personas/types.ts`).
 */
export const PERSONA_TEMPLATES: PersonaTemplate[] = [...SHARED_PERSONA_TEMPLATES];
