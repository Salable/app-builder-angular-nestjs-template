import { IdentityConfigurationError } from "./identity-provider";
import {
  ApplicationOriginConfigurationError,
  resolveApplicationOrigin,
} from "../runtime/application-origin";

type RuntimeEnvironment = Record<string, string | undefined>;

export function readBetterAuthConfig(environment: RuntimeEnvironment) {
  const databaseUrl = required(environment, "DATABASE_URL");
  const secret = required(environment, "BETTER_AUTH_SECRET");
  if (secret.length < 32) {
    throw new IdentityConfigurationError(
      "BETTER_AUTH_SECRET must contain at least 32 characters.",
    );
  }

  let baseUrl: string;
  try {
    baseUrl = resolveApplicationOrigin(environment);
  } catch (error) {
    if (error instanceof ApplicationOriginConfigurationError) {
      throw new IdentityConfigurationError(error.message);
    }
    throw error;
  }

  return {
    baseUrl,
    databaseUrl,
    secret,
    secureCookies: baseUrl.startsWith("https://"),
  };
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === "" ? undefined : normalized;
}

function required(environment: RuntimeEnvironment, name: string): string {
  const value = optional(environment[name]);
  if (value === undefined) {
    throw new IdentityConfigurationError(`${name} is required for identity.`);
  }
  return value;
}
