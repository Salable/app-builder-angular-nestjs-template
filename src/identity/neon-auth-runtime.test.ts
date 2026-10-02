import { afterEach, describe, expect, it, vi } from "vitest";
import { getGlobalBroadcastChannel } from "better-auth/client";
import { createNeonAuthRuntime } from "./neon-auth-runtime";
const config = {
  applicationOrigin: "https://app.example.test",
  baseUrl: "https://branch.auth.neon.tech/neondb/auth",
  cookieSecret: "cookie-secret-with-at-least-32-characters",
};
const session = (id: string) => ({
  session: {
    id: `session-${id}`,
    userId: id,
    token: `token-${id}`,
    expiresAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  user: {
    id,
    email: `${id}@example.test`,
    name: id,
    emailVerified: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
});
afterEach(() => vi.unstubAllGlobals());
describe("managed Neon authentication runtime", () => {
  it("isolates concurrent server identities, reads current sessions, and never creates broadcast subscribers", async () => {
    const channel = getGlobalBroadcastChannel();
    const subscribe = vi.spyOn(channel, "subscribe");
    const requests: { url: string; cookie: string }[] = [];
    let revoked = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit) => {
        const cookie = new Headers(options.headers).get("cookie")!;
        requests.push({ url, cookie });
        expect(new Headers(options.headers).get("origin")).toBe(
          config.applicationOrigin,
        );
        return Response.json(
          revoked ? null : session(cookie.endsWith("alice") ? "alice" : "bob"),
        );
      }),
    );
    const runtime = createNeonAuthRuntime(config);
    const headers = (id: string) =>
      new Headers({
        cookie: `analytics=private; __Secure-neon-auth.session_token=${id}; app-secret=private`,
      });
    try {
      const results = await Promise.all(
        Array.from({ length: 40 }, (_, index) =>
          runtime.identity.authenticate(headers(index % 2 ? "bob" : "alice")),
        ),
      );
      expect(results.map((result) => result?.userId)).toEqual(
        Array.from({ length: 40 }, (_, index) => (index % 2 ? "bob" : "alice")),
      );
      expect(requests).toHaveLength(40);
      expect(
        requests.every(
          ({ url, cookie }) =>
            url.endsWith("/get-session?disableCookieCache=true") &&
            /^__Secure-neon-auth\.session_token=(alice|bob)$/.test(cookie),
        ),
      ).toBe(true);
      expect(subscribe).not.toHaveBeenCalled();
      revoked = true;
      expect(await runtime.identity.authenticate(headers("alice"))).toBeNull();
      expect(requests).toHaveLength(41);
      expect(
        await runtime.identity.authenticate(
          new Headers({ cookie: "analytics=private" }),
        ),
      ).toBeNull();
      expect(requests).toHaveLength(41);
    } finally {
      subscribe.mockRestore();
    }
  });
  it("preserves proxy JSON semantics, prevents caching, and verifies mutation origins", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(session("alice")), {
          headers: {
            "content-type": "application/json",
            "content-encoding": "gzip",
            "cache-control": "public, max-age=3600",
          },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const runtime = createNeonAuthRuntime(config);
    const response = await runtime.handler(
      new Request(`${config.applicationOrigin}/api/auth/get-session`, {
        headers: {
          cookie: "__Secure-neon-auth.session_token=alice; unrelated=private",
        },
      }),
    );
    expect(await response.json()).toEqual(session("alice"));
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(fetch).toHaveBeenCalledOnce();
    const rejected = await runtime.handler(
      new Request(`${config.applicationOrigin}/api/auth/sign-out`, {
        method: "POST",
        headers: { origin: "https://unrelated.example.test" },
        body: "{}",
      }),
    );
    expect(rejected.status).toBe(403);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("forwards a same-origin mutation and scopes returned cookies to the application", async () => {
    const headers = new Headers({
      "content-type": "application/json",
      "content-length": "999",
    });
    headers.append(
      "set-cookie",
      "__Secure-neon-auth.session_token=opaque; Domain=branch.auth.neon.tech; Path=/auth; Secure; HttpOnly; SameSite=Lax",
    );
    const transport = vi.fn<typeof fetch>(async (url) =>
      String(url).includes("/get-session")
        ? Response.json(null)
        : new Response('{"ok":true}', { headers }),
    );
    vi.stubGlobal("fetch", transport);
    const response = await createNeonAuthRuntime(config).handler(
      new Request(`${config.applicationOrigin}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          origin: config.applicationOrigin,
          "content-type": "application/json",
        },
        body: '{"email":"alice@example.test","password":"private-password"}',
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(
      transport.mock.calls.map(([url, request]) => [
        new URL(String(url)).pathname,
        request?.method ?? "GET",
      ]),
    ).toEqual([
      ["/neondb/auth/sign-in/email", "POST"],
      ["/neondb/auth/get-session", "GET"],
    ]);
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain("__Secure-neon-auth.session_token=opaque");
    expect(cookies[0]).toMatch(/Path=\/(?:;|$)/);
    expect(cookies[0]).not.toMatch(/Domain=/i);
    expect(cookies[0]).toMatch(/HttpOnly/i);
    expect(cookies[0]).toMatch(/Secure/i);
    expect(cookies[0]).toMatch(/SameSite=Lax/i);
    expect(response.headers.get("content-length")).toBeNull();
  });

  it.each([
    [
      "upstream rejection",
      () => Promise.resolve(new Response("private upstream", { status: 503 })),
    ],
    [
      "invalid session shape",
      () =>
        Promise.resolve(
          Response.json({ session: { id: "session-bad" }, user: { email: "invalid" } }),
        ),
    ],
    [
      "missing session",
      () => Promise.resolve(Response.json({ user: session("alice").user })),
    ],
    [
      "missing user",
      () => Promise.resolve(Response.json({ session: session("alice").session })),
    ],
    [
      "transport failure",
      () => Promise.reject(new Error("private connection details")),
    ],
  ] as const)("reports a safe identity error after %s", async (_name, transport) => {
    vi.stubGlobal("fetch", vi.fn(transport));
    const runtime = createNeonAuthRuntime(config);
    await expect(
      runtime.identity.authenticate(
        new Headers({ cookie: "__Secure-neon-auth.session_token=alice" }),
      ),
    ).rejects.toMatchObject({
      name: "IdentityProviderUnavailableError",
      message: "The identity provider could not complete the request.",
    });
  });

  it("fails closed when the pinned Neon SDK maps invalid JSON to no session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("private invalid JSON", {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(
      createNeonAuthRuntime(config).identity.authenticate(
        new Headers({ cookie: "__Secure-neon-auth.session_token=alice" }),
      ),
    ).resolves.toBeNull();
  });

  it.each([
    ["GET", "/api/auth/"],
    ["DELETE", "/api/auth/sign-out"],
  ])(
    "rejects unsupported auth route %s %s before contacting Neon",
    async (method, path) => {
      const transport = vi.fn();
      vi.stubGlobal("fetch", transport);
      const response = await createNeonAuthRuntime(config).handler(
        new Request(`${config.applicationOrigin}${path}`, { method }),
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        message: "Authentication route not found.",
      });
      expect(transport).not.toHaveBeenCalled();
    },
  );
});
