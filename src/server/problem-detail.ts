import { randomUUID } from "node:crypto";
import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  IdentityConfigurationError,
  IdentityProviderUnavailableError,
} from "../identity/identity-provider";
import { ApplicationOriginConfigurationError } from "../runtime/application-origin";
import type { ProblemDetail } from "../contracts/api";

export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const titles: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  413: "Content Too Large",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
};

@Catch()
export class ProblemDetailFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<Request>();
    const response = host.switchToHttp().getResponse<Response>();
    const failure = normalizeFailure(error);
    const problem: ProblemDetail = {
      type: "about:blank",
      title: titles[failure.status] ?? "Request Failed",
      status: failure.status,
      code: failure.code,
      detail: failure.message,
      instance: request.path,
      correlationId: `corr_${randomUUID()}`,
    };
    response
      .status(problem.status)
      .set("cache-control", "private, no-store")
      .type("application/problem+json")
      .json(problem);
  }
}

function normalizeFailure(error: unknown): ApiProblem {
  if (error instanceof ApiProblem) return error;
  if (error instanceof ZodError)
    return new ApiProblem(
      400,
      "VALIDATION_FAILED",
      "Check the request fields and try again.",
    );
  if (
    error instanceof IdentityConfigurationError ||
    error instanceof ApplicationOriginConfigurationError
  )
    return new ApiProblem(
      503,
      "AUTH_NOT_CONFIGURED",
      "Authentication is not configured.",
    );
  if (error instanceof IdentityProviderUnavailableError)
    return new ApiProblem(
      503,
      "AUTH_UNAVAILABLE",
      "Authentication is temporarily unavailable. Try again.",
    );
  if (error instanceof HttpException)
    return new ApiProblem(
      error.getStatus(),
      "REQUEST_REJECTED",
      error.getStatus() === 404
        ? "This endpoint does not exist."
        : "The request could not be accepted.",
    );
  return new ApiProblem(
    500,
    "INTERNAL_ERROR",
    "The request could not be completed. Try again.",
  );
}
