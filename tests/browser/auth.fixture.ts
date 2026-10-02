import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { expect, test as base } from "@playwright/test";
import { startNeonAuthTestService } from "../../scripts/neon-auth-test-service.ts";
import { PostgresDatabase } from "../../src/persistence/database.ts";
import { readSuppliedTestDatabaseUrl } from "../../scripts/run-with-test-database.ts";
import { migrateToLatest } from "../../src/persistence/migrator.ts";

type AuthMode = "SELF_HOSTED_BETTER_AUTH" | "NEON_AUTH";
type AuthApplication = {
  origin: string;
  revokeSessions(email: string): Promise<void>;
};

export const test = base.extend<{
  authMode: AuthMode;
  authApplication: AuthApplication;
}>({
  authMode: ["SELF_HOSTED_BETTER_AUTH", { option: true }],
  authApplication: async ({ authMode, context }, use) => {
    let application: ChildProcess | undefined;
    let database: PostgresDatabase | undefined;
    let provider: Awaited<ReturnType<typeof startNeonAuthTestService>> | undefined;
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: String(await unusedPort()),
    };
    for (const key of [
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "NEON_AUTH_BASE_URL",
      "VITE_NEON_AUTH_URL",
      "NEON_AUTH_COOKIE_SECRET",
      "VERCEL",
      "VERCEL_ENV",
      "VERCEL_URL",
      "VERCEL_PROJECT_PRODUCTION_URL",
    ]) {
      delete environment[key];
    }
    const origin = `http://${environment.HOST}:${environment.PORT}`;
    try {
      const databaseUrl = await readSuppliedTestDatabaseUrl(process.env);
      assert.ok(databaseUrl, "Run browser tests through npm run test:browser");
      environment.DATABASE_URL = databaseUrl;
      database = new PostgresDatabase(databaseUrl);
      await expect
        .poll(
          async () => {
            try {
              await database!.query("SELECT 1");
              return true;
            } catch {
              return false;
            }
          },
          { timeout: 15_000 },
        )
        .toBe(true);
      await migrateToLatest(database);
      if (authMode === "NEON_AUTH") {
        provider = await startNeonAuthTestService();
        environment.NEON_AUTH_BASE_URL = `${provider.origin}/auth`;
        environment.VITE_NEON_AUTH_URL = `${provider.origin}/auth`;
        environment.NEON_AUTH_COOKIE_SECRET = "isolated-browser-auth-cookie-secret";
      } else {
        environment.BETTER_AUTH_SECRET = "isolated-browser-auth-postgres-secret";
      }
      const output: string[] = [];
      application = spawn(process.execPath, ["dist/server/local-server.mjs"], {
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
      });
      application.stdout!.on("data", (chunk: Buffer) => output.push(chunk.toString()));
      application.stderr!.on("data", (chunk: Buffer) => output.push(chunk.toString()));
      await expect
        .poll(
          async () => {
            assert.equal(application!.exitCode, null, output.join(""));
            try {
              return (await fetch(origin)).status;
            } catch {
              return 0;
            }
          },
          { timeout: 15_000 },
        )
        .toBe(200);
      await use({
        origin,
        async revokeSessions(email) {
          if (provider) provider.revokeSessions(email);
          else
            await database!.query(
              'DELETE FROM "session" WHERE "userId" IN (SELECT id FROM "user" WHERE email = $1)',
              [email],
            );
        },
      });
    } finally {
      await context.close();
      if (application && application.exitCode === null) {
        const exited = once(application, "exit");
        application.kill("SIGTERM");
        await exited;
      }
      await provider?.close();
      await database?.close();
    }
  },
});

async function unusedPort(): Promise<number> {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return address.port;
}
