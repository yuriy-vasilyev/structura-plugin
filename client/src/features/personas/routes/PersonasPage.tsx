import { __ } from "@wordpress/i18n";
import { BookOpen, Layers, Plus } from "lucide-react";
import { Button } from "@structura/ui";
import { PageTitle } from "@/components/Layout/PageTitle";
import { PageDescription } from "@/components/Layout/PageSubtitle";
import {
  PersonaManager,
  usePersonaLibraryControls,
} from "../components/PersonaManager";

export const PersonasPage = () => {
  // Controlled mode: the New/Templates buttons live in the page header,
  // but the grid + dialogs are the shared PersonaManager (also used by
  // the setup wizard).
  const controls = usePersonaLibraryControls();

  return (
    <div className="space-y-10">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <PageTitle>{__("Personas", "structura")}</PageTitle>
          <PageDescription>{__("Persona & Author Management", "structura")}</PageDescription>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={controls.openTemplates} className="shadow-sm">
            <BookOpen className="mr-2 size-4" /> {__("Templates", "structura")}
          </Button>
          <Button onClick={controls.openNew} className="shadow-lg shadow-brand-600/20">
            <Plus className="mr-2 size-4" /> {__("New Persona", "structura")}
          </Button>
        </div>
      </header>

      <PersonaManager controls={controls} hideActions />

      {/* SYSTEM ARCHITECTURE FOOTER */}
      <div className="mt-12 flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Layers className="h-6 w-6" />
        </div>
        <div>
          <h4 className="m-0! text-sm font-bold text-gray-900">
            {__("Persona Modularization", "structura")}
          </h4>
          <p className="mt-0.5! mb-0! max-w-xl text-xs text-gray-500">
            {__(
              "All Personas operate as independent architectural modules. You can select any Persona when initiating a Campaign or a One-Time post deployment.",
              "structura"
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
