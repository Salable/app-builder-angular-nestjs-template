# Composition and visual acceptance

## Build a coherent composition

Use the accepted direction to choose hierarchy, grid, reading rhythm, typography,
imagery and interaction. The primary visitor task should be apparent without
reading every card. Let actual content determine section length and arrangement;
avoid repeating a generic hero/features/testimonials/pricing sequence regardless
of the product.

Use typography roles consistently and keep line lengths and spacing appropriate
to the content. Dense working views and spacious marketing views can share a brand
without sharing every layout. Check long names, realistic labels, multi-line
messages and empty data instead of designing only around ideal short copy.

Use deliberate variation rather than random novelty. A neutral palette or familiar
control can be right for the brief; a different gradient is not enough to fulfill
a requested distinct visual direction. Do not create arbitrary “variety” scores,
required decorative elements or comparison gates against other private projects.

## Apply automatic accessibility and responsive baselines

Use semantic headings, landmarks, controls and labels. Make focus visible, preserve
keyboard operation, and communicate state beyond color. Check contrast, text
resizing/spacing, content reflow, usable pointer targets, error associations and
status announcements for the changed interaction. Respect reduced-motion needs
where animation is introduced. Avoid placing essential information in hover-only
or motion-only presentations.

Inspect the actual UI at relevant narrow and wide viewports. Confirm that actions,
prices, error messages and navigation remain readable and operable; don't accept
horizontal clipping because the default screenshot looks tidy. Local browser
checks and focused accessibility tooling are useful evidence, but a tool's pass
does not establish complete conformance.

## Make meaningful content appear promptly

Apply the repository's performance baseline without asking the user to select
routine optimizations. Where the accepted target is main content visible under
200 ms, identify the actual main content in the test: an early header, skeleton,
spinner or empty shell is not equivalent. TTFB and generic Core Web Vitals passes
do not prove this target.

Do not hide essential text behind entrance animations or unnecessarily wait for
authentication, billing reads or decorative assets to render public information.
Reserve layout space for media, make useful text available promptly and keep
optional enhancements independent of the critical content. Protected content still
requires server authorization; speed never permits an access-control bypass.
Use the agreed measurement environment and report measured outcomes, not an
unqualified promise across all devices and networks.

## Distinguish evidence from preference

Authors check the changed local user journey, responsive presentation, keyboard
flow and representative errors, then finish with the repository's complete local
suite. Reviewers assess source and supplied completed CI evidence. Neither role
gets permission for hosted tests from this reference.

When human usability research is available, test comprehension and task behavior
before asking about aesthetics. Preference feedback helps assess brand fit; it
does not prove navigation, checkout or access controls work. Agent review and
simulated personas are useful critique, not customer research. If evidence is
missing, report the limit rather than invent a verdict or start an unrelated audit.

## Sources

[W3C's WCAG 2.2 reference](https://www.w3.org/WAI/WCAG22/quickref/)
defines accessibility criteria, including contrast, reflow, keyboard/focus and
status communication. Apply the relevant criteria and use observed evidence.

[NN/g's visual-design testing guide](https://www.nngroup.com/articles/testing-visual-design/)
distinguishes aesthetic attitudes from behavioral usability and recommends asking
behavioral tasks first when combining methods. It does not establish that a more
unusual-looking design performs better.
