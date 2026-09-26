/**
 * Manual-add planning for the Site → Competitors picker (kept out of the
 * route file so the tab stays fast-refreshable and the planner is testable
 * without mounting the page).
 */
export function normaliseInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const candidate = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}

/** Outcome of one manual-add batch against the confirmed list and its cap. */
export interface CompetitorAddPlan {
  /** Normalised URLs to append, in input order, within the remaining cap. */
  accepted: string[];
  /** Raw entries to hand back to the input (invalid, or over the cap). */
  rejected: string[];
  /** Why something was rejected, or `null` when everything landed. */
  reason: "invalid" | "duplicate" | "cap" | null;
}

/**
 * Plans a manual-add batch: normalises each entry, drops duplicates against
 * the confirmed list and within the batch, and cuts the batch at the cap.
 * Invalid entries and cap overflow are returned so they stay in the input.
 * Cap wins over invalid as the surfaced reason because it is the one the
 * user cannot fix by retyping.
 */
export function planCompetitorAdds(
  values: string[],
  confirmedUrls: string[],
  remaining: number,
): CompetitorAddPlan {
  const valid: { raw: string; url: string }[] = [];
  const rejected: string[] = [];
  let sawInvalid = false;
  let sawDuplicate = false;
  for (const raw of values) {
    const url = normaliseInput(raw);
    if (!url) {
      sawInvalid = true;
      rejected.push(raw);
      continue;
    }
    if (confirmedUrls.includes(url) || valid.some((v) => v.url === url)) {
      sawDuplicate = true;
      continue;
    }
    valid.push({ raw, url });
  }
  // Overflow goes back as the user typed it, not as the normalised URL.
  const overflow = valid.splice(Math.max(0, remaining));
  const accepted = valid.map((v) => v.url);
  const reason = overflow.length > 0
    ? "cap"
    : sawInvalid
    ? "invalid"
    : sawDuplicate && accepted.length === 0
    ? "duplicate"
    : null;
  return { accepted, rejected: [...rejected, ...overflow.map((v) => v.raw)], reason };
}
