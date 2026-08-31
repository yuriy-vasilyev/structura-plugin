/**
 * WizardStep5Persona — auto-draft gating.
 *
 * Personas are workspace-shared, so a fresh site seeds its OWN starting
 * voice regardless of the existing library — once per onboarding, gated by
 * the store's `personaSeeded` flag (a reload can't duplicate it). The draft
 * still fires ONLY after the personas query has SUCCESSFULLY resolved: a
 * disabled (workspace gate unsettled) or errored query reads as "zero
 * personas" and must not draft.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({ __: (text: string) => text }));

const personasQueryMock = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));
const memberIdsMock = vi.hoisted(() => ({ current: [] as string[] }));
const suggestMock = vi.hoisted(() => ({ fn: vi.fn() }));
const savePersonaMock = vi.hoisted(() => ({ fn: vi.fn() }));
const addMembershipMock = vi.hoisted(() => ({ fn: vi.fn() }));
// Tier is varied per test: paid + provider = AI draft; non-AI tiers
// (none/free/BYOK-no-provider) bind the seeded House voice instead.
const licenseMock = vi.hoisted(() => ({
  current: { plan: "cloud", isPaidLicense: true } as Record<string, unknown>,
}));
const providersMock = vi.hoisted(() => ({
  current: { defaultTextProvider: "openai" } as Record<string, unknown>,
}));

vi.mock("@/features/settings", () => ({
  useLicense: () => licenseMock.current,
  useDefaultProviders: () => providersMock.current,
}));
vi.mock("@/hooks/useMagicSuggest", () => ({
  useMagicSuggest: () => ({ suggest: suggestMock.fn, isSuggesting: false }),
}));
vi.mock("@/features/personas", () => ({
  PersonaManager: () => <div>persona-manager</div>,
  usePersonasQuery: () => personasQueryMock.current,
  useMemberPersonaIdsQuery: () => ({
    data: memberIdsMock.current,
    isLoading: false,
  }),
  useWpUsersQuery: () => ({ data: [{ id: 7 }] }),
}));
vi.mock("@/features/personas/api/usePersonaMutations", () => ({
  usePersonaMutations: () => ({
    savePersona: savePersonaMock.fn,
    addMembership: addMembershipMock.fn,
    removeMembership: vi.fn(),
    isBinding: false,
  }),
}));
vi.mock("../api/useWizardSeo", () => ({
  useWizardPositioningQuery: () => ({ data: undefined }),
}));

import { WizardStep5Persona } from "../components/WizardStep5Persona";
import { useWizardStore } from "../state/wizardStore";

beforeEach(() => {
  useWizardStore.getState().reset();
  memberIdsMock.current = [];
  licenseMock.current = { plan: "cloud", isPaidLicense: true };
  providersMock.current = { defaultTextProvider: "openai" };
  suggestMock.fn.mockReset();
  savePersonaMock.fn.mockReset();
  addMembershipMock.fn.mockReset();
  addMembershipMock.fn.mockResolvedValue({ success: true });
});

describe("WizardStep5Persona — auto-draft gating", () => {
  it("does NOT auto-draft while the query is disabled/unsettled (data undefined, not loading)", async () => {
    // The exact shape of a disabled query: no data, isLoading false,
    // isSuccess false. Pre-fix this fired the duplicate draft.
    personasQueryMock.current = {
      data: undefined,
      isLoading: false,
      isSuccess: false,
    };
    render(<WizardStep5Persona />);

    await waitFor(() =>
      expect(screen.getByText("persona-manager")).toBeInTheDocument(),
    );
    expect(suggestMock.fn).not.toHaveBeenCalled();
    expect(savePersonaMock.fn).not.toHaveBeenCalled();
  });

  it("seeds a site voice and binds it even when the workspace library already has personas", async () => {
    // Personas are workspace-shared — a fresh site still gets its OWN voice,
    // and that voice is BOUND to the site (membership), not left as another
    // unbound library row.
    personasQueryMock.current = {
      data: [{ id: "p1", name: "House voice" }],
      isLoading: false,
      isSuccess: true,
    };
    suggestMock.fn.mockResolvedValue({
      name: "Site Voice",
      system_prompt: "x",
      tone: "professional",
      reading_level: "grade_8",
    });
    savePersonaMock.fn.mockResolvedValue({ success: true, id: "seed1" });
    render(<WizardStep5Persona />);

    await waitFor(() => expect(savePersonaMock.fn).toHaveBeenCalledTimes(1));
    // The seeded persona is bound to this site.
    await waitFor(() =>
      expect(addMembershipMock.fn).toHaveBeenCalledWith("seed1"),
    );
    // A shared library that isn't bound here does NOT make the step valid —
    // validity is per-site membership now (memberIds is empty in this mock).
    expect(useWizardStore.getState().stepValidity[5]).toBe(false);
  });

  it("does NOT re-draft when a voice was already seeded this onboarding", async () => {
    useWizardStore.getState().setPersonaSeeded(true);
    personasQueryMock.current = {
      data: [{ id: "p1", name: "House voice" }],
      isLoading: false,
      isSuccess: true,
    };
    render(<WizardStep5Persona />);

    await waitFor(() =>
      expect(screen.getByText("persona-manager")).toBeInTheDocument(),
    );
    expect(suggestMock.fn).not.toHaveBeenCalled();
  });

  it("auto-drafts exactly once on a CONFIRMED empty library", async () => {
    personasQueryMock.current = {
      data: [],
      isLoading: false,
      isSuccess: true,
    };
    suggestMock.fn.mockResolvedValue({
      name: "Pragmatic Founder",
      system_prompt: "Write like a hands-on founder.",
      tone: "professional",
      reading_level: "grade_8",
    });
    savePersonaMock.fn.mockResolvedValue({ success: true, id: "seed1" });
    render(<WizardStep5Persona />);

    await waitFor(() => expect(savePersonaMock.fn).toHaveBeenCalledTimes(1));
    expect(savePersonaMock.fn).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Pragmatic Founder", author_id: 7 }),
    );
    // Seeded voice is bound to this site so it joins campaign rotation.
    await waitFor(() =>
      expect(addMembershipMock.fn).toHaveBeenCalledWith("seed1"),
    );
  });
});

describe("WizardStep5Persona — non-AI tier House-voice binding", () => {
  // Regression (2026-07-20): on none/free tiers the plugin-seeded "House
  // voice" landed in the workspace library UNBOUND, leaving an empty "no
  // voice writing for this site" dropzone next to a lone bindable card — and
  // blocking Finish (validity = a bound member). Bind it automatically.
  it("binds the seeded House voice on a none tier (no AI draft)", async () => {
    licenseMock.current = { plan: "none", isPaidLicense: false };
    providersMock.current = { defaultTextProvider: null };
    personasQueryMock.current = {
      data: [{ id: "hv1", name: "House voice" }],
      isLoading: false,
      isSuccess: true,
    };
    memberIdsMock.current = [];
    render(<WizardStep5Persona />);

    await waitFor(() =>
      expect(addMembershipMock.fn).toHaveBeenCalledWith("hv1"),
    );
    // A non-AI tier never drafts a voice.
    expect(suggestMock.fn).not.toHaveBeenCalled();
    expect(savePersonaMock.fn).not.toHaveBeenCalled();
  });

  it("binds the seeded House voice on the free tier too", async () => {
    licenseMock.current = { plan: "free", isPaidLicense: false };
    providersMock.current = { defaultTextProvider: null };
    personasQueryMock.current = {
      data: [{ id: "hv9", name: "House voice" }],
      isLoading: false,
      isSuccess: true,
    };
    memberIdsMock.current = [];
    render(<WizardStep5Persona />);

    await waitFor(() =>
      expect(addMembershipMock.fn).toHaveBeenCalledWith("hv9"),
    );
    expect(suggestMock.fn).not.toHaveBeenCalled();
  });

  it("does NOT re-bind when a voice already writes for this site", async () => {
    // The user (or an earlier auto-bind) already bound one — respect it.
    licenseMock.current = { plan: "free", isPaidLicense: false };
    providersMock.current = { defaultTextProvider: null };
    personasQueryMock.current = {
      data: [{ id: "hv1", name: "House voice" }],
      isLoading: false,
      isSuccess: true,
    };
    memberIdsMock.current = ["hv1"];
    render(<WizardStep5Persona />);

    await waitFor(() =>
      expect(screen.getByText("persona-manager")).toBeInTheDocument(),
    );
    expect(addMembershipMock.fn).not.toHaveBeenCalled();
  });

  it("does not bind before the async seed lands (empty library)", async () => {
    // License_Manager POSTs the House voice to the cloud asynchronously; the
    // library can be momentarily empty. Don't bind nothing — wait for it.
    licenseMock.current = { plan: "none", isPaidLicense: false };
    providersMock.current = { defaultTextProvider: null };
    personasQueryMock.current = {
      data: [],
      isLoading: false,
      isSuccess: true,
    };
    memberIdsMock.current = [];
    render(<WizardStep5Persona />);

    await waitFor(() =>
      expect(screen.getByText("persona-manager")).toBeInTheDocument(),
    );
    expect(addMembershipMock.fn).not.toHaveBeenCalled();
  });
});
