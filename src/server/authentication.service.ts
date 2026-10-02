import { Injectable } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request, Response } from "express";
import { BetterAuthIdentityProvider } from "../identity/better-auth-identity-provider";
import { createBetterAuthRuntime } from "../identity/better-auth-runtime";
import { readBetterAuthConfig } from "../identity/better-auth-config";
import { readNeonAuthConfig } from "../identity/neon-auth-config";
import { createNeonAuthRuntime } from "../identity/neon-auth-runtime";
import {
  IdentityProviderUnavailableError,
  type IdentityProvider,
} from "../identity/identity-provider";
import { resolveApplicationOrigin } from "../runtime/application-origin";
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
    } catch {
      throw new IdentityProviderUnavailableError();
    }
  }

  async requireUser(request: Request) {
    const user = await this.currentUser(request);
    if (!user) throw new ApiProblem(401, "SIGN_IN_REQUIRED", "Sign in to continue.");
    return user;
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
    const result = await runtime.handler(input).catch(() => {
      throw new IdentityProviderUnavailableError();
    });
    if (!result.ok) throw authenticationFailure(result.status);
    for (const [name, value] of result.headers)
      if (!["set-cookie", "content-encoding", "content-length"].includes(name))
        response.setHeader(name, value);
    const cookies = result.headers.getSetCookie();
    if (cookies.length) response.setHeader("set-cookie", cookies);
    response.setHeader("cache-control", "private, no-store");
    response.status(result.status).send(Buffer.from(await result.arrayBuffer()));
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

function authenticationFailure(status: number): ApiProblem {
  if (status >= 500)
    return new ApiProblem(
      503,
      "AUTH_UNAVAILABLE",
      "Authentication is temporarily unavailable. Try again.",
    );
  if (status === 429)
    return new ApiProblem(
      429,
      "AUTH_RATE_LIMITED",
      "Too many attempts. Wait before trying again.",
    );
  if (status === 401)
    return new ApiProblem(401, "INVALID_CREDENTIALS", "Check your email and password.");
  return new ApiProblem(
    400,
    "AUTH_REQUEST_REJECTED",
    "Check your account details and try again.",
  );
}
