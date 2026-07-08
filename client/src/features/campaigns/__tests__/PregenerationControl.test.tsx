/**
 * Tests for `<PregenerationControl>` (Phase 1.6).
 *
 * The component branches on plan tier:
 *   - Pro / BYOK → live toggle (user opts in or out).
 *   - Free      → locked Pro-pill surface, no toggle. Pre-gen depends
 *                 on the keyword bank (Pro-locked too); a live toggle
 *                 would do nothing visible since the cloud refill
 *                 silently skips with `keyword_bank_empty`.
 *   - Managed (Cloud / Agency) → static info banner, no toggle.
 *
 * If the branch breaks, the wrong audience either gets a no-op toggle
 * (Free) or loses the opt-out (Pro/BYOK), or sees a toggle for a
 * feature their pricing already promises (managed).
 *
 * What this suite pins:
 *   - Free renders a Pro-locked surface + NO toggle.
 *   - BYOK renders the toggle + copy + the onChange callback.
 *   - Managed renders the static banner with no toggle.
 *   - The `enabled` prop drives the toggle's checked state on BYOK.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const useLicenseMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/settings", () => ({
  useLicense: useLicenseMock,
}));

import { PregenerationControl } from "../components/PregenerationControl";

function setPlan(plan: string) {
  // `isPaidLicense` mirrors the real hook: paid for byok / cloud /
  // cloud_pro, false for free / none. The component reads both fields,
  // so they must move together.
  const paid = ["byok", "cloud", "cloud_pro"].includes(plan);
  useLicenseMock.mockReturnValue({ plan, isPaidLicense: paid });
}

describe("<PregenerationControl> — Free locked branch", () => {
  it("renders a locked Pro surface for free tier (no toggle)", () => {
    setPlan("free");
    render(<PregenerationControl enabled onChange={() => undefined} />);
    expect(screen.getByText(/Pre-generate posts ahead of schedule/i)).toBeInTheDocument();
    // The Pro pill must be present so the user understands the gate.
    expect(screen.getByText(/^Pro$/)).toBeInTheDocument();
    // No toggle on Free — the value is irrelevant because the cloud
    // can't refill stock without a keyword bank anyway.
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("does NOT call onChange on Free (no interactive control)", () => {
    setPlan("free");
    const onChange = vi.fn();
    render(<PregenerationControl enabled onChange={onChange} />);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("<PregenerationControl> — BYOK toggle branch", () => {
  it("renders the toggle for the pro tier", () => {
    setPlan("byok");
    render(<PregenerationControl enabled onChange={() => undefined} />);
    expect(screen.getByText(/Pre-generate posts ahead of schedule/i)).toBeInTheDocument();
    // Description copy mentions the cost saving — load-bearing for the
    // user's mental model of why they'd toggle this on.
    expect(screen.getByText(/50% on AI costs/i)).toBeInTheDocument();
  });

  it("calls onChange when the user flips the toggle", () => {
    setPlan("byok");
    const onChange = vi.fn();
    render(<PregenerationControl enabled onChange={onChange} />);
    // Headless UI Switch is a button with role=switch; clicking flips it.
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("reflects enabled=false on the toggle's aria-checked", () => {
    setPlan("byok");
    render(<PregenerationControl enabled={false} onChange={() => undefined} />);
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });
});

describe("<PregenerationControl> — managed-tier banner branch", () => {
  it("renders the info banner for cloud tier (no toggle)", () => {
    setPlan("cloud");
    render(<PregenerationControl enabled onChange={() => undefined} />);
    expect(screen.getByText(/Instant publishes are on/i)).toBeInTheDocument();
    expect(screen.getByText(/Run Now still generates fresh on demand/i)).toBeInTheDocument();
    // Critically — no role=switch in this branch. Managed-tier users
    // can't opt out; the banner just explains the behavior.
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("renders the banner for agency tier (no toggle)", () => {
    setPlan("cloud_pro");
    render(<PregenerationControl enabled onChange={() => undefined} />);
    expect(screen.getByText(/Instant publishes are on/i)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("does NOT call onChange when the banner is rendered (no interactive control)", () => {
    setPlan("cloud");
    const onChange = vi.fn();
    render(<PregenerationControl enabled onChange={onChange} />);
    // No way to flip the value — confirm via the absence of the
    // switch role + that no spurious effects ran.
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
