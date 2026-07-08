import { FC, useEffect, useRef, useState } from "react";
import { __ } from "@wordpress/i18n";
import { Button, cn, InputField, Popover } from "@structura/ui";
import {
  Check,
  ChevronDown,
  Link as LinkIcon,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { useLicense, useDefaultProviders } from "@/features/settings";
import { AIProvider } from "@/features/campaigns/types";
import { ProviderPill } from "./ProviderPill";

export interface ContextField {
  title: string;
  url: string;
}

/**
 * Optional medium picker — when supplied, the CTA becomes a dropdown of
 * choices (icon + label + description) and `onGenerate` is called with the
 * picked value. Used by the visual-style flow so the rendering medium is a
 * parameter of the suggestion, not a standalone setting.
 */
export interface MediumPicker {
  heading: string;
  current: string;
  options: ReadonlyArray<{
    value: string;
    label: string;
    desc: string;
    icon: LucideIcon;
  }>;
}

interface SuggestStrategySectionProps {
  isStrategizing: boolean;
  onGenerate: (provider: string, context: ContextField[], medium?: string) => void;
  toggleButtonLabel: string;
  contextFieldLabel: string;
  addSourceLabel: string;
  ctaButtonLabel: string;
  placeholder: {
    title: string;
    url: string;
  };
  /** Pre-populate the repeater with these fields on first load (e.g. auto-detected site logo). */
  initialSources?: ContextField[];
  /** When set, the CTA is a medium dropdown (visual-style flow). */
  mediumPicker?: MediumPicker;
}

export const SuggestStrategySection: FC<SuggestStrategySectionProps> = ({
  isStrategizing,
  onGenerate,
  toggleButtonLabel,
  contextFieldLabel,
  addSourceLabel,
  ctaButtonLabel,
  placeholder,
  initialSources,
  mediumPicker,
}) => {
  const { defaultTextProvider } = useDefaultProviders();
  const [providerOverride, setProviderOverride] = useState<AIProvider | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const activeProvider = providerOverride ?? defaultTextProvider;
  const [contextFields, setContextFields] = useState<ContextField[]>([]);
  const seededRef = useRef(false);
  const { isPaidLicense } = useLicense();

  // Seed context fields once when initialSources become available (async-safe).
  useEffect(() => {
    if (!seededRef.current && initialSources && initialSources.length > 0) {
      setContextFields(initialSources);
      seededRef.current = true;
    }
  }, [initialSources]);

  const addField = () => setContextFields([...contextFields, { title: "", url: "" }]);

  const removeField = (index: number) => {
    setContextFields(contextFields.filter((_, i) => i !== index));
  };

  const updateField = (index: number, key: keyof ContextField, value: string) => {
    const updated = [...contextFields];
    updated[index][key] = value;
    setContextFields(updated);
  };

  return (
    <div>
      {/* ── Trigger row — subtle disclosure toggle ─────────────────── */}
      <button
        type="button"
        onClick={() => (isPaidLicense ? setIsOpen(!isOpen) : undefined)}
        disabled={!isPaidLicense}
        className={cn(
          "group flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-all",
          isPaidLicense
            ? "hover:bg-brand-50/60 dark:hover:bg-brand-950/20"
            : "cursor-not-allowed opacity-50",
          isOpen && "bg-brand-50/40 dark:bg-brand-950/15"
        )}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-purple-500 shadow-sm shadow-brand-500/20">
          <Sparkles size={13} className="text-white" />
        </span>
        <span className="flex-1 text-xs font-bold text-neutral-700 dark:text-neutral-300">
          {toggleButtonLabel}
        </span>
        {!isPaidLicense && (
          <span className="rounded-md bg-brand-100 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-brand-600 uppercase dark:bg-brand-950/30 dark:text-brand-400">
            {__("Pro", "structura")}
          </span>
        )}
        <ChevronDown
          size={14}
          className={cn(
            "text-neutral-400 transition-transform duration-200 dark:text-neutral-500",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* ── Collapsible panel ──────────────────────────────────────── */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isOpen ? "mt-2 max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="rounded-xl border border-neutral-100 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-800/20">
          {/* Context fields label + add */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
              {contextFieldLabel}
            </span>
            <button
              type="button"
              onClick={addField}
              className="flex cursor-pointer items-center gap-1 text-[10px] font-bold text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
            >
              <Plus size={10} />
              {addSourceLabel}
            </button>
          </div>

          {/* Repeater fields */}
          {contextFields.length > 0 && (
            <div className="mb-4 space-y-2">
              {contextFields.map((field, index) => (
                <div
                  key={index}
                  className="group flex items-end gap-2 rounded-lg border border-neutral-100 bg-white p-2.5 dark:border-neutral-700 dark:bg-neutral-800/50"
                >
                  <div className="min-w-0 flex-1">
                    <InputField
                      label={__("Name", "structura")}
                      placeholder={placeholder.title}
                      value={field.title}
                      onChange={(e) => updateField(index, "title", e.target.value)}
                    />
                  </div>
                  <div className="min-w-0 flex-[2]">
                    <InputField
                      label={__("URL", "structura")}
                      placeholder={placeholder.url}
                      value={field.url}
                      onChange={(e) => updateField(index, "url", e.target.value)}
                      leftAdornment={<LinkIcon size={13} />}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeField(index)}
                    className="mb-0.5 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-neutral-600 dark:hover:bg-red-950/20 dark:hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Empty state hint when no resources added */}
          {contextFields.length === 0 && (
            <button
              type="button"
              onClick={addField}
              className="mb-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-200 bg-white/50 px-4 py-3 text-xs text-neutral-400 transition-colors hover:border-brand-300 hover:text-brand-500 dark:border-neutral-700 dark:bg-neutral-800/30 dark:hover:border-brand-700 dark:hover:text-brand-400"
            >
              <LinkIcon size={13} />
              {__("Add brand resources for better results", "structura")}
            </button>
          )}

          {/* ── Action row — generate + provider ───────────────────── */}
          <div className="flex items-center gap-2">
            {mediumPicker ? (
              <Popover>
                <Popover.Trigger
                  disabled={isStrategizing}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-purple-600 px-3 py-1.5 text-sm font-bold text-white shadow-sm shadow-brand-600/15 disabled:opacity-60"
                >
                  <Wand2 size={14} className={cn(isStrategizing && "animate-spin")} />
                  {ctaButtonLabel}
                  <ChevronDown size={14} />
                </Popover.Trigger>
                <Popover.Content
                  anchor={{ to: "bottom start", gap: 6 }}
                  className="w-[19rem] p-1"
                >
                  {({ close }: { close: () => void }) => (
                    <>
                      <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-black tracking-wider text-neutral-400 uppercase">
                        {mediumPicker.heading}
                      </div>
                      {mediumPicker.options.map((opt) => {
                        const Icon = opt.icon;
                        const active = mediumPicker.current === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              onGenerate(
                                activeProvider,
                                contextFields.filter((f) => f.url),
                                opt.value
                              );
                              close();
                            }}
                            className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          >
                            <span
                              className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                                active
                                  ? "bg-brand-500 text-white"
                                  : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                              )}
                            >
                              <Icon size={14} />
                            </span>
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5 text-[13px] font-bold text-neutral-900 dark:text-white">
                                {opt.label}
                                {active && <Check size={12} className="text-brand-500" />}
                              </span>
                              <span className="block text-[11.5px] leading-snug text-neutral-500 dark:text-neutral-400">
                                {opt.desc}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </>
                  )}
                </Popover.Content>
              </Popover>
            ) : (
              <Button
                size="sm"
                onClick={() =>
                  onGenerate(
                    activeProvider,
                    contextFields.filter((f) => f.url)
                  )
                }
                disabled={isStrategizing}
                className="bg-gradient-to-r from-brand-600 to-purple-600 font-bold shadow-sm shadow-brand-600/15"
              >
                {isStrategizing ? (
                  <Wand2 size={14} className="mr-1.5 animate-spin" />
                ) : (
                  <Wand2 size={14} className="mr-1.5" />
                )}
                {ctaButtonLabel}
              </Button>
            )}
            <ProviderPill
              provider={activeProvider}
              onProviderChange={setProviderOverride}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
