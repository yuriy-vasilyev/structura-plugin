import { FileText, Link2, Newspaper, TextQuote, type LucideIcon } from "lucide-react";
import type { VoiceSourceRef } from "@structura/types";

/** The icon of each kind of piece a persona draft reads (handoff persona voice, 4a and 4c). */
export const KIND_ICON: Record<VoiceSourceRef["kind"], LucideIcon> = {
  article: Newspaper,
  link: Link2,
  file: FileText,
  text: TextQuote,
};
