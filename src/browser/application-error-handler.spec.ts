import { ErrorHandler } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiFailure } from "./api-client";
import {
  ApplicationErrorHandler,
  reportBootstrapFailure,
} from "./application-error-handler";

afterEach(() => vi.restoreAllMocks());

describe("application error boundary", () => {
  it("logs uncaught framework errors without exposing their messages", () => {
    TestBed.configureTestingModule({
      providers: [{ provide: ErrorHandler, useClass: ApplicationErrorHandler }],
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    TestBed.inject(ErrorHandler).handleError(
      new Error("private token and customer details"),
    );
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      source: "browser",
      operation: "application.unhandled",
      code: "UNHANDLED_APPLICATION_ERROR",
      error: { type: "Error" },
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
  });

  it("does not duplicate a request failure already logged by the API client", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    new ApplicationErrorHandler().handleError(
      new ApiFailure("REQUEST_FAILED", "Try again."),
    );
    expect(log).not.toHaveBeenCalled();
  });

  it("preserves the startup recovery view even when logging fails", () => {
    const root = document.createElement("app-root");
    document.body.append(root);
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("Failed log sink");
    });
    try {
      expect(() =>
        reportBootstrapFailure(new Error("private startup detail"), document),
      ).not.toThrow();
      expect(root.textContent).toContain("Reload the page");
      expect(root.textContent).not.toContain("private");
    } finally {
      root.remove();
    }
  });

  it("records a startup failure even when the root could not be mounted", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    reportBootstrapFailure(
      new Error("private startup detail"),
      document.implementation.createHTMLDocument(),
    );
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      code: "APPLICATION_STARTUP_FAILED",
    });
  });
});
