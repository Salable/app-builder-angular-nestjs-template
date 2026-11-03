import { afterEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import {
  createBetterAuthRuntime,
  getBetterAuthResponseFailure,
} from "./better-auth-runtime";

const config = {
  databaseUrl: "postgres://unused:unused@localhost/unused",
  baseUrl: "http://localhost:3000",
  secureCookies: false,
  secret: "local-fixture-secret-7UjP5nEg2rWa9mKd8vHt4zYq6xBc1sDf",
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Better Auth's configured diagnostic boundary", () => {
  it("preserves the SDK's empty500 sign-in response without its raw router logging", async () => {
    const failure = Object.assign(new Error("private SQL and credentials"), {
      code: "08006",
    });
    vi.spyOn(Pool.prototype, "connect").mockRejectedValue(failure);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const runtime = createBetterAuthRuntime(config);
    try {
      const response = await runtime.handler(
        new Request(`${config.baseUrl}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { origin: config.baseUrl, "content-type": "application/json" },
          body: JSON.stringify({
            email: "private@example.test",
            password: "private-password",
          }),
        }),
      );
      expect(response.status).toBe(500);
      expect(response.statusText).toBe("Internal Server Error");
      expect(await response.text()).toBe("");
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(getBetterAuthResponseFailure(response)).toMatchObject({
        diagnostic: { dependency: "better-auth", operation: "identity.proxy" },
        cause: failure,
      });
      expect(log).not.toHaveBeenCalled();
    } finally {
      await runtime.close();
    }
  });
  it.each(["origin", "referer"])(
    "captures an SDK %s rejection without printing its private query",
    (header) => {
      // The pinned SDK freezes NODE_ENV at import, so use a fresh process to
      // exercise its real origin guard rather than Vitest's test-mode bypass.
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `
        import { createBetterAuthRuntime, getBetterAuthResponseFailure } from './src/identity/better-auth-runtime.ts';
        const config = ${JSON.stringify(config)};
        const runtime = createBetterAuthRuntime(config);
        try {
          const response = await runtime.handler(new Request(config.baseUrl + '/api/auth/sign-out', {
            method: 'POST', headers: {
              [${JSON.stringify(header)}]: 'https://untrusted.example/path?private=secret',
              cookie: 'generated-app.session_token=private-token', 'content-type': 'application/json'
            }, body: '{}'
          }));
          console.log(JSON.stringify({ status: response.status, code: (await response.json()).code, diagnostic: getBetterAuthResponseFailure(response)?.diagnostic }));
        } finally { await runtime.close(); }
      `,
        ],
        {
          encoding: "utf8",
          env: { ...process.env, NODE_ENV: "development", TEST: "false" },
          timeout: 10000,
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).not.toContain("private");
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: 403,
        code: "INVALID_ORIGIN",
        diagnostic: {
          dependency: "better-auth",
          operation: "identity.proxy",
          code: "IDENTITY_SDK_FAILED",
        },
      });
    },
  );

  it.each([false, true])(
    "records a real SDK background-task error without leaking its arguments, broken sink: %s",
    async (brokenSink) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {
        if (brokenSink) throw new Error("Failed sink");
      });
      const runtime = createBetterAuthRuntime(config);
      try {
        const context = await runtime.auth.$context;
        log.mockClear();
        await expect(
          context.runInBackgroundOrAwait(
            Promise.reject(
              Object.assign(new Error("private background SQL and credentials"), {
                code: "ECONNRESET",
              }),
            ),
          ),
        ).resolves.toBeUndefined();
        expect(log).toHaveBeenCalledOnce();
        expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
          operation: "identity.background",
          code: "IDENTITY_BACKGROUND_FAILURE",
          error: {
            diagnostic: { dependency: "better-auth" },
            cause: { code: "ECONNRESET" },
          },
        });
        expect(JSON.stringify(log.mock.calls)).not.toContain("private");
      } finally {
        await runtime.close();
      }
    },
  );

  it("does not manufacture a diagnostic for a healthy signed-out session", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const runtime = createBetterAuthRuntime(config);
    try {
      await runtime.auth.$context;
      log.mockClear();
      expect(
        await runtime.getSession({
          headers: new Headers(),
          query: { disableCookieCache: true },
        }),
      ).toBeNull();
      expect(log).not.toHaveBeenCalled();
    } finally {
      await runtime.close();
    }
  });
});
