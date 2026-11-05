# Efficient queries and search

Choose a realistic local data scale from the feature and existing context, record
the assumption and implement a reasonable baseline. Do not ask every owner for
row-count forecasts or provision a separate search service without a need.

Start from user query semantics: exact lookup, prefix, free text, filters, sort,
facets or semantic similarity. Use existing database capabilities when suitable;
vector search is not the default for ordinary search. External engines need a
clear requirement, compatible hosting, synchronization/failure design and an
authorized cost.

Derive authorization and tenant scope on the server and apply them before
returning results, counts, facets or snippets. Parameterize queries and bound
query length, page size and expensive operations. Select necessary columns,
avoid per-row round trips and batch related reads when useful. Do not fetch an
entire table to filter it in the browser.

Use deterministic ordering with a unique tie-breaker for pagination. Offset
pagination can be reasonable for small bounded lists; prefer a suitable cursor
when deep offsets or changing large datasets make it expensive or inconsistent.
Design indexes from actual filters, joins and sort order; measure rather than
index every field. Search indexes must match the language and query semantics.

Inspect plans with representative disposable local data. `EXPLAIN ANALYZE`
executes the statement: never use it as a harmless production inspection of a
write. A sequential scan on a small table is not automatically a defect. Test
correctness and query counts/shape as well as representative timings.

In the UI, debounce live typing where appropriate, cancel or ignore obsolete
requests, and distinguish empty results, loading and failure. A stale result must
not overwrite the latest query. Make keyboard navigation, labels, filter state
and pagination usable. Cache only within the correct visibility/freshness scope.

Local application tests should cover permission filtering, stable ordering,
pagination boundaries, empty/invalid queries, relevant accents/case behaviour,
bounded work, stale responses and one visible failure/recovery. Do not replace
the database query under test with an in-memory reimplementation.

Primary references: PostgreSQL [query plans](https://www.postgresql.org/docs/current/using-explain.html),
[LIMIT/OFFSET](https://www.postgresql.org/docs/current/queries-limit.html), and
[text-search indexes](https://www.postgresql.org/docs/current/textsearch-indexes.html).
Use the documentation for the actual database version and selected search method.
