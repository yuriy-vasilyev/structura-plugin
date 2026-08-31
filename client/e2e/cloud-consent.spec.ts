/**
 * First-run cloud consent gate — wp.org guidelines 7 & 9 (review of
 * 2026-08-27).
 *
 * The reviewer flagged that a fresh install bootstrapped an anonymous
 * Structura Cloud workspace on the first wp-admin page load, sending a
 * persistent install ID + site details without asking. This spec drives
 * the real fix end-to-end against the ddev WordPress:
 *
 *   1. With the install's cloud state wiped (options deleted via wp-cli),
 *      opening the plugin page renders ONLY the consent screen — and,
 *      asserted server-side, mints nothing: no consent flag, no install
 *      id, no bootstrapped-at sentinel.
 *   2. Clicking "Connect to Structura Cloud" records consent, bootstraps
 *      the workspace in the same request, reloads, and the app mounts.
 *
 * The suite backs up and restores the affected options so the dev site's
 * real activation survives the run. Local-only, like the rest of this
 * suite (needs ddev).
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect, expectSpaMounted, SPA_PAGE } from "./support/fixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SHOTS_DIR =
  process.env.STRUCTURA_E2E_SHOTS ?? path.resolve(__dirname, "../test-results/cloud-consent");

/** Every option the anonymous-bootstrap path reads or writes. */
const CLOUD_STATE_OPTIONS = [
  "structura_cloud_consent",
  "structura_license_data",
  "structura_install_id",
  "structura_install_bootstrapped_at",
] as const;

function wp(args: string[]): string {
  return execFileSync("ddev", ["wp", ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** JSON-encoded option value, or null when the option does not exist. */
function getOption(name: string): string | null {
  try {
    return wp(["option", "get", name, "--format=json"]);
  } catch {
    return null;
  }
}

function deleteOption(name: string): void {
  try {
    wp(["option", "delete", name]);
  } catch {
    // already absent
  }
}

test.describe.serial("first-run cloud consent gate", () => {
  const backup: Record<string, string | null> = {};

  test.beforeAll(() => {
    for (const name of CLOUD_STATE_OPTIONS) {
      backup[name] = getOption(name);
      deleteOption(name);
    }
  });

  test.afterAll(() => {
    for (const name of CLOUD_STATE_OPTIONS) {
      const value = backup[name];
      if (value === null || value === undefined) {
        deleteOption(name);
      } else {
        wp(["option", "update", name, value, "--format=json"]);
      }
    }
  });

  test("a fresh install shows only the consent screen and contacts nothing until the admin opts in", async ({
    page,
    crashes,
  }) => {
    await page.goto(SPA_PAGE, { waitUntil: "domcontentloaded" });

    const gate = page.getByTestId("cloud-consent-gate");
    await expect(gate).toBeVisible({ timeout: 20_000 });
    const connect = page.getByRole("button", { name: "Connect to Structura Cloud" });
    await expect(connect).toBeVisible();
    await expect(page.getByRole("link", { name: /Privacy policy/ })).toHaveAttribute(
      "href",
      "https://www.structurawp.com/privacy",
    );
    // The gate replaces the app entirely — no header, no routes.
    await expect(page.getByTestId("app-error-boundary")).toHaveCount(0);

    // Server-side proof that merely opening the page phoned nobody.
    expect(getOption("structura_cloud_consent"), "consent flag").toBeNull();
    expect(getOption("structura_install_id"), "install id").toBeNull();
    expect(getOption("structura_install_bootstrapped_at"), "bootstrap sentinel").toBeNull();

    await page.screenshot({ path: path.join(SHOTS_DIR, "gate-light.png"), fullPage: true });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: path.join(SHOTS_DIR, "gate-dark.png"), fullPage: true });
    await page.emulateMedia({ colorScheme: "light" });

    await connect.click();

    // Consent → bootstrap → hard reload → the real app mounts.
    await expect(gate).toHaveCount(0, { timeout: 45_000 });
    await expectSpaMounted(page, crashes);
    await page.screenshot({ path: path.join(SHOTS_DIR, "app-after-consent.png"), fullPage: false });

    expect(getOption("structura_cloud_consent")).toBe('"yes"');
    expect(getOption("structura_install_id"), "install id minted after opt-in").not.toBeNull();
    expect(
      getOption("structura_install_bootstrapped_at"),
      "bootstrap ran (and succeeded against the cloud) in the consent request",
    ).not.toBeNull();
  });
});
