/**
 * "Your character" intake (recurring-character handoff §5): the images, how
 * to use them, Name, the drafted Description, Outfit (person) or Keep its own
 * drawing style (mascot), the consent or rights statement, and the next-step
 * button. Every check blocks by an error line where the problem is; the
 * editor moves focus to the first one.
 */
import { useId, type ReactNode } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { CircleAlert, Image as ImageIcon, Lock, PenLine, Sparkles } from "lucide-react";
import { Button, Checkbox, InputField, OptionCardGroup, Switch, TextArea, cn } from "@structura/ui";

import type { CharacterEditor } from "./useCharacterEditor";
import { CHARACTER_MAX_IMAGES } from "./visualCharacter";
import { UploadSlot, type UploadSlotView } from "./UploadSlot";

/** A red error line with its icon (handoff §4 error line). */
export function FieldError({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      id={id}
      role="alert"
      className={cn(
        "m-0! flex items-start gap-1.5 text-[12.5px] leading-[1.45] font-semibold text-red-800 dark:text-red-200",
        className
      )}
    >
      <CircleAlert
        size={14}
        aria-hidden="true"
        className="mt-px shrink-0 text-red-600 dark:text-red-400"
      />
      <span>{children}</span>
    </p>
  );
}

/** "Finish {name} first, or choose Nobody.", or the unnamed line. */
function unfinishedLine(name: string): string {
  return name
    ? sprintf(
        /* translators: %s: the character's name, e.g. "Lena" */
        __("Finish %s first, or choose Nobody.", "structura"),
        name
      )
    : __("Finish the character first, or choose Nobody.", "structura");
}

/** Props for {@link CharacterIntake}. */
export interface CharacterIntakeProps {
  editor: CharacterEditor;
  /** Name of the signature picked above, when it can draw a character. */
  signatureName: string | null;
  /** Opens the zoom on an upload. */
  onZoomImage: (index: number) => void;
  /** The plan can add or change a character. */
  canEdit: boolean;
}

