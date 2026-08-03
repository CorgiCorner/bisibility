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
} = {}) {
  return async (path) => {
    if (path === "/git/ref/heads/main") return { object: { sha: mainSha } };
    if (path === "/git/ref/tags/v0.3.1") return { object: { sha: tagSha, type: "commit" } };
    if (path === `/git/commits/${sha}`) {
      return { message: `chore(release): v0.3.1\n\nGitOrigin-RevId: ${originSha}` };
    }
    if (path.startsWith("/actions/workflows/ci.yml/runs?")) {
      return { workflow_runs: [{ conclusion, html_url: "https://example.com/run", id: 7, status }] };
    }
    if (path === "/actions/runs/7/jobs?per_page=100") {
      return { jobs: [{ conclusion, name: "ci-ok", status }] };
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

test("accepts legacy verification when no origin SHA is available", async () => {
  const result = await verifyPublicReleaseSource({
    api: apiFixture({ originSha: "b".repeat(40) }),
    sha,
    wait: false,
  });
  assert.equal(result.state, "success");
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
    verifyPublicReleaseSource({ api: apiFixture({ mainSha: "b".repeat(40) }), sha, wait: false }),
    /Public main/,
  );
  await assert.rejects(
    verifyPublicReleaseSource({
      api: apiFixture({ tagSha: "b".repeat(40) }),
      sha,
      tag: "v0.3.1",
      wait: false,
    }),
    /Public tag/,
  );
});

test("rejects missing, pending, and failed public CI", async () => {
  const missingApi = async (path) => {
    if (path === "/git/ref/heads/main") return { object: { sha } };
    return { workflow_runs: [] };
  };
  await assert.rejects(
    verifyPublicReleaseSource({ api: missingApi, sha, wait: false }),
    /Public CI is missing/,
  );
  await assert.rejects(
    verifyPublicReleaseSource({ api: apiFixture({ status: "in_progress" }), sha, wait: false }),
    /Public CI is pending/,
  );
  await assert.rejects(
    verifyPublicReleaseSource({ api: apiFixture({ conclusion: "failure" }), sha, wait: false }),
    /Public CI failed/,
  );
});
