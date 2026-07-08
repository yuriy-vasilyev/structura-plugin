/**
 * Step 5 — Your personas (per-site).
 *
 * Renders `PersonaManager` in per-site mode: the grid shows only the voices
 * BOUND to this site ("writing for this site"); the rest of the workspace
 * library sits in an "Available in your workspace" row with Bind buttons.
 * Create/edit/template still operate on LIVE personas (the library is shared)
 * — but anything created here is auto-bound to this site, and the seeded
 * voice is bound too, so the wizard never dumps the whole shared library on a
 * fresh site. Campaign rotation reads this site's bound set
 * (scheduler/helpers.ts), so binding here is what scopes a voice to the site.
 *
 * On a fresh site we auto-generate one persona from the positioning and bind
 * it, so the step lands with a tailored voice instead of empty (or the whole
 * library). One loader covers persona load + membership load + the draft.
 *
 * Validity (gates Finish): at least one voice is bound to this site.
 */

import { useEffect, useMemo, useRef, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import { Badge, Card } from "@structura/ui";
import { Users } from "lucide-react";

import { useLicense, useDefaultProviders } from "@/features/settings";
import { useMagicSuggest } from "@/hooks/useMagicSuggest";
import {
  PersonaManager,
  usePersonasQuery,
  useMemberPersonaIdsQuery,
  useWpUsersQuery,
} from "@/features/personas";
import { usePersonaMutations } from "@/features/personas/api/usePersonaMutations";

import { useWizardPositioningQuery } from "../api/useWizardSeo";
import { useWizardStore } from "../state/wizardStore";
import { WizardMagicLoader } from "./WizardMagicLoader";

export const WizardStep5Persona = () => {
  const { isPaidLicense } = useLicense();
  const { defaultTextProvider } = useDefaultProviders();
  const personasQuery = usePersonasQuery();
  const personas = personasQuery.data ?? [];
  const personasLoading = personasQuery.isLoading;
  const membersQuery = useMemberPersonaIdsQuery();
  const memberIds = membersQuery.data ?? [];
  const { data: wpUsers = [] } = useWpUsersQuery();
  const { data: positioningData } = useWizardPositioningQuery();
  const { suggest } = useMagicSuggest();
  const { savePersona, addMembership, removeMembership, isBinding } =
    usePersonaMutations();
  const setStepValid = useWizardStore((s) => s.setStepValid);
  const personaSeeded = useWizardStore((s) => s.personaSeeded);
  const setPersonaSeeded = useWizardStore((s) => s.setPersonaSeeded);

  const [autoDrafting, setAutoDrafting] = useState(false);

  // Validity = at least one voice writing for THIS site (a member), not
  // merely something in the shared library. Updates live as the seed binds.
  useEffect(() => {
    setStepValid(5, memberIds.length > 0);
  }, [memberIds.length, setStepValid]);

  // Auto-generate the first persona on a true first run (zero existing).
  const autoFiredRef = useRef(false);
  useEffect(() => {
    if (autoFiredRef.current) return;
    // Gate on a SUCCESSFUL fetch, not just "not loading": while the
    // query is disabled (workspace gate unsettled) or after an error,
    // `data` is undefined/[] with isLoading false — which read as
    // "zero personas" and auto-drafted a duplicate into a populated
    // library (seen 2026-06-07: "Drafting your first persona" on a
    // workspace that already had two).
    if (!personasQuery.isSuccess) return;
    if (!isPaidLicense || !defaultTextProvider) return;
    // Personas are workspace-shared: a fresh site in a populated workspace
    // would inherit the whole library with no voice of its own. Draft one
    // tailored to THIS site regardless of the library — once per onboarding
    // (gated by `personaSeeded`) so a mid-wizard reload can't duplicate it.
    if (personaSeeded) {
      autoFiredRef.current = true; // already seeded this onboarding
      return;
    }
    autoFiredRef.current = true;
    setPersonaSeeded(true);
    const p = positioningData?.positioning;
    const context =
      p && (p.what || p.who || p.problem)
        ? { what: p.what, who: p.who, problem: p.problem }
        : undefined;
    setAutoDrafting(true);
    void (async () => {
      try {
        const data = (await suggest("persona", {
          provider: defaultTextProvider,
          context,
        })) as Partial<{
          name: string;
          system_prompt: string;
          tone: string;
          reading_level: string;
        }> | null;
        if (data && (data.name || data.system_prompt)) {
          // Live create, then bind to THIS site so the seeded voice is a
          // member (and joins campaign rotation) — not just another row in
          // the shared library.
          const res = (await savePersona({
            id: "",
            name: data.name ?? __("Your first persona", "structura"),
            system_prompt: data.system_prompt ?? "",
            tone: (data.tone ?? "professional") as never,
            reading_level: (data.reading_level ?? "grade_8") as never,
            author_id: wpUsers[0]?.id ?? 0,
          })) as { id?: number | string } | undefined;
          if (res?.id != null && String(res.id) !== "0") {
            await addMembership(String(res.id));
          }
        }
      } catch {
        // Auto-draft is best-effort; the PersonaManager empty-state CTA
        // is the fallback (the user creates one manually).
      } finally {
        setAutoDrafting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personasQuery.isSuccess, isPaidLicense, defaultTextProvider, personaSeeded]);

  const stages = useMemo(
    () => [
      __("Reading your positioning…", "structura"),
      __("Shaping a distinct voice…", "structura"),
      __("Tuning tone and audience…", "structura"),
      __("Writing the persona…", "structura"),
    ],
    [],
  );

  const showLoader = personasLoading || membersQuery.isLoading || autoDrafting;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 text-center">
        <h1 className="m-0! text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          {__("Your personas", "structura")}
        </h1>
        <p className="m-0! text-base text-neutral-600 dark:text-neutral-400">
          {__(
            "Personas are the voices that write your posts. We draft one tailored to this site to start you off. Bind more from your workspace library, pull from templates, or add new ones — campaigns rotate through the voices writing for this site.",
            "structura",
          )}
        </p>
      </header>

      {showLoader ? (
        <Card className="p-8">
          <WizardMagicLoader
            icon={Users}
            title={
              autoDrafting
                ? __("Drafting your first persona", "structura")
                : __("Loading your personas", "structura")
            }
            stages={stages}
          />
        </Card>
      ) : (
        <PersonaManager
          memberIds={memberIds}
          onBind={(id) => void addMembership(id)}
          onUnbind={(id) => void removeMembership(id)}
          binding={isBinding}
        />
      )}

      <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="m-0! flex! items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
          <Badge intent="info">{__("Tip", "structura")}</Badge>
          <span>
            {__(
              "Two or three distinct voices keep a blog from sounding repetitive. Only voices bound to this site write for it; the rest stay in your workspace library to bind whenever you want.",
              "structura",
            )}
          </span>
        </p>
      </div>
    </div>
  );
};
