import { build } from "esbuild";

await build({
  entryPoints: ["src/server/local-server.ts", "src/server/vercel-handler.ts"],
  outdir: "dist/server",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  external: [
    "@nestjs/microservices",
    "@nestjs/microservices/microservices-module",
    "@nestjs/websockets/socket-module",
    "class-transformer",
    "class-validator",
    "pg-native",
  ],
  sourcemap: true,
});
