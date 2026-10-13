import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .exclude("nextjs-portal")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(
    serious.map(
      (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
    ),
  ).toEqual([]);
}

for (const path of ["/", "/sign-in", "/legal/privacy", "/legal/terms", "/does-not-exist"]) {
  test(`public page ${path} has no serious a11y violations`, async ({ page }) => {
    await page.goto(path);
    await expectNoSeriousViolations(page);
  });
}

test("app screens have no serious a11y violations", async ({ page }) => {
  await signIn(page);
  await page.goto("/onboarding?step=3");
  await page.getByTestId("connect-demo").filter({ visible: true }).click();
  for (const path of [
    "/dashboard",
    "/connections",
    "/rules",
    "/rules/new",
    "/activity",
    "/settings",
    "/onboarding",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectNoSeriousViolations(page);
  }
});
