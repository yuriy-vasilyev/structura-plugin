import { type ReactNode, useState } from "react";
import { __ } from "@wordpress/i18n";
import { BookOpen, Plus, Users } from "lucide-react";
import { Button, EmptyState, PageLoader } from "@structura/ui";
import { Persona } from "../types";
import { usePersonasQuery, useWpUsersQuery } from "../api/usePersonasQuery";
import { usePersonaMutations } from "../api/usePersonaMutations";
import { PersonaCard } from "./PersonaCard";
import { PersonaEditor } from "./PersonaEditor";
import { TemplateLibrary } from "./TemplateLibrary";

/**
 * The New/Templates triggers + add/edit dialog state. Lifted into a
 * hook so a consumer (the Personas page) can render the action buttons
 * in its OWN header while the grid + dialogs stay inside PersonaManager.
 * When no controls are passed, PersonaManager creates its own and shows
 * the default in-component actions row (the wizard's path).
 */
export interface PersonaLibraryControls {
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
  showTemplates: boolean;
  setShowTemplates: (v: boolean) => void;
  selectedPersona: Persona | null;
  setSelectedPersona: (p: Persona | null) => void;
  /** Open the editor for a fresh persona. */
  openNew: () => void;
  /** Open the template gallery. */
  openTemplates: () => void;
}

export function usePersonaLibraryControls(): PersonaLibraryControls {
  const [isEditing, setIsEditing] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  return {
    isEditing,
    setIsEditing,
    showTemplates,
    setShowTemplates,
    selectedPersona,
    setSelectedPersona,
    openNew: () => {
      setSelectedPersona(null);
      setIsEditing(true);
    },
    openTemplates: () => setShowTemplates(true),
  };
}

interface PersonaManagerProps {
  /**
   * Override the zero-personas state. The Personas page uses the
   * default CTA block; the setup wizard auto-generates a first persona
   * and shows its own loader, so it passes its own node (or nothing).
   */
  emptyState?: ReactNode;
  /**
   * Controlled mode — pass the controls from `usePersonaLibraryControls`
   * to drive New/Templates from outside (e.g. page-header buttons).
   * Omit for self-managed mode (the wizard).
   */
  controls?: PersonaLibraryControls;
  /** Hide the built-in actions row (when the consumer renders its own). */
  hideActions?: boolean;
  /**
   * Per-site mode. When supplied (the wizard), the grid shows ONLY the
   * personas bound to this site ("writing for this site"); the rest of the
   * workspace library renders in a separate "Available in your workspace"
   * row with Bind buttons. Omit (the Personas page) to show the whole
   * library in one grid. A newly created/templated persona is auto-bound
   * via `onBind` so "New" means "new voice for this site."
   */
  memberIds?: string[];
  /** Bind a workspace persona to this site. */
  onBind?: (personaId: string) => void;
  /** Unbind a persona from this site. */
  onUnbind?: (personaId: string) => void;
  /** Disable bind/unbind controls while a membership mutation is in flight. */
  binding?: boolean;
}

/**
 * The persona library surface — grid of `PersonaCard`s, the New/Templates
 * actions, and the add/edit `PersonaEditor` + `TemplateLibrary` dialogs.
 * Extracted from `PersonasPage` so the setup wizard reuses the EXACT same
 * grid + popups instead of a parallel layout. Operates on live personas
 * (create/edit save immediately via `usePersonaMutations`).
 */
