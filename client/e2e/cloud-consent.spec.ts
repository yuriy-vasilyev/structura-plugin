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

/**
 * Every option the anonymous-bootstrap path reads or writes, in the order
 * they are deleted. `Anonymous_Bootstrap::has_cloud_consent()` backfills the
 * consent flag on any request that still finds stashed license credentials or
 * the bootstrapped-at sentinel, so those go first and consent last; deleting
 * consent first let a background request re-create it (2026-11-20).
 */
const CLOUD_STATE_OPTIONS = [
  "structura_license_data",
  "structura_install_bootstrapped_at",
  "structura_install_id",
  "structura_cloud_consent",
] as const;

type OptionBackup = Record<string, { value: unknown } | null>;

/**
 * Runs PHP in one wp-cli call and returns what it printed between the
 * markers. Each `ddev wp` call waits for ddev's file sync, so the option work
 * is batched: one call to back up and clear, one per server-side check, one
 * to restore.
 */
function wpEval(php: string): string {
  const out = execFileSync("ddev", ["wp", "eval", `echo '<<<E2E'; ${php} echo 'E2E>>>';`], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const match = out.match(/<<<E2E([\s\S]*)E2E>>>/);
  if (!match) throw new Error(`wp eval printed no result: ${out.slice(0, 300)}`);
  return match[1];
}

/** A PHP expression that decodes `value` (base64 JSON, so no quoting can break it). */
const phpValue = (value: unknown) =>
  `json_decode(base64_decode('${Buffer.from(JSON.stringify(value)).toString("base64")}'), true)`;

/** Each option's stored value, or null when it does not exist. One wp-cli call. */
function readOptions(names: readonly string[]): Record<string, unknown> {
  return JSON.parse(
    wpEval(
      `$absent = new stdClass(); $out = [];
       foreach (${phpValue(names)} as $name) { $v = get_option($name, $absent); $out[$name] = $v === $absent ? null : $v; }
       echo wp_json_encode($out);`,
    ),
  );
}

/** Backs up every cloud-state option, then deletes them in order. One wp-cli call. */
function backUpAndClear(): OptionBackup {
  return JSON.parse(
    wpEval(
      `$absent = new stdClass(); $backup = [];
       foreach (${phpValue(CLOUD_STATE_OPTIONS)} as $name) {
         $v = get_option($name, $absent);
         $backup[$name] = $v === $absent ? null : ['value' => $v];
         delete_option($name);
       }
       echo wp_json_encode($backup);`,
    ),
  );
}

/** Puts every option back as it was (absent ones stay absent). One wp-cli call. */
function restore(backup: OptionBackup): void {
  wpEval(
    `foreach (${phpValue(backup)} as $name => $entry) {
       if ($entry === null) { delete_option($name); } else { update_option($name, $entry['value']); }
     }`,
  );
}

test.describe.serial("first-run cloud consent gate", () => {
  // A `ddev wp` call took 74 to 182 s on 2026-11-20 while ddev's Mutagen sync
  // was scanning (seconds on a healthy sync); the test makes two, the hooks
  // one each. The calls block, so the default timeout only fires afterwards.
  test.describe.configure({ timeout: 8 * 60_000 });

  let backup: OptionBackup | null = null;

  test.beforeAll(() => {
    backup = backUpAndClear();
  });

  test.afterAll(() => {
    if (backup) restore(backup);
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
    const before = readOptions(CLOUD_STATE_OPTIONS);
    expect(before.structura_cloud_consent, "consent flag").toBeNull();
    expect(before.structura_install_id, "install id").toBeNull();
    expect(before.structura_install_bootstrapped_at, "bootstrap sentinel").toBeNull();

    await page.screenshot({ path: path.join(SHOTS_DIR, "gate-light.png"), fullPage: true });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: path.join(SHOTS_DIR, "gate-dark.png"), fullPage: true });
    await page.emulateMedia({ colorScheme: "light" });

    await connect.click();

    // Consent → bootstrap → hard reload → the real app mounts.
    await expect(gate).toHaveCount(0, { timeout: 45_000 });
    await expectSpaMounted(page, crashes);
    await page.screenshot({ path: path.join(SHOTS_DIR, "app-after-consent.png"), fullPage: false });

    const after = readOptions(CLOUD_STATE_OPTIONS);
    expect(after.structura_cloud_consent).toBe("yes");
    expect(after.structura_install_id, "install id minted after opt-in").not.toBeNull();
    expect(
      after.structura_install_bootstrapped_at,
      "bootstrap ran (and succeeded against the cloud) in the consent request",
    ).not.toBeNull();
  });
});
