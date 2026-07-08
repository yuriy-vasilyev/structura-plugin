/**
 * Public exports for the onboarding wizard feature.
 *
 * Plan: `/Users/yuriyvasilyev/.claude/plans/valiant-juggling-kazoo.md`.
 */

export { OnboardingPage } from "./routes/OnboardingPage";
export { OnboardingAutoRedirectBridge } from "./components/OnboardingAutoRedirectBridge";
export { OnboardingResumeTile } from "./components/OnboardingResumeTile";
export { RestartWizardCard } from "./components/RestartWizardCard";
export { PositioningCard } from "./components/PositioningCard";
export { DowngradeBanner } from "./components/DowngradeBanner";
export { useWizardStateQuery } from "./api/useOnboardingState";
export {
  useWizardPositioningQuery,
  useSuggestWizardKeywordsMutation,
  useSuggestWizardCompetitorsMutation,
} from "./api/useWizardSeo";
export type { SuggestedKeyword, SuggestedCompetitor } from "./api/useWizardSeo";
export type { WizardState, WizardStepId } from "./api/types";
