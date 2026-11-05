---
name: app-error-handling
description: Implement or review changed API errors, provider adapters, logging, and browser/startup/background failure boundaries. Use for owned failure paths, not a recurring whole-project audit.
---

# Application error handling

Read [application error logging](../../../docs/error-logging.md) before changing
the affected failure path. It owns the shared logger, provider normalization,
safe correlation/redaction and final reporting boundaries. Follow the existing
framework/API architecture in the [development guide](../../../docs/development-guide.md).
For billing, also load the applicable pinned Salable skill and
[monetisation guidance](../../../docs/monetisation.md) for endpoint semantics;
an expected empty entitlement result is not an outage.

Keep the real application adapter, wrappers and final handler in changed-path
tests; replace only external provider calls. Observe the safe response or UI
state together with useful correlated diagnostics, actual upstream evidence,
redaction and unchanged outcomes when the sink fails. The reference defines the
applicable cases; do not audit unrelated paths or invent a telemetry service.

Authors include these tests in the complete local suite and canonical GitHub
pipeline. Reviewers use the supplied completed CI evidence without executing
checks. Hosted log inspection belongs to trusted automation or human QA;
browser-console records do not establish server-collected telemetry.
