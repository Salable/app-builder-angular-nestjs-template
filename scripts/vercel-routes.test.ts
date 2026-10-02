import { describe, expect, it } from "vitest";
import { vercelRoutes } from "./vercel-routes";

describe("Vercel routing", () => {
  it("serves API before the SPA fallback and adds no hosted redirect for local builds", () => {
    expect(vercelRoutes({})).toEqual([
      { src: "/api(?:/.*)?$", dest: "/api" },
      { handle: "filesystem" },
      { src: "/.*", dest: "/index.html" },
    ]);
  });
  for (const [stage, host] of [
    ["preview", "branch-123.vercel.app"],
    ["production", "product.example.test"],
  ]) {
    it(`keeps ${stage} navigation and auth on its trusted origin`, () => {
      const route = vercelRoutes({
        VERCEL: "1",
        VERCEL_ENV: stage,
        VERCEL_URL: "branch-123.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "product.example.test",
      })[0];
      expect(route).toMatchObject({
        status: 307,
        methods: ["GET", "HEAD"],
        missing: [{ type: "host", value: { eq: host } }],
        headers: { Location: `https://${host}/$1` },
      });
    });
  }
  it("rejects incomplete Vercel configuration before emitting an artifact", () => {
    expect(() => vercelRoutes({ VERCEL: "1", VERCEL_ENV: "preview" })).toThrow(
      /VERCEL_URL/,
    );
  });
});
