import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultListingsDirectory = path.resolve(scriptDirectory, "../dockerhub");
const latestReleaseUrl =
  "https://api.github.com/repos/CorgiCorner/bisibility/releases/latest";
const releaseTagPattern = /^v\d+\.\d+\.\d+(?:[+-][0-9A-Za-z.-]+)?$/;

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function validateRepository(repository) {
  if (
    !/^[a-z0-9]+(?:[._-][a-z0-9]+)*\/[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(
      repository,
    )
  ) {
    throw new Error(`Invalid Docker Hub repository: ${repository}`);
  }
}

export async function renderDockerHubListings({
  releaseTag,
  listingsDirectory = defaultListingsDirectory,
} = {}) {
  if (!releaseTagPattern.test(releaseTag ?? "")) {
    throw new Error(`Invalid release tag: ${releaseTag ?? "missing"}`);
  }

  const registryPath = path.join(listingsDirectory, "listings.json");
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  const entries = Object.entries(registry);
  if (entries.length !== 2 || !registry.web || !registry.worker) {
    throw new Error(
      "Docker Hub registry must contain exactly web and worker listings.",
    );
  }

  return Promise.all(
    entries.map(async ([name, rawListing]) => {
      const repository = requireText(
        rawListing.repository,
        `${name}.repository`,
      );
      const description = requireText(
        rawListing.description,
        `${name}.description`,
      );
      const template = requireText(rawListing.template, `${name}.template`);
      validateRepository(repository);
      if (Buffer.byteLength(description, "utf8") > 100) {
        throw new Error(
          `${name}.description exceeds Docker Hub's 100-byte limit.`,
        );
      }

      const templateSource = await readFile(
        path.join(listingsDirectory, template),
        "utf8",
      );
      if (!templateSource.includes("{{RELEASE_TAG}}")) {
        throw new Error(`${template} must contain {{RELEASE_TAG}}.`);
      }
      const fullDescription = templateSource.replaceAll(
        "{{RELEASE_TAG}}",
        releaseTag,
      );
      if (fullDescription.includes("{{")) {
        throw new Error(`${template} contains an unresolved template token.`);
      }
      if (Buffer.byteLength(fullDescription, "utf8") > 25_000) {
        throw new Error(`${template} exceeds Docker Hub's 25,000-byte limit.`);
      }

      return { description, fullDescription, name, repository };
    }),
  );
}

async function requireOk(response, operation) {
  if (!response.ok) {
    throw new Error(`${operation} failed with HTTP ${response.status}.`);
  }
  return response;
}

async function requireLatestRelease(fetchImpl, releaseTag, githubToken) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;
  const response = await requireOk(
    await fetchImpl(latestReleaseUrl, { headers }),
    "Latest public release lookup",
  );
  const latestTag = requireText(
    (await response.json()).tag_name,
    "Latest public release tag",
  );
  if (latestTag !== releaseTag) {
    throw new Error(
      `Refusing to publish ${releaseTag}: latest public release is ${latestTag}.`,
    );
  }
}

async function verifyListing(fetchImpl, listing, { attempts, delayMs, sleep }) {
  const [namespace, repository] = listing.repository.split("/");
  const url = `https://hub.docker.com/v2/namespaces/${namespace}/repositories/${repository}`;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await requireOk(
      await fetchImpl(url, { headers: { Accept: "application/json" } }),
      `Docker Hub verification for ${listing.repository}`,
    );
    const body = await response.json();
    if (
      body.description === listing.description &&
      body.full_description === listing.fullDescription
    ) {
      return;
    }
    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  throw new Error(`Docker Hub returned stale copy for ${listing.repository}.`);
}

export async function syncDockerHubDescriptions({
  username,
  password,
  githubToken,
  releaseTag,
  fetchImpl = globalThis.fetch,
  attempts = 6,
  delayMs = 2_000,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  listingsDirectory = defaultListingsDirectory,
} = {}) {
  requireText(username, "DOCKERHUB_USERNAME");
  requireText(password, "DOCKERHUB_TOKEN");
  if (typeof fetchImpl !== "function") {
    throw new Error("A Fetch implementation is required.");
  }

  const listings = await renderDockerHubListings({
    releaseTag,
    listingsDirectory,
  });
  await requireLatestRelease(fetchImpl, releaseTag, githubToken);
  const tokenResponse = await requireOk(
    await fetchImpl("https://hub.docker.com/v2/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: username, secret: password }),
    }),
    "Docker Hub authentication",
  );
  const accessToken = requireText(
    (await tokenResponse.json()).access_token,
    "Docker Hub access token",
  );

  for (const listing of listings) {
    await requireOk(
      await fetchImpl(
        `https://hub.docker.com/v2/repositories/${listing.repository}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            description: listing.description,
            full_description: listing.fullDescription,
          }),
        },
      ),
      `Docker Hub update for ${listing.repository}`,
    );
  }

  for (const listing of listings) {
    await verifyListing(fetchImpl, listing, { attempts, delayMs, sleep });
    process.stdout.write(
      `Verified Docker Hub description: ${listing.repository}\n`,
    );
  }

  return listings;
}

function parseCliArguments(argv) {
  const versionIndex = argv.indexOf("--version");
  const releaseTag = versionIndex >= 0 ? argv[versionIndex + 1] : undefined;
  const checkOnly = argv.includes("--check");
  return { checkOnly, releaseTag };
}

async function main() {
  const { checkOnly, releaseTag } = parseCliArguments(process.argv.slice(2));
  if (checkOnly) {
    const listings = await renderDockerHubListings({ releaseTag });
    for (const listing of listings) {
      process.stdout.write(
        `Validated Docker Hub description: ${listing.repository}\n`,
      );
    }
    return;
  }

  await syncDockerHubDescriptions({
    username: process.env.DOCKERHUB_USERNAME,
    password: process.env.DOCKERHUB_TOKEN,
    githubToken: process.env.GITHUB_TOKEN,
    releaseTag,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Docker Hub description sync failed.",
    );
    process.exitCode = 1;
  });
}
