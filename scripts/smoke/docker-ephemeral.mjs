import { spawnSync } from "node:child_process";

const GIBIBYTE = 1024 ** 3;
const PROBE_IMAGE = "postgres:16";
export const EPHEMERAL_IMAGE_LABEL = "corgicorner.ephemeral=1";
export const DEFAULT_DOCKER_RUNTIME_MIN_FREE_BYTES = 10 * GIBIBYTE;
export const DEFAULT_DOCKER_BUILD_MIN_FREE_BYTES = 12 * GIBIBYTE;
export const DEFAULT_DOCKER_MIN_FREE_BYTES = DEFAULT_DOCKER_RUNTIME_MIN_FREE_BYTES;

function dockerResult(args, environment) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    env: environment,
    stdio: "pipe",
  });
}

function resultDetail(result) {
  return [result.error?.message, result.stderr, result.stdout].filter(Boolean).join("\n").trim();
}

function runDocker(args, environment, execute) {
  const result = execute(args, environment);
  if (result.error || result.status !== 0) {
    const detail = resultDetail(result) || `exit ${result.status ?? "unknown"}`;
    throw new Error(`docker ${args.join(" ")} failed: ${detail}`);
  }
  return result.stdout ?? "";
}

function lastByteCount(output) {
  const rows = output
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter((row) => /^\d+$/.test(row));
  const value = rows.at(-1);
  if (!value) throw new Error("Docker VM free-space probe returned no byte count.");
  return Number(value);
}

function formatGiB(bytes) {
  return `${(bytes / GIBIBYTE).toFixed(2)} GiB`;
}

export function resolveDockerMinimumFreeBytes(environment = process.env, profile = "runtime") {
  if (profile !== "runtime" && profile !== "build") {
    throw new Error(`Unknown Docker free-space profile: ${profile}.`);
  }
  const configured = environment.BISIBILITY_DOCKER_MIN_FREE_GIB;
  if (configured !== undefined) {
    // The operator override deliberately applies to both profiles.
    if (!/^[1-9]\d{0,2}$/.test(configured)) {
      throw new Error("BISIBILITY_DOCKER_MIN_FREE_GIB must be an integer from 1 to 999.");
    }
    return Number(configured) * GIBIBYTE;
  }
  if (profile === "runtime") return DEFAULT_DOCKER_RUNTIME_MIN_FREE_BYTES;
  return DEFAULT_DOCKER_BUILD_MIN_FREE_BYTES;
}

export function readDockerVmFreeBytes({ environment = process.env, run = dockerResult } = {}) {
  // A container reports the Docker engine VM filesystem, unlike host `df` on Docker Desktop.
  const output = runDocker(
    ["run", "--rm", "--pull", "missing", "--entrypoint", "df", PROBE_IMAGE, "-B1", "--output=avail", "/"],
    environment,
    run,
  );
  return lastByteCount(output);
}

export function pruneEphemeralImages({ environment = process.env, run = dockerResult } = {}) {
  runDocker(
    ["image", "prune", "--all", "--force", "--filter", `label=${EPHEMERAL_IMAGE_LABEL}`],
    environment,
    run,
  );
}

export function ensureDockerVmFreeSpace({
  environment = process.env,
  log = console.log,
  profile = "runtime",
  runDocker: execute = dockerResult,
} = {}) {
  const minimumFreeBytes = resolveDockerMinimumFreeBytes(environment, profile);
  const before = readDockerVmFreeBytes({ environment, run: execute });
  if (before >= minimumFreeBytes) {
    return { freeBytes: before, pruned: false };
  }

  log(
    `Docker VM has ${formatGiB(before)} free; pruning unused images labeled ${EPHEMERAL_IMAGE_LABEL}.`,
  );
  pruneEphemeralImages({ environment, run: execute });
  const after = readDockerVmFreeBytes({ environment, run: execute });
  if (after < minimumFreeBytes) {
    throw new Error(
      `Docker VM has ${formatGiB(after)} free after pruning images labeled ${EPHEMERAL_IMAGE_LABEL}; ` +
        `at least ${formatGiB(minimumFreeBytes)} is required. Free Docker VM disk space or set ` +
        "BISIBILITY_DOCKER_MIN_FREE_GIB to override both runtime and build defaults.",
    );
  }
  log(`Docker VM free-space preflight recovered ${formatGiB(after)}.`);
  return { freeBytes: after, pruned: true };
}
