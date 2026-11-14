/**
 * Positioning editor surfaced on Site → Info.
 *
 * The setup wizard captures three positioning answers (what the
 * business does / who the customer is / what problem it solves) and
 * saves them to `workspaces/{w}/positioning`. They steer campaign
 * generation, but until now lived ONLY inside the wizard — so a user
 * who finished setup had no way to see or edit them afterwards, which
 * made the wizard feel disconnected from the app. This card reads and
 * edits the same record.
 *
 * Self-contained (owns its query + save) so the Site feature doesn't
 * reach into onboarding internals — same pattern as RestartWizardCard.
 *
 * The AI draft reads the homepage and the site's offer pages again, lists
 * the pages it read, and asks before replacing text the operator wrote
 * (specs/site-reading.md §5a, §11), as the customer portal does. Before any
 * draft the card lists the site's stored pages.
 */

import { useEffect, useRef, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import { Button, Card, Skeleton, useToast } from "@structura/ui";
import { Loader2, Save, Sparkles, Target } from "lucide-react";

import {
  useSaveWizardPositioningMutation,
  useSuggestWizardPositioningMutation,
  useWizardPositioningQuery,
  type PositioningPageRead,
} from "../api/useWizardSeo";
import {
  positioningDiffers,
  redraftNeedsConfirm,
  type PositioningText,
} from "../utils/positioningRedraft";
import { PositioningPagesRead } from "./PositioningPagesRead";
import { PositioningTextArea } from "./PositioningTextArea";
import { RedraftConfirmDialog } from "./RedraftConfirmDialog";

type Draft = PositioningText;

const EMPTY: Draft = { what: "", who: "", problem: "" };

export const PositioningCard = () => {
  const { data, isLoading } = useWizardPositioningQuery();
  const save = useSaveWizardPositioningMutation();
  const suggest = useSuggestWizardPositioningMutation();
  const { successToast, errorToast } = useToast();

  const [draft, setDraft] = useState<Draft | null>(null);
  // The last AI draft of this visit, and the pages it read (null until a
  // draft sends them; the stored pages are listed until then).
  const sessionDraftRef = useRef<Draft | null>(null);
  const [pagesRead, setPagesRead] = useState<PositioningPageRead[] | null>(null);
  const [confirmRedraft, setConfirmRedraft] = useState(false);

  // Seed once from the saved record (or empty if never set).
  useEffect(() => {
    if (draft) return;
    if (isLoading) return;
    const p = data?.positioning;
    setDraft(p ? { what: p.what, who: p.who, problem: p.problem } : EMPTY);
  }, [data, isLoading, draft]);

  const update = (patch: Partial<Draft>) =>
    setDraft((d) => ({ ...(d ?? EMPTY), ...patch }));

  const handleSave = async () => {
    if (!draft) return;
    // An AI draft saved as it came stays an AI draft, so the next draft
    // replaces it without asking.
    const source =
      sessionDraftRef.current && !positioningDiffers(draft, sessionDraftRef.current)
        ? "ai_draft"
        : "edited";
    await save.mutateAsync({ ...draft, source });
    successToast(__("Positioning saved.", "structura"));
  };

  // Re-run the magic: the cloud selects and reads the site's pages again
  // (`reselectPages`), then AI drafts the three answers. Fills the
  // editable fields — the user still has to Save (lets them tweak first).
  const runAiDraft = async () => {
    try {
      const res = await suggest.mutateAsync({ reselectPages: true });
      if (res.suggestion) {
        const drafted = {
          what: res.suggestion.what,
          who: res.suggestion.who,
          problem: res.suggestion.problem,
        };
        setDraft(drafted);
        sessionDraftRef.current = drafted;
        if (res.pages) setPagesRead(res.pages);
        successToast(__("Drafted from your site's pages. Review and save.", "structura"));
        return;
      }
      errorToast(
        res.reason === "missing_domain"
          ? __(
              "We couldn't find a public homepage to read. Set the public website on the Info card, or write the answers in yourself.",
              "structura",
            )
          : __(
              "AI couldn't draft this right now. Try again in a moment, or write the answers in yourself.",
              "structura",
            ),
      );
    } catch {
      errorToast(
        __("Something went wrong drafting from your homepage.", "structura"),
      );
    }
  };

  const handleAiDraft = () => {
    if (redraftNeedsConfirm(draft ?? EMPTY, data?.positioning, sessionDraftRef.current)) {
      setConfirmRedraft(true);
      return;
    }
    void runAiDraft();
  };

  // The record loads async; until `draft` is seeded the textareas would
  // render empty and show their example placeholders — which reads as
  // "your positioning is blank" rather than "still loading". Show a
  // skeleton for that window instead.
  const loading = isLoading || draft === null;

  const value = draft ?? EMPTY;
  const dirty =
    !!data?.positioning &&
    (value.what !== data.positioning.what ||
      value.who !== data.positioning.who ||
      value.problem !== data.positioning.problem);
  const canSave =
    !!draft &&
    (value.what.trim() || value.who.trim() || value.problem.trim()) &&
    (dirty || !data?.positioning);

  return (
    <Card className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="m-0! flex! items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            <Target size={14} className="text-brand-500" />
            {__("Positioning", "structura")}
          </h3>
          <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
            {__(
              "What you do, who you serve, and the problem you solve. Steers every campaign Structura writes.",
              "structura",
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="transparent"
            size="sm"
            onClick={handleAiDraft}
            disabled={suggest.isPending || loading}
          >
            {suggest.isPending ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Sparkles size={14} className="mr-1.5" />
            )}
            {__("AI draft", "structura")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={save.isPending || !canSave || loading}
          >
            {save.isPending ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Save size={14} className="mr-1.5" />
            )}
            {__("Save", "structura")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {loading ? (
          <>
            <PositioningFieldSkeleton />
            <PositioningFieldSkeleton />
            <PositioningFieldSkeleton />
          </>
        ) : (
          <>
            <PositioningTextArea
              label={__("What does your business do?", "structura")}
              value={value.what}
              onChange={(e) => update({ what: e.target.value })}
              rows={2}
              placeholder={__(
                "We help remote design teams ship Figma faster…",
                "structura",
              )}
            />
            <PositioningTextArea
              label={__("Who's your typical customer?", "structura")}
              value={value.who}
              onChange={(e) => update({ who: e.target.value })}
              rows={2}
              placeholder={__(
                "Senior designers at 20–200-person companies…",
                "structura",
              )}
            />
            <PositioningTextArea
              label={__("What problem do you solve for them?", "structura")}
              value={value.problem}
              onChange={(e) => update({ problem: e.target.value })}
              rows={2}
              placeholder={__(
                "Async handoff between designers and engineers breaks down…",
                "structura",
              )}
            />
          </>
        )}
      </div>
      <PositioningPagesRead pages={pagesRead ?? data?.pages ?? []} drafted={pagesRead !== null} />

      <RedraftConfirmDialog
        isOpen={confirmRedraft}
        onClose={() => setConfirmRedraft(false)}
        onConfirm={() => {
          setConfirmRedraft(false);
          void runAiDraft();
        }}
      />
    </Card>
  );
};

/** One positioning field's loading placeholder: label + textarea block. */
const PositioningFieldSkeleton = () => (
  <div className="flex flex-col gap-1.5">
    <Skeleton className="h-3 w-44" />
    <Skeleton className="h-[60px] w-full" />
  </div>
);
