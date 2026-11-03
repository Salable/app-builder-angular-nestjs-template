import type { IncomingMessage, ServerResponse } from "node:http";
import { createApplication } from "./application";
import { initializeServer } from "./startup";

const application = initializeServer(() => createApplication());
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const { handler } = await application;
  handler(request, response);
}
