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
  await page.getByPlaceholder("Log a station, in English or Chinese").fill("Bakery over-prep 1.5 kg");
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
  await expect(page.getByText("HARBOUR HOTEL", { exact: true })).toBeVisible();
  await expect(page.getByText("Townhouse")).toHaveCount(0);
});
