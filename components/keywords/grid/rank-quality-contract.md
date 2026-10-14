# Rank quality in the keyword table

The table accepts an optional aggregate-only `ReportSummaryPresentation` through `KeywordsGridProps`.
`KeywordReportSummary` consumes that report directly. Its scope counts, coverage,
metric, comparison and snapshot date do not depend on the visible page or expanded groups.
Without a report, it shows the matching target count and an unavailable measurement.
It does not calculate a full-scope result from page rows.

Leaf rows carry `rankQuality`. Current position requires a positive qualified
current point. Unknown current scope leaves that position unknown while a separately
qualified historical success remains visible as last known. Reported raw positions
and the numeric compatibility sentinel do not become a current rank. Confirmed
absence is text, never a synthetic position.

Numeric movement comes only from the server's comparable positive pair and movement
field. Entered, exited and re-entered are events. New requires the kernel's first
observation event; a missing baseline alone is insufficient. A comparison that was
not requested stays distinct from an unavailable baseline.

Group parents use `rankGroupReport`, with counts for their complete child cohort.
Best measured position is the accepted group aggregate, alongside ranked and unknown
counts. A multi-target group has no numeric rank movement or fabricated merged
sparkline. The parent's copied first-child quality, execution status and expected URL
are ignored. The latest group recorded attempt is selected across its children.
Metric delta is labeled as a metric change, never a position movement.

Observation time and attempt creation time are separate `<time>` values. Their
formats follow the locale provider. Freshness comes from the supplied policy result;
this table sets no age threshold. Legacy check dates are labeled stored dates because
their observation-time provenance is unavailable.

Rows without sidecars retain their positive stored rank and URL, explicitly outside
the current KPI. They have no numeric movement, first-observation assertion or
qualified chart. Legacy group minima made from unranked sentinel rows are suppressed.
Retained history remains a separate authorized read; this table does not qualify
the legacy chart from its numeric array.

Help uses the shared, versioned measurement registry. Unsupported definition versions
retain the registry's neutral behavior. The leaf renderers do not fetch, refresh or
run a provider. Existing table sizing, density, borders, padding, filters, actions,
personal layout controls and automatic grouping remain in their existing owners.

The server page must pass `presentReportSummary(list.report)` and preserve row sidecars when selecting flat
or grouped results. Its trusted policy port and immutable current revision adapter
remain required. Locale additions must be merged before rendering this consumer.
Authored contract tests and stories require the final integrated validation pass;
source review is not a test, accessibility or browser acceptance result.

The RSC boundary omits per-target contribution/exclusion and membership ID arrays.
Whole-scope aggregates and explicit composition counts remain unchanged; detailed
server reports and authorized exports retain the original full report.
