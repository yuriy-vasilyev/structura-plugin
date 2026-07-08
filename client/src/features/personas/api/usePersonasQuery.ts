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
