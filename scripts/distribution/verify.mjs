#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeVersion, parseDistributionManifest } from "./manifest.mjs";

const REQUIRED_PLATFORMS = ["linux/amd64", "linux/arm64"];
const REVISION_LABEL = "org.opencontainers.image.revision";
const SOURCE_LABEL = "org.opencontainers.image.source";
const VERSION_LABEL = "org.opencontainers.image.version";

function imageLabels(details, platform) {
  const labels =
    details.image?.[platform]?.config?.Labels ?? details.image?.[platform]?.config?.labels;
  if (!labels || typeof labels !== "object") {
    throw new Error(`Image inspection is missing labels for ${platform}.`);
  }
  return labels;
}

function inspectWithDocker(reference) {
  const inspector = process.env.BISIBILITY_IMAGE_INSPECTOR;
  const result = inspector
    ? spawnSync(inspector, [reference], { encoding: "utf8" })
    : spawnSync(
        "docker",
        ["buildx", "imagetools", "inspect", reference, "--format", "{{json .}}"],
        { encoding: "utf8" },
      );
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr.trim() ?? `exit ${result.status}`;
    throw new Error(`Referenced image is unavailable: ${reference} (${detail})`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Image inspection returned invalid JSON for ${reference}: ${error.message}`);
  }
}

function verifyImage(reference, manifest, inspect) {
  const details = inspect(reference);
  const digest = details.manifest?.digest;
  if (!/^sha256:[0-9a-f]{64}$/.test(digest ?? "")) {
    throw new Error(`Image inspection returned no valid digest for ${reference}.`);
  }

  const revisions = new Set();
  for (const platform of REQUIRED_PLATFORMS) {
    const labels = imageLabels(details, platform);
    const expectedVersion = normalizeVersion(manifest.release);
    if (labels[VERSION_LABEL] !== expectedVersion) {
      throw new Error(
        `${reference} ${platform} has version ${labels[VERSION_LABEL] ?? "missing"}; expected ${expectedVersion}.`,
      );
    }
    if (labels[SOURCE_LABEL] !== manifest.source.repository) {
      throw new Error(`${reference} ${platform} does not identify the public source repository.`);
    }
    const revision = labels[REVISION_LABEL];
    if (!/^[0-9a-f]{40}$/.test(revision ?? "")) {
      throw new Error(`${reference} ${platform} has no valid public source revision.`);
    }
    revisions.add(revision);
  }
  if (revisions.size !== 1) {
    throw new Error(`${reference} platform revisions disagree.`);
  }
  return { digest, revision: [...revisions][0] };
}

export function verifyDistribution(
  manifest,
  { expectedRevision, inspect = inspectWithDocker } = {},
) {
  const web = verifyImage(manifest.images.web, manifest, inspect);
  const worker = verifyImage(manifest.images.worker, manifest, inspect);
  if (web.revision !== worker.revision) {
    throw new Error(`Web revision ${web.revision} does not match worker revision ${worker.revision}.`);
  }
  if (expectedRevision && web.revision !== expectedRevision) {
    throw new Error(
      `Image revision ${web.revision} does not match release revision ${expectedRevision}.`,
    );
  }
  return { revision: web.revision, webDigest: web.digest, workerDigest: worker.digest };
}

export function verifyArtifacts(manifest, artifactRoot) {
  for (const [key, artifact] of Object.entries(manifest.artifacts)) {
    const artifactPath = path.join(artifactRoot, artifact.name);
    let contents;
    try {
      contents = readFileSync(artifactPath);
    } catch (error) {
      throw new Error(`Release artifact is unavailable: ${artifact.name} (${error.message})`);
    }
    const digest = createHash("sha256").update(contents).digest("hex");
    if (digest !== artifact.sha256) {
      throw new Error(
        `Release artifact ${key} has SHA-256 ${digest}; expected ${artifact.sha256}.`,
      );
    }
  }
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function runCli() {
  const args = process.argv.slice(2);
  const manifestPath = argumentValue(args, "--manifest") ?? "distribution-manifest.json";
  const expectedRevision = argumentValue(args, "--revision");
  const artifactsDir = argumentValue(args, "--artifacts-dir");
  const get = argumentValue(args, "--get");
  const manifest = parseDistributionManifest(readFileSync(manifestPath, "utf8"));

  if (get) {
    const values = {
      release: manifest.release,
      web: manifest.images.web,
      worker: manifest.images.worker,
    };
    if (!(get in values)) throw new Error(`Unknown manifest value: ${get}`);
    process.stdout.write(`${values[get]}\n`);
    return;
  }

  if (artifactsDir) verifyArtifacts(manifest, artifactsDir);

  const result = verifyDistribution(manifest, { expectedRevision });
  console.log(`Distribution verified for ${manifest.release} at revision ${result.revision}.`);
  console.log(`web: ${manifest.images.web}@${result.webDigest}`);
  console.log(`worker: ${manifest.images.worker}@${result.workerDigest}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    console.error(`Distribution verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
