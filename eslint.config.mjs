import eslint from "@eslint/js";
import angularTemplate from "@angular-eslint/eslint-plugin-template";
import angularTemplateParser from "@angular-eslint/template-parser";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".angular/**",
      "dist/**",
      ".vercel/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
      "node_modules/**",
    ],
  },
  {
    files: ["**/*.{js,cjs,mjs,ts}"],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.vitest },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-else-return": ["error", { allowElseIf: false }],
      "max-depth": ["warn", 2],
      "no-nested-ternary": "error",
      complexity: ["warn", 12],
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: [
          "./tsconfig.server.json",
          "./tsconfig.app.json",
          "./tsconfig.spec.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    files: ["src/browser/**/*.ts"],
    processor: angularTemplate.processors["extract-inline-html"],
  },
  {
    files: ["**/*.html"],
    languageOptions: { parser: angularTemplateParser },
    plugins: { "@angular-eslint/template": angularTemplate },
    rules: {
      "@angular-eslint/template/no-duplicate-attributes": "error",
      "@angular-eslint/template/no-empty-control-flow": "error",
    },
  },
);
