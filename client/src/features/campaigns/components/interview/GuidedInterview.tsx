import { useCallback, useEffect, useMemo, useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import apiFetch from "@wordpress/api-fetch";
import {
  Check,
  ChevronRight,
  MessageSquare,
  PenLine,
  RefreshCw,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { Button, cn, InputField } from "@structura/ui";
import { useMagicSuggest } from "@/hooks/useMagicSuggest";
import { useCampaignForm } from "@/features/campaigns/context/CampaignContext";
import { AIProvider, CampaignMode } from "@/features/campaigns/types";
import { ProviderPill } from "../ProviderPill";
import { MagicSuggestProgress } from "../MagicSuggestProgress";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InterviewAnswer {
  questionId: string;
  label: string;
  value: string;
}

export interface ChipOption {
  label: string;
  value: string;
}

interface InterviewQuestion {
  id: string;
  question: string;
  chips: ChipOption[];
  allowCustom: boolean;
  multiSelect?: boolean;
}

interface GuidedInterviewProps {
  onComplete: (result: {
    name: string;
    objective: string;
    campaignMode?: CampaignMode;
    /** The selected topic chips, threaded on as explicit keyword-discovery seeds. */
    topics?: string[];
  }) => void;
}

// ─── Questions ──────────────────────────────────────────────────────────────

const QUESTIONS: InterviewQuestion[] = [
  {
    id: "goal",
    question: __("What's the primary goal of this campaign?", "structura"),
    chips: [
      { label: __("Drive organic traffic", "structura"), value: "traffic_magnet" },
      { label: __("Target low-competition topics", "structura"), value: "quick_wins" },
      { label: __("Convert readers to customers", "structura"), value: "conversion" },
      { label: __("Build niche authority", "structura"), value: "authority" },
    ],
    allowCustom: true,
  },
  {
    id: "audience",
    question: __("Who's your target audience?", "structura"),
    chips: [
      { label: __("Beginners & newcomers", "structura"), value: "beginners" },
      { label: __("Professionals & practitioners", "structura"), value: "professionals" },
      { label: __("Business owners & decision-makers", "structura"), value: "business_owners" },
      { label: __("Developers & technical users", "structura"), value: "developers" },
      { label: __("General public", "structura"), value: "general" },
    ],
    allowCustom: true,
  },
  {
    id: "topic",
    question: __("What topics or niches should this campaign cover?", "structura"),
    chips: [], // Populated dynamically via AI
    allowCustom: true,
    multiSelect: true,
  },
  {
    id: "content_types",
    question: __("What type of content works best for your audience?", "structura"),
    chips: [
      { label: __("How-to guides", "structura"), value: "how_to" },
      { label: __("Listicles & roundups", "structura"), value: "listicles" },
      { label: __("In-depth analysis", "structura"), value: "analysis" },
      { label: __("Comparisons & reviews", "structura"), value: "comparisons" },
      { label: __("Tutorials & walkthroughs", "structura"), value: "tutorials" },
      { label: __("Case studies", "structura"), value: "case_studies" },
    ],
    allowCustom: true,
    multiSelect: true,
  },
  {
    id: "differentiator",
    question: __("What makes your perspective unique?", "structura"),
    chips: [
      { label: __("Years of hands-on experience", "structura"), value: "experience" },
      { label: __("Data-driven insights", "structura"), value: "data_driven" },
      { label: __("Contrarian / fresh take", "structura"), value: "contrarian" },
      { label: __("Step-by-step practical advice", "structura"), value: "practical" },
      { label: __("Industry insider knowledge", "structura"), value: "insider" },
    ],
    allowCustom: true,
    multiSelect: true,
  },
];

/**
 * Dedupe the AI topic-chip batch into a stable display list. The topic
 * question gathers TOPIC SEEDS for keyword discovery — it is fed by the
 * AI `topic_chips` pass only, NOT the brand keyword bank (mixing final
 * keywords in conflated seeds with results). The optional `seedChips`
 * lead the list when supplied; the AI routinely re-suggests near-dupes,
 * so compare on label AND value (`wordpress_seo` collapses with a
 * "WordPress SEO" label). Exported for tests.
 */
export const mergeTopicChips = (
  seedChips: ChipOption[],
  aiChips: ChipOption[]
): ChipOption[] => {
  const seen = new Set(
    seedChips.flatMap((c) => [c.label.toLowerCase(), c.value])
  );
  const merged = [...seedChips];
  for (const chip of aiChips) {
    if (seen.has(chip.label.toLowerCase()) || seen.has(chip.value)) continue;
    seen.add(chip.label.toLowerCase());
    seen.add(chip.value);
    merged.push(chip);
  }
  return merged;
};

// ─── Component ──────────────────────────────────────────────────────────────

export const GuidedInterview = ({ onComplete }: GuidedInterviewProps) => {
  const { suggest, isSuggesting } = useMagicSuggest();
  const { formData, updateForm } = useCampaignForm();

  // Provider comes from campaign form — switching here persists across all steps
  const activeProvider = formData.intelligence.textProvider;
  const handleProviderChange = (p: AIProvider) => updateForm("intelligence", { textProvider: p });

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Map<string, InterviewAnswer[]>>(new Map());
  const [customInput, setCustomInput] = useState("");
  const [isCustomMode, setIsCustomMode] = useState(false);

  // AI-generated topic chips (loaded silently — no error toasts)
  const [topicChips, setTopicChips] = useState<ChipOption[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [topicsLoaded, setTopicsLoaded] = useState(false);

  // Track which provider was used for the last topic fetch so we can re-fetch on switch
  const [topicProvider, setTopicProvider] = useState<string | null>(null);

  // Pre-load AI topic chips silently (using apiFetch directly to avoid error toasts).
  // Re-fetches when the active provider changes.
  useEffect(() => {
    if (isLoadingTopics) return;
    if (topicProvider === activeProvider) return; // already fetched for this provider

    const loadTopics = async () => {
      setIsLoadingTopics(true);
      setTopicProvider(activeProvider);
      console.info("[Structura] Loading topic chips via provider:", activeProvider);
      try {
        const response: any = await apiFetch({
          path: "/structura/v1/suggest",
          method: "POST",
          data: {
            mode: "topic_chips",
            provider: activeProvider,
            context: [],
          },
        });
        const data = response?.result ?? response;
        let topics = data?.topics;
        if (typeof topics === "string") {
          try { topics = JSON.parse(topics); } catch { topics = null; }
        }
        if (Array.isArray(topics) && topics.length > 0) {
          setTopicChips(
            topics.map((t: { label: string; value: string }) => ({
              label: t.label,
              value: t.value,
            }))
          );
        }
      } catch (err) {
        console.warn("[Structura] Topic chip suggestion failed:", err);
      } finally {
        setIsLoadingTopics(false);
        setTopicsLoaded(true);
      }
    };

    loadTopics();
  }, [activeProvider]); // eslint-disable-line react-hooks/exhaustive-deps

  // The topic question gathers TOPIC SEEDS for keyword discovery, so it is
  // fed by the AI `topic_chips` pass only — deliberately NOT prefilled from
  // the brand keyword bank (`seoIntelSettings.targetKeywords`). Those are
  // final search terms, a different granularity than seeds, and mixing them
  // in made the step read like the Keywords step. Starts empty, fills in
  // when the AI pass (above) returns; merge is just intra-batch dedup.
  const topicQuestionChips = useMemo<ChipOption[]>(
    () => mergeTopicChips([], topicChips),
    [topicChips]
  );

  // Build the effective questions with dynamic topic chips
  const questions = useMemo(() => {
    return QUESTIONS.map((q) => {
      if (q.id === "topic" && topicQuestionChips.length > 0) {
        return { ...q, chips: topicQuestionChips };
      }
      return q;
    });
  }, [topicQuestionChips]);

  const question = questions[currentStep];
  const isLastQuestion = currentStep === questions.length - 1;
  const hasAnswer = answers.has(question?.id);

  const currentAnswers = useMemo(() => answers.get(question?.id) ?? [], [answers, question?.id]);

  const isChipSelected = useCallback(
    (value: string) => currentAnswers.some((a) => a.value === value),
    [currentAnswers]
  );

  // Custom answers are those not matching any predefined chip for the current question
  const customAnswers = useMemo(() => {
    const predefinedValues = new Set(question?.chips.map((c) => c.value) ?? []);
    return currentAnswers.filter((a) => !predefinedValues.has(a.value));
  }, [currentAnswers, question?.chips]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const selectChip = (chip: ChipOption) => {
    const qId = question.id;

    if (question.multiSelect) {
      setAnswers((prev) => {
        const next = new Map(prev);
        const existing = next.get(qId) ?? [];
        const isSelected = existing.some((a) => a.value === chip.value);

        if (isSelected) {
          next.set(
            qId,
            existing.filter((a) => a.value !== chip.value)
          );
        } else {
          next.set(qId, [...existing, { questionId: qId, label: chip.label, value: chip.value }]);
        }
        return next;
      });
    } else {
      setAnswers((prev) => {
        const next = new Map(prev);
        next.set(qId, [{ questionId: qId, label: chip.label, value: chip.value }]);
        return next;
      });
      setIsCustomMode(false);
      // Auto-advance for single-select questions — synchronously, not on a
      // timeout. The old 300ms delay painted a transient frame (checkmark
      // widens the chip → the row rewraps, and the Next button pops in)
      // that read as flicker before the step swapped. Advancing in the
      // same handler lets React batch both state updates into one render,
      // so that frame never exists; the picked answer stays visible in the
      // answered-questions summary under the next question.
      if (!isLastQuestion) {
        setCurrentStep((s) => s + 1);
      }
    }
  };

  const removeAnswer = (value: string) => {
    const qId = question.id;
    setAnswers((prev) => {
      const next = new Map(prev);
      const existing = next.get(qId) ?? [];
      const filtered = existing.filter((a) => a.value !== value);
      if (filtered.length > 0) {
        next.set(qId, filtered);
      } else {
        next.delete(qId);
      }
      return next;
    });
  };

  const submitCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;

    const qId = question.id;

    if (question.multiSelect) {
      setAnswers((prev) => {
        const next = new Map(prev);
        const existing = next.get(qId) ?? [];
        next.set(qId, [...existing, { questionId: qId, label: trimmed, value: trimmed }]);
        return next;
      });
    } else {
      setAnswers((prev) => {
        const next = new Map(prev);
        next.set(qId, [{ questionId: qId, label: trimmed, value: trimmed }]);
        return next;
      });
    }

    setCustomInput("");

    if (question.multiSelect) {
      // Keep custom mode open so user can add more answers
    } else {
      setIsCustomMode(false);
      // Synchronous advance — same flicker fix as selectChip above.
      if (!isLastQuestion) {
        setCurrentStep((s) => s + 1);
      }
    }
  };

  const handleCustomKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitCustom();
    }
    if (e.key === "Escape") {
      setIsCustomMode(false);
      setCustomInput("");
    }
  };

  const advance = () => {
    if (isLastQuestion) return;
    setCurrentStep((s) => s + 1);
    setIsCustomMode(false);
    setCustomInput("");
  };

  const goBack = () => {
    if (currentStep === 0) return;
    setCurrentStep((s) => s - 1);
    setIsCustomMode(false);
    setCustomInput("");
  };

  // ── Generate strategy from answers ──────────────────────────────────────

  const generateStrategy = async () => {
    // Bundle answers into structured context for the AI
    const context = Array.from(answers.entries()).map(([qId, ans]) => {
      const q = questions.find((qu) => qu.id === qId);
      return {
        title: q?.question ?? qId,
        url: "",
        content: ans.map((a) => a.label).join(", "),
      };
    });

    const data = await suggest("campaign", {
      provider: activeProvider,
      context,
    });

    if (data?.name && data?.strategy) {
      const validModes: CampaignMode[] = [
        "traffic_magnet",
        "quick_wins",
        "conversion",
        "authority",
      ];

      // Derive campaign mode from the goal answer if possible
      const goalAnswer = answers.get("goal")?.[0]?.value;
      const campaignMode = validModes.includes(goalAnswer as CampaignMode)
        ? (goalAnswer as CampaignMode)
        : data.campaign_mode && validModes.includes(data.campaign_mode as CampaignMode)
          ? (data.campaign_mode as CampaignMode)
          : undefined;

      // The picked topics become explicit keyword-discovery seeds — passed
      // through verbatim instead of being re-derived from the objective
      // prose the AI just wrote from them.
      const topics = (answers.get("topic") ?? [])
        .map((a) => a.label.trim())
        .filter(Boolean);

      onComplete({
        name: data.name,
        objective: data.strategy,
        campaignMode,
        ...(topics.length > 0 ? { topics } : {}),
      });
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  const allAnswered = questions.every((q) => {
    const ans = answers.get(q.id);
    return ans && ans.length > 0;
  });

  // Whether topic step is currently showing the blocking loading state.
  // Seeded keyword chips render immediately — the staged panel only
  // blocks when there's nothing at all to show while the AI pass runs.
  const isTopicLoading =
    question?.id === "topic" && isLoadingTopics && topicQuestionChips.length === 0;

  // Whether the AI pass is still appending on top of visible seed chips —
  // surfaced as a small inline hint instead of the blocking panel.
  const isTopicAppending =
    question?.id === "topic" && isLoadingTopics && topicQuestionChips.length > 0;

  // Whether topic step has no chips (loading failed or not yet loaded)
  const isTopicEmpty = question?.id === "topic" && question.chips.length === 0 && !isLoadingTopics;

  return (
    <div className="space-y-6">
      {/* Progress indicator + provider pill */}
      <div className="flex items-center gap-1">
        {questions.map((q, i) => (
          <button
            key={q.id}
            type="button"
            onClick={() => {
              // Only allow navigating to answered questions or the next unanswered one
              const firstUnanswered = questions.findIndex((q2) => !answers.has(q2.id));
              if (i <= currentStep || answers.has(q.id) || i === firstUnanswered) {
                setCurrentStep(i);
                setIsCustomMode(false);
                setCustomInput("");
              }
            }}
            className={cn(
              "h-1.5 flex-1 cursor-pointer rounded-full transition-all duration-300",
              i < currentStep
                ? "bg-brand-500 dark:bg-brand-400"
                : i === currentStep
                  ? "bg-brand-300 dark:bg-brand-600"
                  : answers.has(q.id)
                    ? "bg-brand-200 dark:bg-brand-800"
                    : "bg-neutral-200 dark:bg-neutral-700"
            )}
          />
        ))}
      </div>

      {/* Question card */}
      <div className="rounded-2xl border border-neutral-100 bg-white px-6 py-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        {/* Step counter + provider pill */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
            <MessageSquare size={12} />
            {sprintf(__("Question %d of %d", "structura"), currentStep + 1, questions.length)}
          </div>
          <ProviderPill
            provider={activeProvider}
            onProviderChange={handleProviderChange}
          />
        </div>

        {/* Question text */}
        <h3 className="mb-6 text-lg font-bold text-neutral-900 dark:text-white">
          {question?.question}
        </h3>

        {/* Topic loading state — staged progress so the wait shows
            real motion AND the copy doesn't reveal the mechanism
            (the previous static "Analyzing your site to suggest
            relevant topics…" leaked the flow to anyone watching). */}
        {isTopicLoading && (
          <MagicSuggestProgress
            isLoading
            variant="panel"
            className="mb-4"
          />
        )}

        {/* Chip options (predefined + custom inline) */}
        {(question?.chips.length > 0 || customAnswers.length > 0) && (
          <div className="mb-4 flex flex-wrap gap-2">
            {question.chips.map((chip) => {
              const selected = isChipSelected(chip.value);
              return (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => selectChip(chip)}
                  aria-pressed={selected}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200",
                    selected
                      ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-300 shadow-sm"
                      : "hover:border-brand-200 hover:bg-brand-50/50 hover:text-brand-700 dark:hover:border-brand-800 dark:hover:bg-brand-950/20 dark:hover:text-brand-300 border-neutral-200 bg-white text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  )}
                >
                  {/* The check's slot is always reserved — a conditionally
                      rendered icon widened the chip on selection, rewrapping
                      the whole row (the "jumping" in the 2026-06-06 screen
                      recording). It fades/scales in instead of reflowing. */}
                  <Check
                    size={14}
                    aria-hidden="true"
                    className={cn(
                      "shrink-0 transition-all duration-200",
                      selected ? "scale-100 opacity-100" : "scale-50 opacity-0"
                    )}
                  />
                  {chip.label}
                </button>
              );
            })}

            {/* Custom answers rendered inline as removable chips */}
            {customAnswers.map((a) => (
              <span
                key={a.value}
                className="inline-flex items-center gap-1.5 rounded-xl border border-brand-300 bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-700 shadow-sm dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
              >
                <Check size={14} className="shrink-0" />
                {a.label}
                <button
                  type="button"
                  onClick={() => removeAnswer(a.value)}
                  className="ml-0.5 shrink-0 cursor-pointer rounded-full p-0.5 text-brand-400 transition-colors hover:bg-brand-100 hover:text-red-500 dark:text-brand-500 dark:hover:bg-brand-900 dark:hover:text-red-400"
                >
                  <X size={12} />
                </button>
              </span>
            ))}

            {/* AI-generated badge for topic chips */}
            {question.id === "topic" && topicChips.length > 0 && (
              <span className="bg-brand-50 text-brand-500 dark:bg-brand-950/30 dark:text-brand-400 inline-flex items-center gap-1 self-center rounded-full px-2 py-0.5 text-[9px] font-bold">
                <Sparkles size={8} />
                {__("AI-suggested", "structura")}
              </span>
            )}

            {/* AI pass still appending on top of the seeded keyword chips */}
            {isTopicAppending && (
              <MagicSuggestProgress
                isLoading
                variant="inline"
                stages={[__("Suggesting more topics…", "structura")]}
                className="self-center"
              />
            )}
          </div>
        )}

        {/* Custom input toggle + field */}
        {question?.allowCustom && !isTopicLoading && (
          <div className="mt-3">
            {!isCustomMode && question.chips.length > 0 ? (
              <button
                type="button"
                onClick={() => setIsCustomMode(true)}
                className="hover:border-brand-300 hover:text-brand-600 dark:hover:border-brand-700 dark:hover:text-brand-400 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-neutral-300 px-4 py-2.5 text-sm text-neutral-500 transition-colors dark:border-neutral-600 dark:text-neutral-400"
              >
                <PenLine size={14} />
                {__("Type your own answer", "structura")}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <InputField
                    label={__("Your answer", "structura")}
                    hiddenLabel
                    autoFocus
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    onKeyDown={handleCustomKeyDown}
                    placeholder={
                      isTopicEmpty
                        ? __("e.g. WordPress performance optimization", "structura")
                        : question.chips.length === 0
                          ? __("Type your answer…", "structura")
                          : __("Type your own answer…", "structura")
                    }
                    rightAdornment={
                      <button
                        type="button"
                        onClick={submitCustom}
                        disabled={!customInput.trim()}
                        className={cn(
                          "flex items-center justify-center rounded-md p-1 transition-colors",
                          customInput.trim()
                            ? "text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/30 cursor-pointer"
                            : "text-neutral-300 dark:text-neutral-600"
                        )}
                      >
                        <Check size={14} />
                      </button>
                    }
                  />
                </div>
                {question.chips.length > 0 && (
                  <Button
                    size="sm"
                    variant="transparent"
                    onClick={() => {
                      setIsCustomMode(false);
                      setCustomInput("");
                    }}
                  >
                    {__("Cancel", "structura")}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        {currentStep > 0 ? (
          <Button variant="transparent" size="sm" onClick={goBack}>
            {__("Back", "structura")}
          </Button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-3">
          {hasAnswer && !isLastQuestion && (
            <Button onClick={advance}>
              {__("Next", "structura")}
              <ChevronRight size={16} className="ml-1" />
            </Button>
          )}

          {isLastQuestion && hasAnswer && (
            <div className="flex items-center gap-3">
              {/* While the cloud thinks, show what we're doing — vague
                  enough to keep the magic feeling magical, specific
                  enough that the spinner doesn't feel dead. */}
              <MagicSuggestProgress isLoading={isSuggesting} variant="inline" />
              <Button
                onClick={generateStrategy}
                disabled={!allAnswered || isSuggesting}
                className="from-brand-600 shadow-brand-600/20 bg-gradient-to-r to-purple-600 font-bold shadow-lg"
              >
                {isSuggesting ? (
                  <RefreshCw size={16} className="mr-2 animate-spin" />
                ) : (
                  <Wand2 size={16} className="mr-2" />
                )}
                {__("Generate Campaign Strategy", "structura")}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Answered questions preview */}
      {currentStep > 0 && (
        <div className="space-y-1">
          {questions.slice(0, currentStep).map((q) => {
            const ans = answers.get(q.id);
            if (!ans?.length) return null;
            // Multi-pick answers (5+ in the worst case) blow out the
            // two-column row — comma-joined they either truncate the
            // question or push it off-screen entirely. Render those as
            // wrapping chips below the question so the row grows
            // vertically instead. Single-pick stays inline so the
            // dropdown keeps its scannable rhythm.
            const isMulti = ans.length > 1;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  setCurrentStep(questions.indexOf(q));
                  setIsCustomMode(false);
                }}
                className="flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
              >
                {/* `mt-[3px]` keeps the check optically aligned with
                    the first line of question text once the row stacks
                    chips below — `items-center` would drift the icon
                    to the vertical centre of a tall block. */}
                <Check size={14} className="mt-[3px] shrink-0 text-emerald-500" />
                {isMulti ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      {q.question}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {ans.map((a, i) => (
                        <span
                          key={`${a.value}-${i}`}
                          className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                        >
                          {a.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {q.question}
                    </span>
                    <span className="shrink-0 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      {ans[0].label}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
