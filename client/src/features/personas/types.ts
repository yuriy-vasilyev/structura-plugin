import type {
  PersonaReadingLevel,
  PersonaTemplate as SharedPersonaTemplate,
  PersonaTone,
} from "@structura/types";

export interface Persona {
  /**
   * Cloud personas use nanoid strings (post-2026-05-01); legacy
   * WP-stored personas use numeric WP post ids. Readers must accept
   * both shapes — `Persona_Shape_Transformer::cloud_to_wp` passes
   * the cloud id through verbatim rather than coercing to int.
   */
  id: number | string;
  name: string;
  system_prompt: string;
  tone: ToneOption;
  reading_level: ReadingLevelOption;
  author_id: number;
}

export type PersonaForm = Omit<Persona, "id">;

export interface WpUser {
  id: number;
  name: string;
  avatarUrl?: string;
}

// Tone / reading-level / template vocabularies now live in
// `@structura/types` so the plugin SPA and the customer portal share one
// library. These aliases keep every existing `@/features/personas`
// consumer (PersonaEditor, helpers, TemplateLibrary) untouched.
export type ToneOption = PersonaTone;
export type ReadingLevelOption = PersonaReadingLevel;
export type PersonaTemplate = SharedPersonaTemplate;
