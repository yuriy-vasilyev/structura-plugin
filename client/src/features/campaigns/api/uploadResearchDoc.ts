/**
 * wp-admin transport for the `ResearchAttachments` dropzone — one upload +
 * extract round-trip per file through the plugin proxy
 * (`POST /structura/v1/research-docs` → cloud `executeCloudAttachmentUpload`).
 *
 * The component is transport-agnostic (`onUpload` injection, same pattern as
 * `FileUpload`); this module is the wp-admin side's wiring. On failure it
 * throws an `Error` whose message is already user-displayable: the plugin's
 * typed `message_key` is mapped to the handoff's localized copy, with the
 * server's own message string as the fallback for untyped failures.
 */
import apiFetch from "@wordpress/api-fetch";
import { __, sprintf } from "@wordpress/i18n";
import { formatBytes, type ResearchAttachmentUploadResult } from "@structura/ui";

/**
 * Localized rejection copy for an unsupported file type (handoff
 * `reject.type`). Shared with the dropzone's client-side pre-upload
 * rejection labels so the same rule reads identically whichever side
 * caught it.
 */
export const researchRejectTypeMessage = (fileName: string): string =>
  sprintf(
    /* translators: %s: file name */
    __("%s isn't a supported format — use PDF, DOCX, TXT, MD or HTML.", "structura"),
    fileName,
  );

/**
 * Localized rejection copy for an oversized file (handoff `reject.size`).
 * Shared with the dropzone's client-side pre-upload rejection labels.
 */
export const researchRejectSizeMessage = (fileName: string, size: string): string =>
  sprintf(
    /* translators: 1: file name, 2: formatted file size (e.g. "14.8 MB") */
    __("%1$s is %2$s — files can be up to 10 MB.", "structura"),
    fileName,
    size,
  );

/** Success envelope of `POST /structura/v1/research-docs`. */
interface ResearchDocResponse {
  success?: boolean;
  attachment?: Partial<ResearchAttachmentUploadResult>;
}

/**
 * Shape apiFetch rejects with for a WP_Error response — the REST error JSON
 * with `data.message_key` set to the plugin's typed attachment failure key
 * (may be absent for generic failures).
 */
interface ResearchDocError {
  message?: unknown;
  data?: { message_key?: unknown };
}

/** Map the plugin's typed `message_key` to the handoff's localized copy. */
const messageForKey = (key: string, file: File): string | null => {
  switch (key) {
    case "attachments.unsupportedType":
      return researchRejectTypeMessage(file.name);
    case "attachments.tooLarge":
      return researchRejectSizeMessage(file.name, formatBytes(file.size));
    case "attachments.unreadable":
      return __(
        "We couldn't read this file — it may be corrupt or image-only.",
        "structura",
      );
    case "attachments.planRequired":
      return __(
        "Research material needs a paid plan — upgrade to attach files.",
        "structura",
      );
    default:
      return null;
  }
};

const GENERIC_FAILURE = () =>
  __("The upload failed — please try again.", "structura");

/**
 * Upload one research document and return the extractor's result mapped to
 * the `ResearchAttachments` component's `onUpload` contract. Throws an
 * `Error` with a user-displayable, localized message on any failure.
 *
 * Multipart via FormData; Content-Type is deliberately NOT set so the
 * browser writes the multipart boundary itself (same precedent as the
 * wizard's media-library logo upload — a hand-set header 400s in WP).
 */
export async function uploadResearchDoc(
  file: File,
): Promise<ResearchAttachmentUploadResult> {
  const form = new FormData();
  form.append("file", file, file.name);

  let response: ResearchDocResponse;
  try {
    response = await apiFetch<ResearchDocResponse>({
      path: "/structura/v1/research-docs",
      method: "POST",
      body: form,
    });
  } catch (err) {
    const rejected = (err ?? {}) as ResearchDocError;
    const key =
      typeof rejected.data?.message_key === "string" ? rejected.data.message_key : "";
    const mapped = key ? messageForKey(key, file) : null;
    const serverMessage =
      typeof rejected.message === "string" ? rejected.message : "";
    throw new Error(mapped ?? (serverMessage || GENERIC_FAILURE()));
  }

  const attachment = response?.attachment;
  const attachmentId =
    typeof attachment?.attachmentId === "string" ? attachment.attachmentId : "";
  if (!attachmentId) {
    // 200 without an id would leave a "ready" row the form can't submit —
    // treat it as the generic failure so the row lands on Retry instead.
    throw new Error(GENERIC_FAILURE());
  }

  return {
    attachmentId,
    name: typeof attachment?.name === "string" && attachment.name ? attachment.name : file.name,
    ext: typeof attachment?.ext === "string" ? attachment.ext : "",
    sizeBytes:
      typeof attachment?.sizeBytes === "number" ? attachment.sizeBytes : file.size,
    charCount: typeof attachment?.charCount === "number" ? attachment.charCount : 0,
    truncated: attachment?.truncated === true,
    extractedUnit: attachment?.extractedUnit === "pages" ? "pages" : "words",
    extractedUsed:
      typeof attachment?.extractedUsed === "number" ? attachment.extractedUsed : 0,
    extractedTotal:
      typeof attachment?.extractedTotal === "number" ? attachment.extractedTotal : 0,
  };
}
