import {
  ApplicationOriginConfigurationError,
  resolveApplicationOrigin,
} from "../runtime/application-origin";
import { IdentityConfigurationError } from "./identity-provider";

type Environment = Record<string, string | undefined>;

export type NeonAuthRuntimeConfig = Readonly<{
  applicationOrigin: string;
  baseUrl: string;
  cookieSecret: string;
}>;

export function readNeonAuthConfig(
  environment: Environment,
): NeonAuthRuntimeConfig | null {
  const baseUrl = environment.NEON_AUTH_BASE_URL?.trim();
  const browserUrl = environment.VITE_NEON_AUTH_URL?.trim();
  if (!baseUrl && !browserUrl) return null;
  if (!baseUrl || !browserUrl) {
    throw new IdentityConfigurationError("Both Neon Auth URLs must be configured.");
  }
  const server = parseAuthUrl(baseUrl, environment);
  const browser = parseAuthUrl(browserUrl, environment);
  if (server !== browser) {
    throw new IdentityConfigurationError(
      "The Neon Auth URLs must identify the same service.",
    );
  }
  const cookieSecret = environment.NEON_AUTH_COOKIE_SECRET?.trim();
  if (!cookieSecret || cookieSecret.length < 32) {
    throw new IdentityConfigurationError(
      "NEON_AUTH_COOKIE_SECRET must contain at least 32 characters.",
    );
  }
  return {
    applicationOrigin: applicationOrigin(environment),
    baseUrl: server,
    cookieSecret,
  };
}

function parseAuthUrl(value: string, environment: Environment): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IdentityConfigurationError("A Neon Auth URL is invalid.");
  }
  const localTest =
    environment.NODE_ENV === "test" &&
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !localTest) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new IdentityConfigurationError(
      "Neon Auth requires an HTTPS service URL without credentials, query, or fragment.",
    );
  }
  return url.href.replace(/\/$/, "");
}

function applicationOrigin(environment: Environment): string {
  try {
    return resolveApplicationOrigin(environment);
  } catch (error) {
    if (error instanceof ApplicationOriginConfigurationError)
      throw new IdentityConfigurationError(error.message);
    throw error;
  }
}
