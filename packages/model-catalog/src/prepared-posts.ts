/**
 * Which campaign edits replace a campaign's prepared posts (stock). Shared by
 * the cloud, whose `onCampaignUpdated` trigger discards them
 * (`functions/src/stock/triggers.ts`, through the `pnpm sync:model-catalog`
 * mirror), and the customer portal's campaign edit page, which tells the
 * customer before they save (specs/stock-preview-and-edit.md §6 "Campaign
 * changes"). One rule, so the warning and the discard cannot disagree.
 */

/** The campaign fields whose change replaces a campaign's prepared posts. */
export interface PreparedPostsCampaignFields {
  /** The persona the campaign writes as, or "random" for a rotation; legacy WordPress ids are numbers. */
  personaId?: string | number | null;
  /** The campaign's brief. */
  objective?: string | null;
  /** The language posts are written in. */
  language?: string | null;
  /** The strategic framing (traffic magnet, authority, ...). */
  campaignMode?: string | null;
  /** Target post length in words. */
  postLength?: number | null;
  /** The block types the writer may use, in the stored order. */
  enabledBlocks?: readonly string[] | null;
  /**
   * The keyword pool. Plain strings on older campaigns and in the portal form,
   * `{ keyword, source, usageCount }` objects on newer campaign docs.
   */
  keywordBank?: readonly unknown[] | null;
}

/** A keyword bank entry's text, whatever shape the entry is stored in. */
function keywordText(entry: unknown): string {
  return typeof entry === "string"
    ? entry
    : entry && typeof entry === "object" && "keyword" in entry
      ? String((entry as { keyword: unknown }).keyword)
      : JSON.stringify(entry);
}

/**
 * Whether saving `after` over `before` replaces the campaign's prepared posts,
 * and whether the language changed.
 *
 * A create (`before` undefined) replaces nothing: no prepared post existed.
 * The fields compared are the ones that shape the post itself
 * (specs/v2/cloud-pregeneration-and-model-catalog.md Phase 1.5):
 *   - `personaId`: different persona, different voice, different post.
 *   - `objective`: a direct semantic shift.
 *   - `language`: the content has to be written again in the new language.
 *   - `campaignMode`: the strategic framing changes (traffic_magnet vs.
 *     authority etc.).
 *   - `postLength`: long and short posts use different templates and pacing.
 *   - `enabledBlocks`: a different block set means the written content shape
 *     no longer fits.
 *   - `keywordBank`, compared as a SET: every prepared post draws its primary
 *     keyword from this pool, so when the customer edits the bank (the common
 *     case: replacing all keywords) the prepared posts target keywords the
 *     campaign no longer wants. Order-independent (the round-robin index and
 *     the settings hash both treat the bank as a set), so a pure reorder is a
 *     no-op, but any added, removed or swapped keyword replaces.
 *
 * Fields explicitly NOT compared (they would cause needless thrash):
 *   - `name`: display label only.
 *   - `keywordQueueIndex`: the round-robin cursor; advances on every consume
 *     and is not content-defining. (The `keywordBank` it indexes into is.)
 *   - `schedule`: when posts publish, not what they contain.
 *   - `taxonomy` (categories/tags): applied at insert time, not baked into
 *     the blueprint.
 *   - `featuredImage` / `bodyImages`: flipping these does not change the text.
 *   - `textProvider` / `textModel` / `imageModel` / fallback fields: a
 *     provider swap is a margin and quality knob; a post written by the old
 *     provider is still a valid post, and the next batch uses the new one.
 *
 * `languageChanged` lets the callers apply the one exception of
 * specs/stock-preview-and-edit.md §6: a post the customer edited survives a
 * replacing change, except a language change, which replaces it too.
 */
export function campaignChangeReplacesPreparedPosts(
  before: PreparedPostsCampaignFields | undefined,
  after: PreparedPostsCampaignFields,
): { replaces: boolean; languageChanged: boolean } {
  if (!before) return { replaces: false, languageChanged: false };
  const languageChanged = before.language !== after.language;
  return { replaces: languageChanged || otherFieldsDiffer(before, after), languageChanged };
}

/** Whether a compared field other than `language` differs. */
function otherFieldsDiffer(before: PreparedPostsCampaignFields, after: PreparedPostsCampaignFields): boolean {
  if (before.personaId !== after.personaId) return true;
  if (before.objective !== after.objective) return true;
  if (before.campaignMode !== after.campaignMode) return true;
  if (before.postLength !== after.postLength) return true;

  // enabledBlocks is an array: compare order- and length-aware. The same
  // array saved again is a no-op; a different length or a different element
  // at any index replaces.
  const beforeBlocks = before.enabledBlocks ?? [];
  const afterBlocks = after.enabledBlocks ?? [];
  if (beforeBlocks.length !== afterBlocks.length) return true;
  for (let i = 0; i < beforeBlocks.length; i += 1) {
    if (beforeBlocks[i] !== afterBlocks[i]) return true;
  }

  // keywordBank is a set (order is round-robin state, not meaning), so compare
  // by VALUE, order-independently: a reorder must not replace, but adding,
  // removing or replacing any keyword must.
  //
  // The bank's element shape is NOT uniform: older campaigns store plain
  // `string[]`, newer ones `{ keyword, source, usageCount }[]`. Compare ONLY
  // the keyword TEXT, never the raw element, because (a) comparing objects by
  // `!==` compares references, which differ on every doc read and would
  // replace on EVERY campaign write (the keywordQueueIndex /
  // lastRefillAttemptAt bumps the seed path itself makes: this staled
  // freshly seeded stock within seconds, the 2026-06-17 regression), and (b)
  // `usageCount` churns on every round-robin pick and is not a keyword-set
  // change.
  const beforeKw = (before.keywordBank ?? []).map(keywordText).sort();
  const afterKw = (after.keywordBank ?? []).map(keywordText).sort();
  if (beforeKw.length !== afterKw.length) return true;
  for (let i = 0; i < beforeKw.length; i += 1) {
    if (beforeKw[i] !== afterKw[i]) return true;
  }

  return false;
}
