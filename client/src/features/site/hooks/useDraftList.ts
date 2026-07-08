/**
 * Local-draft wrapper for a server-backed string list (target keywords,
 * competitor URLs, authority domains).
 *
 * Why: the Site editors used to fire a REST `update` on every add/remove,
 * so building a list of ten keywords meant ten round-trips (and ten
 * cache invalidations). This holds edits locally so the editor can offer
 * a single explicit "Save" — matching the Save-button pattern the other
 * Site cards use.
 *
 * Sync rule: the draft seeds from the server value and re-syncs whenever
 * the server value changes *while the user hasn't diverged locally*
 * (initial query resolve, or a successful save invalidating the cache).
 * If the user has unsaved edits, an unrelated server change never clobbers
 * them. Comparison is set-based so reordering never reads as "dirty".
 */
import { useEffect, useRef, useState } from "react";

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

export interface DraftList {
  /** Current working value (what the editor renders). */
  value: string[];
  /** True when the working value differs from the server value. */
  dirty: boolean;
  /** Add one item (no-op if already present). */
  add: (item: string) => void;
  /** Add many items, skipping any already present, preserving order. */
  addMany: (items: string[]) => void;
  /** Remove one item. */
  remove: (item: string) => void;
}

export function useDraftList(serverValue: string[]): DraftList {
  const [draft, setDraft] = useState<string[]>(serverValue);
  const lastServerRef = useRef<string[]>(serverValue);

  useEffect(() => {
    if (sameSet(serverValue, lastServerRef.current)) return;
    const wasDirty = !sameSet(draft, lastServerRef.current);
    lastServerRef.current = serverValue;
    // Only adopt the new server value if the user hadn't made local edits.
    if (!wasDirty) setDraft(serverValue);
  }, [serverValue, draft]);

  const add = (item: string) =>
    setDraft((prev) => (prev.includes(item) ? prev : [...prev, item]));

  const addMany = (items: string[]) =>
    setDraft((prev) => {
      const next = [...prev];
      for (const it of items) if (!next.includes(it)) next.push(it);
      return next;
    });

  const remove = (item: string) =>
    setDraft((prev) => prev.filter((x) => x !== item));

  return { value: draft, dirty: !sameSet(draft, serverValue), add, addMany, remove };
}
