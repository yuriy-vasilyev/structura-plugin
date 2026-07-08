import { X } from "lucide-react";
import { Badge, Dialog } from "@structura/ui";
import { PERSONA_TEMPLATES } from "../data/personaTemplates";
import { PersonaTemplate } from "../types";
import { __ } from "@wordpress/i18n";
import {
  getReadingLevelColor,
  getReadingLevelLabel,
  getReadingLevelProgress,
  getToneColor,
  getToneLabel,
} from "../helpers";

interface TemplateLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (template: PersonaTemplate) => void;
}

export const TemplateLibrary = ({ isOpen, onClose, onSelect }: TemplateLibraryProps) => {
  return (
    <Dialog.Root open={isOpen} onClose={onClose} size="xl">
      <Dialog.Content>
        <Dialog.Header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <Dialog.Title>{__("Persona Templates", "structura")}</Dialog.Title>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:ring-2 focus:ring-brand-500 focus:outline-none"
          >
            <span className="sr-only">{__("Close Persona Templates", "structura")}</span>
            <X strokeWidth={2} className="size-5" />
          </button>
        </Dialog.Header>
        <Dialog.Body className="max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {PERSONA_TEMPLATES.map((t, i) => (
              <div
                key={i}
                className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition-all hover:-translate-y-1 hover:border-brand-500 hover:shadow-xl"
                onClick={() => onSelect(t)}
              >
                <div className="p-6 pb-4">
                  <h3 className="m-0! text-base! leading-tight font-extrabold text-gray-900">
                    {t.name}
                  </h3>
                  <div className="mt-2">
                    <Badge
                      variant="solid"
                      className={`text-[9px]! uppercase ${getToneColor(t.tone).text} ${getToneColor(t.tone).background} ${getToneColor(t.tone).border}`}
                    >
                      {getToneLabel(t.tone)}
                    </Badge>
                  </div>
                </div>

                <div className="border-y border-gray-100 bg-gray-50/50 px-6 py-4">
                  <div className="mb-2 font-mono text-[9px] font-black tracking-[0.2em] text-gray-400 uppercase">
                    {__("System Directive", "structura")}
                  </div>
                  <p className="line-clamp-3 font-mono text-xs leading-relaxed text-gray-600 italic">
                    "{t.system_prompt}"
                  </p>
                </div>

                {/* METRIC BAR - DENSITY (Mocking visual from HTML) */}
                <div className="flex-1 p-6">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[9px] font-black tracking-widest text-gray-400 uppercase">
                      {__("Reading Level", "structura")}
                    </span>
                    <span className="text-[10px] font-bold text-gray-700">
                      {getReadingLevelLabel(t.reading_level)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`${getReadingLevelColor(t.reading_level).progress} h-full transition-all duration-1000`}
                      style={{ width: `${getReadingLevelProgress(t.reading_level)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Dialog.Body>
      </Dialog.Content>
    </Dialog.Root>
  );
};
