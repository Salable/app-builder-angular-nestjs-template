import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { once } from "node:events";
import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const output = ".vercel/output";
const config = JSON.parse(await readFile(`${output}/config.json`, "utf8"));
assert.equal(config.version, 3);
assert.equal(
  config.routes.find((route: { dest?: string }) => route.dest === "/api")?.src,
  "/api(?:/.*)?$",
);
assert.equal(config.routes.at(-1).dest, "/index.html");
const runtime = JSON.parse(
  await readFile(`${output}/functions/api.func/.vc-config.json`, "utf8"),
);
assert.equal(runtime.runtime, "nodejs24.x");
assert.match(await readFile(`${output}/static/index.html`, "utf8"), /app-root/);
// Load only the deployed files, outside the repository and its node_modules.
const isolated = await mkdtemp(join(tmpdir(), "angular-nestjs-function-"));
try {
  await cp(`${output}/functions/api.func`, isolated, { recursive: true });
  const { default: handler } = await import(
    pathToFileURL(join(isolated, runtime.handler)).href
  );
  const server = createServer(handler as RequestListener);
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const health = await fetch(`${origin}/api/v1/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok", apiVersion: "v1" });
    const openapi = await fetch(`${origin}/api/v1/openapi.json`);
    assert.equal(openapi.status, 200);
    assert.equal(
      (await openapi.json()).paths["/api/v1/notes"].post.operationId,
      "createNote",
    );
    const rejected = await fetch(`${origin}/api/v1/notes`);
    assert.equal(rejected.status, 401);
    assert.equal((await rejected.json()).code, "SIGN_IN_REQUIRED");
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }
} finally {
  await rm(isolated, { recursive: true, force: true });
}
console.log(
  "Verified Angular static assets and the standalone NestJS Vercel Function.",
);
