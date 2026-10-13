import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("new user signs in, onboards, connects demo accounts and creates a rule", async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: "Confirm your details" })).toBeVisible();

  await page.getByLabel("Your name").fill("E2E Tester");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Connect your first Google account" })).toBeVisible();

  await page.getByTestId("connect-demo").filter({ visible: true }).click();
  await expect(page.getByText("1 account connected").filter({ visible: true })).toBeVisible();
  await page.getByTestId("connect-demo").filter({ visible: true }).click();
  await expect(page.getByText("2 accounts connected").filter({ visible: true })).toBeVisible();

  await page.getByRole("link", { name: "Continue" }).click();
  await page.getByRole("link", { name: "Create a rule" }).click();
  await expect(page.getByRole("heading", { name: "New rule" })).toBeVisible();

  const calendars = page.getByRole("combobox", { name: "Calendar" });
  await calendars.nth(0).click();
  await page.getByRole("option", { name: "Work" }).click();
  await calendars.nth(1).click();
  await page.getByRole("option", { name: "Personal" }).click();
  await page.getByRole("button", { name: "Create rule" }).click();

  await expect(page.getByRole("heading", { name: "You're all set" })).toBeVisible();
  await page.getByRole("button", { name: "Go to dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/rules");
  await expect(page.getByRole("link", { name: /Work .* Personal/ }).first()).toBeVisible();

  // The initial sync runs right after the action; it shows up in Activity.
  await expect(async () => {
    await page.goto("/activity");
    await expect(page.getByText("Succeeded").filter({ visible: true }).first()).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
});

test("rule form validates required calendars", async ({ page }) => {
  await signIn(page);
  await page.goto("/onboarding?step=3");
  await page.getByTestId("connect-demo").filter({ visible: true }).click();
  await page.goto("/rules/new");
  await page.getByRole("button", { name: "Create rule" }).click();
  await expect(page.getByText("This field is required.").filter({ visible: true }).first()).toBeVisible();
});

test("signed-out visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/rules");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Frules/);
});
