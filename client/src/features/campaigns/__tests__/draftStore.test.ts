/**
 * Tests for the persisted-draft store that backs the New Campaign wizard.
 *
 * What's worth pinning:
 *   - `lastUpdatedAt` sentinel — null = "untouched draft, free for the
 *     license-defaults bootstrap to overwrite"; non-null = "user has
 *     typed, hands off". Every mutation that should count as user
 *     intent must flip it.
 *   - Per-site keying — agencies hop between WP installs in tabs;
 *     site A's draft must not appear on site B.
 *   - Version migration — when the form schema changes incompatibly
 *     the store discards stale persisted state instead of crashing.
 *   - `discardDraft()` actually wipes localStorage, not just memory.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CAMPAIGN_DRAFT_STORE_VERSION,
  __getCampaignDraftStorageKey,
  useCampaignDraftStore,
} from "../context/draftStore";
import { DEFAULT_CAMPAIGN_FORM_DATA } from "../constants";

const resetStore = () => {
  useCampaignDraftStore.setState({
    formData: DEFAULT_CAMPAIGN_FORM_DATA,
    activeStep: "interview",
    completedSteps: [],
    skippedSteps: [],
    lastUpdatedAt: null,
  });
};

beforeEach(() => {
  localStorage.clear();
  resetStore();
});

afterEach(() => {
  localStorage.clear();
  resetStore();
});

describe("draftStore — initial state", () => {
  it("starts with default form data and a null lastUpdatedAt sentinel", () => {
    const { formData, lastUpdatedAt, completedSteps, skippedSteps, activeStep } =
      useCampaignDraftStore.getState();
    expect(formData).toEqual(DEFAULT_CAMPAIGN_FORM_DATA);
    expect(lastUpdatedAt).toBeNull();
    expect(completedSteps).toEqual([]);
    expect(skippedSteps).toEqual([]);
    expect(activeStep).toBe("interview");
  });
});

describe("draftStore — touched semantics", () => {
  it("updateForm flips lastUpdatedAt to a non-null timestamp", () => {
    useCampaignDraftStore.getState().updateForm("identity", { name: "My Campaign" });
    const { formData, lastUpdatedAt } = useCampaignDraftStore.getState();
    expect(formData.identity.name).toBe("My Campaign");
    expect(lastUpdatedAt).not.toBeNull();
    // ISO 8601 sanity check
    expect(new Date(lastUpdatedAt!).toString()).not.toBe("Invalid Date");
  });

  it("replaceForm with markTouched:false keeps lastUpdatedAt null (license-bootstrap path)", () => {
    const before = useCampaignDraftStore.getState().lastUpdatedAt;
    useCampaignDraftStore.getState().replaceForm(DEFAULT_CAMPAIGN_FORM_DATA, { markTouched: false });
    expect(useCampaignDraftStore.getState().lastUpdatedAt).toBe(before);
  });

  it("replaceForm without options touches the draft (default behavior)", () => {
    useCampaignDraftStore.getState().replaceForm(DEFAULT_CAMPAIGN_FORM_DATA);
    expect(useCampaignDraftStore.getState().lastUpdatedAt).not.toBeNull();
  });

  it("markComplete deduplicates entries and touches the draft", () => {
    const { markComplete } = useCampaignDraftStore.getState();
    markComplete("interview");
    markComplete("interview");
    expect(useCampaignDraftStore.getState().completedSteps).toEqual(["interview"]);
    expect(useCampaignDraftStore.getState().lastUpdatedAt).not.toBeNull();
  });

  it("clearStepFlag wipes the step from BOTH completed and skipped lists", () => {
    const s = useCampaignDraftStore.getState();
    s.markComplete("interview");
    s.markSkipped("interview");
    expect(useCampaignDraftStore.getState().completedSteps).toContain("interview");
    expect(useCampaignDraftStore.getState().skippedSteps).toContain("interview");

    useCampaignDraftStore.getState().clearStepFlag("interview");
    expect(useCampaignDraftStore.getState().completedSteps).not.toContain("interview");
    expect(useCampaignDraftStore.getState().skippedSteps).not.toContain("interview");
  });
});

describe("draftStore — discardDraft", () => {
  it("resets in-memory state to the initial values", () => {
    const s = useCampaignDraftStore.getState();
    s.updateForm("identity", { name: "Half-finished" });
    s.markComplete("interview");
    s.setActiveStep("strategy");

    useCampaignDraftStore.getState().discardDraft();

    const after = useCampaignDraftStore.getState();
    expect(after.formData).toEqual(DEFAULT_CAMPAIGN_FORM_DATA);
    expect(after.completedSteps).toEqual([]);
    expect(after.activeStep).toBe("interview");
    expect(after.lastUpdatedAt).toBeNull();
  });

  it("removes the persisted entry from localStorage", async () => {
    const key = __getCampaignDraftStorageKey();
    useCampaignDraftStore.getState().updateForm("identity", { name: "Wipe me" });
    // The persist middleware writes asynchronously — flush microtasks.
    await Promise.resolve();
    expect(localStorage.getItem(key)).not.toBeNull();

    useCampaignDraftStore.getState().discardDraft();
    await Promise.resolve();

    expect(localStorage.getItem(key)).toBeNull();
  });
});

describe("draftStore — persist round-trip", () => {
  it("writes a versioned envelope to localStorage on mutation", async () => {
    const key = __getCampaignDraftStorageKey();
    useCampaignDraftStore.getState().updateForm("identity", { name: "Persisted" });
    await Promise.resolve();

    const raw = localStorage.getItem(key);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    // Zustand wraps state in `{ state, version }`.
    expect(parsed.version).toBe(CAMPAIGN_DRAFT_STORE_VERSION);
    expect(parsed.state.formData.identity.name).toBe("Persisted");
    expect(parsed.state.lastUpdatedAt).not.toBeNull();
  });

  it("uses a per-activation storage key (activation_id discriminator)", () => {
    const prev = window.structuraConfig;
    window.structuraConfig = {
      ...(prev ?? ({} as Window["structuraConfig"])),
      activation_id: "act-abc123",
      domain: "example.test",
    };
    expect(__getCampaignDraftStorageKey()).toBe(
      "structura-campaign-draft:act-abc123",
    );
    window.structuraConfig = prev;
  });
});
