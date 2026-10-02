import { resolve } from "node:path";
import { createApplication } from "./application";

const { app } = await createApplication(resolve("dist/web/browser"));
app.enableShutdownHooks();
await app.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? "127.0.0.1");
