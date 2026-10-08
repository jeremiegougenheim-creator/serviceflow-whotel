/**
 * The day, end to end, against a running app seeded with the demo accounts.
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test
 */
import { expect, test, type Page } from "@playwright/test";

const password = process.env.SEED_DEMO_PASSWORD ?? "serviceflow-demo";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByText("I have a password").click();
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("the GM reads the brief and approves a decision", async ({ page }) => {
  await signIn(page, "gm@demo.serviceflow");
  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByText(/covers forecast/)).toBeVisible();
  await page.goto("/brief");
  await expect(page.getByText("Three decisions for")).toBeVisible();
  const approve = page.getByRole("button", { name: "Approve" }).first();
  if (await approve.isVisible()) {
    await approve.click();
    await expect(page.getByText("Approved").first()).toBeVisible();
  }
});

test("the chef confirms the plan and logs waste by text", async ({ page }) => {
  await signIn(page, "chef@demo.serviceflow");
  await expect(page).toHaveURL(/\/plan/);
  await expect(page.getByText("Station prep")).toBeVisible();
  await page.goto("/live");
  await page.waitForLoadState("networkidle");
  await page.locator("[data-voice-logger][data-ready]").first().waitFor();
  await page.getByPlaceholder("Log a count, a station or a fix").fill("Bakery over-prep 1.5 kg");
  await page.getByRole("button", { name: "Log" }).click();
  await expect(page.getByText(/Log 1.5 kg over-prep at Bakery/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("1.5 kg logged")).toBeVisible();
});

test("housekeeping and engineering screens render", async ({ page }) => {
  await signIn(page, "hk@demo.serviceflow");
  await expect(page.getByText("Next rooms")).toBeVisible();
  await page.goto("/rooms?view=vip");
  await expect(page.getByText("VIP and suites today")).toBeVisible();
  await page.goto("/faults?view=energy");
  await expect(page.getByText("Where it goes")).toBeVisible();
});

test("the CEO reads the group by region and drills into a hotel", async ({ page }) => {
  await signIn(page, "ceo@demo.serviceflow");
  await expect(page.getByText("By region")).toBeVisible();
  await page.goto("/portfolio?lens=ops");
  await expect(page.getByText("Kitchen hours short")).toBeVisible();
});

test("a chef never sees another hotel", async ({ page }) => {
  await signIn(page, "chef@demo.serviceflow");
  await page.goto("/settings/team");
  await expect(page.getByRole("banner").getByText("HARBOUR HOTEL", { exact: true })).toBeVisible();
  await expect(page.getByText("Townhouse")).toHaveCount(0);
});

test("a live proposal approved by the chef becomes a decision on the record", async ({ page }) => {
  await signIn(page, "chef@demo.serviceflow");
  await page.goto("/live");
  const approve = page.getByRole("button", { name: "Approve" }).first();
  if (await approve.isVisible()) {
    await approve.click();
    await expect(page.getByText("Approved").first()).toBeVisible();
  }
});

test("a reader is offered no tap the database would refuse", async ({ page }) => {
  await signIn(page, "owner@demo.serviceflow");
  await page.goto("/brief");
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await page.goto("/waste");
  await expect(page.getByPlaceholder("Log a station’s waste")).toHaveCount(0);
  await expect(page.getByText(/Measured by the log, not modelled/).first()).toBeVisible();
});

test("a decision kept as is reads in words, stays in place and can be undone", async ({ page }) => {
  await signIn(page, "gm@demo.serviceflow");
  await page.goto("/brief?outlet=restaurant");
  const keep = page.getByRole("button", { name: "Keep as is" }).first();
  if (!(await keep.isVisible())) return; // every decision already taken on this copy
  const row = keep.locator("xpath=ancestor::div[contains(@class,'row-decision')]");
  const title = (await row.locator("b").first().innerText()).split("\n")[0];
  await keep.click();
  const same = page.locator(".row-decision", { hasText: title });
  await expect(same.getByText(/^Kept as is/)).toBeVisible();
  await expect(page.getByText(/rejected/i)).toHaveCount(0);
  await same.getByRole("button", { name: "Undo" }).click();
  await expect(same.getByRole("button", { name: "Approve" })).toBeVisible();
});

test("approving a roster move never marks the next one as done", async ({ page }) => {
  await signIn(page, "gm@demo.serviceflow");
  await page.goto("/roster");
  const approve = page.getByRole("button", { name: "Approve the move" });
  if (!(await approve.isVisible())) return;
  const first = await page.locator(".strike .tt").innerText();
  await approve.click();
  await page.waitForLoadState("networkidle");
  const now = page.locator(".strike .tt");
  if ((await now.innerText()) !== first) await expect(page.locator(".strike").getByText("Move applied")).toHaveCount(0);
});

test("the backtest replays the history out of sample and hands over the days", async ({ page }) => {
  await signIn(page, "gm@demo.serviceflow");
  await page.goto("/backtest");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("average miss");
  await expect(page.getByText("each with only what was known the evening before", { exact: false })).toBeVisible();
  await expect(page.getByText("Habit", { exact: true }).first()).toBeVisible();
  const csv = await page.request.get("/backtest/csv?outlet=breakfast");
  expect(csv.status()).toBe(200);
  const lines = (await csv.text()).trim().split("\n");
  expect(lines[1]).toMatch(/^date,actual_covers,serviceflow_p50/);
  expect(lines.length).toBeGreaterThan(20);
});

test("housekeeping is not offered the backtest", async ({ page }) => {
  await signIn(page, "hk@demo.serviceflow");
  const csv = await page.request.get("/backtest/csv");
  expect(csv.status()).toBe(403);
  await page.goto("/backtest");
  await page.waitForURL(/\/rooms/);
});

test("the owner looks through the Rooms lens", async ({ page }) => {
  await signIn(page, "owner@demo.serviceflow");
  await page.goto("/portfolio?lens=rooms");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Next seven nights");
  await expect(page.getByText("On the books", { exact: true }).first()).toBeVisible();
});
