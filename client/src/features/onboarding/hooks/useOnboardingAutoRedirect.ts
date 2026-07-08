/**
 * First-paid-activation auto-redirect to the wizard.
 *
 * Plan: `/Users/yuriyvasilyev/.claude/plans/valiant-juggling-kazoo.md`
 * §"Phasing → W-A".
 *
 * Mounted once at the App.tsx root. On the very first wizard-state
 * read for a paid workspace, if the document was just created
 * server-side (`justCreated: true`) AND the user is sitting on the
 * dashboard, navigate them to the wizard. Subsequent state reads
 * won't return `justCreated: true`, so a user who Exits the wizard
 * and returns to the dashboard never gets yanked back — they get the
 * dashboard resume tile instead.
 *
 * Also fires for a NEW SITE under an already-onboarded workspace
 * (`activationNeedsPositioning: true`). Positioning is activation-scoped
 * (2026-06-02) but wizard progress is workspace-level, so a 2nd site whose
 * workspace already finished the wizard reports `justCreated: false` yet
 * still has no positioning of its own. Without this it would never be
 * prompted to capture its brand facts and would generate ungrounded posts.
 *
 * Exit must STICK: `activationNeedsPositioning` stays true until positioning
 * is actually saved (the wizard only commits at Finish), and the in-session
 * ref below resets on every page load — so without a durable dismissal the
 * redirect re-fired on every refresh after the user clicked Exit. The
 * wizard's Exit records a per-site localStorage dismissal
 * (`markOnboardingDismissed`); this path is skipped once it's set. The
 * dashboard resume tile stays as the explicit way back in.
 *
 * Also fires for a FRESH INSTALL WITH NO KEY BOUND (2026-06-06).
 * There's no wp.org listing yet, so every install comes from the
 * portal with a license key — but the old flow never asked for it:
 * the wizard couldn't open without a bearer and the only key input
 * hid behind the top-right badge menu. Now a keyless install with no
 * prior activation is sent straight to the wizard, whose license
 * gate asks for the key as the very first screen. Installs that HAD
 * an activation (key deactivated / site disconnected) are excluded —
 * they get the SiteNotConnectedBanner instead of a wizard yank.
 *
 * Constraints:
 *   - Don't fire on deep-links (e.g. /campaigns/abc?from=email) —
 *     yanking a user away from where they intentionally clicked is
 *     hostile. Only auto-redirect when the route is the bare "/".
 *   - Fire on EVERY tier, including free / none. The wizard is the
 *     locked-preview upsell surface for them (step 1 + teasers for
 *     2–5 + the Done summary), so a fresh free activation should land
 *     in it too — that's the whole point of the teaser steps. (Before
 *     2026-06-01 this was paid-only, which left free signups with no
 *     wizard at all.)
 *   - Fire exactly once per session — a guard prevents the effect
 *     from re-running if the state cache invalidates.
 */

import { useEffect, useRef } from "@wordpress/element";
import { useLocation, useNavigate } from "react-router";

import { useLicense } from "@/features/settings";

import { useWizardStateQuery } from "../api/useOnboardingState";
import { isOnboardingDismissed } from "../utils/onboardingDismissal";

export const useOnboardingAutoRedirect = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasUsableLicense, hasWorkspace, isPaidLicense } = useLicense();
  // All tiers — the wizard auto-creates its state on first read and
  // returns `justCreated`. requireActivationBearer guards it server-
  // side, so it's gated on workspace presence: firing it without a
  // bearer can only fail (and used to error-toast every fresh
  // keyless install).
  const { data } = useWizardStateQuery({ enabled: hasWorkspace === true });

  // Single-shot guard. Without it, a React Query refetch (network
  // flake recovery) that returns the cached `justCreated: true` body
  // could re-trigger the navigate after the user had already exited.
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    if (hasRedirectedRef.current) return;
    // The needs-positioning nudge respects a prior explicit Exit; the
    // justCreated path doesn't need to (it can only ever fire on the very
    // first state read, before an Exit could exist).
    //
    // Gated on `isPaidLicense` (2026-07-08): positioning is captured on
    // the wizard's SEO step, which is a LOCKED teaser for none/free tiers
    // — they can never satisfy `activationNeedsPositioning`, so it stays
    // true forever and the nudge re-opened the wizard on EVERY SPA load
    // even after the user completed and exited it. Worse, Finish clears
    // the Exit dismissal, so completing the wizard actively re-armed the
    // loop. The nudge only makes sense when the tier can actually provide
    // positioning; none/free get the wizard once via `justCreated` and
    // are never yanked back. Paid installs (incl. the 2nd-site-under-a-
    // completed-workspace case this nudge exists for) are unaffected.
    const needsPositioningNudge =
      data?.activationNeedsPositioning &&
      isPaidLicense &&
      !isOnboardingDismissed();
    // Fresh keyless install → the wizard's license gate is the first-
    // run surface. `had_prior_activation` (default true on plugin
    // builds predating the flag — don't yank on old builds) excludes
    // deliberately disconnected sites.
    const hadPriorActivation =
      typeof window !== "undefined"
        ? (window.structuraConfig?.had_prior_activation ?? true)
        : true;
    const freshUnconnected =
      hasUsableLicense === false &&
      !hadPriorActivation &&
      !isOnboardingDismissed();
    if (!data?.justCreated && !needsPositioningNudge && !freshUnconnected)
      return;
    if (location.pathname !== "/") return;
    hasRedirectedRef.current = true;
    navigate("/onboarding");
  }, [
    data?.justCreated,
    data?.activationNeedsPositioning,
    hasUsableLicense,
    isPaidLicense,
    location.pathname,
    navigate,
  ]);
};
