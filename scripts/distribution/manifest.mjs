const PUBLIC_REPOSITORY = "https://github.com/CorgiCorner/bisibility";
const IMAGE_REPOSITORIES = {
  web: "ghcr.io/corgicorner/bisibility",
  worker: "ghcr.io/corgicorner/bisibility-worker",
};
const SEMVER_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:[+-][0-9A-Za-z.-]+)?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ARTIFACTS = {
  composeCompatibility: "docker-compose.self-host.yml",
  composeCore: "compose.yaml",
  composeTemporal: "compose.temporal.yaml",
  composeWorker: "compose.worker.yaml",
  environment: "bisibility.env.example",
  generator: "generate-self-host-env.mjs",
};

function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function assertExactKeys(value, expected, label) {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(keys) !== JSON.stringify(wanted)) {
    throw new Error(`${label} must contain exactly: ${wanted.join(", ")}.`);
  }
}

export function normalizeVersion(value) {
  const version = String(value).replace(/^v/, "");
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Invalid release version: ${value}`);
  }
  return version;
}

export function distributionManifest(versionValue, artifactSha256) {
  const version = normalizeVersion(versionValue);
  const release = `v${version}`;
  assertExactKeys(artifactSha256, Object.keys(ARTIFACTS), "Artifact SHA-256 input");
  return {
    schemaVersion: 3,
    release,
    source: {
      repository: PUBLIC_REPOSITORY,
      tag: release,
    },
    images: {
      web: `${IMAGE_REPOSITORIES.web}:${version}`,
      worker: `${IMAGE_REPOSITORIES.worker}:${version}`,
    },
    artifacts: Object.fromEntries(
      Object.entries(ARTIFACTS).map(([key, name]) => {
        if (!SHA256_PATTERN.test(artifactSha256[key] ?? "")) {
          throw new Error(`Artifact SHA-256 input ${key} is invalid.`);
        }
        return [key, { name, sha256: artifactSha256[key] }];
      }),
    ),
  };
}

export function parseDistributionManifest(contents) {
  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Distribution manifest is not valid JSON: ${error.message}`);
  }

  const manifest = assertObject(parsed, "Distribution manifest");
  assertExactKeys(
    manifest,
    ["artifacts", "images", "release", "schemaVersion", "source"],
    "Distribution manifest",
  );
  if (manifest.schemaVersion !== 3) {
    throw new Error(`Unsupported distribution manifest schema: ${manifest.schemaVersion}`);
  }

  const source = assertObject(manifest.source, "Distribution manifest source");
  const images = assertObject(manifest.images, "Distribution manifest images");
  const artifacts = assertObject(manifest.artifacts, "Distribution manifest artifacts");
  assertExactKeys(source, ["repository", "tag"], "Distribution manifest source");
  assertExactKeys(images, ["web", "worker"], "Distribution manifest images");
  assertExactKeys(
    artifacts,
    [
      "composeCompatibility",
      "composeCore",
      "composeTemporal",
      "composeWorker",
      "environment",
      "generator",
    ],
    "Distribution manifest artifacts",
  );
  for (const [key, name] of Object.entries(ARTIFACTS)) {
    const artifact = assertObject(
      artifacts[key],
      `Distribution manifest artifact ${key}`,
    );
    assertExactKeys(artifact, ["name", "sha256"], `Distribution manifest artifact ${key}`);
    if (artifact.name !== name || !SHA256_PATTERN.test(artifact.sha256)) {
      throw new Error(`Distribution manifest artifact ${key} is invalid.`);
    }
  }

  const version = normalizeVersion(manifest.release);
  const release = `v${version}`;
  const expected = {
    schemaVersion: 3,
    release,
    source: { repository: PUBLIC_REPOSITORY, tag: release },
    images: {
      web: `${IMAGE_REPOSITORIES.web}:${version}`,
      worker: `${IMAGE_REPOSITORIES.worker}:${version}`,
    },
  };
  if (
    manifest.release !== expected.release ||
    source.repository !== expected.source.repository ||
    source.tag !== expected.source.tag ||
    images.web !== expected.images.web ||
    images.worker !== expected.images.worker
  ) {
    throw new Error("Distribution manifest does not match the public release contract.");
  }
  return {
    ...expected,
    artifacts: Object.fromEntries(
      Object.entries(artifacts).map(([key, artifact]) => [key, { ...artifact }]),
    ),
  };
}

export const distributionContract = {
  imageRepositories: IMAGE_REPOSITORIES,
  publicRepository: PUBLIC_REPOSITORY,
  artifacts: ARTIFACTS,
};
