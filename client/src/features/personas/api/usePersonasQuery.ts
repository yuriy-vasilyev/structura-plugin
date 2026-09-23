import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { personaKeys } from "./keys";
import { Persona, WpUser } from "../types";
import { useLicense } from "@/features/settings/api/useLicense";

/**
 * Persona row enriched with the per-activation default-binding
 * count. Tolerates the legacy bare-array response shape so a stale
 * cloud during rollout doesn't break the SPA.
 */
export interface PersonaWithBinding extends Persona {
  boundActivationCount?: number;
}

interface CloudPersonasEnvelope {
  personas?: PersonaWithBinding[];
  defaultPersonaId?: string | null;
  memberPersonaIds?: string[];
}

async function fetchPersonas(): Promise<PersonaWithBinding[]> {
  const raw = await apiFetch<unknown>({ path: "/structura/v1/personas" });
  if (Array.isArray(raw)) return raw as PersonaWithBinding[];
  const env = raw as CloudPersonasEnvelope;
  return Array.isArray(env?.personas) ? env.personas : [];
}

async function fetchDefaultPersonaId(): Promise<string | null> {
  const raw = await apiFetch<unknown>({ path: "/structura/v1/personas" });
  if (Array.isArray(raw)) return null;
  const env = raw as CloudPersonasEnvelope;
  return env?.defaultPersonaId ?? null;
}

export const usePersonasQuery = () => {
  const { hasWorkspace } = useLicense();
  return useQuery({
    queryKey: personaKeys.lists(),
    queryFn: fetchPersonas,
    enabled: hasWorkspace === true,
    staleTime: 1000 * 60 * 5,
  });
};

/**
 * Per-site default persona id. Decoupled from `usePersonasQuery` so
 * the existing flat-array consumers don't need to change shape.
 */
export const useDefaultPersonaIdQuery = () => {
  const { hasWorkspace } = useLicense();
  return useQuery({
    queryKey: [...personaKeys.lists(), "default-binding"],
    queryFn: fetchDefaultPersonaId,
    enabled: hasWorkspace === true,
    staleTime: 1000 * 60 * 5,
  });
};

async function fetchMemberPersonaIds(): Promise<string[]> {
  const raw = await apiFetch<unknown>({ path: "/structura/v1/personas" });
  if (Array.isArray(raw)) return [];
  const env = raw as CloudPersonasEnvelope;
  return Array.isArray(env?.memberPersonaIds) ? env.memberPersonaIds : [];
}

/**
 * Persona ids bound to THIS site (per-site membership). Drives the wizard's
 * "writing for this site" vs bindable-library split. Decoupled from
 * `usePersonasQuery` so flat-array consumers keep their shape.
 */
export const useMemberPersonaIdsQuery = () => {
  const { hasWorkspace } = useLicense();
  return useQuery({
    queryKey: [...personaKeys.lists(), "memberships"],
    queryFn: fetchMemberPersonaIds,
    enabled: hasWorkspace === true,
    staleTime: 1000 * 60 * 5,
  });
};

/**
 * Personas that write for THIS site — the workspace library narrowed to the
 * activation's membership set, plus `selectedPersonaId` when the campaign
 * being edited names a voice the site never bound.
 *
 * Membership is what the cloud rotates over for "Random persona"
 * (`functions/src/scheduler/helpers.ts`), and the Personas page and the
 * onboarding wizard have split on it since 2026-07-03. The campaign and
 * Generate-post pickers kept offering the whole library, so on a workspace
 * running several sites every sibling's voice showed up in the dropdown
 * (2026-09-22).
 *
 * Two escape hatches, both deliberate:
 *   - An empty membership set falls back to the whole library. That is what
 *     the cloud resolver does for pre-membership activations, and it keeps
 *     an older site's picker usable instead of empty.
 *   - `selectedPersonaId` is appended when it is not a member, because live
 *     campaigns do name personas their site never bound. Dropping it would
 *     rewrite the campaign's voice to "random" on the next save.
 *
 * `isLoading` covers BOTH queries: rendering the options off a resolved
 * library while memberships are still in flight would flash the full list.
 */
export const useSitePersonasQuery = (selectedPersonaId?: string | number) => {
  const { data: library, isLoading: personasLoading } = usePersonasQuery();
  const { data: memberIds, isLoading: membersLoading } = useMemberPersonaIdsQuery();

  // Memoised so callers keep a stable array identity across renders — the
  // campaign forms build their `personaOptions` in a `useMemo` keyed on it.
  // Both inputs stay undefined (not a fresh `[]`) until their query lands,
  // or the memo would recompute on every render while loading.
  const data = useMemo(() => {
    const lib = library ?? [];
    const memberSet = new Set(memberIds ?? []);
    const members = lib.filter((p) => memberSet.has(String(p.id)));
    if (members.length === 0) return lib;
    if (selectedPersonaId != null && !memberSet.has(String(selectedPersonaId))) {
      const selected = lib.find((p) => String(p.id) === String(selectedPersonaId));
      if (selected) return [...members, selected];
    }
    return members;
  }, [library, memberIds, selectedPersonaId]);

  return { data, isLoading: personasLoading || membersLoading };
};

// Fetch WP Users (with longer cache)
export const useWpUsersQuery = () => {
  const { hasWorkspace } = useLicense();
  return useQuery({
    queryKey: personaKeys.users(),
    queryFn: () => apiFetch<WpUser[]>({ path: "/structura/v1/users" }),
    enabled: hasWorkspace === true,
    staleTime: 1000 * 60 * 60, // 1 hour
  });
};
