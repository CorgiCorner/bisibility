import assert from "node:assert/strict";
import test from "node:test";
import { verifyPublicReleaseSource } from "./verify-public-release-source.mjs";

const sha = "a".repeat(40);

function apiFixture({
  conclusion = "success",
  mainSha = sha,
  originSha = sha,
  status = "completed",
  tagSha = sha,
  ref = "main",
  runOverrides = {},
  gateOverrides = {},
} = {}) {
  return async (path) => {
    if (path === "/git/ref/heads/main") return { object: { sha: mainSha } };
    if (path === "/git/ref/tags/v0.3.1") return { object: { sha: tagSha, type: "commit" } };
    if (path === "/git/ref/tags/v0.3.1-rc.1") return { object: { sha: tagSha, type: "commit" } };
    if (path === `/git/commits/${sha}`) {
      return { message: `chore(release): v0.3.1\n\nGitOrigin-RevId: ${originSha}` };
    }
    if (path.startsWith("/actions/workflows/ci.yml/runs?")) {
      return { workflow_runs: [{ conclusion, html_url: "https://example.com/run", id: 7, status,
        head_sha: sha, event: "push", path: ".github/workflows/ci.yml", head_branch: ref, run_attempt: 2, ...runOverrides }] };
    }
    if (path === "/actions/runs/7/attempts/2/jobs?per_page=100") {
      return { jobs: [{ conclusion, name: "ci-ok", status, head_sha: sha, run_attempt: 2, ...gateOverrides }] };
    }
    throw new Error(`Unexpected API path: ${path}`);
  };
}

test("accepts an exact main, tag, workflow run, and ci-ok job", async () => {
  const result = await verifyPublicReleaseSource({
    api: apiFixture(),
    originSha: sha,
    sha,
    tag: "v0.3.1",
    wait: false,
  });
  assert.equal(result.state, "success");
});

test("validates native public RC CI without requiring promotion to main", async () => {
  const result = await verifyPublicReleaseSource({
    api: apiFixture({ ref: "v0.3.1-rc.1", mainSha: "b".repeat(40) }),
    candidateOnly: true, candidateTag: "v0.3.1-rc.1", originSha: sha, sha,
  });
  assert.equal(result.state, "success");
});

for (const runOverrides of [
  { head_sha: "b".repeat(40) }, { event: "pull_request" },
  { head_branch: "v0.3.1-rc.2" }, { path: ".github/workflows/other.yml" },
]) {
  test(`rejects unrelated candidate CI: ${JSON.stringify(runOverrides)}`, async () => {
    await assert.rejects(verifyPublicReleaseSource({
      api: apiFixture({ ref: "v0.3.1-rc.1", runOverrides }),
      candidateOnly: true, candidateTag: "v0.3.1-rc.1", originSha: sha, sha,
    }), /Public CI is missing/);
  });
}

for (const gateOverrides of [{ run_attempt: 1 }, { head_sha: "b".repeat(40) },
  { conclusion: "skipped" }, { conclusion: "cancelled" }, { name: "another-gate" }]) {
  test(`rejects invalid ci-ok evidence: ${JSON.stringify(gateOverrides)}`, async () => {
    await assert.rejects(verifyPublicReleaseSource({ api: apiFixture({ gateOverrides }), originSha: sha, sha }), /Public CI failed/);
  });
}

test("does not fall back to an older success when the latest candidate attempt is pending", async () => {
  const fixture = apiFixture({ status: "in_progress" });
  await assert.rejects(verifyPublicReleaseSource({ api: async (path) => {
    const result = await fixture(path);
    if (result.workflow_runs) result.workflow_runs.push({ ...result.workflow_runs[0], id: 6, status: "completed", conclusion: "success" });
    return result;
  }, originSha: sha, sha }), /Public CI is pending/);
});

