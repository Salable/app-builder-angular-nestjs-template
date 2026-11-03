import { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PostgresDatabase } from "./database";
import { createBetterAuthRuntime } from "../identity/better-auth-runtime";

afterEach(() => vi.restoreAllMocks());

describe("idle database error diagnostics", () => {
  for (const identity of [false, true]) {
    it(`reports the ${identity ? "identity" : "application"} pool failure without its connection details`, async () => {
      // Observe the real pg pool at its external error-event boundary; run the actual listener.
      const registration = vi.spyOn(Pool.prototype, "on");
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const database = identity
        ? createBetterAuthRuntime({
            databaseUrl: "postgres://private:private@localhost/private",
            baseUrl: "http://localhost:3000",
            secret: "test-secret-with-at-least-32-characters",
            secureCookies: false,
          })
        : new PostgresDatabase("postgres://private:private@localhost/private");
      try {
        const index = registration.mock.calls.findIndex(([event]) => event === "error");
        expect(index).toBeGreaterThanOrEqual(0);
        const pool = registration.mock.contexts[index] as Pool;
        pool.emit(
          "error",
          Object.assign(new Error("private database password and SQL"), {
            code: "57P01",
          }),
        );
        expect(log).toHaveBeenCalledOnce();
        expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
          code: "DATABASE_CONNECTION_FAILED",
          error: {
            diagnostic: { category: "database", dependency: "postgresql" },
            cause: { code: "57P01" },
          },
        });
        expect(JSON.stringify(log.mock.calls)).not.toContain("private");
        log.mockImplementation(() => {
          throw new Error("Failed sink");
        });
        expect(() => pool.emit("error", new Error("private failure"))).not.toThrow();
      } finally {
        await database.close();
      }
    });
  }
});
