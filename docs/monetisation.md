# Monetisation implementation and tests

Use this guide only for the approved billing work. Read the installed, pinned
`salable-design` and `salable-develop` skills and their relevant references before
choosing provider operations; use `salable-init` for a readiness question, not a
recurring setup audit. They define the Salable API and
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

### Empty entitlements are a valid access result

For `GET /api/entitlements/check?granteeId=...` (with `owner` when required by the
accepted tenant scope), HTTP 404 means that grantee has no entitlements. Normalize
it in this operation's adapter to an empty entitlement set, just like a valid
empty success response. Keep protected content locked; do not show access or
billing as unavailable, emit an application error, or offer outage retries for
this expected absence. Continue independent subscription reads: no entitlements
does not establish that no subscription exists or permit a duplicate checkout.

This rule applies only to that entitlement lookup. Never turn all provider 404s
into empty results. Other endpoints' 404s, authentication/permission failures,
rate limits, server failures, transport failures and malformed success responses
retain their own error handling and safe diagnostics. Unknown access remains
closed; do not convert genuine failures into an unpaid state.

## Hand the customer over to hosted checkout

Unless the accepted experience explicitly differs, an explicit eligible purchase
click must navigate the current tab to the validated server-returned checkout URL
as soon as it is available. The backend still authorizes the payer, selected plan
and permitted action, and validates the provider destination. Do not wait for a
paid subscription or settled entitlements before navigation: the customer must
complete checkout first. A ready checkout awaiting customer payment differs from
an uncertain mutation outcome or post-payment verification.

Show brief redirecting feedback and an accessible continuation link as a fallback.
Allow the customer to resume the same valid checkout explicitly; use the existing
operation's duplicate protection rather than create another cart on every click.
If checkout creation is rejected or the URL is missing/invalid, show a safe
actionable error without navigating. If the mutation's outcome is unknown, show
pending read-only recovery; never repeat an uncertain mutation or navigate to an
untrusted destination.

Passive reads, reloads, read-only verification retries and success/cancel returns
must not automatically send the customer back to hosted checkout or create another
checkout. On return, reconcile authoritative provider state and display the actual
permitted actions. A confirmation page may navigate once to the application's
workspace when the backend confirms the required billing/access state. Keep the
destination inside the application and prevent repeat navigation or return loops;
pending, unavailable and cancelled states must not masquerade as confirmed access.
Neither checkout readiness nor a return marker proves payment or grants protected access.
Keep accepted embedded or other explicit checkout experiences when applicable;
do not change the approved pricing, lifecycle policy or catalog to implement this
handoff.

## Complete the lifecycle

The backend owns the subscription workflow, permitted actions and state revisions.
The UI presents those facts and submits intent; it must not reconstruct business
rules from labels, timestamps or its own polling heuristics.

After checkout returns or an authoritative provider outcome arrives, reconcile
with provider reads. Also reconcile after a plan change, cancellation or resume.
An accepted mutation is not evidence that every entitlement read has settled.
Represent pending gains and revocations explicitly;
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

## Keep billing failures diagnosable

Use the [shared error logger](error-logging.md). Distinguish missing configuration,
provider authentication/rejection, transport failure and invalid provider data in
safe adapter diagnostics. Every caught Salable HTTP failure retains its actual
upstream status, operation, dependency, allowlisted provider code when known and
original cause through public error wrappers; do not replace it with the public
503 or an unqualified configuration error. Missing configuration, timeout and
transport failures without a response need a specific safe reason code and no
invented HTTP status. A catch that returns billing or access `unavailable`, or
pending state after failed readback, must record its cause and correlation ID even
when the HTTP response is 200. Expected settlement delay alone is not an error.
Keep separate operation labels for mutation and reconciliation. Never log keys,
owner/grantee identifiers, payment data, checkout URLs or provider response bodies.

Tests must drive real application routes/services with provider-boundary failures,
assert the safe visible state, diagnostic classification, correlation and exact
upstream status/code when available, including handled HTTP 200 readback failure.
Also assert no-response failures have a specific reason and no invented upstream
status. Prove a failed log sink does not change a billing result or trigger another
provider mutation.
Local and GitHub tests use synthetic data; hosted inspection is not author work.

