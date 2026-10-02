import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov"],
      include: ["src/**/*.ts", "scripts/*.ts"],
      exclude: ["**/*.test.ts", "**/*test-service.ts", "src/browser/**"],
    },
  },
});
