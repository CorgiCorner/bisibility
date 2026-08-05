#!/usr/bin/env node
import { fileURLToPath } from "node:url";

const workflow = "ci.yml";
const pollIntervalMs = 60_000;

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function required(value, label) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function assertSha(value, label = "public SHA") {
  if (!/^[0-9a-f]{40}$/.test(value)) throw new Error(`Invalid ${label}: ${value}`);
}

export async function verifyOriginRevision(api, publicSha, originSha) {
  assertSha(originSha, "origin SHA");
  const commit = await api(`/git/commits/${publicSha}`);
  const revisions = (commit.message ?? "")
    .split("\n")
    .map((line) => line.match(/^GitOrigin-RevId: ([0-9a-f]{40})$/)?.[1])
    .filter(Boolean);
  if (revisions.length !== 1 || revisions[0] !== originSha) {
    throw new Error(`Public commit ${publicSha} is not bound to ${originSha} by GitOrigin-RevId.`);
  }
}

function apiClient({ repo, token }) {
  return async (path) => {
    const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub API ${path} returned ${response.status}.`);
    }
    return response.json();
  };
}

export async function resolveTagCommit(api, tag) {
  const reference = await api(`/git/ref/tags/${encodeURIComponent(tag)}`);
  if (reference.object?.type === "commit") return reference.object.sha;
  if (reference.object?.type !== "tag") throw new Error(`Tag ${tag} has an invalid target.`);
  const annotated = await api(`/git/tags/${reference.object.sha}`);
  if (annotated.object?.type !== "commit") throw new Error(`Tag ${tag} is not a commit tag.`);
  return annotated.object.sha;
}

export async function inspectPublicCi(api, sha) {
  const query = new URLSearchParams({ event: "push", head_sha: sha, per_page: "20" });
  const runs = await api(`/actions/workflows/${workflow}/runs?${query}`);
  const candidates = (runs.workflow_runs ?? []).sort((left, right) => right.id - left.id);
  const run = candidates[0];
  if (!run) return { state: "missing" };
  if (run.status !== "completed") return { run, state: "pending" };
  if (run.conclusion !== "success") return { run, state: "failed" };

  const jobs = await api(`/actions/runs/${run.id}/jobs?per_page=100`);
  const gate = (jobs.jobs ?? []).find((job) => job.name === "ci-ok");
  if (!gate || gate.status !== "completed" || gate.conclusion !== "success") {
    return { gate, run, state: "failed" };
  }
  return { gate, run, state: "success" };
}

export async function verifyPublicReleaseSource({
  allowMissingOrigin = false,
  api,
  originSha,
  pause: waitFor = pause,
  sha,
  sourceOnly = false,
  tag,
  wait,
}) {
  assertSha(sha);
  if (!originSha && !allowMissingOrigin) throw new Error("origin SHA is required.");
  const deadline = Date.now() + (wait ? 30 * 60_000 : 0);
  for (;;) {
    const main = await api("/git/ref/heads/main");
    if (main.object?.sha === sha) break;
    if (!wait || Date.now() >= deadline) {
      throw new Error(`Public main ${main.object?.sha ?? "missing"} does not match ${sha}.`);
    }
    console.log(
      `Public main is ${main.object?.sha ?? "missing"}; checking for ${sha} again in 60 seconds.`,
    );
    await waitFor(pollIntervalMs);
  }
  if (tag) {
    const tagCommit = await resolveTagCommit(api, tag);
    if (tagCommit !== sha) throw new Error(`Public tag ${tag} does not match ${sha}.`);
  }
  if (originSha) await verifyOriginRevision(api, sha, originSha);
  if (sourceOnly) return { state: "source-only" };

  for (;;) {
    const status = await inspectPublicCi(api, sha);
    if (status.state === "success") return status;
    if (status.state === "failed") {
      throw new Error(`Public CI failed for ${sha}: ${status.run?.html_url ?? "run unavailable"}`);
    }
    if (!wait || Date.now() >= deadline) {
      throw new Error(`Public CI is ${status.state} for ${sha}.`);
    }
    console.log(`Public CI is ${status.state} for ${sha}; checking again in 60 seconds.`);
    await waitFor(pollIntervalMs);
  }
}

function options(argv) {
  const parsed = { allowMissingOrigin: false, sourceOnly: false, wait: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--wait") parsed.wait = true;
    else if (item === "--source-only") parsed.sourceOnly = true;
    else if (item === "--allow-missing-origin") parsed.allowMissingOrigin = true;
    else if (["--repo", "--sha", "--tag", "--origin-sha"].includes(item)) {
      parsed[item.slice(2).replace("-", "_")] = argv[++index];
    }
    else throw new Error(`Unknown argument: ${item}`);
  }
  return parsed;
}

async function main() {
  const parsed = options(process.argv.slice(2));
  const repo = required(parsed.repo, "--repo");
  const sha = required(parsed.sha, "--sha");
  const token = required(process.env.GITHUB_TOKEN, "GITHUB_TOKEN");
  const result = await verifyPublicReleaseSource({
    allowMissingOrigin: parsed.allowMissingOrigin,
    api: apiClient({ repo, token }),
    originSha: parsed.origin_sha,
    sha,
    sourceOnly: parsed.sourceOnly,
    tag: parsed.tag,
    wait: parsed.wait,
  });
  if (result.state === "source-only") console.log(`Public source binding passed for ${sha}.`);
  else console.log(`Public ci-ok passed for ${sha}: ${result.run.html_url}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
