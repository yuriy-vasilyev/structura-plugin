/**
 * Visual-signature copy for wp-admin (visual-signatures handoff §4, the
 * `sites.visuals.signature*`, `palette`, `builder` and `preview` keys).
 * Names and descriptions are copy keyed by library id, not package data
 * (spec §3). "Signature" in headings, "style" in running text.
 */
import { __ } from "@wordpress/i18n";
import type { SignatureId } from "@structura/visual-signatures";

import type { VisualMedium } from "../api/useVisualPresets";
import type { BuilderField } from "./signatureModel";

const SIGNATURES: Record<SignatureId, { name: string; description: string }> = {
  "editorial-reportage": {
    name: __("Editorial reportage", "structura"),
    description: __("Natural light, real places, one clear subject.", "structura"),
  },
  "still-life-studio": {
    name: __("Still life studio", "structura"),
    description: __("One real object on a seamless backdrop.", "structura"),
  },
  "paper-cut": {
    name: __("Paper cut", "structura"),
    description: __("Layered paper shapes with soft shadows.", "structura"),
  },
  "ink-and-fill": {
    name: __("Ink and fill", "structura"),
    description: __("Confident black linework with one flat colour.", "structura"),
  },
  "miniature-world": {
    name: __("Miniature world", "structura"),
    description: __("Tiny figures at work around one oversized object.", "structura"),
  },
  "isometric-glass": {
    name: __("Isometric glass", "structura"),
    description: __("Floating slabs of glass and matte, seen from above.", "structura"),
  },
};

/** A library signature's display name. */
export const signatureName = (id: SignatureId): string => SIGNATURES[id].name;

/** A library signature's one-line description. */
export const signatureDescription = (id: SignatureId): string => SIGNATURES[id].description;

const MEDIUM_LABELS: Record<VisualMedium, string> = {
  photography: __("Photography", "structura"),
  illustration: __("Illustration", "structura"),
  "3d_render": __("3D render", "structura"),
};

/** The medium tag on a card and the builder's Medium options. */
export const mediumLabel = (medium: VisualMedium): string => MEDIUM_LABELS[medium];

/** The saved "Your own" card's line, one sentence per medium so every language can inflect it. */
export const OWN_SAVED_DESCRIPTION: Record<VisualMedium, string> = {
  photography: __("Your own style, in photography.", "structura"),
  illustration: __("Your own style, in illustration.", "structura"),
  "3d_render": __("Your own style, in 3D render.", "structura"),
};

/** The help line under the builder's Medium control. */
export const MEDIUM_HELP: Record<VisualMedium, string> = {
  photography: __("Real photographs of one subject.", "structura"),
  illustration: __("Drawn images: line, shape and flat colour.", "structura"),
  "3d_render": __("Rendered objects and figures with real materials and light.", "structura"),
};

/** Label, help line and placeholder of each builder field. */
export const FIELD_COPY: Record<
  BuilderField,
  { label: string; help: string; placeholder: string }
> = {
  technique: {
    label: __("Technique", "structura"),
    help: __("Materials, line and light: how the images are made.", "structura"),
    placeholder: __(
      "For example: soft window light, shallow depth of field, muted colour",
      "structura"
    ),
  },
  motifs: {
    label: __("Motifs", "structura"),
    help: __(
      "The recurring cast and objects that make your posts feel like one series.",
      "structura"
    ),
    placeholder: __("For example: one real garden tool, hands at work", "structura"),
  },
  composition: {
    label: __("Composition", "structura"),
    help: __("Framing, background, angle and empty space.", "structura"),
    placeholder: __("For example: one object centred on a plain background", "structura"),
  },
  avoid: {
    label: __("Avoid", "structura"),
    help: __("Anything that would break the look.", "structura"),
    placeholder: __("For example: text, desks and laptops, busy backgrounds", "structura"),
  },
};

/** Five phrases per field and medium for the builder's chip rows (handoff §4 `builder.chips`). */
export const BUILDER_CHIPS: Record<VisualMedium, Record<BuilderField, string[]>> = {
  photography: {
    technique: [
      __("Soft window light", "structura"),
      __("Shallow depth of field", "structura"),
      __("Muted film colour", "structura"),
      __("Seamless backdrop", "structura"),
      __("Soft shadows", "structura"),
    ],
    motifs: [
      __("One real object", "structura"),
      __("Hands at work", "structura"),
      __("Plants and soil", "structura"),
      __("Tools on a table", "structura"),
      __("Outdoor places", "structura"),
    ],
    composition: [
      __("One subject, centred", "structura"),
      __("Plain background", "structura"),
      __("Eye level", "structura"),
      __("Lots of empty space", "structura"),
      __("Seen from above", "structura"),
    ],
    avoid: [
      __("Text and lettering", "structura"),
      __("Posed stock people", "structura"),
      __("Desks and laptops", "structura"),
      __("Busy backgrounds", "structura"),
      __("Heavy filters", "structura"),
    ],
  },
  illustration: {
    technique: [
      __("Black ink linework", "structura"),
      __("One flat fill colour", "structura"),
      __("Visible paper grain", "structura"),
      __("Hand-drawn wobble", "structura"),
      __("No shading", "structura"),
    ],
    motifs: [
      __("Small figures at work", "structura"),
      __("Oversized everyday objects", "structura"),
      __("Plants and leaves", "structura"),
      __("Simple tools", "structura"),
      __("Hands holding one object", "structura"),
    ],
    composition: [
      __("One hero object, centred", "structura"),
      __("Flat colour background", "structura"),
      __("Seen straight on", "structura"),
      __("Lots of empty space", "structura"),
      __("Seen from above", "structura"),
    ],
    avoid: [
      __("Text and lettering", "structura"),
      __("Photorealistic people", "structura"),
      __("Desks and laptops", "structura"),
      __("Gradients", "structura"),
      __("Busy backgrounds", "structura"),
    ],
  },
  "3d_render": {
    technique: [
      __("Matte clay materials", "structura"),
      __("Soft studio light", "structura"),
      __("Tilt-shift depth", "structura"),
      __("Glass and matte surfaces", "structura"),
      __("No reflections", "structura"),
    ],
    motifs: [
      __("Tiny workers", "structura"),
      __("Oversized everyday objects", "structura"),
      __("Floating shapes", "structura"),
      __("Simple tools", "structura"),
      __("Stacked blocks", "structura"),
    ],
    composition: [
      __("One hero object, centred", "structura"),
      __("Seamless background", "structura"),
      __("Eye level", "structura"),
      __("Lots of empty space", "structura"),
      __("Isometric view", "structura"),
    ],
    avoid: [
      __("Text and lettering", "structura"),
      __("Photorealistic people", "structura"),
      __("Desks and laptops", "structura"),
      __("Busy backgrounds", "structura"),
      __("Gradients", "structura"),
    ],
  },
};
