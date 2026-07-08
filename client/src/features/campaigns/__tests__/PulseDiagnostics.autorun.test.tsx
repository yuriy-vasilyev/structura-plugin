/**
 * PulseDiagnostics — autoRun.
 *
 * The "cloud can't reach this site" admin notice deep-links to
 * `#/settings?run=connection-check`, and Settings passes `autoRun` so the
 * pulse check (which re-probes cloud→site reachability) fires on landing
 * instead of the user having to find + click it. Pins: fires exactly once
 * on mount when autoRun + a license are present, and not otherwise.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const pulseMock = vi.hoisted(() => ({
  current: { mutate: vi.fn(), isPending: false, status: "idle" as string },
}));
const licenseMock = vi.hoisted(() => ({
  current: { license: { license_key: "lic-123" } } as {
    license: { license_key: string } | null;
  },
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
  licenseMock.current = { license: { license_key: "lic-123" } };
});

describe("PulseDiagnostics — autoRun", () => {
  it("fires the pulse check once on mount when autoRun + license present", () => {
    render(<PulseDiagnostics autoRun />);
    expect(pulseMock.current.mutate).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire when autoRun is not set", () => {
    render(<PulseDiagnostics />);
    expect(pulseMock.current.mutate).not.toHaveBeenCalled();
  });

  it("does NOT fire without a license key", () => {
    licenseMock.current = { license: { license_key: "" } };
    render(<PulseDiagnostics autoRun />);
    expect(pulseMock.current.mutate).not.toHaveBeenCalled();
  });
});