/** The intake form inside "Your character". */
export function CharacterIntake({
  editor,
  signatureName,
  onZoomImage,
  canEdit,
}: CharacterIntakeProps) {
  const { fields, patchFields, errors, images, slot, kind } = editor;
  const imagesErrorId = useId();
  const permissionErrorId = useId();
  const unfinishedId = useId();
  if (!kind) return null;

  const person = kind === "person";
  const name = fields.name.trim();
  const ownStyle = !person && fields.keepOwnStyle;
  const sheetPath = fields.reference === "sheet";
  const busy = slot.status === "uploading" || editor.removingImage || !canEdit;

  // Three slots always: the uploads, the one taking the next file, then empty ones.
  const slotViews: UploadSlotView[] = Array.from({ length: CHARACTER_MAX_IMAGES }, (_, i) => {
    if (i < images.length)
      return { kind: "uploaded", url: images[i]!.url, fileName: editor.fileNames[i] };
    if (i === images.length && slot.status === "uploading")
      return { kind: "uploading", previewUrl: slot.previewUrl };
    if (i === images.length && slot.status === "error")
      return { kind: "error", refusal: slot.refusal, size: slot.size };
    return { kind: "empty", optional: i > 0 || images.length > 0 };
  });

  const sheetDescription = ownStyle
    ? name
      ? sprintf(
          /* translators: %s: the character's name, e.g. "Pip" */
          __(
            "We draw %s in three full-length views and two close-ups, looking just like your artwork. You approve it before it’s used.",
            "structura"
          ),
          name
        )
      : __(
          "We draw the character in three full-length views and two close-ups, looking just like your artwork. You approve it before it’s used.",
          "structura"
        )
    : !signatureName
      ? __(
          "We draw the character in three full-length views and two close-ups, in the style you pick under Signature. You approve it before it’s used.",
          "structura"
        )
      : name
        ? sprintf(
            /* translators: 1: the character's name, e.g. "Lena", 2: a style name, e.g. "Ink and fill" */
            __(
              "We draw %1$s in %2$s in three full-length views and two close-ups. You approve it before it’s used.",
              "structura"
            ),
            name,
            signatureName
          )
        : sprintf(
            /* translators: %s: a style name, e.g. "Ink and fill" */
            __(
              "We draw the character in %s in three full-length views and two close-ups. You approve it before it’s used.",
              "structura"
            ),
            signatureName
          );

  const draftedChip = (
    <span className="border-rec-line bg-rec-soft text-rec-ink inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold">
      <Sparkles size={11} aria-hidden="true" />
      {__("Drafted from your images", "structura")}
    </span>
  );

  const help = sheetPath
    ? ownStyle
      ? __("Takes about a minute. You approve the sheet before anything changes.", "structura")
      : signatureName
        ? sprintf(
            /* translators: %s: a style name, e.g. "Ink and fill" */
            __(
              "Drawn in %s, the style picked above. Takes about a minute, and you approve it before anything changes.",
              "structura"
            ),
            signatureName
          )
        : __("Pick a style under Signature first. The sheet is drawn in it.", "structura")
    : person
      ? __(
          "Nothing is redrawn and no image is used. Every new image follows your image closely.",
          "structura"
        )
      : __(
          "Nothing is redrawn and no image is used. Every new image follows your artwork closely.",
          "structura"
        );

  const cost = <span className="font-medium opacity-80">{__("· 1 image", "structura")}</span>;

  return (
    <div className="flex max-w-[640px] flex-col gap-7">
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold text-neutral-900 dark:text-white">
          {__("Images", "structura")}
        </span>
        <p className="m-0! text-[12.5px] leading-normal text-neutral-500 dark:text-neutral-400">
          {person
            ? __(
                "One to three photos or drawings. A clear face and one full-length image work best. JPG, PNG or WebP, up to 10 MB each.",
                "structura"
              )
            : __(
                "One to three images of the artwork. A front view and a full-body view work best. JPG, PNG or WebP, up to 10 MB each.",
                "structura"
              )}
        </p>
        <p className="m-0! flex items-start gap-1.5 text-[12.5px] leading-normal text-neutral-500 dark:text-neutral-400">
          <Lock size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
          {__(
            "We keep your images until you remove the character, so we can draw a new sheet if you change the style.",
            "structura"
          )}
        </p>
        {/* Two columns on a phone, three from 640 px (handoff §9): wp-admin leaves a phone
            only ~308 px here, too narrow for two 150 px auto-fill tracks. */}
        <div className="mt-2! grid max-w-[640px] grid-cols-2 gap-3 sm:grid-cols-3">
          {slotViews.map((view, i) => (
            <UploadSlot
              key={i}
              index={i}
              view={view}
              disabled={busy}
              invalid={errors.images && i === 0}
              describedBy={errors.images && i === 0 ? imagesErrorId : undefined}
              onPick={(file) => void editor.addImage(file)}
              onRemove={canEdit ? () => void editor.removeImageAt(i) : undefined}
              onZoom={() => onZoomImage(i)}
              slotRef={editor.register(`slot-${i}`)}
            />
          ))}
        </div>
        {errors.images && (
          <FieldError id={imagesErrorId}>{__("Add at least one image.", "structura")}</FieldError>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-bold text-neutral-900 dark:text-white">
          {__("How should we use your images?", "structura")}
        </span>
        <OptionCardGroup
          layout="row"
          ariaLabel={__("How should we use your images?", "structura")}
          value={fields.reference}
          onChange={(reference) => patchFields({ reference })}
          options={[
            {
              value: "sheet",
              label: ownStyle
                ? __("Draw a character sheet in its own style", "structura")
                : __("Draw a character sheet in my signature", "structura"),
              description: sheetDescription,
              icon: PenLine,
            },
            {
              value: "asIs",
              label: __("Use my image as it is", "structura"),
              description: person
                ? __("For drawings already in the style you want. Nothing is redrawn.", "structura")
                : __(
                    "For artwork that already shows the mascot the way you want it. Nothing is redrawn.",
                    "structura"
                  ),
              icon: ImageIcon,
            },
          ]}
        />
      </div>

      <div className="max-w-[360px]">
        <InputField
          ref={editor.register("name")}
          labelStyle="prominent"
          label={__("Name", "structura")}
          placeholder={
            person ? __("For example, Lena", "structura") : __("For example, Pip", "structura")
          }
          description={__(
            "Only for you, to tell characters apart. It never appears in images.",
            "structura"
          )}
          value={fields.name}
          maxLength={80}
          error={errors.name ? __("Give the character a name.", "structura") : undefined}
          onChange={(event) => {
            patchFields({ name: event.target.value });
            if (errors.name && event.target.value.trim())
              editor.setErrors((e) => ({ ...e, name: false }));
          }}
        />
      </div>

      <TextArea
        ref={editor.register("description")}
        labelStyle="prominent"
        label={__("Description", "structura")}
        labelAdornment={fields.descriptionDrafted ? draftedChip : undefined}
        placeholder={__("We draft this from your images once they’re uploaded.", "structura")}
        description={
          name
            ? sprintf(
                /* translators: %s: the character's name, e.g. "Lena" */
                __(
                  "One sentence on how %s looks. We keep it in every image, so fix anything that’s wrong.",
                  "structura"
                ),
                name
              )
            : __(
                "One sentence on how the character looks. We keep it in every image, so fix anything that’s wrong.",
                "structura"
              )
        }
        rows={3}
        maxLength={500}
        value={fields.description}
        loading={editor.describing}
        error={
          errors.description
            ? __("Describe how the character looks in one sentence.", "structura")
            : undefined
        }
        onChange={(event) => {
          patchFields({
            description: event.target.value,
            descriptionDrafted: false,
            descriptionEdited: true,
          });
          if (errors.description && event.target.value.trim())
            editor.setErrors((e) => ({ ...e, description: false }));
        }}
      />

      {person ? (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-bold text-neutral-900 dark:text-white">
            {__("Outfit", "structura")}
          </span>
          <OptionCardGroup
            ariaLabel={__("Outfit", "structura")}
            value={fields.outfit}
            onChange={(outfit) => patchFields({ outfit })}
            className="grid-cols-1 sm:grid-cols-2"
            options={[
              {
                value: "same",
                label: __("Always the same", "structura"),
                description: __("Wears what’s in your images in every post.", "structura"),
              },
              {
                value: "changes",
                label: __("Changes with the post", "structura"),
                description: __(
                  "Dresses for each topic. Face and hair stay the same.",
                  "structura"
                ),
              },
            ]}
          />
        </div>
      ) : (
        sheetPath && (
          // The shared Switch and Checkbox set no margin on their description
          // `<p>`, so wp-admin's own `p { margin: 1em 0 }` would open a gap.
          <div className="[&_p]:m-0!">
            <Switch
              label={__("Keep its own drawing style", "structura")}
              description={
                name
                  ? sprintf(
                      /* translators: %s: the character's name, e.g. "Pip" */
                      __(
                        "%s looks like your artwork in every image, inside scenes drawn in your signature.",
                        "structura"
                      ),
                      name
                    )
                  : __(
                      "The character looks like your artwork in every image, inside scenes drawn in your signature.",
                      "structura"
                    )
              }
              checked={fields.keepOwnStyle}
              onChange={(keepOwnStyle) => patchFields({ keepOwnStyle })}
            />
          </div>
        )
      )}

      <div
        ref={editor.register("permission")}
        className={cn(
          "rounded-xl border px-4 py-3.5",
          errors.permission
            ? "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/30"
            : "border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/60"
        )}
      >
        <div className="[&_p]:m-0!">
          <Checkbox
            label={
              person
                ? __("This is me, or I have this person’s permission", "structura")
                : __("I own this artwork or have the right to use it", "structura")
            }
            description={
              person
                ? __("We only draw real people who have agreed to it.", "structura")
                : __(
                    "We only draw mascots you’re allowed to use, such as your own brand’s.",
                    "structura"
                  )
            }
            checked={fields.confirmed}
            aria-invalid={errors.permission || undefined}
            aria-describedby={errors.permission ? permissionErrorId : undefined}
            onChange={(confirmed) => {
              patchFields({ confirmed });
              if (confirmed) editor.setErrors((e) => ({ ...e, permission: false }));
            }}
          />
        </div>
        {errors.permission && (
          <FieldError id={permissionErrorId} className="mt-2!">
            {__("Confirm this before we use these images.", "structura")}
          </FieldError>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          {sheetPath ? (
            <Button
              ref={editor.register("nextStep")}
              onClick={editor.drawFromIntake}
              disabled={!canEdit}
              aria-describedby={errors.unfinished ? unfinishedId : undefined}
              className="max-sm:min-h-11 max-sm:text-wrap"
            >
              <PenLine size={15} aria-hidden="true" />
              {__("Draw character sheet", "structura")}
              {cost}
            </Button>
          ) : (
            <Button
              ref={editor.register("nextStep")}
              onClick={editor.useAsIs}
              disabled={!canEdit}
              aria-describedby={errors.unfinished ? unfinishedId : undefined}
              className="max-sm:min-h-11 max-sm:text-wrap"
            >
              {__("Use these images", "structura")}
            </Button>
          )}
          {editor.replacing && editor.effective && (
            <Button
              variant="transparent"
              onClick={editor.cancelReplace}
              className="max-sm:min-h-11 max-sm:text-wrap"
            >
              {sprintf(
                /* translators: %s: the character's name, e.g. "Lena" */
                __("Cancel and keep %s", "structura"),
                editor.effective.name
              )}
            </Button>
          )}
        </div>
        <p className="m-0! text-xs leading-normal text-neutral-500 dark:text-neutral-400">{help}</p>
        {errors.unfinished && <FieldError id={unfinishedId}>{unfinishedLine(name)}</FieldError>}
      </div>
    </div>
  );
}
