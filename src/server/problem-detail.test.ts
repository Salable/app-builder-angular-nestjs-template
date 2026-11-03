import "reflect-metadata";
import {
  Controller,
  Get,
  Inject,
  Module,
  Req,
  type INestApplication,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { IdentityConfigurationError } from "../identity/identity-provider";
import { ApiProblem, ProblemDetailFilter } from "./problem-detail";
import { DiagnosticError } from "../runtime/error-logger";
import { AuthenticationService } from "./authentication.service";

const httpFetch = globalThis.fetch;

let failure: unknown;
let serverResponse: Response;

@Controller()
class FailureController {
  constructor(
    @Inject(AuthenticationService)
    private readonly authentication: AuthenticationService,
  ) {}
  @Get("failure")
  fail() {
    throw failure;
  }

  @Get("provider")
  provider(@Req() request: Request) {
    return this.authentication.currentUser(request);
  }
}

@Module({ controllers: [FailureController], providers: [AuthenticationService] })
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
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
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
      const response = await httpFetch(`${origin}/failure?token=private-query`, {
        headers: { authorization: "Bearer private-token", cookie: "session=private" },
      });
      const problem = await response.json();
      expect(response.status).toBe(500);
      expect(response.headers.get("x-correlation-id")).toBe(problem.correlationId);
      expect(problem.code).toBe("INTERNAL_ERROR");
      expect(log).toHaveBeenCalledOnce();
      expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
        source: "server",
        operation: "http.request",
        method: "GET",
        correlationId: problem.correlationId,
        code: "INTERNAL_ERROR",
        status: 500,
        path: "/failure",
        error: diagnostic,
      });
      expect(finished).toEqual([true]);
      expect(JSON.stringify([problem, log.mock.calls])).not.toContain("private");
    });
  }

  it("also records expected configuration failures", async () => {
    failure = new IdentityConfigurationError("private configuration detail");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await httpFetch(`${origin}/failure`);
    const problem = await response.json();
    expect(response.status).toBe(503);
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      correlationId: problem.correlationId,
      code: "AUTH_NOT_CONFIGURED",
      status: 503,
      error: {
        type: "IdentityConfigurationError",
        diagnostic: { category: "configuration" },
      },
    });
    expect(JSON.stringify([problem, log.mock.calls])).not.toContain("private");
  });

  it("does not record expected client rejections as server failures", async () => {
    failure = new ApiProblem(400, "INVALID_INPUT", "Check the input.");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await httpFetch(`${origin}/failure`);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_INPUT");
    expect(log).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledOnce();
    expect(JSON.parse(String(warning.mock.calls[0]?.[0]))).toMatchObject({
      status: 400,
      code: "INVALID_INPUT",
    });
  });

  it("retains normalized provider context and underlying cause through a wrapped problem", async () => {
    failure = new ApiProblem(503, "DEPENDENCY_UNAVAILABLE", "Try again.", {
      cause: new DiagnosticError(
        {
          category: "provider",
          dependency: "billing",
          operation: "subscription.read",
          httpStatus: 401,
        },
        {
          cause: Object.assign(new Error("private provider token and body"), {
            code: "ECONNRESET",
          }),
        },
      ),
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await httpFetch(`${origin}/failure`);
    const problem = await response.json();
    expect(response.status).toBe(503);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      correlationId: problem.correlationId,
      error: {
        type: "ApiProblem",
        cause: {
          diagnostic: {
            category: "provider",
            dependency: "billing",
            operation: "subscription.read",
            httpStatus: 401,
          },
          cause: { type: "Error", code: "ECONNRESET" },
        },
      },
    });
    expect(JSON.stringify([problem, log.mock.calls])).not.toContain("private");
  });

  it("reports the real adapter's upstream status while preserving the safe HTTP problem", async () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://branch.auth.neon.tech/neondb/auth");
    vi.stubEnv("VITE_NEON_AUTH_URL", "https://branch.auth.neon.tech/neondb/auth");
    vi.stubEnv(
      "NEON_AUTH_COOKIE_SECRET",
      "test-cookie-secret-with-at-least-32-characters",
    );
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("HOST", "127.0.0.1");
    vi.stubEnv("PORT", "3000");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ message: "private provider detail" }, { status: 503 }),
      ),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await httpFetch(`${origin}/provider`, {
      headers: { cookie: "__Secure-neon-auth.session_token=private-cookie" },
    });
    const problem = await response.json();
    expect(response.status).toBe(503);
    expect(problem.code).toBe("AUTH_UNAVAILABLE");
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      correlationId: problem.correlationId,
      error: {
        cause: {
          diagnostic: {
            dependency: "neon-auth",
            operation: "identity.session",
            httpStatus: 503,
            code: "PROVIDER_REQUEST_FAILED",
          },
        },
      },
    });
    expect(JSON.stringify([problem, log.mock.calls])).not.toContain("private");
  });

  it("keeps the response and server usable when the diagnostic sink fails", async () => {
    failure = new Error("private failure");
    const log = vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("Logging failed");
    });
    const response = await httpFetch(`${origin}/failure`);
    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe("INTERNAL_ERROR");
    expect(log).toHaveBeenCalledOnce();
    failure = new ApiProblem(404, "NOT_FOUND", "Not found.");
    expect((await httpFetch(`${origin}/failure`)).status).toBe(404);
    expect(log).toHaveBeenCalledOnce();
  });
});
