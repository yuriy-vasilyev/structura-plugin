import { FC } from "react";
import { __ } from "@wordpress/i18n";
import { Alert, Button } from "@structura/ui";
import { ArrowRight, Users } from "lucide-react";
import { useNavigate } from "react-router";
import { usePersonasQuery } from "@/features/personas";

/**
 * Hard-block notice for the Generate Post / New Campaign surfaces — shown
 * when the workspace has ZERO personas on file.
 *
 * Why a hard block (vs. the soft {@link DefaultPersonaAdvisory} that
 * fires at exactly one persona): every generated post is attributed to a
 * persona — a pinned id or the "random" rotation — so with no personas
 * the run degrades to a generic voice, silently defeating the personas
 * feature. Fresh workspaces are auto-seeded with a "House voice" persona
 * (`License_Manager::seed_default_persona_if_needed()`), so this is
 * normally unreachable; a failed seed or a deleted last persona are the
 * paths that land here. The cloud (`postCampaign`) and plugin
 * (`generate_single_post`) refuse the request in this state too — this
 * notice is the UX half of that contract, and the calling surface
 * disables its submit button alongside it.
 *
 * Self-contained — owns its own `usePersonasQuery` so callers don't have
 * to thread the count through. Hidden while loading (avoids a blocker
 * flash before the count resolves) and whenever 1+ personas exist.
 */
export const NoPersonasBlocker: FC = () => {
  const navigate = useNavigate();
  const { data: personas, isLoading } = usePersonasQuery();

  if (isLoading) return null;
  const count = personas?.length ?? 0;
  if (count > 0) return null;

  return (
    <Alert variant="warning">
      <Users />
      <Alert.Title>{__("Add a persona to continue", "structura")}</Alert.Title>
      <Alert.Description>
        {__(
          "Every post is written in the voice of a persona. This workspace doesn't have any yet — create one (or start from a template) before generating content.",
          "structura"
        )}
      </Alert.Description>
      <Alert.Action>
        <Button size="sm" variant="secondary" onClick={() => navigate("/personas")}>
          {__("Create a persona", "structura")}
          <ArrowRight size={14} className="ml-2" strokeWidth={2} />
        </Button>
      </Alert.Action>
    </Alert>
  );
};
