import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createApplication } from "../src/server/application";
import { createOpenApiDocument } from "../src/server/openapi";

const document = await buildOpenApiDocument();
if (process.argv.includes("--check")) {
  if (document !== (await readFile("openapi/openapi.json", "utf8")))
    throw new Error("OpenAPI is out of date. Run npm run generate:openapi.");
} else {
  await mkdir("openapi", { recursive: true });
  await writeFile("openapi/openapi.json", document);
}

async function buildOpenApiDocument(): Promise<string> {
  const { app } = await createApplication();
  try {
    return `${JSON.stringify(createOpenApiDocument(app), null, 2)}\n`;
  } finally {
    await app.close();
  }
}
