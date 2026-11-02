export interface SalableResponseStep {
  method: string;
  /** Exact pathname; query strings, headers and request bodies are not recorded. */
  path: string;
  response: Response | Error;
  waitFor?: Promise<void>;
}

/** Deterministic provider-boundary double, not a subscription implementation. */
export function createSalableResponseSequence(input: {
  origin: string;
  steps: readonly SalableResponseStep[];
}) {
  const origin = providerOrigin(input.origin);
  const steps = input.steps.map((step) => expectedStep(step, origin));
  const requests: { method: string; path: string }[] = [];
  let consumed = 0;
  let pending = 0;
  let failed = false;
  function fail(message: string): never {
    failed = true;
    throw new Error(`Salable response fixture: ${message}`);
  }
  const fetch: typeof globalThis.fetch = async (input, init) => {
    if (failed) fail("an earlier fixture expectation failed");
    const request = requestIdentity(input, init);
    if (request === null) fail("invalid request URL or method");
    requests.push({ method: request.method, path: request.url.pathname });
    const step = steps[consumed];
    if (
      request.url.origin !== origin ||
      request.url.username ||
      request.url.password ||
      step?.method !== request.method ||
      step.path !== request.url.pathname
    )
      fail("unexpected request");
    consumed++;
    pending++;
    try {
      await waitForResponse(step.waitFor, request.signal).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        fail("release gate rejected");
      });
      if (step.response instanceof Error) throw step.response;
      return step.response;
    } finally {
      pending--;
    }
  };
  return {
    fetch,
    /** A fresh snapshot containing only method and pathname; length is the count. */
    get requests() {
      return requests.map((request) => ({ ...request }));
    },
    assertComplete() {
      if (failed)
        throw new Error("Salable response fixture: a fixture expectation failed");
      if (consumed !== steps.length)
        throw new Error("Salable response fixture: unconsumed requests remain");
      if (pending !== 0)
        throw new Error("Salable response fixture: responses are still pending");
    },
  };
}

/** Release deliberately delayed readback without timers or real provider calls. */
export function createSalableResponseGate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

function providerOrigin(value: string) {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new Error(
      "Salable response fixture: expected an HTTP origin without credentials",
    );
  }
}

function expectedStep(step: SalableResponseStep, origin: string) {
  const method = step.method.toUpperCase();
  if (!/^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(method))
    throw new Error("Salable response fixture: invalid expected method");
  expectedPath(step.path, origin);
  if (!(step.response instanceof Response) && !(step.response instanceof Error))
    throw new Error("Salable response fixture: expected a Response or Error");
  try {
    return {
      ...step,
      method,
      response:
        step.response instanceof Response ? step.response.clone() : step.response,
    };
  } catch {
    throw new Error("Salable response fixture: response body is already consumed");
  }
}

function expectedPath(path: string, origin: string) {
  try {
    const url = new URL(path, origin);
    if (url.origin !== origin || url.pathname !== path || url.search || url.hash)
      throw new Error();
  } catch {
    throw new Error("Salable response fixture: expected an exact pathname");
  }
}

function requestIdentity(input: Parameters<typeof fetch>[0], init?: RequestInit) {
  try {
    const request =
      input instanceof Request
        ? input
        : { url: input.toString(), method: "GET", signal: null };
    const url = new URL(request.url);
    const method = (init?.method ?? request.method).toUpperCase();
    if (!/^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(method)) return null;
    return {
      url,
      method,
      signal: init?.signal === undefined ? request.signal : init.signal,
    };
  } catch {
    return null;
  }
}

function waitForResponse(wait: Promise<void> | undefined, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    const finish = (complete: () => void) => {
      signal?.removeEventListener("abort", abort);
      complete();
    };
    const abort = () =>
      finish(() => reject(new DOMException("Request aborted", "AbortError")));
    signal?.addEventListener("abort", abort, { once: true });
    void Promise.resolve(wait).then(
      () => finish(resolve),
      () =>
        finish(() =>
          reject(new Error("Salable response fixture: release gate rejected")),
        ),
    );
    if (signal?.aborted) abort();
  });
}
