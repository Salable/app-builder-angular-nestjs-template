import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSalableResponseGate,
  createSalableResponseSequence,
  type SalableResponseStep,
} from "./salable-response-sequence";

const origin = "https://salable.example";
const path = "/subscriptions/sub_fixture";
const step = (
  response = Response.json({ status: "fixture" }),
): SalableResponseStep => ({
  method: "GET",
  path,
  response,
});
afterEach(() => vi.restoreAllMocks());

// These tests prove the double's contract, not application billing behavior.
describe("deterministic Salable provider response sequence", () => {
  it("returns ordered stale, metadata-only and settled responses without calling the network", async () => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Real network forbidden"));
    const bodies = [
      { planId: "basic", updatedAt: "revision-1" },
      { planId: "basic", updatedAt: "revision-2" },
      { planId: "pro", updatedAt: "revision-3" },
    ];
    const fixture = createSalableResponseSequence({
      origin,
      steps: bodies.map((body) => step(Response.json(body))),
    });
    for (const body of bodies) {
      const response = await fixture.fetch(origin + path);
      expect(await response.json()).toEqual(body);
    }
    expect(fixture.requests).toEqual(bodies.map(() => ({ method: "GET", path })));
    fixture.assertComplete();
    expect(network).not.toHaveBeenCalled();
  });

  it("accepts Request and URL inputs and method overrides without retaining secrets", async () => {
    const fixture = createSalableResponseSequence({
      origin,
      steps: [{ ...step(), method: "patch" }, step()],
    });
    const request = new Request(origin + path + "?api_key=private-query", {
      method: "POST",
      headers: { authorization: "Bearer private-header", cookie: "private-cookie" },
      body: "private-body",
    });
    await fixture.fetch(request, { method: "PATCH" });
    await fixture.fetch(new URL(origin + path));
    expect(request.bodyUsed).toBe(false);
    expect(fixture.requests).toEqual([
      { method: "PATCH", path },
      { method: "GET", path },
    ]);
    expect(JSON.stringify(fixture.requests)).not.toContain("private-");
    fixture.assertComplete();
  });

  it("holds a response until release and rejects completion while it is pending", async () => {
    const gate = createSalableResponseGate();
    const fixture = createSalableResponseSequence({
      origin,
      steps: [{ ...step(), waitFor: gate.wait }],
    });
    let returned = false;
    const result = fixture.fetch(origin + path).then((response) => {
      returned = true;
      return response;
    });
    await Promise.resolve();
    expect(returned).toBe(false);
    expect(fixture.requests).toHaveLength(1);
    expect(() => fixture.assertComplete()).toThrow("responses are still pending");
    gate.release();
    gate.release();
    expect((await result).status).toBe(200);
    fixture.assertComplete();
  });

  it("supports a gate released before the request without waiting for a clock", async () => {
    const gate = createSalableResponseGate();
    gate.release();
    const fixture = createSalableResponseSequence({
      origin,
      steps: [{ ...step(new Response(null, { status: 204 })), waitFor: gate.wait }],
    });
    expect((await fixture.fetch(origin + path)).status).toBe(204);
    fixture.assertComplete();
  });

  it("throws a queued lost-response error then returns provider unavailability and a later response", async () => {
    const lost = new TypeError("Fixture response lost after request");
    const fixture = createSalableResponseSequence({
      origin,
      steps: [
        { ...step(), method: "POST", response: lost },
        step(
          new Response("Unavailable", { status: 503, headers: { "retry-after": "1" } }),
        ),
        step(new Response("invalid-json", { status: 200 })),
      ],
    });
    await expect(fixture.fetch(origin + path, { method: "POST" })).rejects.toBe(lost);
    const unavailable = await fixture.fetch(origin + path);
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("retry-after")).toBe("1");
    expect(await unavailable.text()).toBe("Unavailable");
    expect(await (await fixture.fetch(origin + path)).text()).toBe("invalid-json");
    fixture.assertComplete();
  });

  for (const [url, method] of [
    [origin + "/unexpected", "GET"],
    [origin + path, "POST"],
    ["https://other.example" + path, "GET"],
    ["http://salable.example" + path, "GET"],
    ["https://private-user:private-password@salable.example" + path, "GET"],
  ] as const) {
    it(`fails closed for an unexpected request ${url.replace(/\/\/.*@/, "//[redacted]@")} ${method}`, async () => {
      const fixture = createSalableResponseSequence({ origin, steps: [step()] });
      await expect(fixture.fetch(url!, { method })).rejects.toThrow(
        "unexpected request",
      );
      expect(() => fixture.assertComplete()).toThrow("a fixture expectation failed");
      await expect(fixture.fetch(origin + path)).rejects.toThrow(
        "earlier fixture expectation failed",
      );
      expect(JSON.stringify(fixture.requests)).not.toContain("private-");
    });
  }

  it("allows an empty sequence to complete but rejects any extra request", async () => {
    const fixture = createSalableResponseSequence({ origin, steps: [] });
    fixture.assertComplete();
    await expect(fixture.fetch(origin + path)).rejects.toThrow("unexpected request");
    expect(() => fixture.assertComplete()).toThrow("a fixture expectation failed");
  });

  it("detects unconsumed requests and returns immutable request snapshots", async () => {
    const fixture = createSalableResponseSequence({ origin, steps: [step(), step()] });
    await fixture.fetch(origin + path);
    const snapshot = fixture.requests;
    snapshot[0]!.method = "DELETE";
    snapshot.pop();
    expect(fixture.requests).toEqual([{ method: "GET", path }]);
    expect(() => fixture.assertComplete()).toThrow("unconsumed requests remain");
    await fixture.fetch(origin + path);
    fixture.assertComplete();
    await expect(fixture.fetch(origin + path)).rejects.toThrow("unexpected request");
  });

  it("captures the expected sequence and clones bodies before callers mutate their fixtures", async () => {
    const response = Response.json({ fixture: true });
    const steps = [step(response)];
    const fixture = createSalableResponseSequence({ origin, steps });
    steps[0]!.path = "/changed";
    steps.length = 0;
    await response.text();
    expect(await (await fixture.fetch(origin + path)).json()).toEqual({
      fixture: true,
    });
    fixture.assertComplete();
  });

  for (const value of [
    "invalid",
    "ftp://salable.example",
    origin + "/v1",
    origin + "?key=private",
    origin + "#fragment",
    "https://private:private@salable.example",
  ]) {
    it("rejects invalid configured origins without including their contents", () => {
      expect(() => createSalableResponseSequence({ origin: value, steps: [] })).toThrow(
        "expected an HTTP origin without credentials",
      );
    });
  }

  for (const value of [
    "relative",
    "/path?key=private",
    "/path#fragment",
    "//other.example/path",
    "https://other.example/path",
    "/a/../path",
    "http://[",
  ]) {
    it("rejects an expected path containing an origin, query, fragment or normalization", () => {
      expect(() =>
        createSalableResponseSequence({ origin, steps: [{ ...step(), path: value }] }),
      ).toThrow("expected an exact pathname");
    });
  }

  it("rejects invalid expected methods, response types and consumed response bodies", async () => {
    expect(() =>
      createSalableResponseSequence({
        origin,
        steps: [{ ...step(), method: "TRACE" }],
      }),
    ).toThrow("invalid expected method");
    expect(() =>
      createSalableResponseSequence({
        origin,
        steps: [{ ...step(), response: {} as Response }],
      }),
    ).toThrow("expected a Response or Error");
    const response = new Response("used");
    await response.text();
    expect(() =>
      createSalableResponseSequence({ origin, steps: [step(response)] }),
    ).toThrow("response body is already consumed");
  });

  for (const [url, method] of [
    ["private-invalid-url", "GET"],
    [origin + path, "private-invalid-method"],
  ]) {
    it("rejects malformed actual requests with safe diagnostics", async () => {
      const fixture = createSalableResponseSequence({ origin, steps: [step()] });
      await expect(fixture.fetch(url!, { method })).rejects.toThrow(
        "invalid request URL or method",
      );
      expect(fixture.requests).toEqual([]);
      expect(() => fixture.assertComplete()).toThrow("a fixture expectation failed");
    });
  }

  for (const alreadyAborted of [false, true]) {
    it(`honors ${alreadyAborted ? "an already aborted" : "a pending request's"} signal without recording its reason`, async () => {
      const controller = new AbortController();
      const gate = createSalableResponseGate();
      const fixture = createSalableResponseSequence({
        origin,
        steps: [{ ...step(), waitFor: gate.wait }],
      });
      if (alreadyAborted) controller.abort("private-abort-reason");
      const result = fixture.fetch(
        new Request(origin + path, { signal: controller.signal }),
      );
      const assertion = expect(result).rejects.toMatchObject({
        name: "AbortError",
        message: "Request aborted",
      });
      controller.abort("private-abort-reason");
      await assertion;
      gate.release();
      expect(JSON.stringify(fixture.requests)).not.toContain("private-");
      fixture.assertComplete();
    });
  }

  it("allows an explicit null signal to override the Request signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const fixture = createSalableResponseSequence({ origin, steps: [step()] });
    expect(
      (
        await fixture.fetch(new Request(origin + path, { signal: controller.signal }), {
          signal: null,
        })
      ).status,
    ).toBe(200);
    fixture.assertComplete();
  });

  it("fails completion if a release promise rejects instead of returning the declared response", async () => {
    const fixture = createSalableResponseSequence({
      origin,
      steps: [{ ...step(), waitFor: Promise.reject(new Error("private-gate-reason")) }],
    });
    await expect(fixture.fetch(origin + path)).rejects.toThrow("release gate rejected");
    expect(() => fixture.assertComplete()).toThrow("a fixture expectation failed");
  });
});
