import { expect } from "@playwright/test";
import { test } from "./auth.fixture";

test("the installed global listeners report browser exceptions and unhandled rejections safely", async ({
  page,
  authApplication,
}) => {
  const records: Record<string, unknown>[] = [];
  page.on("console", (message) => {
    try {
      const record: Record<string, unknown> = JSON.parse(message.text());
      if (record.event === "application_error") records.push(record);
    } catch {
      /* Other browser output is not an application diagnostic. */
    }
  });
  await page.goto(authApplication.origin);
  await expect(page.getByRole("heading", { name: "Landing page" })).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(
      new ErrorEvent("error", { error: new TypeError("private exception payload") }),
    );
    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: new Error("private rejected payload"),
      }),
    );
  });
  await expect
    .poll(
      () =>
        records.filter((record) => record.code === "UNHANDLED_APPLICATION_ERROR")
          .length,
    )
    .toBe(2);
  expect(records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: "browser",
        error: expect.objectContaining({ type: "TypeError" }),
      }),
      expect.objectContaining({
        source: "browser",
        error: expect.objectContaining({ type: "Error" }),
      }),
    ]),
  );
  expect(JSON.stringify(records)).not.toContain("private");
});
