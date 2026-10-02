import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createApplication } from "../src/server/application";
import { PostgresDatabase } from "../src/persistence/database";
import { migrateToLatest, rollbackLastMigration } from "../src/persistence/migrator";
import { ProblemDetailSchema } from "../src/contracts/api";
import { readSuppliedTestDatabaseUrl } from "../scripts/run-with-test-database";
import { startNeonAuthTestService } from "../scripts/neon-auth-test-service";

await test("NestJS, real authentication, migrations and PostgreSQL protect each user's notes", async () => {
  const databaseUrl = await readSuppliedTestDatabaseUrl(process.env);
  assert.ok(databaseUrl);
  const database = new PostgresDatabase(databaseUrl);
  try {
    await waitForDatabase(database);
    await migrateToLatest(database);
    assert.equal((await migrateToLatest(database)).length, 1);
    const before = await database.query("SELECT count(*) AS count FROM notes");
    await assert.rejects(
      database.transaction(async (session) => {
        await session.query(
          "INSERT INTO notes (note_id, owner_user_id, content) VALUES ($1, $2, $3)",
          [randomUUID(), "rollback-owner", "not committed"],
        );
        throw new Error("Abort this operation");
      }),
      /Abort this operation/,
    );
    assert.deepEqual(
      (await database.query("SELECT count(*) AS count FROM notes")).rows,
      before.rows,
    );

    for (const managed of [false, true]) {
      await verifyPrivateNotes(managed, databaseUrl, database);
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

async function verifyPrivateNotes(
  managed: boolean,
  databaseUrl: string,
  database: PostgresDatabase,
): Promise<void> {
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
      await fetch(`${origin}/api/v1/notes`, {
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
    assert.equal(openapi.paths["/api/v1/notes"].post.operationId, "createNote");
    assert.equal(
      openapi.paths["/api/v1/notes/{noteId}"].patch.operationId,
      "updateNote",
    );
    assert.deepEqual(openapi.components.schemas.CreateNoteDto.required, ["content"]);
    assert.equal(
      (await request("/api/v1/session", alice).then((response) => response.json())).user
        .displayName,
      "Alice",
    );
    await problem(await request("/api/v1/notes"), 401, "SIGN_IN_REQUIRED");
    await problem(
      await request("/api/v1/notes", alice, { content: " " }),
      400,
      "VALIDATION_FAILED",
    );
    await problem(
      await request("/api/v1/notes", alice, {
        content: "injected",
        ownerId: "Bob",
      }),
      400,
      "VALIDATION_FAILED",
    );
    await problem(
      await request(
        "/api/v1/notes",
        alice,
        { content: "wrong origin" },
        "POST",
        "https://untrusted.example",
      ),
      403,
      "INVALID_ORIGIN",
    );
    const created = await request("/api/v1/notes", alice, {
      content: "  Private to Alice  ",
    });
    assert.equal(created.status, 201);
    const note = await created.json();
    assert.equal(note.content, "Private to Alice");
    assert.deepEqual(
      await request(`/api/v1/notes/${note.noteId}`, alice).then((response) =>
        response.json(),
      ),
      note,
    );
    await problem(
      await request(`/api/v1/notes/${note.noteId}`, bob),
      404,
      "NOTE_NOT_FOUND",
    );
    await problem(
      await request(
        `/api/v1/notes/${note.noteId}`,
        bob,
        { content: "Not mine" },
        "PATCH",
      ),
      404,
      "NOTE_NOT_FOUND",
    );
    await problem(
      await request(`/api/v1/notes/${note.noteId}`, alice, {}, "PATCH"),
      400,
      "VALIDATION_FAILED",
    );
    await problem(
      await request("/api/v1/notes/not-an-id", alice),
      400,
      "VALIDATION_FAILED",
    );
    await problem(
      await request(
        "/api/v1/notes/not-an-id",
        alice,
        { content: "Invalid ID" },
        "PATCH",
      ),
      400,
      "VALIDATION_FAILED",
    );
    const updated = await request(
      `/api/v1/notes/${note.noteId}`,
      alice,
      { content: "Edited by Alice" },
      "PATCH",
    );
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).content, "Edited by Alice");
    assert.deepEqual(
      (await request("/api/v1/notes", bob).then((response) => response.json())).notes,
      [],
    );
    await problem(
      await request(`/api/v1/notes/${note.noteId}`, bob, undefined, "DELETE"),
      404,
      "NOTE_NOT_FOUND",
    );
    await problem(
      await request("/api/v1/notes/not-an-id", alice, undefined, "DELETE"),
      400,
      "VALIDATION_FAILED",
    );
    assert.equal(
      (await request("/api/v1/notes", alice).then((response) => response.json())).notes
        .length,
      1,
    );
    assert.equal(
      (await request(`/api/v1/notes/${note.noteId}`, alice, undefined, "DELETE"))
        .status,
      204,
    );
    await problem(
      await request(`/api/v1/notes/${note.noteId}`, alice, undefined, "DELETE"),
      404,
      "NOTE_NOT_FOUND",
    );
    await problem(await request("/api/v1/missing"), 404, "REQUEST_REJECTED");
    await database.query("ALTER TABLE notes RENAME TO notes_unavailable");
    const diagnostic = mock.method(console, "error", () => undefined);
    try {
      const failure = await problem(
        await request("/api/v1/notes?token=private-query", alice),
        500,
        "INTERNAL_ERROR",
      );
      assert.deepEqual(
        diagnostic.mock.calls.map(({ arguments: args }) => args),
        [
          [
            "Request failed",
            {
              correlationId: failure.correlationId,
              code: "INTERNAL_ERROR",
              status: 500,
              instance: "/api/v1/notes",
              error: { type: "DatabaseError", code: "42P01" },
            },
          ],
        ],
      );
    } finally {
      diagnostic.mock.restore();
      await database.query("ALTER TABLE notes_unavailable RENAME TO notes");
    }
    if (provider) {
      provider.setAvailable(false);
      await problem(await request("/api/v1/notes", alice), 503, "AUTH_UNAVAILABLE");
      provider.setAvailable(true);
    }
    assert.equal((await request("/api/auth/sign-out", alice, {})).status, 200);
    await problem(await request("/api/v1/notes", alice), 401, "SIGN_IN_REQUIRED");
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
