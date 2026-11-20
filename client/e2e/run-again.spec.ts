import { test, expect, expectSpaMounted, SPA_PAGE } from "./support/fixtures";

/**
 * "Run again" on a single-post run — confirmation + schedule-less replay.
 *
 * Browser-real regression for the 2026-07-20 crash: a single-post run's
 * inputSnapshot has NO `schedule` cluster, and "Run again" replayed it through
 * the real `flattenCampaign`, which dereferenced `schedule.cron` and threw
 * "Cannot read properties of undefined (reading 'cron')" (surfaced as an
 * Action-Failed toast, so the jsdom crash-guard wouldn't see it — only driving
 * the real click path does).
 *
 * The run itself can't be produced on a cloud-less local WP, so the run query
 * and the generate call are stubbed AT THE NETWORK EDGE; everything in
 * between — the page, the confirmation dialog, and the real `flattenCampaign`
 * — runs for real in the browser. If the flatten regressed, confirming would
 * reject and the navigation assertion below would fail.
 */

// A completed single-post run whose snapshot deliberately omits `schedule`.
const COMPLETED_RUN = {
  success: true,
  run: {
    schemaVersion: 1,
    runId: "run-e2e-1",
    status: "succeeded",
    currentStep: "done",
    progressPercent: 100,
    headline: "Post published",
    startedAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:01:00.000Z",
    stepDurationsMs: [],
    resultPostId: 42,
    inputSnapshot: {
      identity: { objective: "E2E replay of a schedule-less single-post run" },
      intelligence: {
        textProvider: "openai",
        imageProvider: "openai",
        language: "en",
        personaName: "House voice",
      },
      // The plugin's one-off campaign always carries `disclosure` (since
      // 2026-04-07, before snapshots existed), and `flattenCampaign` reads it.
      structure: { postStatus: "draft", disclosure: { enabled: false, text: "" } },
      taxonomy: {
        categories: { mode: "auto", list: [] },
        tags: { mode: "auto", list: [] },
      },
      // NB: no `schedule` cluster — this is the exact shape that used to throw.
    },
  },
};

test.describe("single-post Run again", () => {
  test.beforeEach(async ({ page }) => {
    // Stub the run fetch (any run id) with the schedule-less completed run.
    await page.route(/structura\/v1\/runs\//, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(COMPLETED_RUN),
      }),
    );
    // Stub the ad-hoc generate so confirming produces a new run id to route to.
    await page.route(/structura\/v1\/post\/generate/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, run_id: "run-e2e-2" }),
      }),
    );
  });

  test("confirms, then replays a schedule-less snapshot without crashing", async ({
    page,
    crashes,
  }) => {
    await page.goto(`${SPA_PAGE}#/generate/runs/run-e2e-1`, {
      waitUntil: "domcontentloaded",
    });
    await expectSpaMounted(page, crashes);

    // The header button opens the confirmation — it must NOT generate yet.
    await page.getByRole("button", { name: /Run again/i }).click();
    // Assert on the title, not the `role="dialog"` element: the shared Dialog
    // puts the role on a 0px-tall wrapper whose children are all fixed, which
    // Playwright reports as hidden even while the panel is on screen.
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Run again?" })).toBeVisible();
    // The post-status badge (the row's "Saves as a draft" also contains "draft").
    await expect(dialog.getByText("Draft", { exact: true })).toBeVisible();

    // Confirm inside the dialog → real flattenCampaign runs on the snapshot.
    const generated = page.waitForResponse((r) =>
      /structura\/v1\/post\/generate/.test(r.url()),
    );
    await dialog.getByRole("button", { name: /Run again/i }).click();
    await generated;

    // Landed on the fresh run — proves flatten did NOT throw the cron error.
    await expect(page).toHaveURL(/#\/generate\/runs\/run-e2e-2$/);
    // And the old crash message never surfaced.
    await expect(page.getByText(/reading 'cron'/)).toHaveCount(0);
  });
});
