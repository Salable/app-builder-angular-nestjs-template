# Feature and library research

Begin with the requested behaviour and inspect the actual framework, runtime,
existing adapters and lockfile. Reusing a compatible maintained dependency is
often preferable to adding a second library for the same job. A familiar name,
download count or recent release alone does not establish suitability.

For a consequential library choice, check its official API and release/support
information against the selected framework/runtime versions, server or browser
execution, module format, SSR/hydration, deployment constraints, bundle cost and
license. Inspect relevant maintenance evidence and documented limitations. State
unknowns; do not start unsolicited upgrades or vulnerability-audit remediation.
New recurring services, credentials or material spend need an explicit product
decision when they are not already authorized.

Research complex features as workflows: actors and authority, inputs, data
ownership, successful result, rejection, partial failure, concurrency and
recovery. Examples include collaboration, imports, search, file processing,
background jobs and billing. Select only the applicable concerns. Do not turn a
small feature into a speculative distributed system.

For each chosen approach, make the next implementation step concrete:

| Decision              | Useful evidence and resulting plan                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Provider integration  | Exact operation/schema/version; adapter boundary; success and failure mapping; locally reproducible contract cases                      |
| Library               | Supported version combination; existing alternative; why it earns its cost; a focused compatibility check when uncertain                |
| Rendering             | Which content must appear first; static/server/client choice in the selected framework; cache ownership; meaningful-content measurement |
| Search or data access | User query semantics; permission filters; bounded results; indexes/query plan against representative local data                         |
| Complex state change  | Authoritative state, atomic local writes, external uncertainty, idempotency/reconciliation appropriate to the operation                 |

Research must reach the spec and owning ticket as a decision and observable
acceptance criterion, not remain a bibliography. Separate recommended alternatives
from the accepted implementation. Where the existing schema cannot represent a
required decision, report the contract gap; do not drop the requirement to make
validation pass.

App Builder's billing scope is full Salable parity. Common pricing playbooks are
examples, not a closed supported-model list. A platform schema or hosted verifier
that cannot describe a valid Salable capability is a platform gap, not a reason
to reject that product requirement or substitute a simpler model. Preserve the
requirement and identify the necessary platform work. Use authoritative provider
operations; parity is not permission to invent missing API fields or guarantees.
The app owns implementation and meaningful model-specific tests in its canonical
GitHub suite; a limited hosted scenario runner does not define what can be built.

Technical evidence should come from official documentation, source or original
papers. For rendering, the official [Angular](https://angular.dev/guide/ssr) and
[TanStack Start](https://tanstack.com/start/latest/docs/framework/react/guide/static-prerendering)
guides explain available strategies, but current documentation must still be
checked against the repository's installed versions. For SQL investigation use
the database's own [query-plan documentation](https://www.postgresql.org/docs/current/using-explain.html).
