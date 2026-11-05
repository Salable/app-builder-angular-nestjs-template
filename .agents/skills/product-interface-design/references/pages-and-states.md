# Pages, content and interaction states

## Public entry and pricing

Design the entry page around the visitor's task and accepted product value, not
the starter's technology. Provide a clear primary action and navigation suited to
the actual pages. Replace starter presentation in assigned landing, auth and
workspace scope while preserving tested auth behavior. Do not ship setup panels,
framework demos or fabricated product claims as the finished experience.

For monetised public products, make pricing discoverable from marketing navigation
and readable while signed out. Keep free products free. Signup before purchase is
the normal default; pricing
visibility does not depend on authentication. Honor an explicitly accepted private,
sales-led or anonymous purchase journey. Do not implement anonymous claiming or a
new sales workflow simply because the table is public.

Present the accepted billing unit, currency, interval, included capability and
material allowance or limit together. Distinguish per-seat and usage amounts from
the total price. Do not label an annual commitment as a monthly charge without
clear context. Calculators and comparisons should reflect approved rules and real
inputs; do not invent discounts, savings, a “most popular” claim or extra tiers.
On signed-in views, reflect server-provided current plan and permitted actions.

Choose a comparison, explanation or enquiry layout that fits the model. A simple
flat fee may need one clear offer; a hybrid model may need an understandable base
and usage explanation. A three-column pricing table is not a universal requirement.

## Product and account presentation

Make account navigation match actual session state. Preserve the user's intended
destination where the application supports it; distinguish navigation to pricing
from an authenticated purchase action. Use the existing session/API boundaries
rather than reconstructing authority in UI state.

Design the states that the assigned feature can actually produce: empty, loading,
successful, unavailable, denied, pending and failed, as applicable. A lack of access
and an inability to verify access are different states. Present actionable,
human-readable feedback and a clearly separated control. Avoid leaking provider
payloads, credentials or internal diagnostics into the interface.

Loading and pending views should explain what the user is waiting for. If the
approved workflow automatically continues after confirmation, implement that
transition; do not leave a permanent waiting screen or make a fallback link the
primary flow. Retry controls must invoke the existing permitted operation, not
invent a new browser-side business sequence. Billing semantics belong to the
accepted contract and applicable Salable guidance, not this presentation reference.

## Truthful content and assets

Prefer real product views, supplied work samples and authorized assets. Clearly
label illustrative data when used. Never invent testimonials, customer logos,
case-study outcomes or performance claims to complete a familiar landing layout.
When proof is unavailable, demonstrate an actual workflow or explain the product.

Do not expose private data in screenshots or request unnecessary data for a visual
effect. Preserve useful alt text and semantics; decorative images should not create
noise for assistive technology. User-provided references guide style decisions,
not permission to copy another site's identity or assets.

## Local journey checks

For the changed scope, exercise signed-out page/pricing access, the primary action,
relevant session states, successful navigation and a representative visible error.
Use production routes/components and meaningful local fixtures at external
boundaries. Billing UI tests should observe what a user sees and what operation
was requested, without replacing the behavior under test with a disconnected model.
An existing app with no pricing change does not need a new billing audit.

## Evidence and requirement ownership

The user's default is public pricing with signup before purchase.
[NN/g's B2B pricing study](https://www.nngroup.com/articles/show-price/)
provides qualitative support for making costs discoverable; it does not determine
this product's prices, promises or checkout implementation.
