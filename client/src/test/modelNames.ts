/**
 * What an AI model's name or id looks like in rendered text, for the tests
 * that assert no customer surface names a model (owner decision 2026-11-25,
 * specs/byok-ai-guidance.md §2.2). Built from every model the catalog knows,
 * plus the shapes of names and ids that older documents still store. Case
 * matters: ids are lowercase, so German compounds like "Gemini-Schlüssel"
 * do not match.
 */
import { MODELS } from "@structura/model-catalog";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches any catalog model name or id, a retired id, or a retired model's display name. */
export const MODEL_NAME = new RegExp(
  [
    ...MODELS.flatMap((m) => [m.name, m.id]).map(escapeRegExp),
    "\\b(gpt|gemini|claude|imagen)-[0-9a-z]",
    "\\bGPT[- ](\\d|Image)",
    "\\bGemini \\d",
    "\\b(Sonnet|Opus|Haiku)\\b",
  ].join("|")
);
