import { EASY_KD_MAX } from "./score";
import type { KeywordRow } from "./types";

/** Columns the keyword table can sort by. */
export type KeywordSortKey = "volume" | "difficulty";

/** Sort direction. */
export type SortDirection = "asc" | "desc";

/**
 * Sort keyword rows client-side without mutating the input. Rows missing
 * the sort metric always go last, in both directions: "unknown difficulty"
 * is not "easiest", and "no volume data" is not "lowest volume".
 */
export function sortKeywordRows(
  rows: readonly KeywordRow[],
  key: KeywordSortKey,
  direction: SortDirection,
): KeywordRow[] {
  const sign = direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const av = a.row[key];
      const bv = b.row[key];
      if (av === undefined && bv === undefined) return a.index - b.index;
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      return av === bv ? a.index - b.index : (av - bv) * sign;
    })
    .map(({ row }) => row);
}

/** Rows with a known KD of {@link EASY_KD_MAX} or less; unknown KD is not "easy". */
export function easyKeywordRows(rows: readonly KeywordRow[]): KeywordRow[] {
  return rows.filter((r) => r.difficulty !== undefined && r.difficulty <= EASY_KD_MAX);
}

/**
 * Quote one CSV cell (RFC 4180) and defuse spreadsheet formulas: a cell a
 * spreadsheet would evaluate (`=`, `+`, `-`, `@`, tab, CR) gets a leading
 * apostrophe. Keywords come from a vendor, and a vendor can return anything.
 */
function csvCell(value: string | number | undefined): string {
  if (value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV of the selected keyword rows for "Export CSV". Headers come from the
 * page's dictionary; numbers stay raw (no locale grouping) so a spreadsheet
 * reads them as numbers; unknown metrics are empty cells, never 0.
 */
export function keywordsCsv(
  rows: readonly KeywordRow[],
  headers: { keyword: string; volume: string; difficulty: string; cpc: string; intent: string },
  intentLabel: (intent: NonNullable<KeywordRow["intent"]>) => string,
): string {
  const lines = [
    [headers.keyword, headers.volume, headers.difficulty, headers.cpc, headers.intent].map(csvCell).join(","),
    ...rows.map((r) =>
      [r.keyword, r.volume, r.difficulty, r.cpc, r.intent ? intentLabel(r.intent) : undefined].map(csvCell).join(","),
    ),
  ];
  return lines.join("\r\n") + "\r\n";
}
