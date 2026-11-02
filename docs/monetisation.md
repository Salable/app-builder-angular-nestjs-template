# Monetisation implementation and tests

Use this guide only for the approved billing work. Read the installed, pinned
`salable-init`, `salable-design` and `salable-develop` skills and their relevant
references before choosing provider operations. They define the Salable API and
catalog semantics; this guide defines the application responsibilities. Keep the
accepted pricing model and ticket scope. Report an unresolved decision rather than
inventing a policy, and report unrelated improvements to Backlog.

## Start from the accepted agreement

Record who pays, who receives access and who may manage billing. Identify the
capabilities granted by each plan and the approved compatible or exclusive plan
groups. Preserve the agreed currency, cadence, transition timing, proration,
cancellation and resume behaviour. Add seats, usage, trials and past-due policies
only when they apply. Do not assume one subscription per user: an organisation
payer, several grantees or compatible add-ons may be the intended model.

Use a shared Salable tier tag only for plans that the agreement makes mutually
exclusive. Switching such plans changes the existing subscription through the
documented operation. Do not create a second checkout for an existing exclusive
subscription. Compatible subscriptions must remain possible when approved.

## Keep identity, billing permission and access separate

Authentication identifies the user. The application checks membership and role
for the requested account on every protected read and mutation. Derive owner and
grantee identities from that authenticated context; never trust a browser-supplied
customer, organisation, subscription or price ID without ownership checks.

Billing permission decides who can buy, change, cancel or resume a subscription.
An authorised member may have content access without permission to manage billing.

Salable entitlement results decide commercial access to each protected resource.
Enforce them on the server, as well as presenting their state in the UI. A plan
name, subscription label, local expiry calculation, checkout return or cached
webhook record cannot grant or revoke access independently. A provider failure is
an unknown result: do not display it as an unpaid account or allow protected
content. Return a safe typed problem with a useful retry action. Preserve
independent authentication and membership checks even when an entitlement exists.

## Complete the lifecycle

The backend owns the subscription workflow, permitted actions and state revisions.
The UI presents those facts and submits intent; it must not reconstruct business
rules from labels, timestamps or its own polling heuristics.

After checkout, plan change, cancellation or resume, reconcile the operation with
authoritative provider reads. An accepted mutation is not evidence that every
entitlement read has settled. Represent pending gains and revocations explicitly;
hide unavailable paid content while state is uncertain and do not offer another
purchase for an unresolved exclusive subscription. Show the actual current plan,
renewal/cancellation state and permitted next actions once confirmed.

Scope commands to the authenticated billing owner and expected semantic revision.
Reject stale/conflicting commands and prevent duplicate side effects. Readback
metadata such as request timestamps must not create a new business revision.
After a lost response, reconcile the existing operation before replay. A
read-only retry must not resend checkout, upgrade, downgrade, cancel or resume.

Cancellation-at-period-end and immediate cancellation differ. Keep or remove
access according to authoritative entitlements and the accepted policy. Resume
renewal only when the provider and agreement permit it. Put the cancel control
with the active subscription and make pending cancellation and renewal timing
clear. Do not invent an expiry from the local clock.

## Commit the contract and real catalog bindings

`.salable/requirements.json` is always present. The untouched starter contains:

```json
{ "schemaVersion": 1, "mode": "UNCONFIGURED" }
```

That is a neutral starter state, not a completed billing feature. The owning
foundation or billing ticket copies the exact approved agreement and changes the
mode:

- `NONE`: include the approved `agreement` with `decision: "NONE"` and its
  `reason`. This requires explicit product opt-out; never use it to bypass a
  required billing feature.
- `REQUIRED`: include the approved `agreement` with `decision: "TEST"` and
  `testEntrypoints`, an array of real repository-relative test file paths.
  Preserve the complete current agreement shape supplied by planning.

Create the approved Test Mode catalog with the supplied project credentials.
Read resources back by ID and write real non-secret IDs to
`.salable/manifest.json`. Reuse confirmed IDs on resumed work; do not sweep the
account or mutate Live Mode. This catalog work is implementation, not hosted QA.

Write `.salable/acceptance.json` using the canonical current contract supplied
with the task: it contains catalog IDs and application route/control bindings,
not credentials, temporary customers, expected outcomes or executable scripts.
Use `npm run check:commercial` to validate these files. The bundled validator
includes the canonical schema refinements; do not replace it with hand-copied
schemas or weaken it to make a failing fixture pass.

The validator checks structure, bindings and the presence of declared test files.
It does not run those tests or prove their assertions are meaningful. Wire the
tests into this repository's existing suite. Review compares the copied agreement,
bindings and assertions with the approved product requirements.

## Test the application in its own repository

The author implements and commits tests with each behaviour. Run the complete
`npm run check` on the final worktree. The existing GitHub `app-builder/ci` job
runs that same suite; keep it free of Salable keys and hosted application secrets.

Use real application services, HTTP routes, components and disposable local
storage. Substitute external Salable/payment/identity calls at their adapters.
Use deterministic provider responses for old, pending, settled, rejected and
unavailable states. A provider fixture is input to an application test, not a
second fake application or proof of a provider purchase.

`scripts/test-support/salable-response-sequence.ts` supplies a deterministic
fetch-compatible provider double. Create a sequence with the provider origin and
expected method/path steps, each returning a `Response` or throwing an `Error`.
Inject its `fetch` into the real application adapter. Use
`createSalableResponseGate()` and a step's `waitFor` promise to hold a read while
asserting the application's pending UI, then release it and assert settlement.
Queue old and updated entitlement responses for both gains and revocations, or a
503/lost response for recovery. Assert the real application's behaviour and call
`assertComplete()`; `requests` exposes only method/path and count for duplicate
mutation assertions. The helper's own tests prove its fixture contract only.

For each applicable lifecycle action, assert the application outcome and visible
error path. Cover:

- Unauthenticated users, unpaid users and each approved capability combination;
  deny cross-account access and unauthorised billing management.
- Purchase, exclusive plan switches and permitted compatible subscriptions;
  retain the correct subscription identity and prevent duplicate mutations.
- Cancellation, resume and expiry; use authoritative provider fixtures for
  future transitions rather than weakening production access rules.
- Delayed entitlement gains and revocations, provider failures, stale commands,
  duplicate submissions and lost responses. Retry reads without another mutation.
- UI updates before reload, stable semantic revisions despite metadata churn,
  and persistence after reload/sign-in.

Use existing component/API/browser tooling. Keep one browser happy path and a
representative error visible to the user. A test that merely checks a fixture
contains a plan or reimplements the state machine cannot establish app behaviour.
Test file names and coverage declarations cannot substitute for assertions.

## Report what was proved

Report committed tests and the complete local suite result. Reviewers inspect
source and supplied canonical GitHub evidence; they do not execute checks.

Authors do not run hosted checks, deploy, request Preview bypass credentials or
retry remote CI. Those actions belong to trusted automation or human QA. Hosted
invoice/expiry observations remain separate from local fixture tests. Record
missing owner configuration, provider failure and unsupported hosted scenarios
truthfully; they are not automatically coding failures. Do not claim real payment,
future renewal, proration or period-end expiry from a passing local suite.
