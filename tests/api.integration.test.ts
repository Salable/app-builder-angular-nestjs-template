import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createApplication } from "../src/server/application";
import { PostgresDatabase } from "../src/persistence/database";
import { migrateToLatest, rollbackLastMigration } from "../src/persistence/migrator";
import { ProblemDetailSchema } from "../src/contracts/api";
import { readSuppliedTestDatabaseUrl } from "../scripts/run-with-test-database";
import { startNeonAuthTestService } from "../scripts/neon-auth-test-service";

await test("NestJS, real authentication and PostgreSQL isolate and revoke sessions", async () => {
  const databaseUrl = await readSuppliedTestDatabaseUrl(process.env);
  assert.ok(databaseUrl);
  const database = new PostgresDatabase(databaseUrl);
  try {
    await waitForDatabase(database);
    await migrateToLatest(database);
    assert.equal((await migrateToLatest(database)).length, 1);
    const tables = await database.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    assert.equal(
      tables.rows.some((row) => row.tablename === "notes"),
      false,
    );
    const before = await database.query("SELECT count(*) AS count FROM verification");
    await assert.rejects(
      database.transaction(async (session) => {
        await session.query(
          'INSERT INTO verification (id, identifier, value, "expiresAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
          [randomUUID(), "rollback", "not committed"],
        );
        throw new Error("Abort this operation");
      }),
      /Abort this operation/,
    );
    assert.deepEqual(
      (await database.query("SELECT count(*) AS count FROM verification")).rows,
      before.rows,
    );

    for (const managed of [false, true]) {
      await verifySessions(managed, databaseUrl);
    }
    assert.equal((await rollbackLastMigration(database))?.version, "0001");
    assert.equal(await rollbackLastMigration(database), undefined);
    await migrateToLatest(database);
  } finally {
    await database.close();
  }
});

await test("missing authentication configuration has a safe and distinct HTTP outcome", async () => {
  delete process.env.DATABASE_URL;
  delete process.env.BETTER_AUTH_SECRET;
  delete process.env.NEON_AUTH_BASE_URL;
  delete process.env.VITE_NEON_AUTH_URL;
  delete process.env.NEON_AUTH_COOKIE_SECRET;
  const { app } = await createApplication();
  try {
    await app.listen(0, "127.0.0.1");
    const origin = await app.getUrl();
    process.env.PORT = new URL(origin).port;
    const publicSession = await fetch(`${origin}/api/v1/session`);
    assert.deepEqual(await publicSession.json(), { user: null });
    await problem(
      await fetch(`${origin}/api/v1/session`, {
        headers: { cookie: "session=unverified" },
      }),
      503,
      "AUTH_NOT_CONFIGURED",
    );
  } finally {
    await app.close();
  }
});

async function waitForDatabase(database: PostgresDatabase): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= 50; attempt++) {
    try {
      await database.query("SELECT 1");
      return;
    } catch (error) {
      lastError = error;
    }
    if (attempt < 50) await delay(100);
  }
  throw lastError;
}

async function verifySessions(managed: boolean, databaseUrl: string): Promise<void> {
  const provider = managed ? await startNeonAuthTestService() : undefined;
  Object.assign(process.env, {
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: "isolated-integration-test-auth-secret",
  });
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  if (provider)
    Object.assign(process.env, {
      NEON_AUTH_BASE_URL: `${provider.origin}/auth`,
      VITE_NEON_AUTH_URL: `${provider.origin}/auth`,
      NEON_AUTH_COOKIE_SECRET: "isolated-integration-test-cookie-secret",
    });
  else {
    delete process.env.NEON_AUTH_BASE_URL;
    delete process.env.VITE_NEON_AUTH_URL;
  }
  const { app } = await createApplication();
  await app.listen(0, "127.0.0.1");
  const origin = await app.getUrl();
  process.env.PORT = new URL(origin).port;
  try {
    const request = (
      path: string,
      cookie = "",
      body?: unknown,
      method = body === undefined ? "GET" : "POST",
      originHeader = origin,
    ) =>
      fetch(`${origin}${path}`, {
        method,
        headers: {
          cookie,
          origin: originHeader,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const account = async (name: string) => {
      const response = await request("/api/auth/sign-up/email", "", {
        name,
        email: `${randomUUID()}@example.test`,
        password: "local-password-123",
      });
      assert.equal(response.status, 200, await response.clone().text());
      return response.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
    };
    const alice = await account("Alice");
    const bob = await account("Bob");
    await problem(
      await request("/api/auth/sign-in/email", "", {
        email: `${randomUUID()}@example.test`,
        password: "local-password-123",
      }),
      401,
      "INVALID_CREDENTIALS",
    );
    await problem(
      await request("/api/auth/sign-in/email", "", undefined, "PATCH"),
      404,
      "NOT_FOUND",
    );
    await problem(
      await fetch(`${origin}/api/auth/sign-out`, {
        method: "POST",
        headers: { cookie: alice, origin, "content-type": "application/json" },
        body: "{",
      }),
      400,
      "REQUEST_REJECTED",
    );
    const openapi = await request("/api/v1/openapi.json").then((response) =>
      response.json(),
    );
    assert.deepEqual(Object.keys(openapi.paths).sort(), [
      "/api/v1/health",
      "/api/v1/session",
    ]);
    assert.deepEqual(await request("/api/v1/session").then((r) => r.json()), {
      user: null,
    });
    assert.equal(
      (await request("/api/v1/session", alice).then((response) => response.json())).user
        .displayName,
      "Alice",
    );
    const bobSession = await request("/api/v1/session", bob).then((r) => r.json());
    assert.equal(bobSession.user.displayName, "Bob");
    await problem(
      await request(
        "/api/auth/sign-out",
        alice,
        {},
        "POST",
        "https://untrusted.example",
      ),
      403,
      "INVALID_ORIGIN",
    );
    await problem(await request("/api/v1/notes", alice), 404, "REQUEST_REJECTED");
    await problem(await request("/api/v1/missing"), 404, "REQUEST_REJECTED");
    if (provider) {
      provider.setAvailable(false);
      await problem(await request("/api/v1/session", alice), 503, "AUTH_UNAVAILABLE");
      provider.setAvailable(true);
    }
    assert.equal((await request("/api/auth/sign-out", alice, {})).status, 200);
    assert.deepEqual(await request("/api/v1/session", alice).then((r) => r.json()), {
      user: null,
    });
    assert.deepEqual(
      await request("/api/v1/session", bob).then((r) => r.json()),
      bobSession,
    );
  } finally {
    await app.close();
    await provider?.close();
  }
}

async function problem(response: Response, status: number, code: string) {
  assert.equal(response.status, status, await response.clone().text());
  assert.match(
    response.headers.get("content-type") ?? "",
    /application\/problem\+json/,
  );
  const body = ProblemDetailSchema.parse(await response.json());
  assert.equal(body.code, code);
  assert.equal(body.type, "about:blank");
  assert.ok(body.correlationId.startsWith("corr_"));
  assert.equal(response.headers.get("x-correlation-id"), body.correlationId);
  assert.equal(JSON.stringify(body).includes("private provider"), false);
  return body;
}
