# Roadmap

The live roadmap is published at
[bisibility.com/roadmap](https://bisibility.com/roadmap). A featured board shows
the maturity of the work in focus, and an index below it keeps every other
capability and direction discoverable.

This file explains how that roadmap is steered and how to influence it.

## Maturity Stages

Stages describe how settled a feature is, not a release date, and never replace
the availability note published with each entry. A feature can be in `Alpha` and
usable today, and a feature in `Beta` can still require configuration.

- `Concept`: Direction and scope are being shaped.
- `Alpha`: Early versions with a limited scope.
- `Beta`: Available to try, with ongoing improvements.

## Capability Index Legend

The index below the board reports current activity rather than maturity:

- `Available`: Released and ready to use, within the early-release caveats.
- `In progress`: Actively being implemented and not yet released.
- `Planned`: Committed to the roadmap, but implementation has not started.
- `Exploring`: Under evaluation and not yet committed.

## Scope

This repository is the front door for the whole bisibility surface: the app,
the public REST API, the MCP server and agent skills, the client libraries,
and the CLI. File feature requests and ideas here even when they concern a
client repository such as [bisibility-sdk-ts][sdk-ts] or
[bisibility-cli][cli]. Bug reports belong in the repository whose code
misbehaves; when in doubt, file here and triage will route it.

## How Priorities Are Set

bisibility is developed with substantial AI-agent assistance.

The queue is roughly:

1. Correctness and security issues in shipped behavior.
2. Accepted feature requests with clear acceptance criteria.
3. Everything else, guided by discussions and operator feedback.

What gets built next is driven by how many different people hit the same
problem, not by how much detail a single request carries. A reaction on an
existing issue counts. A use case in a comment counts for more. A bare "+1"
does not.

## How to Influence the Roadmap

- **Write a [feature request][request-form].** An implementation-ready
  request is the strongest signal you can send; accepted requests are labeled
  `feature:accepted` and may receive changelog credit when they materially
  shape what ships. See [CONTRIBUTING.md](CONTRIBUTING.md#feature-requests)
  for what makes a request implementation-ready.
- **Start an [idea discussion][discussions]** when the proposal is not fully
  formed yet. Good discussions graduate into feature requests.
- **Report bugs** with a minimal reproduction; correctness work always jumps
  the queue.
- **React to existing requests.** Thumbs-up reactions are counted during triage.

[request-form]: https://github.com/CorgiCorner/bisibility/issues/new?template=feature_request.yml
[discussions]: https://github.com/CorgiCorner/bisibility/discussions
[sdk-ts]: https://github.com/CorgiCorner/bisibility-sdk-ts
[cli]: https://github.com/CorgiCorner/bisibility-cli

## Recently Shipped

See [CHANGELOG.md](CHANGELOG.md) and the notes attached to each release.
