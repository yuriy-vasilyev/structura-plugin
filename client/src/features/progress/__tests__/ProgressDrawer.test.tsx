/**
 * ⚠️ REMOVED — the floating `ProgressDrawer` was retired in v1.5.
 *
 * The drawer's responsibilities were split into two surfaces: the
 * inline `CampaignRunProgress` strip (per-campaign originating card,
 * covered by `CampaignRunProgress.test.tsx`) and the app-root
 * `RunStatusToastHost` broadcaster (covered by
 * `useRunStatusToasts.test.tsx`). See `../components/ProgressDrawer.tsx`
 * for the longer rationale.
 *
 * This test file only survives because our session can't delete
 * filesystem entries. Vitest still collects it; we keep one trivial
 * assertion so the runner doesn't complain about an empty spec file.
 */

import { describe, expect, it } from "vitest";

describe("ProgressDrawer (removed)", () => {
  it("has been replaced by CampaignRunProgress + RunStatusToastHost", () => {
    expect(true).toBe(true);
  });
});
