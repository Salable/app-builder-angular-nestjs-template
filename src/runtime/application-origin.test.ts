import { describe, expect, it } from "vitest";
import {
  ApplicationOriginConfigurationError,
  resolveApplicationOrigin,
  resolveApplicationUrl,
} from "./application-origin";

describe("application origin", () => {
  it("uses the exact Vercel Preview deployment URL", () => {
    expect(
      resolveApplicationOrigin({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        VERCEL_PROJECT_PRODUCTION_URL: "app.example.com",
        VERCEL_URL: "app-git-ticket-example.vercel.app",
      }),
    ).toBe("https://app-git-ticket-example.vercel.app");
  });

  it("uses the Vercel Production domain for Production", () => {
    expect(
      resolveApplicationOrigin({
        VERCEL: "1",
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "app.example.com",
        VERCEL_URL: "app-build-hash.vercel.app",
      }),
    ).toBe("https://app.example.com");
  });

  it("uses the current local loopback listener in development and tests", () => {
    expect(
      resolveApplicationOrigin({
        HOST: "127.0.0.1",
        NODE_ENV: "test",
        PORT: "4312",
      }),
    ).toBe("http://127.0.0.1:4312");
    expect(
      resolveApplicationOrigin({
        HOST: "0.0.0.0",
        VERCEL: "1",
        VERCEL_ENV: "development",
      }),
    ).toBe("http://localhost:3000");
  });

  it.each([
    [
      "missing Preview URL",
      { VERCEL: "1", VERCEL_ENV: "preview" },
      /VERCEL_URL is required/,
    ],
    [
      "missing Production URL",
      { VERCEL: "1", VERCEL_ENV: "production" },
      /VERCEL_PROJECT_PRODUCTION_URL is required/,
    ],
    [
      "unknown Vercel environment",
      { VERCEL: "1", VERCEL_ENV: "custom" },
      /VERCEL_ENV must be/,
    ],
    ["missing Vercel environment", { VERCEL: "1" }, /VERCEL_ENV is required/],
    [
      "unexposed Vercel system variables",
      { VERCEL_ENV: "preview", VERCEL_URL: "preview.example.com" },
      /must be exposed/,
    ],
    [
      "invalid Vercel indicator",
      { VERCEL: "true", VERCEL_ENV: "preview" },
      /Vercel-provided value 1/,
    ],
    [
      "scheme in a Vercel domain",
      {
        VERCEL: "1",
        VERCEL_ENV: "preview",
        VERCEL_URL: "https://preview.example.com",
      },
      /must contain only a Vercel-provided domain/,
    ],
    [
      "path in a Vercel domain",
      {
        VERCEL: "1",
        VERCEL_ENV: "preview",
        VERCEL_URL: "preview.example.com/path",
      },
      /must contain only a Vercel-provided domain/,
    ],
    [
      "port in a Vercel domain",
      {
        VERCEL: "1",
        VERCEL_ENV: "preview",
        VERCEL_URL: "preview.example.com:443",
      },
      /must contain only a Vercel-provided domain/,
    ],
    [
      "non-loopback local host",
      { HOST: "example.com", NODE_ENV: "development" },
      /loopback listener/,
    ],
    [
      "invalid local port",
      { NODE_ENV: "test", PORT: "65536" },
      /integer from 1 to 65535/,
    ],
    [
      "non-Vercel production",
      { NODE_ENV: "production" },
      /Vercel system environment variables are required/,
    ],
  ])("rejects %s", (_name, environment, message) => {
    expect(() => resolveApplicationOrigin(environment)).toThrow(
      ApplicationOriginConfigurationError,
    );
    expect(() => resolveApplicationOrigin(environment)).toThrow(message);
  });

  it("constructs only application-owned absolute URLs", () => {
    const environment = {
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_URL: "preview.example.com",
    };
    expect(
      resolveApplicationUrl("/billing/success?checkout=complete", environment),
    ).toBe("https://preview.example.com/billing/success?checkout=complete");
    expect(() => resolveApplicationUrl("//attacker.example/path", environment)).toThrow(
      /one forward slash/,
    );
    expect(() =>
      resolveApplicationUrl("https://attacker.example/path", environment),
    ).toThrow(/one forward slash/);
    expect(() =>
      resolveApplicationUrl("/\\attacker.example/path", environment),
    ).toThrow(/must not replace/);
  });
});
