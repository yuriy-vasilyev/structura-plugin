/**
 * "Your character" (recurring-character handoff §5 to §6.2): the intake,
 * the sheet approval or the card, and the zoom dialog over the images. All
 * state lives in {@link useCharacterEditor}.
 */
import { useState } from "react";
import { __, sprintf } from "@wordpress/i18n";

import type { CharacterEditor } from "./useCharacterEditor";
import { CharacterCard } from "./CharacterCard";
import { CharacterIntake } from "./CharacterIntake";
import { SheetApproval } from "./SheetApproval";
import { sheetAlt } from "./visualCharacter";
import { ZoomDialog, type ZoomItem } from "./ZoomDialog";

/** Props for {@link CharacterSection}. */
export interface CharacterSectionProps {
  editor: CharacterEditor;
  /** Name of the picked signature when it can draw a character, else null. */
  signatureName: string | null;
  /** Name of the signature the shown sheet was drawn in. */
  sheetSignatureName: string;
  /** The plan can add or change a character. */
  canEdit: boolean;
}

/** The character section of the Visuals card. */
export function CharacterSection({
  editor,
  signatureName,
  sheetSignatureName,
  canEdit,
}: CharacterSectionProps) {
  // The index stays while the dialog closes, so it animates out on the same image.
  const [zoom, setZoom] = useState({ open: false, index: 0 });
  const { kind, shown, effective } = editor;
  if (!kind) return null;

  // The images and the sheet the view shows, sheet first, for the zoom.
  const sheet =
    shown === "card"
      ? effective?.reference === "sheet"
        ? effective.sheet
        : undefined
      : editor.draftSheet;
  const images = shown === "card" && effective ? effective.images : editor.images;
  const name = (shown === "card" ? effective?.name : editor.fields.name.trim()) || "";
  const imageLabel = (n: number) =>
    sprintf(
      /* translators: %d: the image's position, 1 to 3 */
      __("Your image %d", "structura"),
      n
    );
  const zoomItems: ZoomItem[] = [
    ...(sheet && shown !== "intake"
      ? [
          {
            key: "sheet",
            src: sheet.url,
            alt: sheetAlt(name, sheetSignatureName),
            title: sprintf(
              /* translators: %s: a style name, e.g. "Ink and fill" */
              __("Character sheet · %s", "structura"),
              sheetSignatureName
            ),
            label: __("Character sheet", "structura"),
            shape: "sheet" as const,
          },
        ]
      : []),
    ...images.map((image, i) => ({
      key: `image-${i}`,
      src: image.url,
      alt: imageLabel(i + 1),
      title: sprintf(
        /* translators: 1: the image's position, 2: how many images there are */
        __("Your image %1$d of %2$d", "structura"),
        i + 1,
        images.length
      ),
      label: imageLabel(i + 1),
      shape: "square" as const,
    })),
  ];
  const offset = zoomItems[0]?.key === "sheet" ? 1 : 0;
  // -1 is the sheet; an upload's index shifts by one when the sheet leads.
  const openZoom = (index: number) =>
    setZoom({ open: true, index: index < 0 ? 0 : index + offset });

  const description =
    shown === "card" && effective?.source === "pending"
      ? sprintf(
          /* translators: %s: the character's name, e.g. "Lena" */
          __(
            "%s appears in every new image once you save. Replace uploads new images and draws a new sheet.",
            "structura"
          ),
          effective.name
        )
      : kind === "person"
        ? __(
            "Upload images of the person, then approve how we draw them. The character stays the same in every image on your website.",
            "structura"
          )
        : __(
            "Upload your mascot’s artwork, then approve how we draw it. The character stays the same in every image on your website.",
            "structura"
          );

  return (
    <section>
      <div className="flex min-w-0 flex-col gap-1">
        <h3
          ref={editor.register("heading")}
          tabIndex={-1}
          className="m-0! text-base font-bold tracking-tight text-neutral-900! outline-none dark:text-white!"
        >
          {__("Your character", "structura")}
        </h3>
        <p className="m-0! max-w-[62ch] text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
      </div>
      <div className="mt-4!">
        {shown === "intake" && (
          <CharacterIntake
            editor={editor}
            signatureName={signatureName}
            onZoomImage={openZoom}
            canEdit={canEdit}
          />
        )}
        {shown === "sheet" && (
          <SheetApproval
            editor={editor}
            signatureName={signatureName ?? sheetSignatureName}
            onZoom={openZoom}
          />
        )}
        {shown === "card" && effective && (
          <CharacterCard
            character={effective}
            sheetSignatureName={sheetSignatureName}
            needsNewSheet={editor.needsNewSheet}
            canReplace={canEdit}
            onReplace={editor.startReplace}
            onRemove={editor.openRemove}
            onZoom={openZoom}
            replaceRef={editor.register("replace")}
          />
        )}
      </div>
      <ZoomDialog
        items={zoomItems}
        open={zoom.open}
        index={zoom.index}
        onIndexChange={(index) => setZoom({ open: true, index })}
        onClose={() => setZoom((z) => ({ ...z, open: false }))}
      />
    </section>
  );
}
