# CLI quickstart

This walkthrough uses the published Bisibility CLI against the hosted service.
For a self-hosted instance, replace the base URL with your instance's `/api/v1`
URL.

## 1. Install the CLI

```console
npm install -g @bisibility/cli
bisibility --version
```

## 2. Connect your account

Create an API key in Bisibility, then save it in the CLI config. Set the EU hosted region
API URL explicitly so the active regional target is clear.

```console
bisibility config set baseUrl https://eu.bisibility.com/api/v1
bisibility config set apiKey your-api-key
bisibility auth status
```

`auth status` should report `authenticated: yes` and list at least one project.

## 3. Choose a project

List the projects available to the API key, copy the project ID, and store it as
the default for the following commands:

```console
bisibility projects list
bisibility config set projectId prj_a00000000000000000000000
```

## 4. Add and inspect a keyword

```console
bisibility keywords add "rank tracker api" \
  --country "United States" \
  --device desktop \
  --target-url https://example.com/rank-tracker \
  --tag quickstart

bisibility keywords list --limit 20
```

Copy the new keyword ID from the output, for example `kw_a00000000000000000000000`.

## 5. Run a rank check

Rank checks require a connected SERP provider in the selected project.

```console
bisibility check kw_a00000000000000000000000
bisibility check list kw_a00000000000000000000000 --all
```

The first command runs a check immediately. The second shows the keyword's rank
check history.

## 6. Export the results

```console
bisibility export --format json --output bisibility-export.json
```

The export contains the project's keywords and their rank history. To remove the
quickstart keyword afterward:

```console
bisibility keywords delete kw_a00000000000000000000000
```

Run `bisibility --help` or `bisibility <command> --help` to discover the remaining
project, provider, alert, team, and migration commands.
