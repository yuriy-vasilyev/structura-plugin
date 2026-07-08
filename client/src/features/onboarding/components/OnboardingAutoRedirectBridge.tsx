/**
 * Headless mount point for the wizard auto-redirect hook.
 *
 * The hook itself uses `useLocation()` + `useNavigate()`, both of
 * which require an enclosing `<HashRouter>`. App.tsx structure
 * doesn't let the hook be called at the top level (those router
 * hooks would throw outside of router context), so we pull the call
 * down into a render-nothing child mounted inside the router.
 */

import { useOnboardingAutoRedirect } from "../hooks/useOnboardingAutoRedirect";

export const OnboardingAutoRedirectBridge = () => {
  useOnboardingAutoRedirect();
  return null;
};
