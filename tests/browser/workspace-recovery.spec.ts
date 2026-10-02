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
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByLabel("Your note")).toBeVisible();
});

test("a failed load retries loading and keeps the failure visible until recovery", async ({
  page,
  authApplication,
}) => {
  await page.getByLabel("Your note").fill("Already saved");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Already saved", { exact: true })).toBeVisible();
  await authApplication.withNotesUnavailable(async () => {
    await page.reload();
    await expect(page.getByRole("alert")).toBeVisible();
    const retry = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/v1/notes",
    );
    await page.getByRole("button", { name: "Retry loading" }).click();
    expect((await retry).status()).toBe(500);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry loading" })).toBeVisible();
  });
  await page.getByRole("button", { name: "Retry loading" }).click();
  await expect(page.getByText("Already saved", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("failed writes preserve the draft or note and recover through the original action", async ({
  page,
  authApplication,
}) => {
  for (const content of ["Keep my draft", "Keep my edited draft"]) {
    await page.getByLabel("Your note").fill(content);
    await authApplication.withNotesUnavailable(async () => {
      await page.getByRole("button", { name: "Save note" }).click();
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(page.getByRole("button", { name: /Retry/ })).toHaveCount(0);
      await expect(page.getByLabel("Your note")).toHaveValue(content);
    });
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByText(content, { exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Edit note" })).toHaveCount(1);
    await page.getByRole("button", { name: "Edit note" }).click();
    await expect(page.getByLabel("Your note")).toHaveValue(content);
  }
  await authApplication.withNotesUnavailable(async () => {
    await page.getByRole("button", { name: "Delete note" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: /Retry/ })).toHaveCount(0);
    await expect(page.getByText("Keep my edited draft", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Your note")).toHaveValue("Keep my edited draft");
  });
  await page.getByRole("button", { name: "Delete note" }).click();
  await expect(page.getByRole("button", { name: "Delete note" })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Your note")).toHaveValue("");
  await page.reload();
  await expect(page.getByLabel("Your note")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit note" })).toHaveCount(0);
});
