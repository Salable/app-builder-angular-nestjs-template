import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { vercelRoutes } from "./vercel-routes";

const output = ".vercel/output";
const routes = vercelRoutes(process.env);
await rm(output, { recursive: true, force: true });
await mkdir(`${output}/functions/api.func`, { recursive: true });
await cp("dist/web/browser", `${output}/static`, { recursive: true });
await cp("dist/server/vercel-handler.mjs", `${output}/functions/api.func/handler.mjs`);
await writeFile(
  `${output}/functions/api.func/.vc-config.json`,
  JSON.stringify({
    runtime: "nodejs24.x",
    handler: "handler.mjs",
    launcherType: "Nodejs",
    supportsResponseStreaming: true,
  }),
);
await writeFile(`${output}/config.json`, JSON.stringify({ version: 3, routes }));
