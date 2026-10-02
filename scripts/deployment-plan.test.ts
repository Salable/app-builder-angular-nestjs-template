import { describe, expect, it } from "vitest";
import { deploymentApplicationOrigin, deploymentScripts } from "./deployment-plan";

describe("Vercel deployment plan", () => {
  it("migrates an isolated preview database before building", () => {
    expect(deploymentScripts("PREVIEW")).toEqual([
      "migrate",
      "build:vercel",
      "check:deployment:built",
    ]);
  });

  it("treats staged Development delivery as a preview deployment", () => {
    expect(deploymentScripts("DEVELOPMENT")).toEqual([
      "migrate",
      "build:vercel",
      "check:deployment:built",
    ]);
  });

  it("migrates Production after validating the built output", () => {
    expect(deploymentScripts("PRODUCTION")).toEqual([
      "build:vercel",
      "check:deployment:built",
      "migrate",
    ]);
  });

  it("fails closed without an App Builder deployment stage", () => {
    expect(() => deploymentScripts(undefined)).toThrow(/APP_BUILDER_DELIVERY_STAGE/);
  });

  it("validates the target-specific application origin before building", () => {
    expect(
      deploymentApplicationOrigin("PREVIEW", {
        VERCEL: "1",
        VERCEL_ENV: "preview",
        VERCEL_URL: "ticket-preview.vercel.app",
      }),
    ).toBe("https://ticket-preview.vercel.app");
    expect(
      deploymentApplicationOrigin("PRODUCTION", {
        VERCEL: "1",
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "app.example.com",
      }),
    ).toBe("https://app.example.com");
    expect(
      deploymentApplicationOrigin("DEVELOPMENT", {
        HOST: "127.0.0.1",
        NODE_ENV: "test",
        PORT: "4312",
      }),
    ).toBe("http://127.0.0.1:4312");
  });

  it("rejects a missing or mismatched Vercel target before building", () => {
    expect(() =>
      deploymentApplicationOrigin("PREVIEW", {
        NODE_ENV: "production",
      }),
    ).toThrow(/requires exposed Vercel Preview/);
    expect(() =>
      deploymentApplicationOrigin("PRODUCTION", {
        VERCEL: "1",
        VERCEL_ENV: "preview",
        VERCEL_URL: "ticket-preview.vercel.app",
      }),
    ).toThrow(/requires exposed Vercel Production/);
  });
});
