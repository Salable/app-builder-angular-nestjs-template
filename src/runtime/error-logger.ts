/** Safe diagnostics shared by server boundaries and browser error handlers. */
export interface ErrorContext {
  source: "server" | "browser";
  /** Static operation name, never a user value. */
  operation: string;
  code: string;
  correlationId?: string;
  status?: number;
  method?: string;
  /** A route template, not a URL or a path containing user-supplied identifiers. */
  path?: string;
}

export interface FailureDiagnostic {
  category: "configuration" | "provider" | "database" | "unexpected";
  operation: string;
  dependency?: string;
  httpStatus?: number;
  code?: string;
}

/** Adapters retain classification without retaining provider response bodies. */
export class DiagnosticError extends Error {
  constructor(
    readonly diagnostic: FailureDiagnostic,
    options?: ErrorOptions,
  ) {
    super("Application operation failed.", options);
  }
}

interface ErrorDiagnostic {
  type: string;
  code?: string;
  diagnostic?: Partial<FailureDiagnostic>;
  frames?: string[];
  cause?: ErrorDiagnostic;
}

/**
 * One JSON record per owned failure. Call at the final boundary, including a
 * catch that returns degraded state instead of throwing. Never log raw errors.
 * Browser records stay in the browser console; server records go to host logs.
 */
export function reportError(error: unknown, context: ErrorContext): void {
  try {
    const record = {
      event: "application_error",
      timestamp: new Date().toISOString(),
      source: context.source === "browser" ? "browser" : "server",
      operation: label(context.operation) ?? "unknown",
      code: codeLabel(context.code) ?? "UNEXPECTED_ERROR",
      correlationId: correlation(context.correlationId),
      status: httpStatus(context.status),
      method: method(context.method),
      path: route(context.path),
      error: describeError(error, new Set(), 0),
    };
    const output = JSON.stringify(record);
    if (record.status !== undefined && record.status >= 400 && record.status < 500) {
      console.warn(output);
      return;
    }
    console.error(output);
  } catch {
    // Inspection and logging are best effort; neither can change app behavior.
  }
}

function describeError(
  error: unknown,
  seen: Set<Error>,
  depth: number,
): ErrorDiagnostic {
  try {
    return inspectError(error, seen, depth);
  } catch {
    return { type: "UnreadableError" };
  }
}

function inspectError(
  error: unknown,
  seen: Set<Error>,
  depth: number,
): ErrorDiagnostic {
  if (!(error instanceof Error)) return { type: "NonErrorThrown" };
  if (seen.has(error)) return { type: "CircularCause" };
  if (depth >= 4) return { type: "CauseLimit" };
  seen.add(error);
  const errorCode = ownValue(error, "code");
  const cause = ownValue(error, "cause");
  return {
    type: label(error.constructor.name) ?? "Error",
    code:
      typeof errorCode === "string" && /^(?:[0-9A-Z]{5}|E[A-Z_]{2,40})$/.test(errorCode)
        ? errorCode
        : undefined,
    diagnostic:
      error instanceof DiagnosticError ? diagnostic(error.diagnostic) : undefined,
    frames: callsites(error, readStack(error)),
    ...(cause === undefined ? {} : { cause: describeError(cause, seen, depth + 1) }),
  };
}

function ownValue(error: Error, key: string): unknown {
  try {
    // Do not execute provider-defined accessors while reporting a failure.
    return Object.getOwnPropertyDescriptor(error, key)?.value;
  } catch {
    return undefined;
  }
}

function readStack(error: Error): unknown {
  try {
    // V8 exposes stack through a lazy accessor, including on normal Errors.
    return error.stack;
  } catch {
    return undefined;
  }
}

function diagnostic(input: FailureDiagnostic): Partial<FailureDiagnostic> {
  const categories = ["configuration", "provider", "database", "unexpected"];
  return {
    category: categories.includes(input.category) ? input.category : "unexpected",
    operation: label(input.operation),
    dependency: label(input.dependency),
    httpStatus: httpStatus(input.httpStatus),
    code: codeLabel(input.code),
  };
}

function callsites(error: Error, stack: unknown): string[] | undefined {
  if (typeof stack !== "string") return undefined;
  const message = ownValue(error, "message") ?? "";
  if (typeof message !== "string" || typeof error.name !== "string") return undefined;
  const header = message === "" ? error.name : `${error.name}: ${message}`;
  // V8 includes the entire message, including embedded newlines and text that
  // resembles a frame. Remove that exact header before inspecting any frames.
  // Unrecognized/custom stack formats are omitted rather than guessed at.
  if (!stack.startsWith(`${header}\n`)) return undefined;
  const frames: string[] = [];
  // Drop directories, function arguments, URL queries and fragments. Keep only
  // recognizable V8 source/bundle basenames and positions for debugging.
  for (const line of stack
    .slice(header.length + 1)
    .split("\n")
    .slice(0, 20)) {
    const match =
      /^\s+at .*[/\\]([A-Za-z0-9_.-]{1,100}\.[cm]?[jt]sx?):(\d{1,8}):(\d{1,8})\)?$/.exec(
        line,
      );
    if (match) frames.push(`${match[1]}:${match[2]}:${match[3]}`);
    if (frames.length === 6) break;
  }
  return frames.length === 0 ? undefined : frames;
}

function label(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(value)
    ? value
    : undefined;
}

function codeLabel(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(value)
    ? value
    : undefined;
}

function correlation(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)
    ? value
    : undefined;
}

function httpStatus(value: unknown): number | undefined {
  return Number.isInteger(value) &&
    typeof value === "number" &&
    value >= 100 &&
    value <= 599
    ? value
    : undefined;
}

function method(value: unknown): string | undefined {
  return typeof value === "string" &&
    /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(value)
    ? value
    : undefined;
}

function route(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const path = value.split(/[?#]/, 1)[0];
  return path && /^\/[A-Za-z0-9_/:.*{}-]{0,199}$/.test(path) ? path : undefined;
}
