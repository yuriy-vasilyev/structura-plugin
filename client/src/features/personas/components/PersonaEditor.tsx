import { useEffect, useState } from "react";
import { __ } from "@wordpress/i18n";
import { Loader2, Sparkles, Zap } from "lucide-react";
import { Button, Dialog, InputField, Select, TextArea, toast } from "@structura/ui";
import { READING_LEVEL_OPTIONS, TONE_OPTIONS } from "../data/personaTemplates";
import { Persona, ReadingLevelOption, ToneOption, WpUser } from "../types";
import { useMagicSuggest } from "@/hooks/useMagicSuggest";
import { useDefaultProviders } from "@/features/settings";
import { AIProvider } from "@/features/campaigns/types";
import { ProviderPill } from "@/features/campaigns/components/ProviderPill";
import { MagicSuggestProgress } from "@/features/campaigns/components/MagicSuggestProgress";

interface PersonaEditorProps {
  persona: Persona | null;
  users: WpUser[];
  onClose: () => void;
  onSave: (data: Persona) => Promise<void>;
}

export const PersonaEditor = ({ persona, users, onClose, onSave }: PersonaEditorProps) => {
  const [current, setCurrent] = useState<Persona>({
    id: 0,
    name: "",
    system_prompt: "",
    tone: "professional",
    reading_level: "grade_8",
    author_id: 0,
  });
  const [isSaving, setIsSaving] = useState(false);
  const { suggest, isSuggesting } = useMagicSuggest();

  useEffect(() => {
    if (persona) {
      setCurrent(persona);
    }
  }, [persona]);

  /**
   * Triggers the Magic Suggest engine for the Persona mode.
   * The AI will return a validated object with: name, system_prompt, tone, and reading_level.
   */
  const { defaultTextProvider } = useDefaultProviders();
  const [providerOverride, setProviderOverride] = useState<AIProvider | null>(null);
  const activeProvider = providerOverride ?? defaultTextProvider;

  const handleMagicSuggest = async () => {
    const data = await suggest("persona", {
      provider: activeProvider,
    });

    if (data) {
      setCurrent((prev) => ({
        ...prev,
        ...data,
      }));
      toast.success(__("Persona optimized by AI.", "structura"));
    }
  };

  return (
    <Dialog.Root open={true} onClose={onClose} size="lg">
      <Dialog.Content>
        <Dialog.Header>
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title>
              {current.id === 0
                ? __("Create New Persona", "structura")
                : __("Edit Persona", "structura")}
            </Dialog.Title>

            <div className="flex items-center gap-2">
              {/* Persona suggestion runs through `useMagicSuggest("persona")`.
                  Since 2026-05-27 the cloud grounds this on the site's
                  homepage scrape AND its own recent published posts (voice
                  samples), so the generated persona matches the existing
                  writing voice — the staged-progress copy reflects that
                  same research work the other suggestion modes show. */}
              <MagicSuggestProgress isLoading={isSuggesting} variant="inline" />
              <ProviderPill
                provider={activeProvider}
                onProviderChange={setProviderOverride}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleMagicSuggest}
                disabled={isSuggesting || isSaving}
              >
                {isSuggesting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                <span className="ml-2 text-[10px] font-bold tracking-wider uppercase">
                  {isSuggesting
                    ? __("Architecting…", "structura")
                    : __("Magic Suggest", "structura")}
                </span>
              </Button>
            </div>
          </div>
        </Dialog.Header>

        <Dialog.Body>
          <div className="space-y-8">
            {/* ROW 1: Identity & Author */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <InputField
                label={__("Identity Name", "structura")}
                value={current.name}
                placeholder={__("e.g. Technical Reviewer", "structura")}
                onChange={(e) => setCurrent({ ...current, name: e.target.value })}
              />

              <Select
                value={current.author_id}
                onValueChange={(val) =>
                  setCurrent({ ...current, author_id: parseInt(val as string) })
                }
                options={users.map((u) => ({ label: u.name, value: u.id }))}
              >
                <Select.Label>{__("Publishing Author", "structura")}</Select.Label>
                <Select.Trigger placeholder={__("Select an author...", "structura")} />
                <Select.Content className="w-(--button-width)">
                  {users.map((u) => (
                    <Select.Item key={u.id} value={u.id}>
                      {u.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>

            {/* ROW 2: System Directive */}
            <TextArea
              label={__("Intelligence Directive (System Prompt)", "structura")}
              rows={5}
              className="font-mono text-xs leading-relaxed"
              value={current.system_prompt}
              onChange={(e) => setCurrent({ ...current, system_prompt: e.target.value })}
              placeholder={__("You are a rigorous academic...", "structura")}
            />

            {/* ROW 3: Linguistics */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Select
                value={current.tone}
                onValueChange={(val) => setCurrent({ ...current, tone: val as ToneOption })}
                options={TONE_OPTIONS}
              >
                <Select.Label>{__("Linguistic Tone", "structura")}</Select.Label>
                <Select.Trigger placeholder={__("Select a tone...", "structura")} />
                <Select.Content className="w-(--button-width)">
                  {TONE_OPTIONS.map((u) => (
                    <Select.Item key={u.value} value={u.value}>
                      {u.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>

              <Select
                value={current.reading_level}
                onValueChange={(val) =>
                  setCurrent({ ...current, reading_level: val as ReadingLevelOption })
                }
                options={READING_LEVEL_OPTIONS}
              >
                <Select.Label>{__("Reading Level", "structura")}</Select.Label>
                <Select.Trigger placeholder={__("Select a level...", "structura")} />
                <Select.Content className="w-(--button-width)">
                  {READING_LEVEL_OPTIONS.map((u) => (
                    <Select.Item key={u.value} value={u.value}>
                      {u.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Button variant="secondary" onClick={onClose} size="sm">
            {__("Cancel", "structura")}
          </Button>
          <Button
            disabled={
              isSaving ||
              !current.author_id ||
              !current.name.trim() ||
              !current.system_prompt.trim()
            }
            onClick={async () => {
              setIsSaving(true);
              await onSave(current);
              setIsSaving(false);
            }}
          >
            {isSaving ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Zap className="mr-2 size-4" />
            )}
            {current.id === 0 ? __("Create Persona", "structura") : __("Save Changes", "structura")}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};
