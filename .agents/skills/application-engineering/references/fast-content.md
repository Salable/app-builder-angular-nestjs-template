# Fast, meaningful page content

Treat fast content delivery as design and implementation work, not a final score
badge. App Builder's preferred goal is main page content visible within 200 ms
where feasible. This is not TTFB, an empty shell or a spinner. Do not promise that
latency for every cold visit, device and network, or silently redefine the target
as a warm-cache result.

## Choose an appropriate rendering path

Identify the important content for each changed route and its dependencies.
Public landing pages, useful pricing and editorial content should not wait for
authentication, account data or an avoidable browser fetch waterfall. Prefer
static generation or server-rendered content when the selected framework and
freshness requirements suit it. Keep private data on an authorized path and
show truthful pending/error states when it cannot be ready immediately.

Inspect the repository before prescribing SSR: it can already exist, and adding
it may require changes to routing, deployment output, browser-only code and
hydration. Preserve the accepted framework. Include those concrete changes and
tests in the owning ticket; do not claim server-rendered content because the
server can serve an empty HTML shell. For mixed pages, static public content and
private interactive sections can have different delivery paths.

Keep critical assets small: route-split nonessential code, defer optional
widgets/analytics, avoid blocking font downloads, reserve media dimensions, use
appropriately sized images, and prioritize the content that actually matters.
Do not lazy-load the primary image merely to reduce initial requests. Avoid
making visible content wait for animation or hydration when it can render first.

Use cache policy appropriate to ownership and freshness. Cache public content
and hashed assets where useful; do not place authenticated responses in a shared
public cache. User/tenant-scoped keys and invalidation must prevent cross-account
reads. Cached billing labels or stale entitlements never establish authority.

## Measure the claim being made

Choose and record representative desktop/mobile, network, region, data and
cold/warm-cache conditions without burdening the owner with a technical survey.
Report both cold and warm outcomes, sample counts and the statistic used. Measure
the relevant content's actual visibility/paint through browser timing and visual
trace evidence; a DOM insertion time alone does not prove the user saw it.

Use LCP and other browser metrics as supporting evidence. Identify whether the
LCP element represents the requested main content. Keep load visibility separate
from interaction responsiveness. If 200 ms is missed, report the result and
dominant cost honestly, with a proportionate next step; do not relabel a TTFB or
generic Core Web Vitals pass as satisfying it.

Local CI can enforce deterministic render/content assertions, route bundle
budgets and controlled performance regressions. Avoid flaky hard timing gates on
arbitrarily loaded runners. Author tests use local services/fixtures; deployed
regional/cold-start measurements remain separately labelled trusted QA evidence.

Sources: [rendering tradeoffs](https://web.dev/articles/rendering-on-the-web),
[LCP components and measurement](https://web.dev/articles/optimize-lcp/),
[Angular hybrid rendering](https://angular.dev/guide/ssr),
[TanStack prerendering](https://tanstack.com/start/latest/docs/framework/react/guide/static-prerendering).
These sources inform implementation; the 200 ms goal is a product preference,
not a performance guarantee made by those frameworks.