## Commit the contract and real catalog bindings

`.salable/requirements.json` is always present. The untouched starter contains:

```json
{ "schemaVersion": 1, "mode": "UNCONFIGURED" }
```

Non-billing prerequisites may keep this state without catalog or acceptance files;
they must not claim billing delivery. After those prerequisites, one owning
commercial-core ticket delivers the complete accepted model's real catalog,
application bindings and tests, then switches to `REQUIRED` in the same change.
Do not split catalog provisioning into an earlier ticket, invent future bindings,
or shrink the approved agreement. Existing `REQUIRED` apps stay `REQUIRED` during
follow-ups. Only an explicitly approved opt-out lets the foundation record `NONE`.

Copy the exact approved agreement when setting the mode:

- `NONE`: include the approved `agreement` with `decision: "NONE"` and its
  `reason`. This requires explicit product opt-out; never use it to bypass a
  required billing feature.
- `REQUIRED`: include the approved `agreement` with `decision: "TEST"` and
  `testEntrypoints`, an array of real repository-relative test file paths.
  Preserve the complete current agreement shape supplied by planning.

Create the approved Test Mode catalog with the supplied project credentials.
Read resources back by ID and write real non-secret IDs to
`.salable/manifest.json`. Reuse only IDs established for this exact project on
resumed work; do not sweep the account or mutate Live Mode. This catalog work is
implementation, not hosted QA.

### Keep each application's catalog distinct

The account's Salable connection is shared. Access to its catalog does not authorize
this app to adopt another project's resources. A new independent product creates
its own product, plans, entitlements, tier groups, line items and prices. Never
select resources by generic names such as Basic/Pro, matching prices, cadence,
capabilities or tier tags. Existing-catalog adoption requires explicit product
approval; it is not a shortcut during implementation.

Preserve non-secret provenance for this project's catalog and read the exact
product, plans, line items and prices back by ID. Verify their relationships and
the intended customer-facing product identity before binding checkout. Names and
self-declared project IDs are evidence to inspect, not trusted ownership proof.
Salable payer `owner` and entitlement `grantee` identify customers/access recipients,
not the application that owns a catalog.

Resolve purchases and lifecycle operations from server-owned project bindings.
Reject foreign product, plan and price IDs; browser input, subscription labels and
matching commercial terms cannot expand the allowed catalog. Test the real
application with two products having identical plan names and prices: assert that
foreign IDs are rejected and the outgoing cart uses only this project's bindings.
Also cover same-project resumed setup and the visible error for a binding mismatch.

If checkout shows another application's name, establish whether it comes from the
selected Salable resources, the payment product/line-item mapping, or merchant
branding before asserting a cause. Correct this project's bindings or create its
missing resources. Never rename, delete or modify another application's resources,
transfer existing subscriptions, or reset customer data as a repair shortcut.
An existing-subscription migration is a separate explicitly approved operation.

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
- The entitlement-check 404 and a valid empty success response through the real
  adapter and application route/UI: content stays locked, subscription state
  still loads, and no unavailable state or application error is produced. Cover
  a subscription that exists despite empty entitlements. Contrast an unrelated
  endpoint's 404 and genuine provider failures to prove they remain failures.
- Purchase, exclusive plan switches and permitted compatible subscriptions;
  retain the correct subscription identity and prevent duplicate mutations.
- For hosted purchase, drive the real purchase control, API client, server
  route/service and provider adapter in a local browser test. Substitute only
  external provider boundaries, including the checkout destination, and assert
  actual current-tab navigation while payment is still outstanding. Cover a
  rejected creation and missing/invalid URL with safe visible recovery, explicit
  resume without another checkout, and passive/read-only/return flows without
  outbound checkout redirects or duplicate mutations. When the accepted return
  experience confirms access then opens the workspace, exercise pending and
  unavailable readback followed by confirmation and one internal navigation;
  keep cancelled returns separate and prove refresh cannot create a loop.
  A URL response, visible link or mocked navigation helper alone
  cannot prove the handoff works.
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
