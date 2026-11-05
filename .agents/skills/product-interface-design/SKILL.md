---
name: product-interface-design
description: Implement or review product-specific website and application presentation from an accepted direction, including public marketing/pricing, authenticated journeys, responsive composition and interaction states. Use for visible UI work, not unrelated backend repairs or unsolicited redesigns.
---

# Product interface design

Implement the accepted product and active ticket. Preserve the selected framework,
commercial decisions, tested authentication and working behavior. Replace relevant
starter branding, copy and presentation with a coherent product experience; do not
expand a narrow repair into a whole-site redesign.

Use the accepted audience, page journey, visual direction and real content to make
composition decisions. When a minor choice is unspecified, apply professional
judgment consistent with that direction. A material product ambiguity belongs in
the existing planning flow; it does not justify inventing features or adding an
approval stage.

Read [pages, content and interaction states](references/pages-and-states.md) when
implementing an entry experience, pricing or account journey. Read
[visual acceptance](references/visual-acceptance.md) for composition decisions and
the local evidence relevant to the changed presentation. Load only what the task
requires.

For monetised public products, public pricing and signup before purchase are
defaults unless the accepted product specifies otherwise. Do not add billing to
a free product. Display approved prices and units; presentation must never
derive entitlement authority or billing rules from labels. Where billing is in
scope, the admitted Salable guidance and current commercial agreement own provider
semantics and subscription behavior.

Accessibility, responsive layout, sensible performance, appropriate SEO and safe
data handling are automatic baselines. Do not ask the user whether to include
them. Avoid adding libraries for decoration or replacing the selected stack;
dependency changes must be genuinely necessary for the assigned behavior.

Authors implement local acceptance checks through real application components and
routes, with external boundaries replaced as required by the repository, then run
its complete authoritative local suite. Reviewers inspect source and the supplied
canonical CI evidence without running tests. Hosted QA and deployments remain with
trusted automation or human QA; this skill does not change those boundaries.

Report observed behavior and remaining limitations accurately. A screenshot,
visual preference or automated accessibility score alone does not establish a
working, accessible product. Findings outside the active scope remain separately
prioritized follow-ups.
