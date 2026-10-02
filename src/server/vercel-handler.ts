import type { IncomingMessage, ServerResponse } from "node:http";
import { createApplication } from "./application";

const application = createApplication();
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const { handler } = await application;
  handler(request, response);
}