export const PersonaManager = ({
  emptyState,
  controls: externalControls,
  hideActions,
  memberIds,
  onBind,
  onUnbind,
  binding,
}: PersonaManagerProps) => {
  const { data: personas = [], isLoading: loadingPersonas } = usePersonasQuery();
  const { data: wpUsers = [], isLoading: loadingUsers } = useWpUsersQuery();
  const { savePersona } = usePersonaMutations();

  // Self-managed unless the consumer passes controls (so its own header
  // buttons can drive New/Templates). The hook is always called.
  const internalControls = usePersonaLibraryControls();
  const c = externalControls ?? internalControls;

  if (loadingPersonas || loadingUsers) {
    return <PageLoader label={__("Syncing personas…", "structura")} size="md" padding="md" />;
  }

  // Per-site split: members write for THIS site; the rest are bindable from
  // the workspace library. Without `memberIds` (Personas page) everything is
  // a "member" — i.e. the whole library renders in one grid as before.
  const perSite = memberIds !== undefined;
  const memberSet = new Set(memberIds ?? []);
  const gridPersonas = perSite ? personas.filter((p) => memberSet.has(String(p.id))) : personas;
  const bindable = perSite ? personas.filter((p) => !memberSet.has(String(p.id))) : [];

  /**
   * Create/template save. In per-site mode the new persona is auto-bound so
   * "New" yields a voice for this site, not an orphan in the shared library.
   */
  const handleSave = async (data: Persona) => {
    const res = (await savePersona(data)) as { id?: number | string } | undefined;
    if (perSite && onBind && res?.id != null && String(res.id) !== "0") {
      onBind(String(res.id));
    }
    c.setIsEditing(false);
  };

  return (
    <div className="space-y-6">
      {!hideActions && (
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={c.openTemplates} className="shadow-sm">
            <BookOpen className="mr-2 size-4" /> {__("Templates", "structura")}
          </Button>
          <Button onClick={c.openNew} className="shadow-brand-600/20 shadow-lg">
            <Plus className="mr-2 size-4" /> {__("New Persona", "structura")}
          </Button>
        </div>
      )}

      {gridPersonas.length === 0 && bindable.length === 0 ? (
        (emptyState ?? (
          <EmptyState
            icon={<Users size={28} />}
            title={__("No Personas Yet", "structura")}
            description={__(
              "Personas define the voice, tone, and writing style of your AI content. Create your first one or start from a template.",
              "structura"
            )}
            action={
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <Button onClick={c.openNew}>
                  <Plus className="mr-2 size-4" />
                  {__("New Persona", "structura")}
                </Button>
                <Button variant="secondary" onClick={c.openTemplates}>
                  <BookOpen className="mr-2 size-4" />
                  {__("Browse Templates", "structura")}
                </Button>
              </div>
            }
          />
        ))
      ) : (
        <>
          {perSite && gridPersonas.length === 0 ? (
            <p className="m-0! rounded-2xl border-2 border-dashed border-neutral-200 px-6 py-8 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
              {__(
                "No voice is writing for this site yet. Bind one from your workspace below, or create a new persona.",
                "structura"
              )}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {gridPersonas.map((p) => (
                <div key={p.id} className="flex flex-col gap-2">
                  <PersonaCard
                    persona={p}
                    author={wpUsers.find((u) => u.id === p.author_id)}
                    onEdit={() => {
                      c.setSelectedPersona(p);
                      c.setIsEditing(true);
                    }}
                  />
                  {perSite && onUnbind && (
                    <button
                      type="button"
                      disabled={binding}
                      onClick={() => onUnbind(String(p.id))}
                      className="cursor-pointer self-start text-xs font-semibold text-neutral-400 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
                    >
                      {__("Remove from this site", "structura")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {perSite && bindable.length > 0 && (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-900/40">
              <h4 className="mt-0! mb-3! text-[11px] font-black tracking-[0.14em] text-neutral-400 uppercase">
                {__("Available in your workspace", "structura")}
              </h4>
              <div className="flex flex-col gap-2">
                {bindable.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                        {p.name}
                      </span>
                      {p.tone && (
                        <span className="text-xs text-neutral-400 capitalize">
                          {String(p.tone)}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={binding}
                      onClick={() => onBind?.(String(p.id))}
                    >
                      <Plus className="mr-1 size-3.5" />
                      {__("Bind", "structura")}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {c.isEditing && (
        <PersonaEditor
          persona={c.selectedPersona}
          users={wpUsers}
          onClose={() => c.setIsEditing(false)}
          onSave={handleSave}
        />
      )}

      <TemplateLibrary
        isOpen={c.showTemplates}
        onClose={() => c.setShowTemplates(false)}
        onSelect={(template) => {
          c.setSelectedPersona({ ...template, id: 0, author_id: 0 });
          c.setShowTemplates(false);
          c.setIsEditing(true);
        }}
      />
    </div>
  );
};
