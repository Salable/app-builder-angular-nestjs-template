import { betterAuth } from "better-auth";
import { isAPIError } from "better-auth/api";
import { AsyncLocalStorage } from "node:async_hooks";
import { Pool } from "pg";
import { readBetterAuthConfig } from "./better-auth-config";
import { DiagnosticError, reportError } from "../runtime/error-logger";

const responseFailures = new WeakMap<Response, DiagnosticError>();

export function getBetterAuthResponseFailure(
  response: Response,
): DiagnosticError | undefined {
  return responseFailures.get(response);
}

type Operation = "identity.proxy" | "identity.session";
type OperationDiagnostics = {
  operation: Operation;
  active: boolean;
  failure?: DiagnosticError;
  routerFailure?: { error: unknown };
};

export function createBetterAuthRuntime(
  config: ReturnType<typeof readBetterAuthConfig>,
) {
  const contexts = new AsyncLocalStorage<OperationDiagnostics>();
  const capture = (level: string, message: unknown, ...args: unknown[]) => {
    if (level !== "error" && level !== "warn") return;
    // SDK messages/objects can contain SQL, origins and private request values.
    // Retain only an Error cause for the shared allowlisted diagnostic serializer.
    const cause = [message, ...args].find(
      (value): value is Error => value instanceof Error,
    );
    const context = contexts.getStore();
    const operation = context?.active ? context.operation : "identity.background";
    const failure = new DiagnosticError(
      {
        category: "provider",
        dependency: "better-auth",
        operation,
        code: level === "error" ? "IDENTITY_SDK_FAILED" : "IDENTITY_SDK_WARNING",
      },
      cause ? { cause } : undefined,
    );
    if (context?.active) {
      if (!context.failure || (cause && !context.failure.cause))
        context.failure = failure;
      return;
    }
    reportError(failure, {
      source: "server",
      operation,
      code: "IDENTITY_BACKGROUND_FAILURE",
    });
  };

  async function observe<T>(
    operation: Operation,
    work: (state: OperationDiagnostics) => Promise<T>,
  ) {
    const state: OperationDiagnostics = { operation, active: true };
    return contexts.run(state, async () => {
      try {
        return { value: await work(state), failure: state.failure };
      } catch (error) {
        if (state.failure?.cause) throw state.failure;
        throw new DiagnosticError(
          {
            category: "provider",
            dependency: "better-auth",
            operation,
            code: "IDENTITY_OPERATION_FAILED",
          },
          { cause: error },
        );
      } finally {
        // Detached SDK work must not append to a completed request's capture.
        state.active = false;
      }
    });
  }
  const pool = new Pool({
    allowExitOnIdle: true,
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    max: 5,
  });
  pool.on("error", (error: Error) => {
    reportError(
      new DiagnosticError(
        {
          category: "database",
          dependency: "postgresql",
          operation: "identity.database.idle",
        },
        { cause: error },
      ),
      {
        source: "server",
        operation: "identity.database.idle",
        code: "DATABASE_CONNECTION_FAILED",
      },
    );
  });

  const auth = betterAuth({
    logger: { level: "warn", disableColors: true, log: capture },
    onAPIError: {
      onError(error) {
        capture("error", "", error);
        // Leave SDK protocol error responses and redirects intact.
        if (isAPIError(error)) return;
        const state = contexts.getStore();
        if (state?.active && state.operation === "identity.proxy")
          state.routerFailure = { error };
        // Returning lets Better Call print the raw exception. Only the matching
        // handler scope below restores its existing empty HTTP500 response.
        throw error;
      },
    },
    advanced: {
      cookiePrefix: "generated-app",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.secureCookies,
      },
      useSecureCookies: config.secureCookies,
    },
    appName: "Generated Application",
    basePath: "/api/auth",
    baseURL: config.baseUrl,
    database: pool,
    emailAndPassword: {
      disableSignUp: false,
      enabled: true,
      requireEmailVerification: false,
    },
    secret: config.secret,
    session: {
      cookieCache: { enabled: false },
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    telemetry: { enabled: false },
    trustedOrigins: [new URL(config.baseUrl).origin],
  });

  return {
    auth,
    async handler(request: Request) {
      const { value, failure } = await observe("identity.proxy", async (state) => {
        try {
          return await auth.handler(request);
        } catch (error) {
          if (state.routerFailure && Object.is(state.routerFailure.error, error))
            return new Response(null, {
              status: 500,
              statusText: "Internal Server Error",
            });
          throw error;
        }
      });
      if (failure) responseFailures.set(value, failure);
      return value;
    },
    async getSession(input: Parameters<typeof auth.api.getSession>[0]) {
      const { value, failure } = await observe("identity.session", () =>
        auth.api.getSession(input),
      );
      if (failure)
        reportError(failure, {
          source: "server",
          operation: "identity.session",
          code: "IDENTITY_RESPONSE_DEGRADED",
        });
      return value;
    },
    close: () => pool.end(),
  };
}
