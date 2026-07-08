import { FC } from "react";
import { __ } from "@wordpress/i18n";
import { Alert, Button } from "@structura/ui";
import { ArrowRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router";
import { usePersonasQuery } from "@/features/personas";

/**
 * Inline advisory for the Generate Post / New Campaign surfaces —
 * surfaces when the user is about to run a campaign with only the
 * auto-seeded default ("House voice") persona on file.
 *
 * Why an advisory rather than a hard block: every fresh install (both
 * licensed AND anonymous, since Phase 1.8) lands with one
 * auto-seeded persona by `License_Manager::seed_default_persona_if_needed()`.
 * That's enough to run a campaign, so we let the user proceed — but
 * a single voice across every post produces tonally identical
 * content. A one-line "we'll use this; consider adding more" hint
 * gets the user to the personas page without forcing them through
 * it before they can do anything.
 *
 * Visibility:
 *   - Hidden while personas are loading (avoids a "you have one
 *     persona" flash that flips to "you have many" the next render).
 *   - Hidden when 2+ personas exist — the user already has variety.
 *   - Hidden on a 0-personas state (the cloud failed to seed; the
 *     surrounding form already disables submission for that case
 *     and a separate empty-state covers it).
 *
 * Self-contained — owns its own `usePersonasQuery` so callers don't
 * have to thread the count through. Idempotent re-renders pick up
 * persona-list mutations via TanStack Query invalidations.
 */
export const DefaultPersonaAdvisory: FC = () => {
  const navigate = useNavigate();
  const { data: personas, isLoading } = usePersonasQuery();

  if (isLoading) return null;
  const count = personas?.length ?? 0;
  if (count !== 1) return null;

  return (
    <Alert variant="info">
      <Sparkles />
      <Alert.Title>{__("Using your default persona", "structura")}</Alert.Title>
      <Alert.Description>
        {__(
          "This run will use the auto-seeded \"House voice\" persona. Add a couple more personas to vary tone across campaigns and posts.",
          "structura"
        )}
      </Alert.Description>
      <Alert.Action>
        <Button size="sm" variant="secondary" onClick={() => navigate("/personas")}>
          {__("Add Persona", "structura")}
          <ArrowRight size={14} className="ml-2" strokeWidth={2} />
        </Button>
      </Alert.Action>
    </Alert>
  );
};
