# Recorded keyword history

`PositionHistoryCard.history` selects the full report consumer. Its required read
ports are server adapters over authorized rank reports. They capture the project
and validated selected target IDs, renew actor and project authorization on every
read, and return the report's actual snapshot, source, selection and window binding.
No actor or owner ID enters the client request. The compatibility renderer remains
available for old callers; it is not evidence of a full report window.

Initial observations and attempts share `asOf`, source, selection, definition and
date bounds. Observations use the chosen observation or recorded basis. Attempts
always use their recorded creation time, retaining failed and deferred checks that
have no observation timestamp. Unknown observation time is never replaced with the
scheduled `checkedAt`. Records with unknown time excluded by an observation window
are stated separately, without assigning them to that window.

Reads occur only after a user asks to change the date window, load a page or open a
saved check. Mount and stream switching have no read side effects. These ports are
read-only and cannot run a provider or extend a paid snapshot. Controlled responses
distinguish forbidden, configured capacity, changed snapshot and unavailable data.
A forbidden outcome removes previously rendered history and snapshots.

Each page preserves the report binding. Duplicate rows, repeated cursors, changed
source, changed totals, falsely terminal partial pages and changed resolutions are
refused. Capacity errors do not truncate or substitute a partial scope. The UI has
no 90-row or 240-attempt cap: it reports loaded versus total counts and lets the user
read every permitted page. The server supplies the actual read budget.

The chart uses numeric timestamps, not equal row spacing or one point per calendar
day. Its points and the accessible observation table use the same DTO. Unknown,
absent and unsupported observations have no artificial rank. Different targets and
captured comparison definitions form separate segments; gaps are not interpolated.
While a page remains unread, only points are drawn, since an unseen observation
could establish an intervening boundary. Full lines require the complete window.

Movement is shown only for an observation that the shared resolver identified as
the current endpoint of an actual comparable pair. Other observations do not acquire
a movement from the neighboring row. The baseline check and events are retained
without synthetic absence positions or local rank subtraction.

Opening a point or table row sends its saved check ID and frozen snapshot time.
The returned snapshot must match the clicked normalized observation, project and
time. Every normalized item must belong to that same check and target. Raw expiration
or a missing raw record preserves normalized rank, URLs and history. Absolute and
group ranks remain different columns; result kinds are not remapped to organic rank.

Feature presence is separate from ownership. A positive feature requires referenced
same-check normalized items of that result kind. Known ownership additionally requires
the observation's retained identity revision. Missing proof stays unknown; organic
completeness does not prove absence or ownership of other feature families. There is
no absence inference from a partial or empty retained result set.

`RankingUrlHistory.history` reads individual observation DTOs, retaining the expected
URL captured by each check. It never falls back to today's editable target. The new
`RetrievedResultsCard.history` branch accepts the same normalized snapshot contract.
The old results branch now takes its ranking URL from the selected saved snapshot,
instead of a current-page URL passed for a different historical check.

The root page must supply these ports and preserve their binding. Shared help uses
the existing versioned registry. Locale proposals must be merged before rendering.
Authored source tests cover pagination, time geometry, boundaries, preserved expired
rank, read denial, same-check snapshot/ownership and real four-locale catalogs. They
have not been run; mocks are UI contract fixtures, not server authorization evidence.
