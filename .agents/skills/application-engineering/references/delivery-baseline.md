# Baselines owned by implementation

Apply these to the accepted feature or initial product scope. An owner does not
need to opt into competent engineering, and a repair ticket does not become a
whole-application audit.

| Concern                   | Expected implementation and evidence                                                                                                                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accessibility             | Semantic controls, keyboard access, visible focus, meaningful labels, contrast, reduced motion and readable responsive layouts; use WCAG 2.2 AA as the design baseline where applicable, with browser checks for relevant flows. Automated checks alone are not conformance proof. |
| Public discovery          | Public marketing/pricing where appropriate; useful titles, descriptions, canonical URLs and indexable content. Keep private pages private; SEO is not a reason to expose them. No fabricated structured data or claims.                                                            |
| Privacy and authorization | Collect only needed data, validate server authority, isolate users/tenants, protect credentials and avoid personal data in logs. Do not add tracking or promise legal compliance without an actual requirement and basis.                                                          |
| Correctness               | Exercise success, early return, validation rejection, thrown error and failed commands through their observable result. Use real internal collaborators and local storage wherever feasible.                                                                                       |
| User recovery             | Loading, empty, denied, unavailable, pending and retry states reflect backend outcomes. Recovery must not blindly repeat a completed purchase or other consequential effect.                                                                                                       |
| Observability             | Use the shared logger and error contract. Record safe operation/correlation and upstream HTTP status/code when available; redact capabilities, credentials and personal payloads. Diagnostics do not alter successful responses.                                                   |
| Delivery efficiency       | Choose appropriate rendering and bounded data access; measure meaningful content and expensive queries in stated local conditions. Report limitations instead of invented speed claims.                                                                                            |

Keep each applicable baseline in the owning feature's acceptance and tests, not
as a new universal ticket list or recurring audit. Use the repository's complete
canonical suite and GitHub workflow; test code must run without hosted database,
payment, model or deployment credentials. Required approved Salable Test Mode
catalog creation/readback remains a separate implementation responsibility, not
proof that fixture billing tests exercised the provider.

For accessibility criteria consult the normative
[WCAG 2.2 recommendation](https://www.w3.org/TR/WCAG22/). These engineering defaults
do not decide the product's pricing, legal terms or business policy.
