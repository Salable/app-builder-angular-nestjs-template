# Application error logging

Every application keeps the shared `src/runtime/error-logger.ts` logger and wires
new feature failures into it. Server records go to the hosting runtime's log
stream (Vercel Runtime Logs on Vercel). Browser records stay in the browser console;
they are not automatically uploaded or available in Vercel logs. A separate
telemetry destination requires an explicit product decision.

## Record useful, safe evidence

`reportError(error, context)` emits one JSON `application_error` record with a
timestamp, source, static operation and stable code. Include the request's
correlation ID, HTTP status, method and route template when applicable. Reuse the
same correlation ID in the public response so a customer report can be matched.
Do not attach an unrelated random ID when the operation already has one.

The logger retains a bounded error-cause chain, SQLSTATE/Node error codes and
source or bundle file names with line/column positions. It excludes messages,
full stacks and directories. `DiagnosticError` adds adapter-owned classification:
`configuration`, `provider`, `database` or `unexpected`, a static operation,
dependency name, upstream HTTP status and stable code. This distinguishes a
missing key, authentication rejection, transport failure and malformed response
without leaking provider bodies. Metadata labels must be constants, never user
values. Preserve existing public RFC 9457 contracts and safe display details.

A caught upstream HTTP failure must retain its actual response status, dependency,
operation and an allowlisted stable provider error code when known, through every
wrapper to the final log. `ErrorContext.status` is the application's public HTTP
status; `FailureDiagnostic.httpStatus` is the upstream response status. A public
503 or handled unavailable HTTP 200 must not overwrite the upstream 401, 429 or 502. Capture the safe fields at the adapter boundary before discarding the raw
response. Do not flatten known HTTP evidence into a generic configuration or
unavailable classification. Map only explicitly recognised provider codes, never
copy arbitrary error text or an entire response object.

Apply documented endpoint semantics before classifying a response as a failure.
Salable's grantee entitlement-check 404 is a valid empty-access result, not an
application error; see [empty entitlements](monetisation.md#empty-entitlements-are-a-valid-access-result).
This exception does not suppress other upstream 404s or genuine failures.

If no response was received, omit `httpStatus` and retain a safe, specific reason
such as `PROVIDER_TIMEOUT`, `PROVIDER_TRANSPORT_FAILED` or a constant naming the
missing configuration prerequisite. Do not invent an upstream status from the
application's response or an SDK's synthetic response. Missing status in an old
log is not evidence that no upstream request occurred.

The pinned Neon SDK exposes structured status for direct HTTP failures, but some
optional cookie-refresh failures provide only message text. Preserve those as
`IDENTITY_SDK_FAILED` with unknown upstream status; do not parse status-shaped
text as HTTP evidence. Better classification requires a supported structured SDK
hook, not guessing from messages or copying private response data.

Wrap an adapter failure with safe context and retain its cause:

```ts
throw new DiagnosticError(
  {
    category: "provider",
    dependency: "salable",
    operation: "subscriptions.read",
    httpStatus: response.status,
    code: "PROVIDER_REJECTED",
  },
  { cause: originalError },
);
```

Never pass a provider body as diagnostic metadata. Public domain errors may wrap
this error using `ErrorOptions.cause`; the final response still exposes only its
safe public code and detail. Do not log secrets, cookies, headers, SQL, payment
data, customer identities, request/response payloads, checkout URLs or URL queries.

## Own the reporting boundary

- The global request error boundary reports thrown failures once. Expected 4xx
  rejections are warnings; server failures are errors. Do not log and rethrow at
  each intermediate service or adapter.
- A service that catches a failure and returns unavailable or pending state owns
  reporting that failure, even when it returns HTTP 200. Include the existing
  request correlation ID and a static operation such as `billing.readback`.
  Ordinary pending settlement, a signed-out session and denied entitlements are
  not unexpected failures.
- Browser API interpretation and uncaught UI handlers use the same logger.
  Expected visible failures retain their normal UI recovery. Logging alone never
  claims that broken UI state recovered. Report startup and background errors at
  their owner without swallowing exceptions or changing process exit behavior.
- Logging is best effort. A failed sink cannot change an accepted write, produce
  another error response, retry a mutation or conceal the original failure.

For a handled degraded response, call the logger at the catch, then preserve the
existing outcome and recovery behavior:

```ts
reportError(error, {
  source: "server",
  operation: "billing.readback",
  code: "BILLING_UNAVAILABLE",
  correlationId,
  method: "GET",
  path: "/api/v1/billing/subscriptions/current",
});
```

## Prove diagnostics in application tests

Exercise real routes/services and browser handling, replacing only external
providers. Verify safe responses or degraded state and a matching useful record;
cover configuration, provider rejection, transport and malformed responses when
the feature has those exits. For a known upstream rejection, assert its exact
status and safe code survive adapter normalization and public wrappers even when
the public response is a different status or handled HTTP 200. For a no-response
failure, assert the specific reason and absence of an invented upstream status.
Include a representative unexpected failure, secrets
in synthetic exception/payload fixtures, and a throwing log sink. Assert the
original result remains unchanged and billing mutations are not repeated. The
logger's unit tests supplement these application tests; they cannot replace them.

Keep tests in the complete `npm run check` and canonical GitHub pipeline, with
local fixtures and no hosted credentials. Authors implement and run local checks;
hosted log inspection belongs to trusted automation or human QA.
