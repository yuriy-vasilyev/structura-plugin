import {
  forwardRef,
  useCallback,
  useId,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  ImagePlus,
  Loader2,
  Link2,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { cn } from "../utils";

/**
 * Result the consumer's uploader resolves to. A bare URL string is the
 * common case; the object form lets callers thread extra metadata
 * (e.g. a media-library attachment id) back without a second round-trip.
 */
export type FileUploadResult = string | { url: string };

export interface FileUploadProps {
  /** Current value — the hosted URL of the uploaded file (or empty). */
  value?: string;
  /** Fired with the new URL after a successful upload / paste, or "" on remove. */
  onChange: (url: string) => void;
  /**
   * Storage-agnostic uploader. Receives the picked File and a progress
   * reporter; resolves to the hosted URL (or `{ url }`). THIS is where
   * each surface plugs in its backend — wp-admin posts to the WP media
   * library, the web portal to Blob/Storage — so the component never
   * hard-codes a transport. Reject to surface an error in the dropzone.
   */
  onUpload: (
    file: File,
    helpers: { onProgress: (percent: number) => void },
  ) => Promise<FileUploadResult>;
  label?: string;
  hiddenLabel?: boolean;
  /** Helper text under the field. */
  hint?: ReactNode;
  /** External error (e.g. validation from the form). */
  error?: string;
  /** Accepted types — `accept` attr syntax: "image/*", ".png,.svg", etc. Default "image/*". */
  accept?: string;
  /** Max file size in bytes. Rejected before upload with a friendly message. */
  maxSize?: number;
  /** Show an image thumbnail of the current value. Default: true for image accept. */
  preview?: boolean;
  /**
   * Offer a "paste a URL instead" affordance. Useful while migrating off
   * URL-only inputs, or for users linking an externally-hosted asset.
   */
  allowUrl?: boolean;
  disabled?: boolean;
  className?: string;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)(\?|#|$)/i;

function isImageValue(value: string, accept: string): boolean {
  if (accept.includes("image")) return true;
  return IMAGE_EXT.test(value);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Does `file` satisfy the `accept` attribute string? */
function matchesAccept(file: File, accept: string): boolean {
  const tokens = accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return tokens.some((token) => {
    if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
    if (token.startsWith(".")) return name.endsWith(token);
    return type === token;
  });
}

/**
 * FileUpload — drag-and-drop file picker with preview, progress, and
 * validation. Presentation + interaction only; storage is injected via
 * `onUpload` so the same component works in wp-admin (WP media library)
 * and the web portal (Blob/Storage) unchanged.
 *
 * Controlled around a URL string (`value` / `onChange`) so it drops into
 * any field that previously took a URL.
 *
 * Design guide: dropzone uses the dashed-border idle treatment, brand
 * tint on drag-over, Elevation-1 surface; dark-mode is the primary
 * target. Keyboard-operable (focusable, Enter/Space opens the picker).
 */
export const FileUpload = forwardRef<HTMLDivElement, FileUploadProps>(
  (
    {
      value,
      onChange,
      onUpload,
      label,
      hiddenLabel,
      hint,
      error,
      accept = "image/*",
      maxSize,
      preview,
      allowUrl = false,
      disabled = false,
      className,
    },
    ref,
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const fieldId = useId();
    const [isDragging, setDragging] = useState(false);
    const [isUploading, setUploading] = useState(false);
    const [progress, setProgress] = useState<number | null>(null);
    const [internalError, setInternalError] = useState<string | null>(null);
    const [urlMode, setUrlMode] = useState(false);
    const [urlDraft, setUrlDraft] = useState("");

    const shownError = error ?? internalError;
    const showPreview =
      (preview ?? isImageValue(value ?? "", accept)) && !!value && !isUploading;

    const handleFiles = useCallback(
      async (files: FileList | null) => {
        setInternalError(null);
        const file = files?.[0];
        if (!file) return;

        if (!matchesAccept(file, accept)) {
          setInternalError(`That file type isn't supported. Allowed: ${accept}.`);
          return;
        }
        if (maxSize && file.size > maxSize) {
          setInternalError(
            `File is too large (${formatBytes(file.size)}). Max ${formatBytes(maxSize)}.`,
          );
          return;
        }

        setUploading(true);
        setProgress(null);
        try {
          const result = await onUpload(file, {
            onProgress: (pct) => setProgress(Math.max(0, Math.min(100, pct))),
          });
          const url = typeof result === "string" ? result : result.url;
          if (url) onChange(url);
        } catch (err) {
          setInternalError(
            err instanceof Error && err.message
              ? err.message
              : "Upload failed. Please try again.",
          );
        } finally {
          setUploading(false);
          setProgress(null);
          // Reset the input so re-picking the same file fires onChange.
          if (inputRef.current) inputRef.current.value = "";
        }
      },
      [accept, maxSize, onChange, onUpload],
    );

    const onDrop = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      if (disabled || isUploading) return;
      void handleFiles(e.dataTransfer.files);
    };

    const openPicker = () => {
      if (disabled || isUploading) return;
      inputRef.current?.click();
    };

    return (
      <div ref={ref} className={cn("flex flex-col gap-1.5", className)}>
        {label ? (
          <label
            htmlFor={fieldId}
            className={cn(
              "text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400",
              hiddenLabel && "sr-only",
            )}
          >
            {label}
          </label>
        ) : null}

        {showPreview ? (
          /* ── Uploaded state — preview + replace/remove ─────────── */
          <div className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <img
              src={value}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg border border-neutral-200 bg-white object-contain dark:border-neutral-700"
            />
            <div className="min-w-0 flex-1">
              <p className="m-0! truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">
                {value?.split("/").pop() || value}
              </p>
              <p className="m-0! truncate text-xs text-neutral-400 dark:text-neutral-500">
                {value}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={openPicker}
                disabled={disabled}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                aria-label="Replace file"
                title="Replace"
              >
                <RefreshCw size={15} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setInternalError(null);
                  onChange("");
                }}
                disabled={disabled}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                aria-label="Remove file"
                title="Remove"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ) : (
          /* ── Empty / dropzone state ────────────────────────────── */
          <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            onClick={openPicker}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openPicker();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (!disabled && !isUploading) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950",
              disabled
                ? "cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60 dark:border-neutral-800 dark:bg-neutral-900"
                : isDragging
                  ? "cursor-pointer border-brand-400 bg-brand-50 dark:border-brand-500 dark:bg-brand-950/30"
                  : shownError
                    ? "cursor-pointer border-red-300 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/10"
                    : "cursor-pointer border-neutral-300 bg-white hover:border-brand-300 hover:bg-brand-50/40 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-brand-600 dark:hover:bg-brand-950/20",
            )}
          >
            {isUploading ? (
              <>
                <Loader2 size={22} className="animate-spin text-brand-500" />
                <p className="m-0! text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {progress !== null ? `Uploading… ${progress}%` : "Uploading…"}
                </p>
                {progress !== null ? (
                  <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <span
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full",
                    isDragging
                      ? "bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300"
                      : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
                  )}
                >
                  {accept.includes("image") ? (
                    <ImagePlus size={20} />
                  ) : (
                    <UploadCloud size={20} />
                  )}
                </span>
                <p className="m-0! text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  <span className="text-brand-600 dark:text-brand-400">
                    Click to upload
                  </span>{" "}
                  or drag and drop
                </p>
                <p className="m-0! text-xs text-neutral-400 dark:text-neutral-500">
                  {accept === "image/*" ? "PNG, JPG, SVG or WebP" : accept}
                  {maxSize ? ` · up to ${formatBytes(maxSize)}` : ""}
                </p>
              </>
            )}
          </div>
        )}

        <input
          ref={inputRef}
          id={fieldId}
          type="file"
          accept={accept}
          disabled={disabled}
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />

        {/* Optional "paste a URL" escape hatch. */}
        {allowUrl && !showPreview && !isUploading ? (
          urlMode ? (
            <div className="flex items-center gap-2">
              <input
                type="url"
                autoFocus
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const v = urlDraft.trim();
                    if (v) onChange(v);
                    setUrlMode(false);
                    setUrlDraft("");
                  }
                }}
                placeholder="https://example.com/logo.png"
                className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
              <button
                type="button"
                onClick={() => {
                  const v = urlDraft.trim();
                  if (v) onChange(v);
                  setUrlMode(false);
                  setUrlDraft("");
                }}
                className="shrink-0 cursor-pointer rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
              >
                Use URL
              </button>
              <button
                type="button"
                onClick={() => {
                  setUrlMode(false);
                  setUrlDraft("");
                }}
                aria-label="Cancel URL entry"
                className="shrink-0 cursor-pointer rounded-md p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setUrlMode(true)}
              disabled={disabled}
              className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-400 dark:hover:text-brand-400"
            >
              <Link2 size={12} />
              Paste a URL instead
            </button>
          )
        ) : null}

        {shownError ? (
          <p className="m-0! text-xs text-red-600 dark:text-red-400" role="alert">
            {shownError}
          </p>
        ) : hint ? (
          <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);

FileUpload.displayName = "FileUpload";
