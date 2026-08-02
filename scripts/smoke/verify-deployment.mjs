import { parseArgs } from "node:util";

const PROFILES = ["web-only", "full-stack"];

const { values } = parseArgs({
  options: {
    profile: { type: "string", default: "web-only" },
    timeout: { type: "string", default: "15000" },
    url: { type: "string" },
    wait: { type: "string", default: "0" },
  },
});

const baseUrl = values.url?.replace(/\/+$/, "");
const timeoutMs = Number(values.timeout);
const waitSeconds = Number(values.wait);
const probeToken = process.env.INTERNAL_PROBE_TOKEN?.trim();

if (!baseUrl || !PROFILES.includes(values.profile) || !Number.isFinite(timeoutMs) || !Number.isFinite(waitSeconds)) {
  console.error(
    "Usage: node scripts/smoke/verify-deployment.mjs --url https://host [--profile web-only|full-stack] [--wait <seconds>] [--timeout <ms>]",
  );
  console.error("  --profile full-stack requires the Temporal worker to report healthy.");
  console.error("  --wait polls /api/v1/health until it responds before running checks (cold starts).");
  process.exit(2);
}

async function request(path, options = {}) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      ...(probeToken ? { authorization: `Bearer ${probeToken}` } : {}),
      "user-agent": "bisibility-verify-deployment",
    },
    redirect: options.redirect ?? "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { elapsedMs: Math.round(performance.now() - started), response };
}

async function waitForDeployment() {
  const deadline = Date.now() + waitSeconds * 1000;
  let lastFailure = "no response";
  while (Date.now() < deadline) {
    try {
      const { response } = await request("/api/v1/health");
      if (response.status < 500 || response.status === 503) {
        return;
      }
      lastFailure = `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`Deployment did not respond within ${waitSeconds}s (${lastFailure}).`);
}

async function checkHealth() {
  const { elapsedMs, response } = await request("/api/v1/health");
  const body = await response.json().catch(() => null);
  const services = body?.services;
  if (!services) {
    return { detail: `HTTP ${response.status}, body has no services object`, elapsedMs, ok: false };
  }
  const failures = [];
  if (services.app !== "ok") {
    failures.push(`app=${services.app}`);
  }
  if (services.database !== "ok") {
    failures.push(`database=${services.database}`);
  }
  // A missing heartbeat is unknown for legacy web-only deployments. Degraded and down
  // signal observed telemetry failures and must fail every deployment profile.
  const workerFailed = ["degraded", "down"].includes(services.worker);
  const workerAcceptable =
    values.profile === "full-stack" ? services.worker === "ok" : !workerFailed;
  if (!workerAcceptable) {
    failures.push(`worker=${services.worker} (required by --profile ${values.profile})`);
  }
  const temporalFailed = ["degraded", "down"].includes(services.temporal);
  const temporalAcceptable =
    values.profile === "full-stack" ? services.temporal === "ok" : !temporalFailed;
  if (!temporalAcceptable) {
    failures.push(`temporal=${services.temporal} (required by --profile ${values.profile})`);
  }
  return {
    detail:
      failures.length > 0
        ? failures.join(", ")
        : `status=${body.status}, worker=${services.worker}, temporal=${services.temporal}`,
    elapsedMs,
    ok: failures.length === 0,
  };
}

async function checkOkResponse(path, validate) {
  const { elapsedMs, response } = await request(path);
  if (!response.ok) {
    return { detail: `HTTP ${response.status}`, elapsedMs, ok: false };
  }
  const problem = validate ? await validate(response) : null;
  return { detail: problem ?? `HTTP ${response.status}`, elapsedMs, ok: problem === null };
}

async function checkAuthGate() {
  const { elapsedMs, response } = await request("/app", { redirect: "manual" });
  const location = response.headers.get("location") ?? "";
  if (response.status >= 300 && response.status < 400 && location.includes("/login")) {
    return { detail: `HTTP ${response.status} -> ${new URL(location, baseUrl).pathname}`, elapsedMs, ok: true };
  }
  return {
    detail: `expected redirect to /login, got HTTP ${response.status}${location ? ` -> ${location}` : ""}`,
    elapsedMs,
    ok: false,
  };
}

async function checkCloudModeSettingsRedirect() {
  const { elapsedMs, response } = await request("/app/settings", { redirect: "manual" });
  const location = response.headers.get("location") ?? "";
  if (response.status === 307 && location.includes("next=%2Fapp%2Fsettings")) {
    return { detail: `HTTP ${response.status} -> ${location}`, elapsedMs, ok: true };
  }
  return {
    detail: `expected HTTP 307 with next=%2Fapp%2Fsettings, got HTTP ${response.status}${location ? ` -> ${location}` : ""}`,
    elapsedMs,
    ok: false,
  };
}

const checks = [
  { name: "health", run: checkHealth },
  { name: "homepage", run: () => checkOkResponse("/") },
  { name: "robots.txt", run: () => checkOkResponse("/robots.txt") },
  {
    name: "openapi.json",
    run: () =>
      checkOkResponse("/api/v1/openapi.json", async (response) => {
        const body = await response.json().catch(() => null);
        return body && typeof body.paths === "object" ? null : "response is not an OpenAPI document";
      }),
  },
  {
    name: "llms.txt",
    run: () =>
      checkOkResponse("/api/v1/llms.txt", async (response) => {
        const text = await response.text();
        return text.trim().length > 0 ? null : "response body is empty";
      }),
  },
  { name: "auth gate /app", run: checkAuthGate },
  ...(values.profile === "web-only"
    ? [{ name: "cloud settings", run: checkCloudModeSettingsRedirect }]
    : []),
];

console.log(`verify-deployment: ${baseUrl} (profile ${values.profile})`);
if (waitSeconds > 0) {
  console.log(`waiting up to ${waitSeconds}s for the deployment to respond...`);
  await waitForDeployment();
}

let failed = 0;
for (const check of checks) {
  let result;
  try {
    result = await check.run();
  } catch (error) {
    result = { detail: error instanceof Error ? error.message : String(error), elapsedMs: timeoutMs, ok: false };
  }
  if (!result.ok) {
    failed += 1;
  }
  const mark = result.ok ? "PASS" : "FAIL";
  console.log(`  ${mark}  ${check.name.padEnd(16)} ${String(result.elapsedMs).padStart(6)}ms  ${result.detail}`);
}

const passed = checks.length - failed;
console.log(`RESULT: ${failed === 0 ? "PASS" : "FAIL"} (${passed}/${checks.length})`);
process.exit(failed === 0 ? 0 : 1);
