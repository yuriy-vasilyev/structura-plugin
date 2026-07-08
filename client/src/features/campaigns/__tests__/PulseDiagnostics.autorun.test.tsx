/**
 * PulseDiagnostics — autoRun.
 *
 * The "cloud can't reach this site" admin notice deep-links to
 * `#/settings?run=connection-check`, and Settings passes `autoRun` so the
 * pulse check (which re-probes cloud→site reachability) fires on landing
 * instead of the user having to find + click it. Pins: fires exactly once
 * on mount when autoRun + a cloud workspace are present, and not otherwise.
 *
 * Gate changed 2026-07-08 from `license.license_key` to `hasWorkspace` so
 * anonymous/"none" installs (no license key, but a bootstrapped workspace)
 * can run diagnostics too.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const pulseMock = vi.hoisted(() => ({
  current: { mutate: vi.fn(), isPending: false, status: "idle" as string },
}));
const licenseMock = vi.hoisted(() => ({
  current: { hasWorkspace: true } as { hasWorkspace: boolean | null },
}));

vi.mock("@wordpress/i18n", () => ({ __: (t: string) => t }));
vi.mock("../api/usePulseCheck", () => ({
  usePulseCheck: () => pulseMock.current,
}));
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => licenseMock.current,
}));
vi.mock("@wordpress/api-fetch", () => ({ default: vi.fn() }));
vi.mock("@structura/ui", () => ({
  Button: (p: Record<string, unknown>) => <button {...p} />,
  Card: (p: Record<string, unknown>) => <div {...p} />,
  cn: (...a: unknown[]) => a.filter(Boolean).join(" "),
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { PulseDiagnostics } from "../components/PulseDiagnostics";

beforeEach(() => {
  pulseMock.current = { mutate: vi.fn(), isPending: false, status: "idle" };
  licenseMock.current = { hasWorkspace: true };
});

describe("PulseDiagnostics — autoRun", () => {
  it("fires the pulse check once on mount when autoRun + a workspace present", () => {
    render(<PulseDiagnostics autoRun />);
    expect(pulseMock.current.mutate).toHaveBeenCalledTimes(1);
  });

  it("fires for an anonymous/'none' install (workspace, no license key)", () => {
    // Regression (2026-07-08): the old license-key gate left Bridge
    // Diagnostics disabled for anonymous installs even though they run
    // cloud generation over the same handshake.
    licenseMock.current = { hasWorkspace: true };
    render(<PulseDiagnostics autoRun />);
    expect(pulseMock.current.mutate).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire when autoRun is not set", () => {
    render(<PulseDiagnostics />);
    expect(pulseMock.current.mutate).not.toHaveBeenCalled();
  });

  it("does NOT fire without a workspace (unconfigured install)", () => {
    licenseMock.current = { hasWorkspace: false };
    render(<PulseDiagnostics autoRun />);
    expect(pulseMock.current.mutate).not.toHaveBeenCalled();
  });
});
