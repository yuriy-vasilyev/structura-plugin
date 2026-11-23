/**
 * The samples picked for "Draft from images" (specs/visual-signatures.md
 * §14.4). A picked image is checked and scaled to 1536 px in the browser with
 * the character intake's helpers and kept in memory only. The builder owns
 * this state, so closing its panel keeps the picks for another try and
 * closing the builder drops them.
 */
import { useEffect, useRef, useState } from "react";

import type { UploadSlotView } from "../character/UploadSlot";
import {
  CHARACTER_MAX_IMAGES,
  checkCharacterFile,
  shrinkCharacterImage,
  type UploadRefusal,
} from "../character/visualCharacter";

/** A picked sample: its preview and the scaled data URI the draft sends. */
interface SampleImage {
  name: string;
  previewUrl: string;
  dataUri: string;
}

/** The picked samples in slot order, with the three slots' views. */
export function useSampleImages() {
  const [images, setImages] = useState<SampleImage[]>([]);
  // The file being scaled; its preview shows in the next slot meanwhile.
  const [reading, setReading] = useState<{ name: string; previewUrl: string } | null>(null);
  const [refused, setRefused] = useState<{ refusal: UploadRefusal; size: number } | null>(null);
  // Every preview URL still open, revoked when the builder closes.
  const previews = useRef(new Set<string>());
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const open = previews.current;
    return () => {
      mounted.current = false;
      open.forEach((url) => URL.revokeObjectURL(url));
      open.clear();
    };
  }, []);

  const revoke = (url: string) => {
    URL.revokeObjectURL(url);
    previews.current.delete(url);
  };

  /** Checks and scales a picked file into the next slot, or shows there why it can't be used. */
  const add = async (file: File) => {
    const refusal = checkCharacterFile(file);
    if (refusal) {
      setRefused({ refusal, size: file.size });
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    previews.current.add(previewUrl);
    setRefused(null);
    setReading({ name: file.name, previewUrl });
    const dataUri = await shrinkCharacterImage(file);
    // Closed meanwhile: the cleanup already revoked the preview.
    if (!mounted.current) return;
    setReading(null);
    if (!dataUri) {
      revoke(previewUrl);
      setRefused({ refusal: "wrongType", size: file.size });
      return;
    }
    setImages((current) => [...current, { name: file.name, previewUrl, dataUri }]);
  };

  /** Drops the sample in slot `index`. */
  const removeAt = (index: number) => {
    const removed = images[index];
    if (!removed) return;
    revoke(removed.previewUrl);
    setImages(images.filter((_, i) => i !== index));
  };

  // Three slots: the samples, the one being scaled or refused, then empty ones.
  const views: UploadSlotView[] = Array.from({ length: CHARACTER_MAX_IMAGES }, (_, i) => {
    const image = images[i];
    if (image) return { kind: "uploaded", url: image.previewUrl, fileName: image.name };
    if (i === images.length && reading)
      return { kind: "uploaded", url: reading.previewUrl, fileName: reading.name };
    if (i === images.length && refused)
      return { kind: "error", refusal: refused.refusal, size: refused.size };
    return { kind: "empty", optional: i > 0 || images.length > 0 };
  });

  return {
    views,
    add,
    removeAt,
    count: images.length,
    reading: reading !== null,
    dataUris: images.map((image) => image.dataUri),
  };
}

/** What {@link useSampleImages} returns. */
export type SampleImages = ReturnType<typeof useSampleImages>;
