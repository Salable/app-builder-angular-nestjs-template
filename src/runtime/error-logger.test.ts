import { afterEach, describe, expect, it, vi } from "vitest";
import { DiagnosticError, reportError } from "./error-logger";

const context = {
  source: "server" as const,
  operation: "billing.read",
  code: "BILLING_UNAVAILABLE",
  correlationId: "corr_00000000-0000-4000-8000-000000000001",
  status: 503,
  method: "GET",
  path: "/api/subscriptions/:id",
};

afterEach(() => vi.restoreAllMocks());

describe("safe application error logger", () => {
  it("retains adapter classification, original code and source location without private data", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const original = Object.assign(
      new Error("Bearer private-secret user@example.com"),
      {
        code: "ECONNREFUSED",
        request: { authorization: "private-secret" },
        response: { body: "private-payload" },
        stack:
          "Error: Bearer private-secret user@example.com\n    at request (/private/user/billing-adapter.ts:42:9)\n    at https://host/path.js?token=private-secret:1:2",
      },
    );
    const provider = new DiagnosticError(
      {
        category: "provider",
        dependency: "salable",
        operation: "subscriptions.read",
        httpStatus: 502,
        code: "PROVIDER_REJECTED",
      },
      { cause: original },
    );
    reportError(new Error("safe public text", { cause: provider }), context);
    expect(output).toHaveBeenCalledTimes(1);
    const serialized = output.mock.calls[0]?.[0] as string;
    const record = JSON.parse(serialized);
    expect(record).toMatchObject({
      ...context,
      event: "application_error",
      error: {
        type: "Error",
        cause: {
          type: "DiagnosticError",
          diagnostic: {
            category: "provider",
            dependency: "salable",
            operation: "subscriptions.read",
            httpStatus: 502,
          },
          cause: {
            type: "Error",
            code: "ECONNREFUSED",
            frames: ["billing-adapter.ts:42:9"],
          },
        },
      },
    });
    expect(Number.isNaN(Date.parse(record.timestamp))).toBe(false);
    for (const privateValue of [
      "private-secret",
      "private-payload",
      "user@example.com",
      "safe public text",
      "/private/user",
      "authorization",
      "response",
    ])
      expect(serialized).not.toContain(privateValue);
  });

  it("records a handled degraded result even without an HTTP error status", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    reportError(
      new DiagnosticError({
        category: "configuration",
        operation: "billing.configure",
        dependency: "salable",
        code: "KEY_MISSING",
      }),
      { ...context, status: 200 },
    );
    expect(JSON.parse(output.mock.calls[0]?.[0] as string)).toMatchObject({
      code: "BILLING_UNAVAILABLE",
      status: 200,
      error: { diagnostic: { category: "configuration", code: "KEY_MISSING" } },
    });
  });

  it("uses warning severity for an expected rejection and sanitizes context", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    reportError(undefined, {
      ...context,
      source: "browser",
      status: 403,
      path: "/api/section?token=secret#private",
    });
    expect(error).not.toHaveBeenCalled();
    expect(JSON.parse(warning.mock.calls[0]?.[0] as string)).toMatchObject({
      source: "browser",
      status: 403,
      path: "/api/section",
      error: { type: "NonErrorThrown" },
    });
    expect(warning.mock.calls[0]?.[0]).not.toContain("secret");
  });

  it("bounds cause cycles, depth and source frames", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cyclic = new Error("cycle");
    cyclic.cause = cyclic;
    reportError(cyclic, context);
    expect(JSON.parse(output.mock.calls[0]?.[0] as string).error.cause).toEqual({
      type: "CircularCause",
    });
    let deep = new Error("base");
    for (let i = 0; i < 8; i++) deep = new Error("wrapper", { cause: deep });
    deep.stack = `Error: wrapper\n${Array.from({ length: 12 }, (_, i) => `    at /app/file.ts:${i + 1}:1`).join("\n")}`;
    reportError(deep, context);
    const record = JSON.parse(output.mock.calls[1]?.[0] as string);
    expect(record.error.frames).toHaveLength(6);
    expect(record.error.cause.cause.cause.cause).toEqual({ type: "CauseLimit" });
  });

  it("removes complete multiline messages before extracting genuine runtime frames", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new TypeError(
      "Provider rejected private-payload\n/private/customer-secret.ts:42:9\n    at /private/private-token.js:71:3",
    );
    reportError(error, context);
    const serialized = output.mock.calls[0]?.[0] as string;
    const record = JSON.parse(serialized);
    expect(record.error.type).toBe("TypeError");
    expect(record.error.frames).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^error-logger\.test\.ts:\d+:\d+$/),
      ]),
    );
    for (const value of ["private-payload", "customer-secret", "private-token"])
      expect(serialized).not.toContain(value);
  });

  it("omits unfamiliar stacks and unavailable stack accessors instead of guessing at their contents", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("private text");
    error.stack = "unknown header\n    at /private/customer-secret.ts:42:9";
    reportError(error, context);
    expect(JSON.parse(output.mock.calls[0]?.[0] as string).error).toEqual({
      type: "Error",
    });
    Object.defineProperty(error, "stack", {
      get() {
        throw new Error("private stack");
      },
    });
    reportError(error, context);
    expect(JSON.parse(output.mock.calls[1]?.[0] as string).error).toEqual({
      type: "Error",
    });
    expect(JSON.stringify(output.mock.calls)).not.toContain("private");
  });

  it("ignores accessors and invalid metadata instead of printing arbitrary values", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("private");
    const getter = vi.fn(() => {
      throw new Error("must not inspect");
    });
    Object.defineProperty(error, "code", { get: getter });
    Object.defineProperty(error, "cause", { get: getter });
    reportError(error, {
      ...context,
      operation: "user@example.com",
      code: "secret token",
      correlationId: "private secret",
      path: "https://host/secret",
      method: "secret",
      status: 999,
    });
    expect(getter).not.toHaveBeenCalled();
    const record = JSON.parse(output.mock.calls[0]?.[0] as string);
    expect(record.operation).toBe("unknown");
    expect(record.code).toBe("UNEXPECTED_ERROR");
    for (const key of ["correlationId", "path", "method", "status"])
      expect(record).not.toHaveProperty(key);
    expect(record.error).not.toHaveProperty("code");
    reportError(
      new DiagnosticError({
        category: "unexpected",
        operation: "user@example.com",
        dependency: "Bearer secret",
        code: "private code",
        httpStatus: 999,
      }),
      context,
    );
    expect(JSON.parse(output.mock.calls[1]?.[0] as string).error.diagnostic).toEqual({
      category: "unexpected",
    });
  });

  it("reports unreadable errors safely and never lets an unavailable sink escape", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("private");
    Object.defineProperty(error, "constructor", {
      get() {
        throw new Error("private");
      },
    });
    expect(() => reportError(error, context)).not.toThrow();
    expect(JSON.parse(output.mock.calls[0]?.[0] as string).error).toEqual({
      type: "UnreadableError",
    });
    output.mockImplementation(() => {
      throw new Error("sink unavailable");
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {
      throw new Error("sink unavailable");
    });
    expect(() => reportError(new Error(), context)).not.toThrow();
    expect(() => reportError(new Error(), { ...context, status: 400 })).not.toThrow();
    expect(warning).toHaveBeenCalledTimes(1);
  });
});
