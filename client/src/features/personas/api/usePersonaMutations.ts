import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { __ } from "@wordpress/i18n";
import { toast } from "@structura/ui";
import { personaKeys } from "./keys";
import { Persona } from "../types";

export const usePersonaMutations = () => {
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: personaKeys.lists() });

  // 1. Save/Update Persona
  const saveMutation = useMutation({
    mutationFn: (persona: Persona) =>
      apiFetch({ path: "/structura/v1/personas", method: "POST", data: persona }),
    onSuccess: () => {
      toast.success(__("Persona configuration saved.", "structura"));
      invalidate();
    },
  });

  // 2. Delete Persona
  // 2026-05-01 — id widened to `number | string` because cloud
  // personas use nanoid string ids; legacy WP personas use numeric
  // post ids. The plugin REST handler accepts both shapes.
  const deleteMutation = useMutation({
    mutationFn: (id: number | string) =>
      apiFetch({ path: "/structura/v1/personas/delete", method: "POST", data: { id } }),
    onSuccess: () => {
      toast.success(__("Persona removed.", "structura"));
      invalidate();
    },
    // We can still override the global error handler for specific logic
    onError: () => {
      toast.error(__("Cannot delete the primary architect.", "structura"));
    },
  });

  // 3. Fork persona — clones into a new doc; caller may rebind via
  //    setDefaultPersona afterwards.
  const forkMutation = useMutation({
    mutationFn: ({ id, label_suffix }: { id: string; label_suffix?: string }) =>
      apiFetch<{ success: true; persona: Persona }>({
        path: `/structura/v1/personas/${encodeURIComponent(id)}/fork`,
        method: "POST",
        data: label_suffix ? { label_suffix } : {},
      }),
    onSuccess: () => {
      toast.success(__("Persona forked for this site.", "structura"));
      invalidate();
    },
  });

  // 4. Set or clear this site's default-persona binding.
  const setDefaultMutation = useMutation({
    mutationFn: (personaId: string | null) =>
      apiFetch<{ success: true; defaultPersonaId: string | null }>({
        path: "/structura/v1/personas/set-default",
        method: "POST",
        data: { persona_id: personaId },
      }),
    onSuccess: () => {
      toast.success(__("Default persona updated for this site.", "structura"));
      invalidate();
    },
  });

  // 5/6. Bind / unbind a workspace persona to THIS site (membership). The
  // site's bound set is what campaign "random per post" rotation uses.
  const addMembershipMutation = useMutation({
    mutationFn: (personaId: string) =>
      apiFetch<{ success: true }>({
        path: "/structura/v1/personas/membership/add",
        method: "POST",
        data: { persona_id: personaId },
      }),
    onSuccess: () => invalidate(),
  });
  const removeMembershipMutation = useMutation({
    mutationFn: (personaId: string) =>
      apiFetch<{ success: true }>({
        path: "/structura/v1/personas/membership/remove",
        method: "POST",
        data: { persona_id: personaId },
      }),
    onSuccess: () => invalidate(),
  });

  return {
    savePersona: saveMutation.mutateAsync,
    deletePersona: deleteMutation.mutateAsync,
    forkPersona: forkMutation.mutateAsync,
    setDefaultPersona: setDefaultMutation.mutateAsync,
    addMembership: addMembershipMutation.mutateAsync,
    removeMembership: removeMembershipMutation.mutateAsync,
    isPending:
      saveMutation.isPending ||
      deleteMutation.isPending ||
      forkMutation.isPending ||
      setDefaultMutation.isPending,
    isForking: forkMutation.isPending,
    isSettingDefault: setDefaultMutation.isPending,
    isBinding: addMembershipMutation.isPending || removeMembershipMutation.isPending,
  };
};
