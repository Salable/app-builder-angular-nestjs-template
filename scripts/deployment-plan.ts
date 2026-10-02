import { resolveApplicationOrigin } from "../src/runtime/application-origin";
export type DeploymentScript = "migrate" | "build:vercel" | "check:deployment:built";

/**
 * Vercel runs migrations using the deployment's own Neon credentials.
 * Production validates the built output before changing its database.
 */
export function deploymentScripts(
  value: string | undefined,
): readonly DeploymentScript[] {
  if (value === "DEVELOPMENT" || value === "PREVIEW") {
    return ["migrate", "build:vercel", "check:deployment:built"];
  }
  if (value === "PRODUCTION") {
    return ["build:vercel", "check:deployment:built", "migrate"];
  }
  throw new Error(
    "APP_BUILDER_DELIVERY_STAGE must be DEVELOPMENT, PREVIEW, or PRODUCTION for a Vercel deployment.",
  );
}

/** Validates the origin contract before a provider-owned deployment can build. */
export function deploymentApplicationOrigin(
  stage: string | undefined,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  if (!["DEVELOPMENT", "PREVIEW", "PRODUCTION"].includes(stage ?? "")) {
    throw new Error(
      "APP_BUILDER_DELIVERY_STAGE must be DEVELOPMENT, PREVIEW, or PRODUCTION before resolving the deployment origin.",
    );
  }
  const vercelEnvironment = environment.VERCEL_ENV?.trim();
  if (stage === "PREVIEW" && vercelEnvironment !== "preview") {
    throw new Error(
      "A PREVIEW delivery requires exposed Vercel Preview system variables.",
    );
  }
  if (stage === "PRODUCTION" && vercelEnvironment !== "production") {
    throw new Error(
      "A PRODUCTION delivery requires exposed Vercel Production system variables.",
    );
  }
  if (
    stage === "DEVELOPMENT" &&
    ![undefined, "development", "preview"].includes(vercelEnvironment)
  ) {
    throw new Error(
      "A DEVELOPMENT delivery must run locally or in a Vercel Preview environment.",
    );
  }
  return resolveApplicationOrigin(environment);
}
