import {
  createAuthServer,
  extractNeonAuthCookies,
  handleAuthProxyRequest,
  NEON_AUTH_SESSION_COOKIE_NAME,
  NEON_AUTH_NETWORK_ERROR_CODES,
  parseSetCookies,
  serializeSetCookie,
} from "@neondatabase/auth/server";
import {
  AuthenticatedIdentitySchema,
  IdentityProviderUnavailableError,
  type IdentityProvider,
} from "./identity-provider";
import type { NeonAuthRuntimeConfig } from "./neon-auth-config";
import { DiagnosticError, reportError } from "../runtime/error-logger";

const responseFailures = new WeakMap<Response, DiagnosticError>();

/** Keep SDK diagnostics outside the public response; its owner reports them once. */
export function getNeonAuthResponseFailure(
  response: Response,
): DiagnosticError | undefined {
  return responseFailures.get(response);
}

export function createNeonAuthRuntime(config: NeonAuthRuntimeConfig) {
  const identity: IdentityProvider = {
    async authenticate(headers) {
      const cookies = extractNeonAuthCookies(headers);
      if (
        !cookies
          .split("; ")
          .some((cookie) => cookie.startsWith(`${NEON_AUTH_SESSION_COOKIE_NAME}=`))
      )
        return null;
      // The server toolkit holds no browser client, broadcast listener, or user
      // session cache. Each call binds only this request's allowed cookies.
      const diagnostics = captureDiagnostics("identity.session");
      const auth = createAuthServer({
        ...config,
        log: diagnostics.log,
        context: () => ({
          getCookies: () => cookies,
          getHeader: (name) => headers.get(name),
          getOrigin: () => config.applicationOrigin,
          getFramework: () => "nestjs",
          // Session reads never mint application identity or mutate its response.
          // Browser session refresh and cookie updates use the proxy below.
          setCookie: () => undefined,
        }),
      });
      const result = await auth
        .getSession({ query: { disableCookieCache: "true" } })
        .catch((error: unknown) => {
          throw unavailable(
            "PROVIDER_REQUEST_FAILED",
            error,
            undefined,
            diagnostics.failure(),
          );
        });
      if (result.error) {
        throw unavailable(
          "PROVIDER_REQUEST_FAILED",
          undefined,
          result.error.status,
          diagnostics.failure(),
        );
      }
      if (result.data === null) {
        reportSessionDiagnostic(diagnostics.failure());
        return null;
      }
      if (!result.data?.session || !result.data.user) {
        throw unavailable("INVALID_PROVIDER_RESPONSE");
      }
      const identity = AuthenticatedIdentitySchema.safeParse({
        email: result.data.user.email,
        name: result.data.user.name,
        sessionId: result.data.session.id,
        userId: result.data.user.id,
      });
      if (!identity.success) {
        throw unavailable("INVALID_PROVIDER_RESPONSE");
      }
      reportSessionDiagnostic(diagnostics.failure());
      return identity.data;
    },
  };

  async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.slice("/api/auth/".length);
    if (!path || !["GET", "POST"].includes(request.method)) {
      return Response.json(
        { message: "Authentication route not found." },
        { status: 404 },
      );
    }
    if (
      request.method === "POST" &&
      request.headers.get("origin") !== config.applicationOrigin
    ) {
      return Response.json({ message: "Invalid request origin." }, { status: 403 });
    }
    const headers = new Headers(request.headers);
    headers.set("origin", config.applicationOrigin);
    // Session revocation is authoritative for browser reads as well as SSR/API.
    if (path === "get-session") url.searchParams.set("disableCookieCache", "true");
    const proxied = new Request(url, {
      method: request.method,
      headers,
      ...(request.body === null ? {} : { body: await request.text() }),
    });
    const diagnostics = captureDiagnostics("identity.proxy");
    const response = await handleAuthProxyRequest({
      ...config,
      request: proxied,
      path,
      log: diagnostics.log,
    });
    const failure = diagnostics.failure();
    if (failure) responseFailures.set(response, failure);
    const cookies = response.headers.getSetCookie();
    response.headers.delete("set-cookie");
    for (const header of cookies) {
      for (const cookie of parseSetCookies(header)) {
        response.headers.append(
          "set-cookie",
          serializeSetCookie({ ...cookie, domain: undefined, path: "/" }),
        );
      }
    }
    // Fetch decodes upstream bodies. The pinned toolkit retains their original
    // encoding header and drops cache directives; normalize at our HTTP boundary.
    response.headers.delete("content-encoding");
    response.headers.delete("content-length");
    response.headers.set("cache-control", "private, no-store");
    response.headers.set("pragma", "no-cache");
    return response;
  }
  return { identity, handler };
}

function unavailable(
  code: string,
  cause?: unknown,
  httpStatus?: number,
  diagnostic?: DiagnosticError,
) {
  return new IdentityProviderUnavailableError({
    cause: new DiagnosticError(
      diagnostic?.diagnostic ?? {
        category: "provider",
        dependency: "neon-auth",
        operation: "identity.session",
        code,
        ...(httpStatus === undefined ? {} : { httpStatus }),
      },
      { cause },
    ),
  });
}

function reportSessionDiagnostic(failure: DiagnosticError | undefined): void {
  if (!failure) return;
  reportError(failure, {
    source: "server",
    operation: "identity.session",
    code: "IDENTITY_RESPONSE_DEGRADED",
  });
}

function captureDiagnostics(operation: "identity.proxy" | "identity.session") {
  let failure: DiagnosticError | undefined;
  const capture = (_message: string, metadata?: unknown) => {
    // SDK metadata can include private URLs and provider/parser messages. Copy
    // only documented HTTP status and the SDK's finite transport classification.
    const fields =
      metadata !== null && typeof metadata === "object"
        ? (metadata as Record<string, unknown>)
        : {};
    if (typeof fields.status === "number" && fields.status < 400) return;
    // SDK statuses originate from Response.status; the shared logger validates
    // their integer range before emitting them.
    const httpStatus = typeof fields.status === "number" ? fields.status : undefined;
    const networkCode =
      typeof fields.code === "string" &&
      NEON_AUTH_NETWORK_ERROR_CODES.some((code) => code === fields.code)
        ? fields.code
        : undefined;
    failure = new DiagnosticError({
      category: "provider",
      dependency: "neon-auth",
      operation,
      code:
        networkCode ??
        (httpStatus === undefined
          ? "IDENTITY_PROXY_FAILED"
          : "IDENTITY_REQUEST_REJECTED"),
      ...(httpStatus === undefined ? {} : { httpStatus }),
    });
  };

  return {
    failure: () => failure,
    log: { error: capture, warn: capture, info: capture, debug: () => undefined },
  };
}
