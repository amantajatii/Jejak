import { expect, test, type Page } from "@playwright/test";

async function reset(page: Page, scenario: "happy" | "adverse") {
  await page.getByRole("button", { name: `Reset ${scenario}` }).click();
  await page.getByRole("button", { name: "Confirm reset" }).click();
  await expect(page.getByText(new RegExp(`${scenario.toUpperCase()} ·`))).toBeVisible();
}

async function role(page: Page, value: string) {
  await page.getByRole("combobox", { name: "Active demo role" }).selectOption(value);
}

async function action(page: Page, label: string, next?: string) {
  const panel = page.locator(".jejak-operation").filter({ has: page.getByRole("heading", { name: label }) });
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: label }).click();
  if (next) await expect(page.getByRole("heading", { name: next })).toBeVisible({ timeout: 10_000 });
}

async function happyFlow(page: Page) {
  await page.goto("/institution/claims/current"); await reset(page, "happy");
  await role(page, "ORIGINATOR"); await action(page, "Analyze claim", "Create offer"); await action(page, "Create offer", "Accept offer");
  await page.goto("/seller/offers/current"); await role(page, "SELLER"); await action(page, "Accept offer");
  await page.goto("/institution/claims/current"); await role(page, "ORIGINATOR"); await expect(page.getByRole("heading", { name: "Verify control" })).toBeVisible(); await action(page, "Verify control", "Issue jCLAIM");
  await role(page, "ISSUER"); await action(page, "Issue jCLAIM", "Fund JUSD");
  await role(page, "FACILITY"); await action(page, "Fund JUSD", "Record settlement");
  await role(page, "SERVICER"); await action(page, "Record settlement", "Run waterfall"); await action(page, "Run waterfall");
  await expect(page.getByText("CLOSED", { exact: true }).first()).toBeVisible();
}

async function adverseFlow(page: Page) {
  await page.goto("/resolution/current"); await reset(page, "adverse");
  await role(page, "ORIGINATOR"); await action(page, "Inject refund spike", "Record settlement");
  await role(page, "SERVICER"); await action(page, "Record settlement", "Run waterfall"); await action(page, "Run waterfall", "Open resolution");
  await expect(page.getByText("JUSD 10").first()).toBeVisible();
  await expect(page.getByText("−JUSD 4").first()).toBeVisible();
  await role(page, "RESOLVER"); await action(page, "Open resolution", "Record recovery"); await action(page, "Record recovery", "Close with final loss"); await action(page, "Close with final loss");
  await expect(page.getByText("CLOSED WITH LOSS", { exact: true }).first()).toBeVisible();
}

test("@mock browser happy path reconciles to CLOSED", async ({ page }) => { await happyFlow(page); });
test("@mock refund spike and resolution reconcile to CLOSED_WITH_LOSS", async ({ page }) => { await adverseFlow(page); });

test("@mock authorization, version conflict, retry, refresh, and responsive labels", async ({ page }) => {
  await page.goto("/institution/claims/current?mockFixture=version-conflict"); await reset(page, "happy"); await role(page, "SELLER");
  const analyze = page.locator(".jejak-operation"); await analyze.getByRole("checkbox").check(); await expect(analyze.getByRole("button", { name: "Analyze claim" })).toBeDisabled();
  await role(page, "ORIGINATOR"); await analyze.getByRole("button", { name: "Analyze claim" }).click(); await expect(page.getByText("The financial state changed").first()).toBeVisible();
  await analyze.getByRole("button", { name: "Analyze claim" }).click(); await expect(page.getByRole("heading", { name: "Create offer" })).toBeVisible();
  await page.reload(); await expect(page.getByRole("heading", { name: "Create offer" })).toBeVisible(); await expect(page.getByRole("combobox", { name: "Active demo role" })).toHaveValue("");
  await page.setViewportSize({ width: 375, height: 812 }); await expect(page.getByText("SANDBOX", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Tab"); await expect(page.locator(":focus")).toBeVisible();
});

test("@mock retryable lost response keeps the action available", async ({ page }) => {
  await page.goto("/institution/claims/current?mockFixture=retryable-timeout"); await reset(page, "happy"); await role(page, "ORIGINATOR");
  const panel = page.locator(".jejak-operation"); await panel.getByRole("checkbox").check(); await panel.getByRole("button", { name: "Analyze claim" }).click();
  await expect(page.getByText("The connection was interrupted").first()).toBeVisible(); await panel.getByRole("button", { name: "Analyze claim" }).click(); await expect(page.getByRole("heading", { name: "Create offer" })).toBeVisible();
});

test("@api browser happy path", async ({ page }) => { test.skip(process.env.JEJAK_API_E2E !== "1", "Person 1 runtime is not available"); await happyFlow(page); });
test("@api browser adverse path", async ({ page }) => { test.skip(process.env.JEJAK_API_E2E !== "1", "Person 1 runtime is not available"); await adverseFlow(page); });
