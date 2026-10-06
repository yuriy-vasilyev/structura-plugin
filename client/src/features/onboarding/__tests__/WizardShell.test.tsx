/**
 * WizardShell — dark-mode logo swap survives wp-admin's `.hidden`.
 *
 * Regression (2026-10-06): the mono logo's wrapper used `hidden
 * dark:contents`. WordPress core's unlayered `.hidden { display: none }`
 * beats Tailwind's layered `dark:contents`, so the dark header showed no
 * logo. Same bug that hid the AI badge on the Visuals page on 2026-10-05;
 * the fix is the repo's `s-hidden` utility.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

vi.mock("@wordpress/api-fetch", () => ({ default: vi.fn().mockResolvedValue({}) }));

import { WizardShell } from "../components/WizardShell";

describe("WizardShell header logo (2026-10-06 wp-admin .hidden)", () => {
  it("hides the dark-mode logo with s-hidden, never wp-admin's .hidden", () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <WizardShell activeStep={1} completedSteps={[]} skippedSteps={[]}>
            <div />
          </WizardShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const darkLogo = document.body.querySelector('[class~="dark:contents"]');
    expect(darkLogo).not.toBeNull();
    const cls = darkLogo!.getAttribute("class") ?? "";
    expect(cls).toContain("s-hidden");
    expect(cls).not.toMatch(/(^|\s)hidden(\s|$)/);
  });
});
