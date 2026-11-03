import { type INestApplication } from "@nestjs/common";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApplication } from "./application";

const httpFetch = globalThis.fetch;

describe("Neon SDK diagnostics at the real authentication HTTP boundary", () => {
  let app: INestApplication;
  let origin: string;

  beforeAll(async () => {
    ({ app } = await createApplication());
    await app.listen(0, "127.0.0.1");
    origin = await app.getUrl();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("HOST", "127.0.0.1");
    vi.stubEnv("PORT", new URL(origin).port);
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://branch.auth.neon.tech/neondb/auth");
    vi.stubEnv("VITE_NEON_AUTH_URL", "https://branch.auth.neon.tech/neondb/auth");
    vi.stubEnv(
      "NEON_AUTH_COOKIE_SECRET",
      "test-cookie-secret-with-at-least-32-characters",
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const signIn = () =>
    httpFetch(`${origin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        email: "private@example.test",
        password: "private-password",
      }),
    });

  it.each(["malformed JSON", "misleading transport message", "broken sink"])(
    "preserves successful sign-in and safe cookie-mint diagnostics after %s",
    async (scenario) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {
        if (scenario === "broken sink") throw new Error("Sink failed");
      });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const transport = vi.fn<typeof fetch>(async (url) => {
        if (String(url).includes("/get-session")) {
          if (scenario === "misleading transport message")
            throw new Error("Failed to fetch session data: 502 private-provider-text");
          return new Response("private-provider-payload-is-not-json", {
            headers: { "content-type": "application/json" },
          });
        }
        return new Response('{"ok":true}', {
          headers: {
            "content-type": "application/json",
            "set-cookie":
              "__Secure-neon-auth.session_token=private-session; Path=/; Secure; HttpOnly",
          },
        });
      });
      vi.stubGlobal("fetch", transport);
      const response = await signIn();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(response.headers.getSetCookie()).toEqual([
        expect.stringContaining("__Secure-neon-auth.session_token=private-session"),
      ]);
      expect(transport).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenCalledOnce();
      expect(warn).not.toHaveBeenCalled();
      expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
        source: "server",
        code: "AUTH_RESPONSE_DEGRADED",
        correlationId: response.headers.get("x-correlation-id"),
        error: {
          diagnostic: {
            dependency: "neon-auth",
            operation: "identity.proxy",
            code: "IDENTITY_SDK_FAILED",
          },
        },
      });
      expect(
        JSON.parse(String(log.mock.calls[0]?.[0])).error.diagnostic,
      ).not.toHaveProperty("httpStatus");
      expect(JSON.stringify(log.mock.calls)).not.toContain("private");
    },
  );

  it("retains SDK transport classification rather than treating its synthetic 502 as an upstream rejection", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("private fetch URL", {
          cause: Object.assign(new Error("private network details"), {
            code: "ENOTFOUND",
          }),
        });
      }),
    );
    const response = await signIn();
    const problem = await response.json();
    expect(response.status).toBe(503);
    expect(problem.code).toBe("AUTH_UNAVAILABLE");
    expect(log).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      correlationId: problem.correlationId,
      error: {
        cause: {
          diagnostic: {
            dependency: "neon-auth",
            operation: "identity.proxy",
            code: "NETWORK_DNS",
          },
        },
      },
    });
    expect(
      JSON.parse(String(log.mock.calls[0]?.[0])).error.cause.diagnostic,
    ).not.toHaveProperty("httpStatus");
    expect(JSON.stringify([problem, log.mock.calls])).not.toContain("private");
  });

  it.each([
    [401, 401, "INVALID_CREDENTIALS"],
    [429, 429, "AUTH_RATE_LIMITED"],
    [502, 503, "AUTH_UNAVAILABLE"],
  ])(
    "retains upstream status %i through public status %i",
    async (upstreamStatus, publicStatus, code) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json(
            { message: "private provider body" },
            { status: upstreamStatus },
          ),
        ),
      );
      const response = await signIn();
      const problem = await response.json();
      expect(response.status).toBe(publicStatus);
      expect(problem.code).toBe(code);
      const sink = publicStatus >= 500 ? log : warn;
      const unusedSink = publicStatus >= 500 ? warn : log;
      expect(unusedSink).not.toHaveBeenCalled();
      expect(sink).toHaveBeenCalledOnce();
      expect(JSON.parse(String(sink.mock.calls[0]?.[0]))).toMatchObject({
        status: publicStatus,
        correlationId: problem.correlationId,
        error: {
          cause: {
            diagnostic: {
              category: "provider",
              dependency: "neon-auth",
              operation: "identity.proxy",
              httpStatus: upstreamStatus,
              code: "IDENTITY_REQUEST_REJECTED",
            },
          },
        },
      });
      expect(JSON.stringify([problem, log.mock.calls, warn.mock.calls])).not.toContain(
        "private",
      );
    },
  );

  it("does not log a healthy auth response as degraded", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true })),
    );
    const response = await signIn();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("x-correlation-id")).toBeNull();
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
