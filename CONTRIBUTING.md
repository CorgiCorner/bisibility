# Contributing

Thanks for helping improve bisibility. Public issues are welcome, and code is
not the only contribution that counts - often it is not even the fastest one.
This repository does not accept pull requests; see
[Pull Requests](#pull-requests) for why and for what works instead.

## Ways to Contribute

bisibility is developed by a small core team that ships with heavy AI-agent
assistance, and the product itself is built agent-ready (MCP server, agent
skills, machine-readable docs). In this setup, a precise problem statement or
an implementation-ready spec regularly turns into shipped code faster than a
patch would.

In rough order of leverage:

1. **Feature specs.** Implementation-ready proposals through the
   [feature spec form][spec-form]. Accepted specs are labeled `spec:accepted`,
   are usually implemented by the core team, and are credited in the release
   notes. See [Spec-First Contributions](#spec-first-contributions).
2. **Bug reports.** A minimal reproduction through the
   [bug report form][bug-form] is the fastest path to a fix.
3. **Ideas and feedback.** Use [GitHub Discussions][discussions] when a
   proposal is not fully formed yet; good discussions graduate into specs.
4. **Docs, examples, and provider know-how.** Corrections, self-hosting notes,
   example configurations, and real-world provider behavior (quotas, SERP
   quirks, locale edge cases) that only operators run into.
5. **Not pull requests.** This repository does not accept them. See
   [Pull Requests](#pull-requests) for why, and for where the same work lands
   instead.

The [roadmap](ROADMAP.md) explains how all of this feeds into what gets built
next, including how reactions and engagement on existing issues are weighed
during triage.

Issues are triaged at least every two weeks. Quiet stretches between rounds
mean the queue has not been read yet, not that a report was dismissed.

### One Front Door

File feature specs and ideas in this repository for every part of bisibility:
the app, the public REST API, the MCP server and agent skills, the client
libraries, and the CLI. Bug reports belong in the repository whose code
misbehaves, for example [bisibility-sdk-ts][sdk-ts] or [bisibility-cli][cli];
when in doubt, file here and triage will route it.

[spec-form]: https://github.com/CorgiCorner/bisibility/issues/new?template=feature_spec.yml
[bug-form]: https://github.com/CorgiCorner/bisibility/issues/new?template=bug_report.yml
[discussions]: https://github.com/CorgiCorner/bisibility/discussions
[sdk-ts]: https://github.com/CorgiCorner/bisibility-sdk-ts
[cli]: https://github.com/CorgiCorner/bisibility-cli

## Spec-First Contributions

A spec describes observable behavior, not implementation; the core team takes
it from there. A spec is implementation-ready when it answers four questions:

- **Problem.** What are you trying to do that bisibility makes hard today, and
  who hits it?
- **Proposed behavior.** What should a user see and be able to do? Web UI,
  REST API, webhooks, imports, MCP - whichever surfaces apply.
- **Acceptance criteria.** A short checklist a reviewer, or a coding agent,
  can verify one item at a time.
- **Boundaries.** What is explicitly out of scope, plus known constraints and
  edge cases (providers, quotas, large keyword sets, self-host vs cloud).

Drafting a spec together with your own AI assistant is welcome and encouraged.
What matters is that the problem is real for you and that you sanity-check the
result. Specs move through a simple lifecycle: submitted, discussed in the
issue, then `spec:accepted` (or declined with a reason), implemented, and
finally released and credited.

## Credits

- Code contributions are credited by name in the release notes and in the
  changelog entry for the release that contains them.
- Git authorship is preserved in the project's own history when maintainers
  port an accepted patch. It may also surface publicly through release
  co-author metadata, but public attribution is not guaranteed.
- Shipped feature specs are credited in the changelog entry of the release
  that contains them, for example `keyword group exports (spec by @handle)`.
- Substantial docs, examples, and triage help are credited the same way.

Say so in the issue if you prefer not to be credited.

## Development Setup

Prerequisites:

- Node.js 22
- Docker with Docker Compose

For the fastest full-stack start, follow the [README quick start](README.md). It
creates a local `.env` with development secrets and runs:

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) after the stack is ready.

For local application development from your checkout:

```bash
npm ci
npx prisma generate
npm run dev
```

Keep your `.env`, PostgreSQL, Redis or Valkey, and any provider credentials
configured for the feature you are testing.

### Temporal Worker

The default Docker stack runs manual rank checks without the scheduler. To run
scheduled checks in Docker, use the scheduled Compose profile:

```bash
docker compose --profile scheduled up --build
```

That profile starts Temporal, the worker container, and the Temporal Web UI at
`http://localhost:8233`.

To run the worker from your checkout while using Docker only for Temporal, start
the Temporal fallback stack:

```bash
docker compose -f docker-compose.temporal.yml up
```

The fallback stack serves the Temporal Web UI at `http://localhost:8233`.

Then, in another shell:

```bash
npm run temporal:worker
```

## Tests

Useful focused checks:

- `npm run test:unit`, runs the Vitest unit project.
- `npm run test:storybook`, runs the Storybook test script.
- `npm run test:e2e`, runs the end-to-end test script.
- `npm run smoke:worker`, smoke-tests the worker entrypoint.

The aggregate test command is:

```bash
npm run test
```

It chains `npm run typecheck`, `npm run lint`, and `npm run test:unit`.

Run `npm run verify:build` before larger pull requests, dependency changes,
build configuration changes, or changes that affect Storybook or production
bundling. It checks the Node version, linting, typechecking, unit tests, the Next
build, and the Storybook build.

### Local SonarQube analysis

The repository includes a local SonarQube Community Build for release-readiness
checks. Start it with:

```bash
npm run sonar:up
```

Open [http://localhost:9000](http://localhost:9000), sign in with the initial
`admin` / `admin` credentials, change the password, and create a user token under
**My Account → Security**. Load the token into the current terminal without
placing it in shell history:

```bash
read -s SONAR_TOKEN
export SONAR_TOKEN
```

Generate LCOV coverage and run the scanner:

```bash
npm run sonar:check
```

The scan uses the built-in **Sonar way** profiles and quality gate: no new issues,
all new security hotspots reviewed, at least 80% coverage on new code, and no
more than 3% duplication on new code. Tests and Storybook stories are analyzed
as test code. Only generated files, dependencies, build output, immutable Prisma
migrations for duplication, and private process material are excluded.

Stop the server without deleting its named volumes:

```bash
npm run sonar:down
```

## Code Conventions

- Use the `@/` alias for cross-directory imports.
- Use `./` only for same-directory imports.
- `lib/temporal` keeps relative imports for the worker runtime.
- `lib/` must not import from `components/`.
- Keep Prisma client access behind `lib/queries`; `app/` must not import
  `@/lib/db/prisma` directly.
- App code reads through `lib/queries/*` and mutates through `lib/actions/*`
  or `lib/api/*`; domain modules live under `lib/`.
- Import `components/ui` through its barrel, for example
  `import { Button } from "@/components/ui";`.
- Import layering is enforced in `eslint.config.mjs` through
  `no-restricted-imports`, `import/no-cycle`, and `max-lines`.
- Keep source files at 300 effective lines or fewer.
- Use Biome formatting. The lint-staged hook formats staged `ts`, `tsx`, `js`,
  `jsx`, `mjs`, `cjs`, `json`, and `md` files on commit.

## Snapshot Releases

This repository receives released snapshots of the application. Each release
arrives as one commit per version, so this history is a release history rather
than a development history, and there is no branch here to merge into.

## Pull Requests

bisibility does not accept pull requests.

Because releases arrive as snapshots, a pull request opened here cannot be
reviewed or merged even when the change is good. One opened anyway is closed
automatically with a pointer to the right form.

This is a capacity decision, and it is easier to state plainly than to dress
up: a small team cannot run a public review process and ship at the same time,
so review time goes to specs and bug reports, which turn into shipped code
faster. Everything the application does is in this repository either way.

Describe the problem rather than sending a patch. A bug report with a minimal
reproduction is enough to get a fix written, including for typos, dead links,
and wrong commands. We do not use pasted code; if we ever want to, we will ask
you to agree to the CLA first.

## License

Before a contribution can be accepted, you must agree to the
[Contributor Licence Agreement](CLA.md). You keep your copyright. The CLA
gives the project a non-exclusive licence that includes the right to
sublicense and relicense your contribution under any terms, including terms
other than `AGPL-3.0-only`.

This rarely comes up, because the project asks for problem reports rather than
patches. Problem reports, feature descriptions, and ideas in issues are not
covered and need no agreement; the CLA applies only when the project asks to
include material you submitted. When it does, record your agreement in the
issue where you submit the material and name the version:
`I agree to CLA version 1.0.` The agreement covers the material submitted in
that issue; there is no signing bot and no blanket sign-up.
