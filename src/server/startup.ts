import { reportError } from "../runtime/error-logger";

/** Report bootstrap failures once at the entry point without hiding failed startup. */
export async function initializeServer<T>(initialize: () => Promise<T>): Promise<T> {
  try {
    return await initialize();
  } catch (error) {
    reportError(error, {
      source: "server",
      operation: "application.startup",
      code: "SERVER_STARTUP_FAILED",
    });
    throw error;
  }
}
