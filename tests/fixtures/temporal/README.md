# Legacy digest replay fixture

`legacy-alert-delivery-workflows.ts` is the workflow source from commit
`25351a5bd33132bd0de51fa699867c703ce98835`, with import paths adjusted for this
fixture directory. `digest-legacy-history.json` was recorded from that workflow
with the TypeScript SDK's local test environment and mocked external activities.
Only worker identity strings were normalized to `fixture-worker`. Activity types,
inputs, results, command order and event references are the recorded values.

The replay regression runs the current workflow against this history. The
PostgreSQL overlap regression also runs the legacy workflow and its frozen
webhook activity beside the fenced worker. Keep these fixtures out of production
activity registration.
