import "reflect-metadata";
import { Controller, Get, Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { IdentityConfigurationError } from "../identity/identity-provider";
import { ApiProblem, ProblemDetailFilter } from "./problem-detail";

let failure: unknown;
let serverResponse: Response;

@Controller()
class FailureController {
  @Get("failure")
  fail() {
    throw failure;
  }
}

@Module({ controllers: [FailureController] })
class FailureModule {}

describe("HTTP failure diagnostics", () => {
  let app: INestApplication;
  let origin: string;

  beforeAll(async () => {
    app = await NestFactory.create(FailureModule, { logger: false });
    app.use((_request: Request, response: Response, next: NextFunction) => {
      serverResponse = response;
      next();
    });
    app.useGlobalFilters(new ProblemDetailFilter());
    await app.listen(0, "127.0.0.1");
    origin = await app.getUrl();
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => app.close());

  for (const [label, error, diagnostic] of [
    ["ordinary error", new Error("private exception detail"), { type: "Error" }],
    ["typed error", new TypeError("private exception detail"), { type: "TypeError" }],
    [
      "SQLSTATE",
      Object.assign(new Error("private SQL and values"), { code: "42P01" }),
      { type: "Error", code: "42P01" },
    ],
    [
      "Node error code",
      Object.assign(new Error("private connection string"), { code: "ECONNREFUSED" }),
      { type: "Error", code: "ECONNREFUSED" },
    ],
    [
      "unsafe code",
      Object.assign(new Error("private exception detail"), { code: "private-token" }),
      { type: "Error" },
    ],
    ["non-error value", { token: "private-token" }, { type: "NonErrorThrown" }],
  ] as const) {
    it(`correlates a ${label} after sending the response without logging private content`, async () => {
      failure = error;
      const finished: boolean[] = [];
      const log = vi.spyOn(console, "error").mockImplementation(() => {
        finished.push(serverResponse.writableFinished);
      });
      const response = await fetch(`${origin}/failure?token=private-query`, {
        headers: { authorization: "Bearer private-token", cookie: "session=private" },
      });
      const problem = await response.json();
      expect(response.status).toBe(500);
      expect(response.headers.get("x-correlation-id")).toBe(problem.correlationId);
      expect(problem.code).toBe("INTERNAL_ERROR");
      expect(log).toHaveBeenCalledExactlyOnceWith("Request failed", {
        correlationId: problem.correlationId,
        code: "INTERNAL_ERROR",
        status: 500,
        instance: "/failure",
        error: diagnostic,
      });
      expect(finished).toEqual([true]);
      expect(JSON.stringify([problem, log.mock.calls])).not.toContain("private");
    });
  }

  it("also records expected configuration failures", async () => {
    failure = new IdentityConfigurationError("private configuration detail");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await fetch(`${origin}/failure`);
    const problem = await response.json();
    expect(response.status).toBe(503);
    expect(log).toHaveBeenCalledExactlyOnceWith("Request failed", {
      correlationId: problem.correlationId,
      code: "AUTH_NOT_CONFIGURED",
      status: 503,
      instance: "/failure",
      error: { type: "IdentityConfigurationError" },
    });
    expect(JSON.stringify([problem, log.mock.calls])).not.toContain("private");
  });

  it("does not record expected client rejections as server failures", async () => {
    failure = new ApiProblem(400, "INVALID_INPUT", "Check the input.");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await fetch(`${origin}/failure`);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_INPUT");
    expect(log).not.toHaveBeenCalled();
  });

  it("keeps the response and server usable when the diagnostic sink fails", async () => {
    failure = new Error("private failure");
    const log = vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("Logging failed");
    });
    const response = await fetch(`${origin}/failure`);
    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe("INTERNAL_ERROR");
    expect(log).toHaveBeenCalledOnce();
    failure = new ApiProblem(404, "NOT_FOUND", "Not found.");
    expect((await fetch(`${origin}/failure`)).status).toBe(404);
    expect(log).toHaveBeenCalledOnce();
  });
});
