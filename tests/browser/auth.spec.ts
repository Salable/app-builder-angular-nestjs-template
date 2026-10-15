import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { test } from "./auth.fixture";

for (const authMode of ["SELF_HOSTED_BETTER_AUTH", "NEON_AUTH"] as const) {
  test.describe(authMode, () => {
    test.use({ authMode });
    test("opens the skeleton, signs up, refreshes, rejects bad credentials and revokes a session", async ({
      page,
      authApplication,
    }) => {
      const email = `${randomUUID()}@example.test`;
      await page.goto(authApplication.origin);
      await expect(
        page.getByRole("heading", { name: "Landing page", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("This is the public entry point", { exact: false }),
      ).toContainText("App Builder will replace");
      await page.getByRole("link", { name: "Application", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Sign in required", exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Sign in", exact: true }).click();
      await page.getByRole("link", { name: "Create an account", exact: true }).click();
      await page.getByRole("textbox", { name: "Name", exact: true }).fill("Sam");
      await page.getByRole("textbox", { name: "Email" }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill("local-password-123");
      await page.getByRole("button", { name: "Create your account" }).click();
      await expect(
        page.getByRole("heading", { name: "Application", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(`Signed in as Sam (${email}).`, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("This is the signed-in area", { exact: false }),
      ).toContainText("App Builder will replace");
      await page.reload();
      await expect(
        page.getByText(`Signed in as Sam (${email}).`, { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Sign in required" }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Sign in", exact: true }).click();
      await page.getByRole("textbox", { name: "Email" }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill("wrong-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText(
        "Check your email and password.",
      );
      await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue(email);
      await page.getByLabel("Password", { exact: true }).fill("local-password-123");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(
        page.getByText(`Signed in as Sam (${email}).`, { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await authApplication.revokeSessions(email);
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Sign in required" }),
      ).toBeVisible();
      await expect(
        page.getByText(`Signed in as Sam (${email}).`, { exact: true }),
      ).toHaveCount(0);
    });
  });
}
