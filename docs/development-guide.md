# Development guide

| Location                            | Responsibility                                              |
| ----------------------------------- | ----------------------------------------------------------- |
| `src/browser`                       | Angular pages, transient form state and shared API client   |
| `src/contracts/api.ts`              | Browser-safe Zod request, response and error schemas        |
| `src/server`                        | NestJS controllers, authentication and application services |
| `src/identity`                      | Managed Neon Auth and self-hosted Better Auth adapters      |
| `src/runtime/application-origin.ts` | Trusted Vercel/local origin resolution                      |
| `src/persistence` and `migrations`  | PostgreSQL access and transactional migrations              |
| `tests`                             | Real HTTP/database flows and browser acceptance             |

Controllers collect HTTP input; services validate, process and persist. Ownership
comes from the current server session; client-submitted identity is never authority.
Reuse `AuthPageComponent`, `SessionService`, `AuthenticationService` and the local
fixtures when customising auth. Both modes read the current session on protected
requests, so sign-out and revocation take effect immediately. Managed Neon user
IDs are external identities; application ownership must not require those users
to exist in the local Better Auth `user` table.

Throw `ApiProblem` for expected domain failures. The global `ProblemDetailFilter`
serializes errors with `about:blank`, stable codes, safe details and correlation
IDs. `ApiClient` is the browser interpretation boundary. Never forward provider
error bodies or fabricate a problem-documentation domain.

`/api/v1/openapi.json` serves the NestJS OpenAPI document. Request validation and
document schemas share `src/contracts/api.ts`; controller decorators provide
routes, operations and responses. Run `npm run generate:openapi` after a contract
change. `generate:check` rejects a stale `openapi/openapi.json`. The browser's
`ApiClient` validates responses using those same shared schemas.

| Request                         | Outcome                               |
| ------------------------------- | ------------------------------------- |
| `GET /api/v1/notes`             | List the current user's notes         |
| `GET /api/v1/notes/{noteId}`    | Read one owned note                   |
| `POST /api/v1/notes`            | Create from `{ content }`; return 201 |
| `PATCH /api/v1/notes/{noteId}`  | Update `{ content }`                  |
| `DELETE /api/v1/notes/{noteId}` | Delete; return 204                    |

Responses name identity and time explicitly: `noteId`, `createdAt`, `updatedAt`.
Times are UTC ISO 8601 strings. The session returns `userId`, `displayName` and
`email`. Clients never supply ownership. Third-party `/api/auth/*` protocol
routes remain owned by the selected auth adapter, outside the resource OpenAPI.

`npm run check` is authoritative: format, lint, types, combined production build,
deployment output validation, unit tests, real PostgreSQL/HTTP integration, and
desktop/mobile browser tests. Integration uses the real NestJS app and both auth
paths; only managed Neon is replaced by a local HTTP protocol fixture. Browser
tests cover auth, storage, visible rejection and revocation.

`npm run test:coverage` reports unit coverage for the server utilities and Angular
client separately. Real HTTP/database and browser checks are additional evidence;
unit percentages alone do not describe those flows. ESLint rejects `else` after a
return and nested ternaries. Type-aware rules check floating/misused promises and
exhaustive switches against the server, application and test TypeScript projects.
Angular ESLint checks duplicate attributes and empty control-flow blocks in inline
and external templates. Nesting above two levels and cyclomatic complexity above
12 produce warnings; there is no separate hard complexity limit or CRAP score gate.

## Deployment

Vercel runs `npm run deploy:vercel`. `build:vercel` emits Angular static assets and
one NestJS Node 24 function under `.vercel/output`, using the
[Build Output API](https://vercel.com/docs/build-output-api). API routes go to
NestJS; application routes load Angular. There is one deployment and origin.

Preview migrates before building. Production builds and validates its output,
then migrates before Vercel serves the release. Failed steps fail deployment.
Migrations use a transaction and advisory lock; never run them on request startup.
Schema changes must remain compatible with the previous deployment until promotion.
CI has a disposable database and read-only GitHub token; hosted verification and
production promotion belong to trusted automation or human QA.
