# Bisibility Examples

Runnable examples live under this directory. They are small programs that call a
real Bisibility API, print their progress, and exit with a machine-checkable
success line.

## Requirements

Set these variables before running an example:

- `BISIBILITY_BASE_URL`: the API v1 root for your instance, such as
  `https://bisibility.example.com/api/v1` or `http://127.0.0.1:3000/api/v1`
- `BISIBILITY_API_KEY`: an API key that can read projects and perform the
  operation shown by the example

For a self-hosted instance, create the key in the app and make sure at least one
project is visible to it. The quickstart examples create temporary keywords, run
rank checks, and clean up after themselves. Use a test project when you are
trying the examples for the first time.

Never commit real API keys, `.env` files, or host-specific secrets in this
directory.

```sh
export BISIBILITY_BASE_URL="https://bisibility.example.com/api/v1"
export BISIBILITY_API_KEY=your-api-key
```

## Success Contract

A successful example exits with status `0` and prints a final non-empty stdout
line in this format:

```text
OK <id>
```

For example, the TypeScript quickstart ends with:

```text
OK ts-quickstart
```

## Included Examples

- `ts/quickstart.ts`: list projects, create a keyword, run a rank check, read
  rank history, and clean up.
- `ts/error-handling.ts`: handle typed SDK API errors for authentication,
  missing resources, and validation failures.
- `ts/alerts.ts`: create, list, delete, and verify an alert rule.
- `cli/README.md`: install and use the `bisibility` command line interface.
- `mcp/quickstart.mjs`: connect to the Bisibility MCP stdio server, inspect
  tools, and call `list_projects`.
- `go/quickstart`: run the quickstart flow with the Go SDK.
- `go/error-handling`: assert typed Go SDK API errors for authentication,
  missing resources, and validation failures.
- `python/quickstart.py`: run the quickstart flow with the Python SDK.
- `python/error_handling.py`: assert typed Python SDK API errors for
  authentication, missing resources, and validation failures.

## TypeScript

The TypeScript examples use the published `@bisibility/sdk` package. Use Node 22
or newer because the examples run TypeScript files directly.

```sh
cd examples/ts
npm install
npm run quickstart
npm run error-handling
npm run alerts
```

## CLI

Follow the [CLI quickstart](./cli/README.md) to install the published package,
authenticate, add a keyword, run a rank check, and export the results.

## MCP

Install the example dependencies and run the MCP quickstart. The example starts
the published `@bisibility/mcp` stdio server with `npx -y @bisibility/mcp`.

```sh
cd examples/mcp
npm install
npm run quickstart
```

## Go

The Go examples use the published `github.com/bisibility/bisibility-sdk-go`
module.

```sh
cd examples/go
go get github.com/bisibility/bisibility-sdk-go@v0.1.0
go run ./quickstart
go run ./error-handling
```

## Python

Create a virtual environment and install the published `bisibility` package from
`requirements.txt`.

```sh
cd examples/python
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python quickstart.py
python error_handling.py
```

## Contributor Loop

From a source checkout that includes the local example harness, run:

```sh
npm run test:examples
```

The harness starts an isolated Postgres container on the `bisibility-examples`
Docker Compose project, runs migrations and seed data, creates deterministic
test credentials, starts the app on `http://127.0.0.1:3200`, and verifies every
entry in `examples/manifest.json`. It also checks the committed OpenAPI snapshot
and SDK parity manifests before running examples.

Useful flags:

- `npm run test:examples -- --require-all`: fail when any example is skipped
  because a toolchain or sibling SDK checkout is missing.
- `npm run test:examples -- --sdk-integration`: after the examples pass, run the
  sibling TypeScript, Go, Python, CLI, and MCP SDK integration suites against
  the same local API.
- `npm run test:examples -- --sdk-integration --require-all`: full local gate
  for SDK release validation.

The local harness seeds `BISIBILITY_SEED_API_KEY` as
`bsb_key_test_e2e_quickstart_0001`. That value is only for local deterministic
tests. Public users should always provide their own `BISIBILITY_API_KEY`.

## Conventions

- Examples must be re-runnable. Use unique names or suffixes when creating
  resources.
- Clean up resources created by the example in a `finally` block or shell trap.
- Keep examples public-quality, small, and focused on the published SDK or API.
- Do not import unpublished implementation internals from example code.
