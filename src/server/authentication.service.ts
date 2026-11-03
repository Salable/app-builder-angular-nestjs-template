import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import type { Request, Response } from "express";
import { BetterAuthIdentityProvider } from "../identity/better-auth-identity-provider";
import { createBetterAuthRuntime } from "../identity/better-auth-runtime";
import { readBetterAuthConfig } from "../identity/better-auth-config";
import { readNeonAuthConfig } from "../identity/neon-auth-config";
import {
  createNeonAuthRuntime,
  getNeonAuthResponseFailure,
} from "../identity/neon-auth-runtime";
import {
  IdentityProviderUnavailableError,
  type IdentityProvider,
} from "../identity/identity-provider";
import { resolveApplicationOrigin } from "../runtime/application-origin";
import { DiagnosticError, reportError } from "../runtime/error-logger";
import { ApiProblem } from "./problem-detail";

type Runtime = {
  identity: IdentityProvider;
  handler(request: globalThis.Request): Promise<globalThis.Response>;
  close?(): Promise<void>;
};

@Injectable()
export class AuthenticationService {
  private runtime: Runtime | undefined;

  async currentUser(request: Request) {
    if (!request.headers.cookie) return null;
    const runtime = this.getRuntime();
    try {
      const identity = await runtime.identity.authenticate(
        fromNodeHeaders(request.headers),
      );
      return (
        identity && {
          userId: identity.userId,
          displayName: identity.name,
          email: identity.email,
        }
      );
    } catch (error) {
      if (error instanceof IdentityProviderUnavailableError) throw error;
      throw new IdentityProviderUnavailableError({
        cause: new DiagnosticError(
          {
            category: "provider",
            dependency: "identity",
            operation: "identity.session",
          },
          { cause: error },
        ),
      });
    }
  }

  assertSameOrigin(request: Request): void {
    if (request.headers.origin !== resolveApplicationOrigin())
      throw new ApiProblem(403, "INVALID_ORIGIN", "The request origin is not allowed.");
  }

  async handle(request: Request, response: Response): Promise<void> {
    if (!["GET", "POST"].includes(request.method))
      throw new ApiProblem(
        404,
        "NOT_FOUND",
        "This authentication endpoint does not exist.",
      );
    if (request.method === "POST") this.assertSameOrigin(request);
    const runtime = this.getRuntime();
    const input = new globalThis.Request(
      new URL(request.originalUrl, resolveApplicationOrigin()),
      {
        method: request.method,
        headers: fromNodeHeaders(request.headers),
        ...(request.method === "POST" ? { body: JSON.stringify(request.body) } : {}),
      },
    );
    const result = await runtime.handler(input).catch((error: unknown) => {
      throw new IdentityProviderUnavailableError({
        cause: new DiagnosticError(
          { category: "provider", dependency: "identity", operation: "identity.proxy" },
          { cause: error },
        ),
      });
    });
    const diagnostic = getNeonAuthResponseFailure(result);
    if (!result.ok) throw authenticationFailure(result.status, diagnostic);
    for (const [name, value] of result.headers)
      if (!["set-cookie", "content-encoding", "content-length"].includes(name))
        response.setHeader(name, value);
    const cookies = result.headers.getSetCookie();
    if (cookies.length) response.setHeader("set-cookie", cookies);
    response.setHeader("cache-control", "private, no-store");
    const body = Buffer.from(await result.arrayBuffer());
    if (diagnostic) {
      const correlationId = `corr_${randomUUID()}`;
      response.setHeader("x-correlation-id", correlationId);
      response.once("finish", () =>
        reportError(diagnostic, {
          source: "server",
          operation: "identity.proxy",
          code: "AUTH_RESPONSE_DEGRADED",
          correlationId,
          method: request.method,
          // This callback describes optional SDK work; the successful auth response stays unchanged.
          ...(typeof request.route?.path === "string"
            ? { path: request.route.path }
            : {}),
        }),
      );
    }
    response.status(result.status).send(body);
  }

  async onModuleDestroy() {
    await this.runtime?.close?.();
  }

  private getRuntime(): Runtime {
    if (this.runtime) return this.runtime;
    const neon = readNeonAuthConfig(process.env);
    if (neon) return (this.runtime = createNeonAuthRuntime(neon));
    const runtime = createBetterAuthRuntime(readBetterAuthConfig(process.env));
    return (this.runtime = {
      identity: new BetterAuthIdentityProvider(() => runtime.auth),
      handler: (request) => runtime.auth.handler(request),
      close: runtime.close,
    });
  }
}

function authenticationFailure(
  status: number,
  diagnostic?: DiagnosticError,
): ApiProblem {
  const options = {
    cause:
      diagnostic ??
      new DiagnosticError({
        category: "provider",
        dependency: "identity",
        operation: "identity.proxy",
        httpStatus: status,
      }),
  };
  if (status >= 500)
    return new ApiProblem(
      503,
      "AUTH_UNAVAILABLE",
      "Authentication is temporarily unavailable. Try again.",
      options,
    );
  if (status === 429)
    return new ApiProblem(
      429,
      "AUTH_RATE_LIMITED",
      "Too many attempts. Wait before trying again.",
      options,
    );
  if (status === 401)
    return new ApiProblem(
      401,
      "INVALID_CREDENTIALS",
      "Check your email and password.",
      options,
    );
  return new ApiProblem(
    400,
    "AUTH_REQUEST_REJECTED",
    "Check your account details and try again.",
    options,
  );
}
