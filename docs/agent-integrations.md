# Task-specific integrations

## Runtime environments

The mounted operation document's `body.environment` records available names,
ownership, exposure and applied revisions. Missing variables are requirements;
never invent credentials or infer configuration from another environment.

| Owner                            | Variables                                                                                                                 | Use                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Native Vercel–Neon               | `DATABASE_URL`, `DATABASE_URL_UNPOOLED`                                                                                   | Deployment-specific PostgreSQL                               |
| Native Vercel–Neon, Auth enabled | `NEON_AUTH_BASE_URL`, `VITE_NEON_AUTH_URL`                                                                                | Matching managed Auth URLs, checked server-side              |
| App Builder                      | `BETTER_AUTH_SECRET`, `NEON_AUTH_COOKIE_SECRET`                                                                           | Server-only auth secrets                                     |
| Vercel                           | `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`                                                     | Trusted origin resolution; expose system variables           |
| App Builder                      | `APP_BUILDER_DELIVERY_STAGE`                                                                                              | Migration sequencing                                         |
| App Builder                      | `APP_ENVIRONMENT_ID`, `APP_BUILDER_PROJECT_ID`, `APP_BUILDER_CONTROL_PLANE_URL`, `APP_BUILDER_FEATURE_FLAG_RUNTIME_TOKEN` | Server-side delivery integration when required by the ticket |
| Project owner via App Builder    | `SALABLE_SECRET_KEY`, `SALABLE_PUBLISHABLE_KEY`                                                                           | Matching environment-scoped billing credentials              |

Preview uses Salable Test Mode. Production uses its separately configured pair;
the POC can also use Test Mode there. Authors receive only the allowed Preview
Test Mode pair. CI receives no application secrets. Expose a publishable key only
when a feature requires it; never expose a secret key or runtime token to Angular.

Keep both auth modes: matching Neon URLs select managed Auth, neither selects
Better Auth, and a partial/inconsistent pair fails configuration. Neon owns Auth
branches and trusted origins. Missing domains are an onboarding/operator issue;
do not add a hard-coded Preview allowlist, another Auth server or copied Production
values. Use `resolveApplicationOrigin`/`resolveApplicationUrl` for server URLs.
Preview uses `VERCEL_URL`, Production `VERCEL_PROJECT_PRODUCTION_URL`. Never use
request Host headers or invent `APP_BASE_URL`. Angular calls its own `/api` origin.

## Database setup and tests

`APP_BUILDER_TEST_DATABASE_URL` with `APP_BUILDER_TEST_DISPOSABLE_DATABASE=1`
identifies the worker's disposable local PostgreSQL fixture. The runner validates
loopback access; otherwise it starts/removes a Docker container. Never supply a
provider database. SQL migrations use paired `NNNN_name.up.sql` and `.down.sql`
files. Do not edit applied migrations. Run `npm run test:integration` and
`npm run test:browser` for database and browser checks.

## Salable billing

When billing is in the ticket, discover `salable-design` and use supplied Test
Mode credentials to create products/plans/line items through the API. Read them
back by ID and save real non-secret IDs to `.salable/manifest.json`; reuse confirmed
IDs on resumed work. This is implementation, not hosted QA. Never delegate it to
an operator or mutate Live Mode. Tests use fixtures. Enforce paywalls on the server;
a provider outage is not evidence of an inactive subscription.

## Product entry

Replace the example homepage with the accepted product design. Public products
need a value proposition, primary action, account navigation and applicable pricing.
Private products may begin at sign-in or the app. Report other concrete findings
as supplementary Backlog requests, keeping the active ticket focused.
