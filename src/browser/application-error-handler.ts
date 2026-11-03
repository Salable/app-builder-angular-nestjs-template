import { ErrorHandler, Injectable } from "@angular/core";
import { reportError } from "../runtime/error-logger";
import { ApiFailure } from "./api-client";

/** Receives Angular errors, browser exceptions and unhandled promise rejections. */
@Injectable()
export class ApplicationErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    // The client already reported this request with the server's correlation ID.
    if (error instanceof ApiFailure) return;
    reportError(error, {
      source: "browser",
      operation: "application.unhandled",
      code: "UNHANDLED_APPLICATION_ERROR",
    });
  }
}

export function reportBootstrapFailure(error: unknown, document: Document): void {
  reportError(error, {
    source: "browser",
    operation: "application.bootstrap",
    code: "APPLICATION_STARTUP_FAILED",
  });
  const root = document.querySelector("app-root");
  if (root)
    root.textContent =
      "We couldn't open the application. Reload the page to try again.";
}
