import { useEffect, useState } from "react";
import { ExternalLink, Info } from "lucide-react";
import { __, sprintf } from "@wordpress/i18n";
import { Alert } from "@structura/ui";

import { perActivationStorageKey } from "@/utils/storageKey";
import {
  CompatPageBuilder,
  useCompatPageBuildersQuery,
} from "../api/useCompatPageBuildersQuery";

/**
 * Inline info card shown on the Campaign create / edit pages when
 * Structura has detected a page builder on the site.
 *
 * Spec: `specs/page-builder-compat.md` §4.2.
 *
 * ### Two states of the same card
 *
 * 1. **Atomic-meta builder detected** (Divi or WPBakery). The body
 *    says: "we've already written the opt-out flag, but if the
 *    post still renders blank check the theme builder template."
 *    This is the important case — the card's job is to save a
 *    "why is my post empty on the front end?" support ticket.
 *
 * 2. **Opt-in builder detected** (Elementor / Beaver / Brizy / Bricks).
 *    The body is a gentler "if you later open a Structura post
 *    inside Elementor's builder, your Gutenberg blocks get
 *    replaced" reminder. Useful, but noisy for most users — so the
 *    card is visually quieter (variant "default" instead of
 *    "info") and dismisses faster.
 *
 * ### Dismissal model
 *
 * Per-user, via `localStorage`. We store a counter rather than a
 * boolean because the spec calls for "auto-hides after 3
 * sessions" — users who close the card three times clearly don't
 * need it, and after three sessions we treat the absence of click-
 * through as implicit acknowledgement. A React Query invalidation
 * on detection change bumps the counter back to zero so a newly-
 * detected builder (e.g. the site owner installed Divi today)
 * re-surfaces the card once even for users who previously
 * dismissed it against a different builder list.
 *
 * Using localStorage instead of user_meta avoids the REST round-
 * trip + admin-ajax wiring that the admin notice carries. For a
 * per-user cosmetic-card dismissal, the resulting small loss of
 * precision (a user switching browsers sees the card again) is
 * acceptable.
 */
// Per-activation so a dismissal on one site (e.g. a DDEV install) doesn't
// suppress the card on another site opened in the same browser.
const DISMISSAL_KEY = perActivationStorageKey(
  "structura:page-builder-compat-card:v1",
);
const DISMISSAL_THRESHOLD = 3;

interface DismissalState {
  /** Count of dismissals since the last detection snapshot change. */
  count: number;
  /** Hash of the detected builders list when the counter was last bumped. */
  snapshot: string;
}

function readDismissal(): DismissalState {
  if (typeof window === "undefined") {
    return { count: 0, snapshot: "" };
  }
  try {
    const raw = window.localStorage.getItem(DISMISSAL_KEY);
    if ( ! raw) return { count: 0, snapshot: "" };
    const parsed = JSON.parse(raw) as Partial<DismissalState>;
    return {
      count: typeof parsed.count === "number" ? parsed.count : 0,
      snapshot: typeof parsed.snapshot === "string" ? parsed.snapshot : "",
    };
  } catch {
    return { count: 0, snapshot: "" };
  }
}

function writeDismissal(state: DismissalState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISSAL_KEY, JSON.stringify(state));
  } catch {
    // localStorage can throw on quota-exceeded (private browsing,
    // Safari). Swallow — the card reappearing next session is a
    // fine degradation.
  }
}

function snapshotHash(builders: CompatPageBuilder[]): string {
  return builders
    .map((b) => b.slug)
    .sort((a, b) => a.localeCompare(b))
    .join(",");
}

export function PageBuilderCompatCard() {
  const { data, isLoading } = useCompatPageBuildersQuery();
  const [dismissal, setDismissal] = useState<DismissalState>(() => readDismissal());

  const builders = data?.detected ?? [];
  const snapshot = snapshotHash(builders);

  // When the detection snapshot changes (e.g. a new builder was
  // just installed on the site), reset the dismissal counter so
  // the card surfaces again once even for users who previously
  // hit "×" three times.
  useEffect(() => {
    if (snapshot === "") return;
    if (dismissal.snapshot !== "" && dismissal.snapshot !== snapshot) {
      const reset = { count: 0, snapshot };
      writeDismissal(reset);
      setDismissal(reset);
    } else if (dismissal.snapshot === "") {
      writeDismissal({ count: dismissal.count, snapshot });
    }
  }, [snapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return null;
  if (builders.length === 0) return null;
  if (dismissal.count >= DISMISSAL_THRESHOLD) return null;

  const atomicMeta = builders.filter((b) => b.opt_out_meta_active);
  const optIn = builders.filter((b) => ! b.opt_out_meta_active);

  const primary = atomicMeta.length > 0 ? atomicMeta : optIn;
  const variant: "info" | "default" = atomicMeta.length > 0 ? "info" : "default";

  const labels = primary.map((b) => b.label);
  const builderList = humanList(labels);

  const headline = atomicMeta.length > 0
    ? sprintf(
        /* translators: %s is a natural-language list of page builders, e.g. "Divi" or "Divi and WPBakery". */
        __("%s detected on this site.", "structura"),
        builderList
      )
    : sprintf(
        /* translators: %s is a natural-language list of opt-in page builders, e.g. "Elementor" or "Elementor and Brizy". */
        __("%s is active on this site.", "structura"),
        builderList
      );

  const body = atomicMeta.length > 0
    ? __(
        "Structura automatically opts every generated post out of this builder, so the body renders normally on the front end. If a post still looks blank, check your theme builder template.",
        "structura"
      )
    : __(
        "Structura posts are stored as Gutenberg blocks. If you open one with this page builder, the builder will replace the block content on save.",
        "structura"
      );

  const handleDismiss = () => {
    const next = {
      count: dismissal.count + 1,
      snapshot,
    };
    writeDismissal(next);
    setDismissal(next);
  };

  return (
    <Alert
      variant={variant}
      onDismiss={handleDismiss}
      dismissLabel={__("Dismiss", "structura")}
    >
      <Info />
      <Alert.Title>{headline}</Alert.Title>
      <Alert.Description>
        <p className="m-0! mb-2!">{body}</p>
        <ul className="m-0! list-none p-0! flex flex-wrap gap-3">
          {primary.map((b) => (
            <li key={b.slug} className="m-0!">
              <a
                href={b.docs_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm"
              >
                {sprintf(
                  /* translators: %s is a page-builder display name. */
                  __("%s compatibility guide", "structura"),
                  b.label
                )}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </li>
          ))}
        </ul>
      </Alert.Description>
    </Alert>
  );
}

/**
 * Render a list of labels as natural language: `["Divi"]` →
 * `"Divi"`, `["Divi", "WPBakery"]` → `"Divi and WPBakery"`. Uses
 * `__("and", "structura")` so the conjunction itself is
 * translatable for locales that don't use the word "and" between
 * two items (e.g. Spanish "y" / "e", French "et").
 */
function humanList(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) {
    return sprintf(
      /* translators: 1: first item, 2: second item — rendered as "A and B". */
      __("%1$s and %2$s", "structura"),
      labels[0],
      labels[1]
    );
  }
  const tail = labels[labels.length - 1];
  const head = labels.slice(0, -1).join(", ");
  return sprintf(
    /* translators: 1: comma-separated list of items, 2: last item — "A, B, and C". */
    __("%1$s, and %2$s", "structura"),
    head,
    tail
  );
}
