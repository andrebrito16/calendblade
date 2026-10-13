import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";

async function setupRule(page: Page) {
  await signIn(page);
  await page.goto("/onboarding?step=3");
  await page.getByTestId("connect-demo").filter({ visible: true }).click();
  await expect(page.getByText("1 account connected").filter({ visible: true })).toBeVisible();
  await page.getByTestId("connect-demo").filter({ visible: true }).click();
  await expect(page.getByText("2 accounts connected").filter({ visible: true })).toBeVisible();
  await page.goto("/rules/new");
  const calendars = page.getByRole("combobox", { name: "Calendar" });
  await calendars.nth(0).click();
  await page.getByRole("option", { name: "Work" }).click();
  await calendars.nth(1).click();
  await page.getByRole("option", { name: "Personal" }).click();
  await page.getByRole("button", { name: "Create rule" }).click();
  await expect(page.getByRole("heading", { name: "Recent runs" })).toBeVisible();
}

test("edits a rule's mode and options", async ({ page }) => {
  await setupRule(page);
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit rule" })).toBeVisible();
  await page.getByRole("radio", { name: /Full details/ }).click();
  await page.getByRole("textbox", { name: "Title prefix" }).fill("[Work]");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Rule updated. Resyncing mirrors.").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Full details").filter({ visible: true }).first()).toBeVisible();
});

test("deletes a rule together with its mirrors", async ({ page }) => {
  await setupRule(page);
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("Delete this rule?")).toBeVisible();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Delete rule" }).click();
  await expect(page).toHaveURL(/\/rules$/);
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("heading", { name: "No sync rules yet" })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
});

test("disconnects an account", async ({ page }) => {
  await setupRule(page);
  await page.goto("/connections");
  await page.getByRole("link", { name: "Manage" }).first().click();
  await page.getByRole("button", { name: "Disconnect" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Disconnect account" }).click();
  await expect(page).toHaveURL(/\/connections$/);
  await expect(page.getByRole("link", { name: "Manage" })).toHaveCount(1);
});

test("deletes the account and signs out", async ({ page }) => {
  await setupRule(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", { name: "Delete my account" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await confirm.click();
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
});
