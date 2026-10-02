import { describe, expect, it } from "vitest";
import { readNeonAuthConfig } from "./neon-auth-config";
const configured = {
  NEON_AUTH_BASE_URL: "https://branch.auth.eu-west-2.aws.neon.tech/neondb/auth",
  VITE_NEON_AUTH_URL: "https://branch.auth.eu-west-2.aws.neon.tech/neondb/auth/",
  NEON_AUTH_COOKIE_SECRET: "cookie-secret-with-at-least-32-characters",
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_URL: "app-preview.vercel.app",
};
describe("managed authentication selection", () => {
  it("uses the exact native Neon configuration and trusted application origin", () => {
    expect(readNeonAuthConfig(configured)).toEqual({
      baseUrl: configured.NEON_AUTH_BASE_URL,
      cookieSecret: configured.NEON_AUTH_COOKIE_SECRET,
      applicationOrigin: "https://app-preview.vercel.app",
    });
    expect(readNeonAuthConfig({})).toBeNull();
  });
  it("rejects partial, mismatched, and unsafe configuration without switching providers", () => {
    for (const change of [
      { NEON_AUTH_BASE_URL: undefined },
      { VITE_NEON_AUTH_URL: undefined },
      { VITE_NEON_AUTH_URL: "https://different.auth.neon.tech/auth" },
      { NEON_AUTH_BASE_URL: "https://user:secret@auth.neon.tech/auth" },
      { NEON_AUTH_BASE_URL: "http://branch.auth.neon.tech/auth" },
      { NEON_AUTH_BASE_URL: "https://branch.auth.neon.tech/auth?branch=other" },
      { NEON_AUTH_COOKIE_SECRET: "short" },
      { VERCEL_URL: undefined },
    ])
      expect(() => readNeonAuthConfig({ ...configured, ...change })).toThrow();
  });
});