test("rejects a changed receipt attempt and a source-only candidate shortcut", async () => {
  await assert.rejects(verifyPublicReleaseSource({ api: apiFixture(), originSha: sha, sha, expectedRunAttempt: 1 }), /receipt/);
  await assert.rejects(verifyPublicReleaseSource({ api: apiFixture(), originSha: sha, sha,
    candidateOnly: true, candidateTag: "v0.3.1-rc.1", sourceOnly: true }), /requires native public CI/);
});

test("rejects a missing origin SHA unless diagnostic mode is explicit", async () => {
  await assert.rejects(
    verifyPublicReleaseSource({
      api: apiFixture({ originSha: "b".repeat(40) }),
      sha,
      wait: false,
    }),
    /origin SHA is required/,
  );

  const result = await verifyPublicReleaseSource({
    allowMissingOrigin: true,
    api: apiFixture({ originSha: "b".repeat(40) }),
    sha,
    wait: false,
  });
  assert.equal(result.state, "success");
});

test("accepts a bound source before public CI completes when explicitly requested", async () => {
  const result = await verifyPublicReleaseSource({
    api: apiFixture({ status: "in_progress" }),
    originSha: sha,
    sha,
    sourceOnly: true,
    tag: "v0.3.1",
    wait: false,
  });
  assert.equal(result.state, "source-only");
});

test("rejects a mismatched or missing Copybara origin revision", async () => {
  await assert.rejects(
    verifyPublicReleaseSource({
      api: apiFixture({ originSha: "b".repeat(40) }),
      originSha: sha,
      sha,
      wait: false,
    }),
    /GitOrigin-RevId/,
  );

  const missingOriginApi = async (path) => {
    if (path === "/git/ref/heads/main") return { object: { sha } };
    if (path === `/git/commits/${sha}`) return { message: "chore(release): v0.3.1" };
    throw new Error(`Unexpected API path: ${path}`);
  };
  await assert.rejects(
    verifyPublicReleaseSource({ api: missingOriginApi, originSha: sha, sha, wait: false }),
    /GitOrigin-RevId/,
  );
});

test("rejects a public main or tag pointing at another commit", async () => {
  await assert.rejects(
    verifyPublicReleaseSource({
      api: apiFixture({ mainSha: "b".repeat(40) }),
      originSha: sha,
      sha,
      wait: false,
    }),
    /Public main/,
  );
  await assert.rejects(
    verifyPublicReleaseSource({
      api: apiFixture({ tagSha: "b".repeat(40) }),
      originSha: sha,
      sha,
      tag: "v0.3.1",
      wait: false,
    }),
    /Public tag/,
  );
});

test("waits for the pushed public main ref to become visible", async () => {
  const fixture = apiFixture();
  const staleSha = "b".repeat(40);
  const mainResponses = [staleSha, sha];
  const pauses = [];
  const api = async (path) => {
    if (path === "/git/ref/heads/main") {
      return { object: { sha: mainResponses.shift() ?? sha } };
    }
    return fixture(path);
  };

  const result = await verifyPublicReleaseSource({
    api,
    originSha: sha,
    pause: async (milliseconds) => pauses.push(milliseconds),
    sha,
    wait: true,
  });

  assert.equal(result.state, "success");
  assert.deepEqual(pauses, [60_000]);
});

test("rejects missing, pending, and failed public CI", async () => {
  const missingApi = async (path) => {
    if (path === "/git/ref/heads/main") return { object: { sha } };
    if (path === `/git/commits/${sha}`) {
      return { message: `chore(release): v0.3.1\n\nGitOrigin-RevId: ${sha}` };
    }
    return { workflow_runs: [] };
  };
  await assert.rejects(
    verifyPublicReleaseSource({ api: missingApi, originSha: sha, sha, wait: false }),
    /Public CI is missing/,
  );
  await assert.rejects(
    verifyPublicReleaseSource({
      api: apiFixture({ status: "in_progress" }),
      originSha: sha,
      sha,
      wait: false,
    }),
    /Public CI is pending/,
  );
  await assert.rejects(
    verifyPublicReleaseSource({
      api: apiFixture({ conclusion: "failure" }),
      originSha: sha,
      sha,
      wait: false,
    }),
    /Public CI failed/,
  );
});
