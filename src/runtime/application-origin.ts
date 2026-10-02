import { isIP } from "node:net";

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export class ApplicationOriginConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationOriginConfigurationError";
  }
}

/**
 * Resolves the application-owned origin from trusted runtime state.
 *
 * Vercel Preview deployments use their exact deployment URL, Production uses
 * the project's production domain, and local development uses its loopback
 * listener. Request and forwarded-host headers are deliberately not inputs.
 */
export function resolveApplicationOrigin(
  environment: RuntimeEnvironment = process.env,
): string {
  const vercelEnvironment = readVercelEnvironment(environment);
  if (vercelEnvironment === "preview") {
    return vercelOrigin(environment.VERCEL_URL, "VERCEL_URL");
  }
  if (vercelEnvironment === "production") {
    return vercelOrigin(
      environment.VERCEL_PROJECT_PRODUCTION_URL,
      "VERCEL_PROJECT_PRODUCTION_URL",
    );
  }
  if (vercelEnvironment === "development") {
    return localOrigin(environment);
  }
  if (environment.NODE_ENV === "development" || environment.NODE_ENV === "test") {
    return localOrigin(environment);
  }
  throw new ApplicationOriginConfigurationError(
    "Vercel system environment variables are required outside local development.",
  );
}

function readVercelEnvironment(environment: RuntimeEnvironment): string | undefined {
  const vercel = optional(environment.VERCEL);
  const vercelEnvironment = optional(environment.VERCEL_ENV);
  if (vercel !== undefined && vercel !== "1") {
    throw new ApplicationOriginConfigurationError(
      "VERCEL must be the Vercel-provided value 1 when it is present.",
    );
  }
  if (vercelEnvironment !== undefined && vercel !== "1") {
    throw new ApplicationOriginConfigurationError(
      "Vercel system environment variables must be exposed to this deployment.",
    );
  }
  if (vercel === "1" && vercelEnvironment === undefined) {
    throw new ApplicationOriginConfigurationError(
      "VERCEL_ENV is required when Vercel system environment variables are exposed.",
    );
  }
  if (
    vercelEnvironment !== undefined &&
    !["preview", "production", "development"].includes(vercelEnvironment)
  ) {
    throw new ApplicationOriginConfigurationError(
      "VERCEL_ENV must be production, preview, or development.",
    );
  }
  return vercelEnvironment;
}

/** Builds an application-owned absolute URL without accepting another origin. */
export function resolveApplicationUrl(
  pathname: string,
  environment: RuntimeEnvironment = process.env,
): string {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    throw new ApplicationOriginConfigurationError(
      "Application URL paths must start with one forward slash.",
    );
  }
  const origin = resolveApplicationOrigin(environment);
  const resolved = new URL(pathname, origin);
  if (resolved.origin !== origin) {
    throw new ApplicationOriginConfigurationError(
      "Application URL paths must not replace the application origin.",
    );
  }
  return resolved.toString();
}

function vercelOrigin(value: string | undefined, name: string): string {
  const host = required(value, name);
  if (/[/\\:@?#\s]/.test(host)) {
    throw new ApplicationOriginConfigurationError(
      `${name} must contain only a Vercel-provided domain without a scheme.`,
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(`https://${host}`);
  } catch {
    throw new ApplicationOriginConfigurationError(
      `${name} must contain a Vercel-provided domain without a scheme.`,
    );
  }
  if (
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new ApplicationOriginConfigurationError(
      `${name} must contain only a Vercel-provided domain without a scheme.`,
    );
  }
  return parsed.origin;
}

function localOrigin(environment: RuntimeEnvironment): string {
  const rawHost = optional(environment.HOST) ?? "localhost";
  const host = rawHost === "0.0.0.0" || rawHost === "::" ? "localhost" : rawHost;
  if (host !== "localhost" && !isLoopback(host)) {
    throw new ApplicationOriginConfigurationError(
      "Local application HOST must identify a loopback listener.",
    );
  }
  const rawPort = optional(environment.PORT) ?? "3000";
  if (!/^[1-9]\d{0,4}$/.test(rawPort)) {
    throw new ApplicationOriginConfigurationError(
      "Local application PORT must be an integer from 1 to 65535.",
    );
  }
  const port = Number(rawPort);
  if (port > 65_535) {
    throw new ApplicationOriginConfigurationError(
      "Local application PORT must be an integer from 1 to 65535.",
    );
  }
  const renderedHost = isIP(host) === 6 ? `[${host}]` : host;
  return `http://${renderedHost}:${String(port)}`;
}

function isLoopback(value: string): boolean {
  if (isIP(value) === 4) return value.startsWith("127.");
  return value === "::1" || value.toLowerCase().startsWith("::ffff:127.");
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === "" ? undefined : normalized;
}

function required(value: string | undefined, name: string): string {
  const normalized = optional(value);
  if (normalized === undefined) {
    throw new ApplicationOriginConfigurationError(
      `${name} is required for this Vercel deployment.`,
    );
  }
  return normalized;
}
