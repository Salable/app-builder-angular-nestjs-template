import { afterEach, describe, expect, it, vi } from "vitest";
import { createApplication } from "./application";
import { initializeServer } from "./startup";

afterEach(() => vi.restoreAllMocks());

describe("server startup diagnostics", () => {
  it("preserves a successful application startup without logging an error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const application = await initializeServer(() => createApplication());
    try {
      await application.app.listen(0, "127.0.0.1");
      expect(
        (await fetch(`${await application.app.getUrl()}/api/v1/session`)).status,
      ).toBe(200);
      expect(log).not.toHaveBeenCalled();
    } finally {
      await application.app.close();
    }
  });

  it.each([false, true])(
    "retains a real listener failure when the logging sink fails: %s",
    async (brokenSink) => {
      const first = await createApplication();
      const second = await createApplication();
      const log = vi.spyOn(console, "error").mockImplementation(() => {
        if (brokenSink) throw new Error("Failed sink");
      });
      try {
        await first.app.listen(0, "127.0.0.1");
        const port = Number(new URL(await first.app.getUrl()).port);
        await expect(
          initializeServer(async () => {
            await second.app.listen(port, "127.0.0.1");
          }),
        ).rejects.toMatchObject({ code: "EADDRINUSE" });
        expect(log).toHaveBeenCalledOnce();
        expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
          source: "server",
          operation: "application.startup",
          code: "SERVER_STARTUP_FAILED",
          error: { code: "EADDRINUSE" },
        });
      } finally {
        await second.app.close();
        await first.app.close();
      }
    },
  );
});
