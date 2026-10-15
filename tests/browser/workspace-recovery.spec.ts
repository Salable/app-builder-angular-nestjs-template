import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { test } from "./auth.fixture";

test.use({ authMode: "NEON_AUTH" });
test.beforeEach(async ({ page, authApplication }) => {
  await page.goto(`${authApplication.origin}/sign-up`);
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Sam");
  await page
    .getByRole("textbox", { name: "Email" })
    .fill(`${randomUUID()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("local-password-123");
  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
});

test("a failed session load retries without displaying an authenticated shell", async ({
  page,
  authApplication,
}) => {
  await authApplication.withIdentityUnavailable(async () => {
    await page.reload();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText("Signed in as", { exact: false })).toHaveCount(0);
    const response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/v1/session",
    );
    await page.getByRole("button", { name: "Retry loading" }).click();
    expect((await response).status()).toBe(503);
    await expect(page.getByRole("alert")).toBeVisible();
  });
  await page.getByRole("button", { name: "Retry loading" }).click();
  await expect(page.getByText("Signed in as", { exact: false })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a failed sign-out retains the signed-in view and can be retried", async ({
  page,
  authApplication,
}) => {
  await authApplication.withIdentityUnavailable(async () => {
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText("Signed in as", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry loading" })).toHaveCount(0);
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in required" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
