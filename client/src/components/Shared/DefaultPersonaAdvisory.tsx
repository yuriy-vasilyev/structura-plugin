import { FC } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { Alert, Button } from "@structura/ui";
import { ArrowRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router";
import { usePersonasQuery } from "@/features/personas";

/**
 * Inline advisory for the Generate Post / New Campaign surfaces —
 * surfaces when the user has exactly ONE persona on file.
 *
 * Why an advisory rather than a hard block: a single voice across every
 * post produces tonally identical content. A one-line "we'll use this;
 * consider adding more" hint gets the user to the personas page without
 * forcing them through it before they can do anything.
 *
 * Copy note (2026-07-08): this used to assert the single persona was the
 * auto-seeded "House voice" default. That's wrong — a user who picks ONE
 * persona from the onboarding templates also lands here, and telling them
 * they're on an "auto-seeded default" they never chose reads as a bug.
 * The copy now names the actual persona and makes no claim about its
 * origin, which is true whether it was seeded or hand-picked.
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

  const personaName = personas?.[0]?.name ?? "";

  return (
    <Alert variant="info">
      <Sparkles />
      <Alert.Title>{__("Using your only persona", "structura")}</Alert.Title>
      <Alert.Description>
        {personaName
          ? // translators: %s is the persona name.
            sprintf(
              __(
                "Every post will use “%s” — your only persona. Add a couple more to vary tone across campaigns and posts.",
                "structura",
              ),
              personaName,
            )
          : __(
              "Every post will use your only persona. Add a couple more to vary tone across campaigns and posts.",
              "structura",
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
