import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { campaignKeys } from "./keys";
import { AIProvider } from "@/features/campaigns/types";

/** One AI-suggested topic seed for the interview's topic question. */
export interface TopicChip {
  label: string;
  value: string;
}

interface SuggestEnvelope {
  result?: { topics?: TopicChip[] | string };
  topics?: TopicChip[] | string;
}

/**
 * The cloud occasionally hands the topic list back as a JSON string rather
 * than an array (model output passed through verbatim).
 */
function readTopics(raw: unknown): TopicChip[] {
  const envelope = raw as SuggestEnvelope;
  const data = envelope?.result ?? envelope;
  let topics = data?.topics;
  if (typeof topics === "string") {
    try {
      topics = JSON.parse(topics) as TopicChip[];
    } catch {
      return [];
    }
  }
  return Array.isArray(topics)
    ? topics.map((t) => ({ label: t.label, value: t.value }))
    : [];
}

/**
 * AI topic seeds for the interview's topic question.
 *
 * A cached query rather than a fire-on-mount effect: the Interview step
 * unmounts whenever the wizard moves to another step, so the old effect
 * re-ran the whole site analysis every time the user stepped back to it
 * (2026-09-22). Keyed by provider, so switching the campaign's text
 * provider still buys a fresh batch from the new model.
 *
 * Errors are left to the caller to ignore — the step degrades to
 * type-your-own topics and never toasts.
 */
export const useTopicChipsQuery = (provider: AIProvider, enabled: boolean) =>
  useQuery({
    queryKey: campaignKeys.topicChips(provider),
    queryFn: async (): Promise<TopicChip[]> =>
      readTopics(
        await apiFetch({
          path: "/structura/v1/suggest",
          method: "POST",
          data: { mode: "topic_chips", provider, context: [] },
        })
      ),
    enabled,
    // Seeds are inspiration, not data that goes stale: never refetch on a
    // remount, a window focus or a reconnect — each one is an AI call. A
    // failed pass is the exception; that one retries when the user returns.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
