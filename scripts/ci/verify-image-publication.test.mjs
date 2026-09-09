import assert from "node:assert/strict";
import test from "node:test";
import { parsePublicationProof, verifyImagePublication } from "./verify-image-publication.mjs";

const sha = "a".repeat(40);
const tag = "v0.3.1";
const candidateTag = `${tag}-rc.1`;
const proof = `Candidate-Tag: ${candidateTag}\nCandidate-CI-Run: 7\nCandidate-CI-Attempt: 2`;

function fixture(mutate = () => {}) {
  return async (path) => {
    let result;
    if (path === "/git/ref/heads/main") result = { object: { sha } };
    else if (path === `/git/ref/tags/${tag}`) result = { object: { type: "tag", sha: "final" } };
    else if (path === `/git/ref/tags/${candidateTag}`) result = { object: { type: "tag", sha: "candidate" } };
    else if (path === "/git/tags/final" || path === "/git/tags/candidate") result = {
      tag: path.endsWith("final") ? tag : candidateTag, message: proof,
      object: { type: "commit", sha }, verification: { verified: true },
    };
    else if (path === `/git/commits/${sha}`) result = {
      message: `Release\n\nGitOrigin-RevId: ${"b".repeat(40)}`, verification: { verified: true },
    };
    else if (path.startsWith("/actions/workflows/ci.yml/runs?")) result = { workflow_runs: [{
      id: 7, run_attempt: 2, head_sha: sha, head_branch: candidateTag,
      path: ".github/workflows/ci.yml", event: "push", status: "completed", conclusion: "success",
    }] };
    else if (path === "/actions/runs/7/attempts/2/jobs?per_page=100") result = { jobs: [{
      name: "ci-ok", head_sha: sha, run_attempt: 2, status: "completed", conclusion: "success",
    }] };
    else throw new Error(`Unexpected API path ${path}`);
    mutate(path, result);
    return result;
  };
}

test("publication requires matching signed refs and current receipt-bound native CI", async () => {
  const result = await verifyImagePublication({ api: fixture(), sha, tag });
  assert.equal(result.state, "success");
  assert.equal(result.run.run_attempt, 2);
});

for (const ref of [tag, candidateTag]) {
  test(`rejects lightweight publication ref ${ref}`, async () => {
    await assert.rejects(verifyImagePublication({ sha, tag, api: fixture((path, value) => {
      if (path === `/git/ref/tags/${ref}`) value.object.type = "commit";
    }) }), /annotated signed tag/);
  });
}

for (const ref of ["final", "candidate"]) {
  for (const defect of ["signature", "target"]) {
    test(`rejects ${ref} tag with invalid ${defect}`, async () => {
      await assert.rejects(verifyImagePublication({ sha, tag, api: fixture((path, value) => {
        if (path !== `/git/tags/${ref}`) return;
        if (defect === "signature") value.verification.verified = false;
        else value.object.sha = "c".repeat(40);
      }) }), /signature or target/);
    });
  }
}

test("rejects an unverified commit even with signed tags", async () => {
  await assert.rejects(verifyImagePublication({ sha, tag, api: fixture((path, value) => {
    if (path === `/git/commits/${sha}`) value.verification.verified = false;
  }) }), /commit is not verified/);
});

for (const text of ["", proof.replace("-rc.1", "-rc.x"), proof.replace("v0.3.1-rc", "v0.3.2-rc"),
  proof.replace("Run: 7", "Run: 0"), proof.replace("Attempt: 2", "Attempt: -1"),
  `${proof}\nCandidate-CI-Run: 8`]) {
  test(`rejects invalid signed publication proof ${JSON.stringify(text)}`, () => {
    assert.throws(() => parsePublicationProof(text, tag));
  });
}

for (const state of ["missing", "pending", "failure", "cancelled", "skipped", "stale-proof"]) {
  test(`no publication after ${state} native CI`, async () => {
    let published = false;
    const api = fixture((path, value) => {
      if (state === "stale-proof" && path === "/git/tags/final") value.message = proof.replace("Attempt: 2", "Attempt: 1");
      if (!value.workflow_runs) return;
      if (state === "missing") value.workflow_runs = [];
      else if (state === "pending") value.workflow_runs[0].status = "in_progress";
      else if (state !== "stale-proof") value.workflow_runs[0].conclusion = state;
    });
    await assert.rejects(async () => {
      await verifyImagePublication({ api, sha, tag });
      published = true;
    }, /Public CI/);
    assert.equal(published, false);
  });
}
