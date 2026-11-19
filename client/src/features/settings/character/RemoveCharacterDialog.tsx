/**
 * Remove confirmation (recurring-character handoff §6.3): what is deleted,
 * what stays, and on a preset several sites share, that the character goes
 * from all of them. Focus starts on Keep; Escape and the overlay cancel.
 */
import { createInterpolateElement } from "@wordpress/element";
import { __, _n, sprintf } from "@wordpress/i18n";
import { Globe, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@structura/ui";

import type { CharacterKind } from "../api/useVisualCharacter";

/** Props for {@link RemoveCharacterDialog}. */
export interface RemoveCharacterDialogProps {
  open: boolean;
  /** The character being removed; the editor keeps it while the dialog animates out. */
  character: { name: string; kind: CharacterKind; imageCount: number } | null;
  /** Sites bound to the preset; above one, the dialog says all of them lose it. */
  sharedBySites: number;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** A translated sentence whose `<b>` lead ("Deleted:", "Unchanged:") renders bold. */
const withBoldLead = (text: string) =>
  createInterpolateElement(text, {
    b: <b className="font-bold text-neutral-900 dark:text-white" />,
  });

/** The danger confirmation for Remove. */
export function RemoveCharacterDialog({
  open,
  character,
  sharedBySites,
  loading,
  onCancel,
  onConfirm,
}: RemoveCharacterDialogProps) {
  if (!character) return null;
  const { name } = character;

  return (
    <ConfirmDialog
      isOpen={open}
      onClose={loading ? () => undefined : onCancel}
      onConfirm={onConfirm}
      variant="danger"
      icon={Trash2}
      title={sprintf(
        /* translators: %s: the character's name, e.g. "Lena" */
        __("Remove %s?", "structura"),
        name
      )}
      description={sprintf(
        /* translators: %s: the character's name, e.g. "Lena" */
        __(
          "New images won’t include %s, and “Who appears in your images?” goes back to Nobody.",
          "structura"
        ),
        name
      )}
      loading={loading}
      initialFocus="cancel"
      confirmButtonProps={{
        label: sprintf(
          /* translators: %s: the character's name, e.g. "Lena" */
          __("Remove %s", "structura"),
          name
        ),
        icon: <Trash2 size={15} aria-hidden="true" />,
      }}
      cancelButtonProps={{
        label: sprintf(
          /* translators: %s: the character's name, e.g. "Lena" */
          __("Keep %s", "structura"),
          name
        ),
      }}
    >
      <div className="mt-4! flex flex-col gap-2 rounded-xl bg-neutral-50 px-4 py-3.5 text-[13px] leading-normal text-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-300">
        <p className="m-0! flex items-start gap-2">
          <Trash2
            size={14}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-red-600 dark:text-red-400"
          />
          <span>
            {withBoldLead(
              character.kind === "person"
                ? sprintf(
                    /* translators: %d: how many images were uploaded, 1 to 3. Keep the <b></b> tags. */
                    _n(
                      "<b>Deleted:</b> the image you uploaded and the character sheet.",
                      "<b>Deleted:</b> the %d images you uploaded and the character sheet.",
                      character.imageCount,
                      "structura"
                    ),
                    character.imageCount
                  )
                : __(
                    "<b>Deleted:</b> the artwork you uploaded and the character sheet.",
                    "structura"
                  )
            )}
          </span>
        </p>
        <p className="m-0! flex items-start gap-2">
          <Globe
            size={14}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-neutral-500 dark:text-neutral-400"
          />
          <span>
            {withBoldLead(
              __(
                "<b>Unchanged:</b> images already published on your website. To replace one, regenerate that post’s image.",
                "structura"
              )
            )}
          </span>
        </p>
        {sharedBySites > 1 && (
          <p className="m-0! flex items-start gap-2">
            <Globe
              size={14}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-neutral-500 dark:text-neutral-400"
            />
            <span>
              {sprintf(
                /* translators: 1: the character's name, e.g. "Lena", 2: how many sites use the preset */
                _n(
                  "%1$s is removed from the %2$d site that uses this preset.",
                  "%1$s is removed from all %2$d sites that use this preset.",
                  sharedBySites,
                  "structura"
                ),
                name,
                sharedBySites
              )}
            </span>
          </p>
        )}
      </div>
      <p className="mt-3! mb-0! text-[12.5px] text-neutral-500 dark:text-neutral-400">
        {sprintf(
          /* translators: %s: the character's name, e.g. "Lena" */
          __("This can’t be undone. To use %s again, upload the images again.", "structura"),
          name
        )}
      </p>
    </ConfirmDialog>
  );
}
