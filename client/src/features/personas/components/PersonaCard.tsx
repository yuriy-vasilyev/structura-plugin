import { Persona, WpUser } from "../types";
import { Settings2, Trash2 } from "lucide-react";
import { Badge, ConfirmDialog } from "@structura/ui";
import { usePersonaMutations } from "../api/usePersonaMutations";
import { __ } from "@wordpress/i18n";
import { useState } from "@wordpress/element";
import { useWpUsersQuery } from "@/features/personas";
import {
  getReadingLevelColor,
  getReadingLevelLabel,
  getReadingLevelProgress,
  getToneColor,
  getToneLabel,
} from "../helpers";

interface PersonaCardProps {
  persona: Persona;
  author?: WpUser;
  onEdit: () => void;
}

export const PersonaCard = ({ persona, author, onEdit }: PersonaCardProps) => {
  const { deletePersona, isPending } = usePersonaMutations();
  const { data: wpUsers } = useWpUsersQuery();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  return (
    <>
      <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition-all hover:-translate-y-1 hover:border-brand-500 hover:shadow-xl">
        <div className="p-6 pb-4">
          <div className="mb-6 flex items-start justify-between">
            {/* AVATAR LOGIC */}
            {author?.avatarUrl ? (
              <img
                src={author.avatarUrl}
                className="h-11 w-11 rounded-xl border-2 border-white object-cover shadow-sm"
                alt={author.name}
              />
            ) : (
              <div className="grid h-11 w-11 grid-cols-2 gap-0.5 rounded-xl border border-brand-100 bg-brand-50 p-1">
                <div className="rounded-lg bg-brand-400" />
                <div className="rounded-lg bg-brand-600" />
                <div className="col-span-2 rounded-lg bg-brand-200" />
              </div>
            )}
            <Badge
              variant="solid"
              className={`${getToneColor(persona.tone).text} ${getToneColor(persona.tone).background} ${getToneColor(persona.tone).border}`}
            >
              {getToneLabel(persona.tone)}
            </Badge>
          </div>

          <h3 className="m-0! text-xl leading-tight font-extrabold text-gray-900">
            {persona.name}
          </h3>
          <div className="mt-1 text-xs font-bold tracking-wider text-gray-400 uppercase">
            {author
              ? wpUsers?.find((u) => u.id === persona.author_id)?.name || "Unknown"
              : "No Author"}
          </div>
        </div>

        <div className="border-y border-gray-100 bg-gray-50/50 px-6 py-4">
          <div className="mb-2 font-mono text-[9px] font-black tracking-[0.2em] text-gray-400 uppercase">
            {__("System Directive", "structura")}
          </div>
          <p className="line-clamp-3 font-mono text-xs leading-relaxed text-gray-600 italic">
            "{persona.system_prompt}"
          </p>
        </div>

        {/* METRIC BAR - DENSITY (Mocking visual from HTML) */}
        <div className="flex-1 p-6">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[9px] font-black tracking-widest text-gray-400 uppercase">
              {__("Reading Level", "structura")}
            </span>
            <span className="text-[10px] font-bold text-gray-700">
              {getReadingLevelLabel(persona.reading_level)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`${getReadingLevelColor(persona.reading_level).progress} h-full transition-all duration-1000`}
              style={{ width: `${getReadingLevelProgress(persona.reading_level)}%` }}
            />
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-6 py-4">
          <button
            onClick={onEdit}
            className="flex cursor-pointer items-center gap-2 text-[10px]! font-bold! tracking-widest text-gray-600 uppercase hover:text-brand-600"
          >
            <Settings2 size={14} strokeWidth={2.5} />
            {__("Configure", "structura")}
          </button>
          <button
            onClick={() => setIsConfirmOpen(true)}
            className="cursor-pointer text-neutral-400 uppercase hover:text-red-600/80 dark:hover:text-red-400/80"
            aria-label={`Delete persona ${persona.name}`}
          >
            <span className="sr-only">{__("Delete", "structura")}</span>
            <Trash2 size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>
      <ConfirmDialog
        isOpen={isConfirmOpen}
        loading={isPending}
        variant="danger"
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={async () => {
          await deletePersona(persona.id);
          setIsConfirmOpen(false);
        }}
        confirmButtonProps={{
          label: __("Yes, Delete", "structura"),
        }}
        title={__("Confirm Deletion", "structura")}
        description={__(
          `Are you sure you want to delete "${persona.name}"? This action cannot be undone.`,
          "structura"
        )}
      />
    </>
  );
};
