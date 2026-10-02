import { describe, expect, it } from "vitest";
import { runVercelDeployment } from "./deploy-vercel";

const environment = {
  APP_BUILDER_DELIVERY_STAGE: "PRODUCTION",
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_PROJECT_PRODUCTION_URL: "app.example.com",
};

describe("Vercel deployment execution", () => {
  it("builds and verifies before migrating, preserving the deployment environment", () => {
    const calls: string[] = [];
    expect(
      runVercelDeployment(environment, (script, supplied) => {
        expect(supplied).toBe(environment);
        calls.push(script);
        return { status: 0 };
      }),
    ).toBe(0);
    expect(calls).toEqual(["build:vercel", "check:deployment:built", "migrate"]);
  });

  it.each([
    ["build:vercel", 21, ["build:vercel"]],
    ["check:deployment:built", 22, ["build:vercel", "check:deployment:built"]],
    ["migrate", 23, ["build:vercel", "check:deployment:built", "migrate"]],
  ] as const)("stops at failed %s and returns its exit", (failed, status, expected) => {
    const calls: string[] = [];
    expect(
      runVercelDeployment(environment, (script) => {
        calls.push(script);
        return { status: script === failed ? status : 0 };
      }),
    ).toBe(status);
    expect(calls).toEqual(expected);
  });

  it.each([{}, { ...environment, VERCEL_ENV: "preview" }])(
    "rejects invalid configuration before starting a command",
    (invalid) => {
      const calls: string[] = [];
      expect(() =>
        runVercelDeployment(invalid, (script) => {
          calls.push(script);
          return { status: 0 };
        }),
      ).toThrow(/APP_BUILDER_DELIVERY_STAGE|requires exposed Vercel Production/);
      expect(calls).toEqual([]);
    },
  );

  it("reports a terminated command as failure without starting migration", () => {
    const calls: string[] = [];
    expect(
      runVercelDeployment(environment, (script) => {
        calls.push(script);
        return { status: null };
      }),
    ).toBe(1);
    expect(calls).toEqual(["build:vercel"]);
  });

  it("propagates a command launch failure", () => {
    const error = new Error("npm could not start");
    expect(() =>
      runVercelDeployment(environment, () => ({ error, status: null })),
    ).toThrow(error);
  });
});
