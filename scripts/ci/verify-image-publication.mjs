#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { apiClient, verifyPublicReleaseSource } from "./verify-public-release-source.mjs";

export function parsePublicationProof(message, version) {
  if (!/^v\d+\.\d+\.\d+$/.test(version)) throw new Error("Image publication requires a final version.");
  const read = (key) => {
    const prefix = `${key}: `;
    const values = message.split("\n").filter((line) => line.startsWith(prefix));
    if (values.length !== 1) throw new Error(`Signed release tag requires exactly one ${key}.`);
    return values[0].slice(prefix.length);
  };
  const candidateTag = read("Candidate-Tag");
  if (!candidateTag.startsWith(`${version}-rc.`) ||
    !/^(0|[1-9]\d*)$/.test(candidateTag.slice(`${version}-rc.`.length))) throw new Error("Release candidate tag differs from version.");
  const number = (key) => {
    const raw = read(key);
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error(`Invalid ${key}.`);
    return Number(raw);
  };
  return { candidateTag, expectedRunId: number("Candidate-CI-Run"), expectedRunAttempt: number("Candidate-CI-Attempt") };
}

async function signedTag(api, tag, sha) {
  const ref = await api(`/git/ref/tags/${encodeURIComponent(tag)}`);
  if (ref.object?.type !== "tag") throw new Error("Publication requires an annotated signed tag.");
  const value = await api(`/git/tags/${ref.object.sha}`);
  if (value.tag !== tag || value.object?.type !== "commit" || value.object.sha !== sha ||
    value.verification?.verified !== true) throw new Error("Publication tag signature or target is invalid.");
  return value;
}

export async function verifyImagePublication({ api, sha, tag }) {
  const final = await signedTag(api, tag, sha);
  const proof = parsePublicationProof(final.message, tag);
  await signedTag(api, proof.candidateTag, sha);
  const commit = await api(`/git/commits/${sha}`);
  if (commit.verification?.verified !== true) throw new Error("Publication commit is not verified.");
  const origins = [...commit.message.matchAll(/^GitOrigin-RevId: ([a-f0-9]{40})$/gm)];
  if (origins.length !== 1) throw new Error("Publication commit requires one source revision.");
  return verifyPublicReleaseSource({ api, sha, tag, originSha: origins[0][1], ...proof });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { GITHUB_REPOSITORY: repo, GITHUB_TOKEN: token, PUBLIC_SHA: sha, RELEASE_TAG: tag } = process.env;
  if (!repo || !token || !sha || !tag) throw new Error("Repository, token, public SHA and release tag are required.");
  verifyImagePublication({ api: apiClient({ repo, token }), sha, tag })
    .then((result) => console.log(`Image publication CI verified: ${result.run.id}, attempt ${result.run.run_attempt}.`))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
