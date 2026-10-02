import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { test } from "./auth.fixture";

for (const authMode of ["SELF_HOSTED_BETTER_AUTH", "NEON_AUTH"] as const) {
  test.describe(authMode, () => {
    test.use({ authMode });
    test("sign up, persist a private note, sign out, reject a bad password and sign in again", async ({
      page,
      authApplication,
    }) => {
      const email = `${randomUUID()}@example.test`;
      await page.goto(`${authApplication.origin}/workspace`);
      await expect(page).toHaveURL(/\/sign-in$/);
      await page.getByRole("link", { name: "Create an account", exact: true }).click();
      await page.getByRole("textbox", { name: "Name", exact: true }).fill("Sam");
      await page.getByRole("textbox", { name: "Email" }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill("local-password-123");
      await page.getByRole("button", { name: "Create account" }).click();
      await expect(
        page.getByRole("heading", { name: "Sam's workspace" }),
      ).toBeVisible();
      await page.getByLabel("Your note").fill("A private thought worth keeping");
      await page.getByRole("button", { name: "Save note" }).click();
      await expect(
        page.getByText("A private thought worth keeping", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Edit note" }).click();
      await expect(page.getByLabel("Your note")).toHaveValue(
        "A private thought worth keeping",
      );
      await page
        .getByLabel("Your note")
        .fill("A private thought worth keeping, revised");
      await page.getByRole("button", { name: "Save note" }).click();
      await expect(
        page.getByText("A private thought worth keeping, revised", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Edit note" }).click();
      await expect(page.getByLabel("Your note")).toHaveValue(
        "A private thought worth keeping, revised",
      );
      await page.getByLabel("Your note").fill("A private thought worth keeping");
      await page.getByRole("button", { name: "Save note" }).click();
      await page.reload();
      await expect(
        page.getByText("A private thought worth keeping", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
      await page.getByRole("textbox", { name: "Email" }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill("wrong-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText(
        "Check your email and password.",
      );
      await page.getByLabel("Password", { exact: true }).fill("local-password-123");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(
        page.getByText("A private thought worth keeping", { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await page.getByRole("button", { name: "Delete note" }).click();
      await expect(
        page.getByText("A private thought worth keeping", { exact: true }),
      ).toHaveCount(0);
      await authApplication.revokeSessions(email);
      await page.getByLabel("Your note").fill("This must not be saved");
      await page.getByRole("button", { name: "Save note" }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
    });
  });
}
