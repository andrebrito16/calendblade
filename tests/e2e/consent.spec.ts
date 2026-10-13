import { expect, type Page, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

const analyticsStorage = (page: Page) =>
  page.evaluate(() => [
    ...document.cookie.split("; ").filter((part) => /^(ph_|__ph)/.test(part)),
    ...Object.keys(localStorage).filter((key) => /^(ph_|__ph)/.test(key)),
  ]);

test("nothing optional runs before a choice; rejecting keeps it off", async ({ page }) => {
  const telemetry: string[] = [];
  page.on("request", (request) => {
    if (/127\.0\.0\.1:9|posthog|ingest\.sentry/.test(request.url())) telemetry.push(request.url());
  });
  await page.goto("/");
  const banner = page.getByTestId("consent-banner");
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("button", { name: "Reject all" })).toBeVisible();
  await expect(banner.getByRole("button", { name: "Accept all" })).toBeVisible();
  expect(telemetry).toEqual([]);

  await banner.getByRole("button", { name: "Reject all" }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.getByTestId("consent-banner")).toBeHidden();
  expect(await analyticsStorage(page)).toEqual([]);
  expect(telemetry).toEqual([]);
});

test("consent can be given granularly and withdrawn from cookie settings", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("consent-banner").getByRole("button", { name: "Customize" }).click();
  const dialog = page.getByRole("dialog", { name: "Cookie preferences" });
  await expect(dialog.getByRole("switch", { name: /Strictly necessary/ })).toBeDisabled();
  await dialog.getByRole("switch", { name: /Product analytics/ }).click();
  await dialog.getByRole("button", { name: "Save choices" }).click();
  await expect.poll(() => analyticsStorage(page)).not.toEqual([]);

  await page.getByRole("contentinfo").getByRole("button", { name: "Cookie settings" }).click();
  await page
    .getByRole("dialog", { name: "Cookie preferences" })
    .getByRole("button", { name: "Reject all" })
    .click();
  await page.waitForLoadState("load");
  await expect.poll(() => analyticsStorage(page)).toEqual([]);
});

test("legal pages cover GDPR, LGPD and every cookie", async ({ page }) => {
  await page.goto("/legal/privacy");
  await expect(page.getByRole("heading", { name: /Your rights/ })).toBeVisible();
  await expect(page.getByText(/LGPD \(Art\. 18\)/)).toBeVisible();
  await expect(page.getByText(/Autoridade Nacional de Proteção de Dados/)).toBeVisible();
  await page.goto("/legal/cookies");
  for (const name of ["better-auth.session_token", "cb_consent", "NEXT_LOCALE", "ph_<project>_posthog"]) {
    await expect(page.getByRole("rowheader", { name })).toBeVisible();
  }
  await page.goto("/legal/terms");
  await expect(page.getByRole("heading", { name: /consumer rights/ })).toBeVisible();
});
