import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, failureMessage } from "./api-client";

afterEach(() => vi.unstubAllGlobals());
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
            instance: "/api/v1/notes",
            correlationId: "corr_fixture",
          },
          { status: 401 },
        ),
      ),
    );
    await expect(TestBed.inject(ApiClient).notes()).rejects.toMatchObject({
      code: "SIGN_IN_REQUIRED",
      message: "Sign in to continue.",
    });
  });
  it("normalizes network failures without leaking their raw detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("private network detail");
      }),
    );
    await expect(TestBed.inject(ApiClient).session()).rejects.toMatchObject({
      code: "NETWORK_UNAVAILABLE",
    });
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
  it("accepts a deletion without a response body", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      TestBed.inject(ApiClient).removeNote("note/id"),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/notes/note%2Fid",
      expect.objectContaining({ method: "DELETE", credentials: "same-origin" }),
    );
  });
  it("keeps unexpected errors out of the presentation", () => {
    expect(failureMessage(new Error("private error"))).toBe(
      "Something went wrong. Try again.",
    );
  });
});
