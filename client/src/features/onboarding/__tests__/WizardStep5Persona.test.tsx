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

vi.mock("@/features/settings", () => ({
  useLicense: () => ({ plan: "cloud", isPaidLicense: true }),
  useDefaultProviders: () => ({ defaultTextProvider: "openai" }),
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
