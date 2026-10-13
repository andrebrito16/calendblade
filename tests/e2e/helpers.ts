import { expect, type Page } from "@playwright/test";

export function uniqueEmail(prefix = "e2e") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Signs in through the real magic-link flow, using the dev endpoint as the inbox. */
export async function signIn(page: Page, email = uniqueEmail()) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  const response = await page.request.get(`/api/dev/magic-link?email=${encodeURIComponent(email)}`);
  expect(response.ok()).toBeTruthy();
  const { url } = (await response.json()) as { url: string };
  await page.goto(url);
  return email;
}
