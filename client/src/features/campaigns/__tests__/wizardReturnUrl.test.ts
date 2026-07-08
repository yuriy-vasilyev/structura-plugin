/**
 * Tests for `buildWizardResumeUrl` — the helper that packages the
 * current wp-admin URL plus a `#/campaigns/new?resume=draft&step=…`
 * hash so the portal can deep-link the customer back to the wizard
 * step they came from.
 *
 * What's worth pinning:
 *   - The wp-admin URL's existing query string survives (we can't
 *     drop `?page=structura` — wp-admin uses that to load the SPA).
 *   - The hash is replaced wholesale (no concatenation, no merging
 *     with a previous hash like `#/dashboard`).
 *   - `step` is URL-encoded (defensive against future step names
 *     that contain reserved characters — current "keywords" and
 *     "authority" are safe).
 *   - SSR / non-window environments return empty string rather than
 *     throwing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildWizardResumeUrl } from "../utils/wizardReturnUrl";

const ORIGINAL_HREF = "http://localhost:3000/";

function setLocation(href: string) {
  // jsdom locks `window.location`; reassigning via `vi.stubGlobal` is
  // the supported way to swap it for the duration of a test.
  vi.stubGlobal("location", new URL(href));
}

describe("buildWizardResumeUrl", () => {
  beforeEach(() => {
    setLocation(ORIGINAL_HREF);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves the wp-admin's existing query string", () => {
    setLocation(
      "https://example.com/wp-admin/admin.php?page=structura#/dashboard",
    );
    const url = buildWizardResumeUrl("keywords");
    expect(url).toBe(
      "https://example.com/wp-admin/admin.php?page=structura#/campaigns/new?resume=draft&step=keywords",
    );
  });

  it("replaces an existing hash rather than appending to it", () => {
    setLocation(
      "https://example.com/wp-admin/admin.php?page=structura#/campaigns/123",
    );
    const url = buildWizardResumeUrl("authority");
    expect(url).toContain(
      "#/campaigns/new?resume=draft&step=authority",
    );
    expect(url).not.toContain("#/campaigns/123");
  });

  it("accepts both resumable steps", () => {
    setLocation(
      "https://example.com/wp-admin/admin.php?page=structura",
    );
    const kw = buildWizardResumeUrl("keywords");
    const au = buildWizardResumeUrl("authority");
    expect(kw).toContain("step=keywords");
    expect(au).toContain("step=authority");
  });

  it("works on a WordPress install at a subdirectory", () => {
    setLocation(
      "https://example.com/wp/wp-admin/admin.php?page=structura",
    );
    const url = buildWizardResumeUrl("keywords");
    expect(url.startsWith("https://example.com/wp/wp-admin/admin.php"))
      .toBe(true);
  });
});
