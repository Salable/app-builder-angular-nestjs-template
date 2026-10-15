import { Injectable } from "@angular/core";
import { z } from "zod";
import { ProblemDetailSchema, SessionViewSchema } from "../contracts/api";

export class ApiFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
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
    } catch {
      throw new ApiFailure(
        "NETWORK_UNAVAILABLE",
        "The connection was interrupted. Try again.",
      );
    }
    if (!response.ok) {
      const problem = ProblemDetailSchema.safeParse(
        await response.json().catch(() => null),
      );
      throw new ApiFailure(
        problem.success ? problem.data.code : "REQUEST_FAILED",
        problem.success
          ? problem.data.detail
          : "The request could not be completed. Try again.",
      );
    }
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success)
      throw new ApiFailure(
        "INVALID_RESPONSE",
        "The service returned an unexpected response. Try again.",
      );
    return parsed.data;
  }
}

export function failureMessage(error: unknown): string {
  return error instanceof ApiFailure
    ? error.message
    : "Something went wrong. Try again.";
}
