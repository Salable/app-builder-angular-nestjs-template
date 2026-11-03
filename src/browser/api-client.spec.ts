import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, failureMessage } from "./api-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("shared API client", () => {
  it("reads the current server user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          user: { userId: "user_1", displayName: "Sam", email: "sam@example.test" },
        }),
      ),
    );
    expect((await TestBed.inject(ApiClient).session()).user?.displayName).toBe("Sam");
  });
  it("preserves the safe problem code and detail", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            type: "about:blank",
            title: "Unauthorized",
            status: 401,
            code: "SIGN_IN_REQUIRED",
            detail: "Sign in to continue.",
            instance: "/api/v1/session",
            correlationId: "corr_00000000-0000-4000-8000-000000000001",
          },
          { status: 401 },
        ),
      ),
    );
    await expect(TestBed.inject(ApiClient).session()).rejects.toMatchObject({
      code: "SIGN_IN_REQUIRED",
      message: "Sign in to continue.",
      correlationId: "corr_00000000-0000-4000-8000-000000000001",
    });
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      source: "browser",
      operation: "api.request",
      status: 401,
      code: "SIGN_IN_REQUIRED",
      correlationId: "corr_00000000-0000-4000-8000-000000000001",
      method: "GET",
      path: "/api/v1/session",
    });
  });
  it("normalizes network failures without leaking their raw detail", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("private network detail");
      }),
    );
    await expect(TestBed.inject(ApiClient).session()).rejects.toMatchObject({
      code: "NETWORK_UNAVAILABLE",
    });
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      code: "NETWORK_UNAVAILABLE",
      error: { cause: { type: "Error" } },
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
  });
  for (const response of [
    () => new Response("upstream private body", { status: 503 }),
    () => Response.json({ message: "private detail" }, { status: 502 }),
  ]) {
    it("normalizes an unexpected error format", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => response()),
      );
      await expect(TestBed.inject(ApiClient).session()).rejects.toMatchObject({
        code: "REQUEST_FAILED",
        message: "The request could not be completed. Try again.",
      });
    });
  }
  for (const response of [
    () => new Response("not-json"),
    () => Response.json({ user: { userId: "incomplete" } }),
  ]) {
    it("rejects invalid success data", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => response()),
      );
      await expect(TestBed.inject(ApiClient).session()).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
      });
    });
  }
  it("keeps unexpected errors out of the presentation", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(failureMessage(new Error("private error"))).toBe(
      "Something went wrong. Try again.",
    );
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      operation: "ui.operation",
      code: "UNEXPECTED_OPERATION_ERROR",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
  });

  it("retains the original failure when logging fails and never logs submitted credentials", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("Sink unavailable");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("private provider payload", { status: 503 })),
    );
    await expect(
      TestBed.inject(ApiClient).authenticate(
        "sign-in",
        "private@example.test",
        "private-password",
        "Private Name",
      ),
    ).rejects.toMatchObject({ code: "REQUEST_FAILED" });
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
  });
});
