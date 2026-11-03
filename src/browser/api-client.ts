import { Injectable } from "@angular/core";
import { z } from "zod";
import { ProblemDetailSchema, SessionViewSchema } from "../contracts/api";
import { reportError } from "../runtime/error-logger";

export class ApiFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly correlationId?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

@Injectable({ providedIn: "root" })
export class ApiClient {
  session() {
    return this.request("/api/v1/session", SessionViewSchema);
  }
  async authenticate(
    mode: "sign-in" | "sign-up",
    email: string,
    password: string,
    name: string,
  ) {
    await this.request(`/api/auth/${mode}/email`, z.unknown(), {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        ...(mode === "sign-up" ? { name } : {}),
      }),
    });
  }
  signOut() {
    return this.request("/api/auth/sign-out", z.unknown(), {
      method: "POST",
      body: "{}",
    });
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(path, {
        ...init,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const failure = new ApiFailure(
        "NETWORK_UNAVAILABLE",
        "The connection was interrupted. Try again.",
        undefined,
        { cause: error },
      );
      this.report(failure, path, init);
      throw failure;
    }
    if (!response.ok) {
      const problem = ProblemDetailSchema.safeParse(
        await response.json().catch(() => null),
      );
      const valid = problem.success && problem.data.status === response.status;
      const failure = new ApiFailure(
        valid ? problem.data.code : "REQUEST_FAILED",
        valid ? problem.data.detail : "The request could not be completed. Try again.",
        valid ? problem.data.correlationId : undefined,
      );
      this.report(failure, path, init, response.status);
      throw failure;
    }
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      const failure = new ApiFailure(
        "INVALID_RESPONSE",
        "The service returned an unexpected response. Try again.",
      );
      this.report(failure, path, init);
      throw failure;
    }
    return parsed.data;
  }

  private report(error: ApiFailure, path: string, init: RequestInit, status?: number) {
    reportError(error, {
      source: "browser",
      operation: "api.request",
      code: error.code,
      path,
      method: init.method ?? "GET",
      ...(error.correlationId ? { correlationId: error.correlationId } : {}),
      ...(status === undefined ? {} : { status }),
    });
  }
}

export function failureMessage(error: unknown): string {
  if (error instanceof ApiFailure) return error.message;
  reportError(error, {
    source: "browser",
    operation: "ui.operation",
    code: "UNEXPECTED_OPERATION_ERROR",
  });
  return "Something went wrong. Try again.";
}
