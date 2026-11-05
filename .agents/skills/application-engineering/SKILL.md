---
name: application-engineering
description: Choose or evaluate rendering, caching, data-access and search approaches for an application's architecture or a changed feature. Use when these decisions are needed or a concrete performance/query problem is in scope; routine edits do not require an architecture review.
---

# Application engineering

Start from the accepted feature, current repository contracts and existing stack.
Identify the content or result the user needs, its freshness and visibility
boundaries, and the dependencies that delay it. Choose the simplest compatible
approach that addresses those constraints; do not turn a local decision into a
framework replacement or whole-project cleanup.

Read the applicable branch:

- Page rendering, content delivery or load-time work:
  [fast content](references/fast-content.md).
- Queries, lists, filtering or search:
  [data access](references/data-access.md).
- Initial architecture or feature acceptance that needs engineering baselines:
  [delivery baseline](references/delivery-baseline.md).

Apply proportionate performance, data-access, accessibility, privacy and applicable
SEO baselines without asking the owner to opt into routine engineering quality.
Record the chosen approach, material tradeoff and relevant local acceptance in
the existing plan or implementation evidence. Distinguish proposed checks from
observed results; follow the repository's coding, error and logging conventions.

Planning records decisions and acceptance; authors implement and run the required
local suite. Reviewers inspect source and supplied completed CI evidence only.
Hosted measurements and release work remain with trusted automation or human QA;
this skill does not change role permissions or create another approval gate.
