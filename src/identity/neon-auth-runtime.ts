import {
  createAuthServer,
  extractNeonAuthCookies,
  handleAuthProxyRequest,
  NEON_AUTH_SESSION_COOKIE_NAME,
  parseSetCookies,
  serializeSetCookie,
} from "@neondatabase/auth/server";
import {
  AuthenticatedIdentitySchema,
  IdentityProviderUnavailableError,
  type IdentityProvider,
} from "./identity-provider";
import type { NeonAuthRuntimeConfig } from "./neon-auth-config";

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
      const auth = createAuthServer({
        ...config,
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
        .catch(() => {
          throw new IdentityProviderUnavailableError();
        });
      if (result.error) {
        throw new IdentityProviderUnavailableError();
      }
      if (result.data === null) return null;
      if (!result.data?.session || !result.data.user) {
        throw new IdentityProviderUnavailableError();
      }
      const identity = AuthenticatedIdentitySchema.safeParse({
        email: result.data.user.email,
        name: result.data.user.name,
        sessionId: result.data.session.id,
        userId: result.data.user.id,
      });
      if (!identity.success) {
        throw new IdentityProviderUnavailableError();
      }
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
    const response = await handleAuthProxyRequest({
      ...config,
      request: proxied,
      path,
    });
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
