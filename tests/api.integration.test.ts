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

await test("real Better Auth keeps diagnostic failures out of successful sign-out responses", async (context) => {
  const databaseUrl = await readSuppliedTestDatabaseUrl(process.env);
  assert.ok(databaseUrl);
  const database = new PostgresDatabase(databaseUrl);
  const { app } = await createApplication();
  const logs: unknown[][] = [];
  let brokenSink = false;
  context.mock.method(console, "error", (...args: unknown[]) => {
    logs.push(args);
    if (brokenSink) throw new Error("Diagnostic sink failed");
  });
  context.mock.method(console, "warn", (...args: unknown[]) => logs.push(args));
  Object.assign(process.env, {
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: "isolated-integration-test-auth-secret",
  });
  delete process.env.NEON_AUTH_BASE_URL;
  delete process.env.VITE_NEON_AUTH_URL;
  try {
    await waitForDatabase(database);
    await migrateToLatest(database);
    await app.listen(0, "127.0.0.1");
    const origin = await app.getUrl();
    process.env.PORT = new URL(origin).port;
    const signup = await fetch(`${origin}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Diagnostic fixture",
        email: `${randomUUID()}@example.test`,
        password: "private-fixture-password",
      }),
    });
    assert.equal(signup.status, 200);
    const cookie = signup.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    await database.query(
      `CREATE FUNCTION diagnostic_fixture_reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private SQL and credentials' USING ERRCODE = 'P0001'; END $$`,
    );
    await database.query(
      `CREATE TRIGGER diagnostic_fixture_delete BEFORE DELETE ON "session" FOR EACH ROW EXECUTE FUNCTION diagnostic_fixture_reject_delete()`,
    );

    for (const failSink of [false, true]) {
      brokenSink = failSink;
      logs.length = 0;
      const [response, session] = await Promise.all([
        fetch(`${origin}/api/auth/sign-out`, {
          method: "POST",
          headers: { origin, cookie, "content-type": "application/json" },
          body: "{}",
        }),
        fetch(`${origin}/api/v1/session`, { headers: { cookie } }),
      ]);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { success: true });
      assert.ok(
        response.headers.getSetCookie().some((value) => value.includes("Max-Age=0")),
      );
      assert.equal(session.status, 200);
      assert.equal((await session.json()).user.displayName, "Diagnostic fixture");
      assert.equal(logs.length, 1);
      const record = JSON.parse(String(logs[0]?.[0]));
      assert.equal(record.code, "AUTH_RESPONSE_DEGRADED");
      assert.equal(record.correlationId, response.headers.get("x-correlation-id"));
      assert.equal(record.error.diagnostic.dependency, "better-auth");
      assert.equal(record.error.cause.code, "P0001");
      assert.equal(JSON.stringify(logs).includes("private"), false);
    }

    brokenSink = false;
    await database.query('DROP TRIGGER diagnostic_fixture_delete ON "session"');
    await database.query(
      'ALTER TABLE "session" RENAME TO diagnostic_fixture_session_unavailable',
    );
    try {
      logs.length = 0;
      const response = await fetch(`${origin}/api/v1/session`, { headers: { cookie } });
      const failure = await problem(response, 503, "AUTH_UNAVAILABLE");
      assert.equal(logs.length, 1);
      const record = JSON.parse(String(logs[0]?.[0]));
      assert.equal(record.correlationId, failure.correlationId);
      assert.ok(JSON.stringify(record).includes("42P01"));
      assert.equal(JSON.stringify(logs).includes("private"), false);
    } finally {
      await database.query(
        'ALTER TABLE diagnostic_fixture_session_unavailable RENAME TO "session"',
      );
    }

    await database.query(
      'ALTER TABLE "user" RENAME TO diagnostic_fixture_user_unavailable',
    );
    const assertSignInFailure = async (failSink: boolean) => {
      brokenSink = failSink;
      logs.length = 0;
      const [response, healthy] = await Promise.all([
        fetch(`${origin}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({
            email: "private@example.test",
            password: "private-password",
          }),
        }),
        fetch(`${origin}/api/auth/get-session`),
      ]);
      const failure = await problem(response, 503, "AUTH_UNAVAILABLE");
      assert.equal(response.headers.getSetCookie().length, 0);
      assert.equal(healthy.status, 200);
      assert.equal(await healthy.json(), null);
      assert.equal(logs.length, 1);
      assert.equal(logs[0]?.length, 1);
      const record = JSON.parse(String(logs[0]?.[0]));
      assert.equal(record.correlationId, failure.correlationId);
      assert.equal(record.error.cause.diagnostic.dependency, "better-auth");
      assert.equal(record.error.cause.cause.code, "42P01");
      assert.equal(JSON.stringify(logs).includes("private"), false);
    };
    try {
      await assertSignInFailure(false);
      await assertSignInFailure(true);
    } finally {
      brokenSink = false;
      await database.query(
        'ALTER TABLE diagnostic_fixture_user_unavailable RENAME TO "user"',
      );
    }

    logs.length = 0;
    const rejected = await fetch(`${origin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { origin, cookie, "content-type": "application/json" },
      body: JSON.stringify({
        email: "private@example.test",
        password: "private-password",
        callbackURL: "https://untrusted.example/?private=value",
      }),
    });
    const rejection = await problem(rejected, 400, "AUTH_REQUEST_REJECTED");
    assert.equal(logs.length, 1);
    const rejectedRecord = JSON.parse(String(logs[0]?.[0]));
    assert.equal(rejectedRecord.correlationId, rejection.correlationId);
    assert.equal(rejectedRecord.error.cause.diagnostic.dependency, "better-auth");
    assert.equal(JSON.stringify(logs).includes("private"), false);
  } finally {
    brokenSink = false;
    await database.query(
      'DROP TRIGGER IF EXISTS diagnostic_fixture_delete ON "session"',
    );
    await database.query("DROP FUNCTION IF EXISTS diagnostic_fixture_reject_delete()");
    await app.close();
    await database.close();
    process.env.NODE_ENV = "test";
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
