# Roadmap

The live roadmap is published at
[bisibility.com/roadmap](https://bisibility.com/roadmap). It tracks every
notable capability with an honest status: `Available`, `Preview`, `Open beta`,
`In progress`, `Planned`, or `Exploring`.

This file explains how that roadmap is steered and how to influence it.

## Status Legend

- `Available`: Released and ready to use, within the early-release caveats.
- `Preview`: Released for early use and feedback; behavior or contracts may change.
- `Open beta`: Broadly accessible for beta use, but not generally available.
- `In progress`: Actively being implemented and not yet released.
- `Planned`: Committed to the roadmap, but implementation has not started.
- `Exploring`: Under evaluation and not yet committed.

## Scope

This repository is the front door for the whole bisibility surface: the app,
the public REST API, the MCP server and agent skills, the client libraries,
and the CLI. File feature specs and ideas here even when they concern a
client repository such as [bisibility-sdk-ts][sdk-ts] or
[bisibility-cli][cli]. Bug reports belong in the repository whose code
misbehaves; when in doubt, file here and triage will route it.

## How Priorities Are Set

bisibility is developed with substantial AI-agent assistance.

The queue is roughly:

1. Correctness and security issues in shipped behavior.
2. Accepted feature specs with clear acceptance criteria.
3. Everything else, guided by discussions and operator feedback.

What gets built next is driven by how many different people hit the same
problem, not by how much detail a single request carries. A reaction on an
existing issue counts. A use case in a comment counts for more. A bare "+1"
does not.

## How to Influence the Roadmap

- **Write a [feature spec][spec-form].** An implementation-ready spec is the
  strongest signal you can send; accepted specs are labeled `spec:accepted`
  and credited in the release notes when they ship. See
  [CONTRIBUTING.md](CONTRIBUTING.md#spec-first-contributions) for what makes a
  spec implementation-ready.
- **Start an [idea discussion][discussions]** when the proposal is not fully
  formed yet. Good discussions graduate into specs.
- **Report bugs** with a minimal reproduction; correctness work always jumps
  the queue.
- **React to existing specs.** Thumbs-up reactions are counted during triage.

[spec-form]: https://github.com/CorgiCorner/bisibility/issues/new?template=feature_spec.yml
[discussions]: https://github.com/CorgiCorner/bisibility/discussions
[sdk-ts]: https://github.com/CorgiCorner/bisibility-sdk-ts
[cli]: https://github.com/CorgiCorner/bisibility-cli

## Recently Shipped

See [CHANGELOG.md](CHANGELOG.md) and the notes attached to each release.
