# Angular + NestJS application

One application and one Vercel project: Angular presents the UI; NestJS owns
validation, authentication, business rules and PostgreSQL persistence.

The foundation includes sign-up, sign-in, sign-out, current-session enforcement,
a private notes example, predictable API errors and desktop/mobile browser tests.
Neon supplies deployment-specific database and Auth configuration through Vercel.
When Neon Auth is disabled during onboarding, Better Auth uses the provisioned
PostgreSQL database. Both modes use the same application origin and UI.

App Builder replaces this README with the accepted product outline before initial
tickets start. Product tickets replace the example homepage and workspace.

## Local development

Use Node 24 and the committed lockfile. Run `npm ci --no-audit`, then `npm run check`
for the complete local suite. Tests start disposable PostgreSQL through Docker,
or use the host-provided fixture in [agent integrations](docs/agent-integrations.md).
Outside the automation worker, install Chromium once with
`npx playwright install chromium`.

For interactive development, set a local `DATABASE_URL` and a `BETTER_AUTH_SECRET`
of at least 32 characters in the ignored `.env` file. Run
`node --env-file=.env --import tsx scripts/migrate.ts`, then `npm run dev` and open
`http://localhost:3000`. Never use a provider database for tests.

See [development guide](docs/development-guide.md) for the code map and deployment
contract, and [AGENTS.md](AGENTS.md) for the automation service's conventions.
