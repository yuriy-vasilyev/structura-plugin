import { __ } from "@wordpress/i18n";
import { Boxes, Camera, Shapes, type LucideIcon } from "lucide-react";

import type { VisualMedium } from "./api/useVisualPresets";

/**
 * Rendering-medium choices for the visual-style suggest picker, in display
 * order. Single source of truth shared by the Visuals settings page and the
 * onboarding wizard's Visuals step, so both offer the same media + copy.
 */
export const MEDIUM_OPTIONS: ReadonlyArray<{
  value: VisualMedium;
  icon: LucideIcon;
  label: string;
  desc: string;
}> = [
  {
    value: "photography",
    icon: Camera,
    label: __("Photography", "structura"),
    desc: __("Realistic photos that show the actual subject.", "structura"),
  },
  {
    value: "illustration",
    icon: Shapes,
    label: __("Illustration", "structura"),
    desc: __("Flat, editorial vector illustrations.", "structura"),
  },
  {
    value: "3d_render",
    icon: Boxes,
    label: __("3D render", "structura"),
    desc: __("Premium 3D / abstract conceptual art.", "structura"),
  },
];
