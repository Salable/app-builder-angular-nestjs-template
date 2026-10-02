# Agent guidance

The ticket defines the work. Deliver its smallest coherent outcome, preserve
unrelated changes, and remove code and tests made obsolete by your change.
Supporting material is optional: read it when the task needs it. Report concrete
out-of-scope findings in `supplementaryFindings` with a stable kebab-case key,
evidence and requested outcome. Set `duplicateOfTaskId` when already tracked,
otherwise null. The owner prioritises that Backlog; do not expand this ticket.

## Design

- Write functions as recipes: sanitise, validate, process, finalise, transform if
  needed, persist, respond. Prefer guard clauses and early exits. Keep the main
  path flat; avoid deep nesting and `else` after a returning guard. Extract helpers
  for distinct responsibilities, not just to hide complexity.
- Finish processing before writes where practical. Use a transaction when partial
  storage would leave invalid state. Prefer deterministic results and removing
  unnecessary steps over speculative retries, fallbacks or abstractions.
- NestJS owns business rules, authorization and workflows. Keep controllers thin
  and persistence free of workflow policy. Angular renders server state, collects
  intent and owns transient UI state.
- Use plural resource routes and standard CRUD methods. Names must be concise
  and unambiguous: `noteId`, `content`, `createdAt`. Use one vocabulary across
  routes, actions, DTOs and clients; name units explicitly. Shared Zod schemas
  define validation and DTO shapes; NestJS generates OpenAPI from actual routes.
- Throw expected `ApiProblem` errors. The global filter serializes RFC 9457;
  `ApiClient` interprets it. Keep stable codes, safe details and correlation IDs.
  Normalize provider errors at adapters. Never expose secrets or provider bodies.
  Defer nonessential diagnostics until after the response where supported; they
  must not turn a successful operation into a failure.
- Auth is already implemented and tested. Customise `AuthPageComponent` and
  navigation; reuse `SessionService`, `AuthenticationService` and local fixtures.
  Add tests for the change, not another auth implementation or harness.

## Verification

Test every changed exit through observable behavior, including rejection and
failure. Use real internal dependencies and disposable local storage. Mock LLMs,
GitHub, Vercel and Neon at their external boundaries. Include functional/integration
coverage and browser happy paths plus a visible error. Remove tests that only
assert their own fixtures or duplicate production logic.

Run the complete `npm run check` on the final worktree, sequentially, without
concurrent constituents. Diagnose failures before rerunning unchanged commands.
Return `COMPLETED` only for delivered work with green checks; otherwise preserve
coherent work and return `REVIEW_REQUIRED` with the failure and remaining work.
Reviewers assess scope and introduced regressions independently, keep source and
Git state unchanged, and run the same suite. A missing required file is an in-scope
defect; unrelated findings are Backlog work. Do not manufacture edits for a valid
no-change response on a retained PR.

Coding agents never perform hosted QA, deployments or remote CI retries. Those
belong to trusted automation or human QA; missing hosted evidence is not a coding
failure. Required Salable Test Mode catalog setup is implementation within a
billing ticket. Dependency changes must serve the ticket, update the lockfile and
explain the choice. Do not run `npm audit` or unsolicited advisory remediation.

## Tools and context

The worker supplies Node/npm, Git, rg, Bash, curl, jq, Python 3, build tools and
Chromium. Use the lockfile; no OS/browser bootstrap is needed. Use
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when set, with `--no-sandbox` in the worker.
The host may supply a disposable PostgreSQL fixture through
`APP_BUILDER_TEST_DATABASE_URL`; workers do not need Docker access.

`.app-builder/context/manifest.json` lists mounted references. Installed Salable
skills (`salable-design`, `salable-develop`, `salable-init`) are available when
relevant. `body.environment` in the mounted operation document defines available
Preview/Production variables. Never invent configuration or copy secrets or mounted
documents into source. Agents receive no deployment or hosted database credentials;
GitHub publication is platform-owned.

See [README](README.md) for product scope, [development guide](docs/development-guide.md)
for architecture and commands, and [integrations](docs/agent-integrations.md) for
auth, local databases, billing, environments and product entry work.
