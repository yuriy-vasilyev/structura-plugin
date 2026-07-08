/**
 * Free-tier weekly cadence lock in `<ScheduleBuilder>` (the Manual
 * publishing-frequency picker).
 *
 * Confirms the create-flow behaviour the product spec turns on for Free:
 *   - DAILY is locked (disabled) — it's >1 post/week.
 *   - WEEKLY is single-select — picking a day replaces the selection, so
 *     the composed cron never carries more than one weekday.
 *   - A "Go Pro" CTA is shown.
 *   - Paid plans, and Free in EDIT mode, are unrestricted (edit defers to
 *     the grandfather-aware server gate).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

let mockIsPaidLicense = false;
vi.mock("@/features/settings", () => ({
  useLicense: () => ({ isPaidLicense: mockIsPaidLicense, plan: mockIsPaidLicense ? "cloud" : "free" }),
}));

const mockUpdateForm = vi.fn();
let mockIsCreate = true;
vi.mock("@/features/campaigns/context/CampaignContext", () => ({
  useCampaignForm: () => ({
    formData: { schedule: { cron: "" } },
    updateForm: mockUpdateForm,
    isCreate: mockIsCreate,
    mode: "campaign",
    isValid: () => true,
  }),
}));

// cronToHuman pulls in cronstrue + WP locale; parseCronForUi would hydrate
// state from an existing cron. Stub both — these tests drive the picker
// from its defaults, not from a hydrated cron.
vi.mock("@/utils/cronUtils", () => ({
  cronToHuman: () => "human schedule",
  parseCronForUi: () => null,
}));

vi.mock("../components/LocalTimeDisplay", () => ({
  LocalTimeDisplay: () => <span>local time</span>,
}));

import { ScheduleBuilder } from "../components/ScheduleBuilder";

/** Most recent cron string handed to updateForm("schedule", { cron }). */
function lastCron(): string | undefined {
  const calls = mockUpdateForm.mock.calls.filter(
    ([cluster, patch]) => cluster === "schedule" && typeof patch?.cron === "string",
  );
  return calls.length ? (calls[calls.length - 1][1].cron as string) : undefined;
}

/** Count of distinct weekdays in a `m h * * <dow>` cron. */
function weekdayCount(cron: string | undefined): number {
  if (!cron) return 0;
  const dow = cron.split(" ")[4] ?? "";
  if (dow === "*" || dow === "") return 0;
  return dow.split(",").length;
}

describe("ScheduleBuilder — Free weekly cadence lock (create flow)", () => {
  beforeEach(() => {
    mockUpdateForm.mockReset();
    mockIsPaidLicense = false;
    mockIsCreate = true;
  });
  afterEach(cleanup);

  it("locks the DAILY tab and shows a Go Pro CTA", () => {
    render(<ScheduleBuilder />);
    const daily = screen.getByRole("button", { name: /daily/i });
    expect(daily).toBeDisabled();
    expect(screen.getByText(/Go Pro for daily and Smart scheduling/i)).toBeInTheDocument();
  });

  it("composes a single-weekday cron and never more than one day", async () => {
    render(<ScheduleBuilder />);
    // Default lands on Weekly clamped to one day.
    await waitFor(() => expect(weekdayCount(lastCron())).toBe(1));

    // Picking another weekday replaces the selection (single-select).
    fireEvent.click(screen.getByRole("button", { name: "Wed" }));
    await waitFor(() => expect(weekdayCount(lastCron())).toBe(1));
    expect(lastCron()).toMatch(/^\d+ \d+ \* \* 3$/);
  });
});

describe("ScheduleBuilder — unrestricted cases", () => {
  beforeEach(() => {
    mockUpdateForm.mockReset();
  });
  afterEach(cleanup);

  it("leaves DAILY enabled and allows multi-day weekly for paid plans", async () => {
    mockIsPaidLicense = true;
    mockIsCreate = true;
    render(<ScheduleBuilder />);
    expect(screen.getByRole("button", { name: /daily/i })).not.toBeDisabled();
    expect(screen.queryByText(/Go Pro for daily/i)).not.toBeInTheDocument();
    // Paid default keeps the multi-day weekly preset.
    await waitFor(() => expect(weekdayCount(lastCron())).toBeGreaterThan(1));
  });

  it("does not lock Free users when editing an existing campaign", () => {
    mockIsPaidLicense = false;
    mockIsCreate = false; // edit flow → server gate handles grandfathering
    render(<ScheduleBuilder />);
    expect(screen.getByRole("button", { name: /daily/i })).not.toBeDisabled();
    expect(screen.queryByText(/Go Pro for daily/i)).not.toBeInTheDocument();
  });
});
