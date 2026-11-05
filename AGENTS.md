# Agent guidance

The ticket defines the work. Deliver its smallest coherent outcome, preserve
unrelated changes and remove code/tests made obsolete by the change. Report
concrete out-of-scope findings in `supplementaryFindings` with a stable kebab-case
key, evidence, requested outcome and `duplicateOfTaskId` when already tracked
(otherwise null). The owner prioritises Backlog; do not expand this ticket.

Landing, sign-in, sign-up and signed-in views are neutral skeletons. Their owning
product tickets replace starter copy, branding and presentation with the accepted
product design while retaining tested authentication. Do not invent features
from starter examples or treat the skeleton as the finished product.

## Design

Keep functions readable as recipes: validate, process, finalise, persist, respond.
Prefer guard clauses and atomic writes when partial state would be invalid;
avoid speculative retries, fallbacks and abstractions. Business rules,
authorization and workflow progression belong on the server. The UI renders
server state and permitted actions, submits intent and owns transient display
state. Keep the selected framework and one current contract.

NestJS owns application workflows; controllers stay thin and persistence does
not own business policy. Shared Zod schemas define contracts. Use existing
`ApiProblem`, the global RFC 9457 filter and `ApiClient`, with stable codes, safe
details and correlation IDs. Customize `AuthPageComponent` and navigation;
reuse `SessionService`, `AuthenticationService` and local auth fixtures.

## Verification and completion

Test every changed exit through observable behavior, including rejection and
failure. Use real internal dependencies and disposable local storage; replace
LLMs, GitHub, Vercel and Neon at their external boundaries. Include functional/
integration coverage and browser happy paths plus a representative visible error.
Fixture self-checks and duplicated implementations do not prove application behavior.

Authors run the complete `npm run check` on the final worktree, sequentially
without concurrent constituents. Diagnose failures before repeating commands.
Return `COMPLETED` only for delivered work and green checks; otherwise preserve
coherent work and return `REVIEW_REQUIRED` with the failure and remaining work.
A justified no-change response on a retained PR needs no manufactured edit.

Reviewers keep source and Git state unchanged and inspect completed canonical
GitHub Actions evidence in `reviews/input.json`. They do not install dependencies,
run tests/builds, reproduce failures or retry CI. Missing required files are
in-scope defects; unrelated findings remain Backlog work.

Coding agents never perform hosted QA, deployments or remote CI retries; trusted
automation or human QA owns those checks. Missing hosted evidence is not a coding
failure, even if an older ticket says otherwise. Required approved Salable Test
Mode catalog setup/readback is implementation, not hosted QA. Dependency changes
must serve the ticket, update the lockfile and explain the choice. Do not run
`npm audit`, unsolicited package upgrades or advisory remediation.

## Task-specific guidance

Applicable skills are required; optional supporting context does not waive them.

- Product/feature research: use [product-research](.agents/skills/product-research/SKILL.md).
  Design direction uses [product-design-discovery](.agents/skills/product-design-discovery/SKILL.md);
  visible UI work uses [product-interface-design](.agents/skills/product-interface-design/SKILL.md).
- Rendering, caching, data-access or search decisions: use
  [application-engineering](.agents/skills/application-engineering/SKILL.md).
  Apply suitable performance, data-access, accessibility, SEO and privacy
  baselines as standard; ask about product choices, not routine engineering quality.
- Changed errors, provider adapters or logging: use
  [app-error-handling](.agents/skills/app-error-handling/SKILL.md) and its local
  reference. Preserve the shared safe logger; diagnostics cannot change outcomes.
- Approved billing work: use the installed pinned `salable-design` and
  `salable-develop` skills plus [monetisation](docs/monetisation.md). Use
  `salable-init` for an actual readiness question. The accepted agreement owns
  expected outcomes; authentication, billing authority and entitlement access
  remain separate. Use this project's confirmed catalog and real Test Mode IDs,
  never foreign resources or placeholders. Deliver required application tests and
  `.salable` artifacts with the supplied `check:commercial` contract.
- Auth, local database, environment or product-entry changes: read the relevant
  part of [integrations](docs/agent-integrations.md) and the
  [development guide](docs/development-guide.md).

## Tools and environment

The worker supplies Node/npm, Git, rg, Bash, curl, jq, Python 3, build tools and
Chromium. Use the lockfile; no OS/browser bootstrap is needed. Honor
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` with `--no-sandbox` inside the worker.
`APP_BUILDER_TEST_DATABASE_URL`, when supplied, is a disposable local PostgreSQL
fixture; workers do not need Docker access.

`.app-builder/context/manifest.json` lists optional project references. The mounted
operation's `body.environment` defines Preview/Production names, ownership and
applied revisions. Never invent configuration or copy secrets or mounted documents
into source. Agents receive no deployment, hosted database or release credentials;
GitHub publication is platform-owned. Shared account access grants no authority
to adopt or modify another project's catalog; no Live Mode work is authorized.

`.github/workflows/ci.yml` independently runs `npm run check` in the `app-builder/ci`
job's `Run complete suite` step on the exact PR head, using local fixtures and a
read-only GitHub token, no application secrets. Restore this canonical workflow
in the foundation ticket if the clone omitted it. See [README](README.md) for the
accepted product scope; a local fixture pass is not hosted customer verification.
