import { createContext, useContext } from "react";

/** Selection state a `PresetRadioCardGroup` shares with the radio cards inside it. */
export type PresetRadioCardGroupContextValue = {
  /** Value of the checked card, or `undefined` when no card is checked. */
  value?: string;
  /** Selects a card by value. */
  onValueChange: (value: string) => void;
};

/**
 * Context behind `PresetRadioCardGroup`. Internal: `PresetRadioCard` and
 * `SignatureCard` read it; the package barrel does not export this module.
 */
export const PresetRadioCardGroupContext = createContext<PresetRadioCardGroupContextValue | null>(
  null
);

/** Returns the enclosing group's selection state; throws, naming `component`, outside a group. */
export function usePresetRadioCardGroupContext(
  component: string
): PresetRadioCardGroupContextValue {
  const context = useContext(PresetRadioCardGroupContext);
  if (!context) {
    throw new Error(`${component} must be used within a PresetRadioCardGroup.`);
  }
  return context;
}
