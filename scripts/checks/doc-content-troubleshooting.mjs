import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TROUBLESHOOTING_PAGE = "self-hosting/troubleshooting.mdx";

const RUNBOOK_HEADINGS = [
  "## First triage and evidence",
  "## App or migration startup failures",
  "## Liveness versus readiness",
  "## Sign-in redirects or callbacks",
  "## Provider and rank-check failures",
  "## Worker restart loops",
  "## Schedules not firing",
  "## Wrong client IP or shared rate-limit bucket",
  "## Email failures",
  "## Issue report checklist",
];

const REQUIRED_TERMS = [
  "db-migrations",
  "Completed migration steps are skipped",
  "ps --all",
  "logs --no-color",
  "/api/v1/liveness",
  "/api/v1/readiness",
  "/api/v1/health",
  "INTERNAL_PROBE_TOKEN",
  "Never put `INTERNAL_PROBE_TOKEN` in a URL",
  "SITE_URL",
  "BETTER_AUTH_URL",
  "TEMPORAL_ADDRESS",
  "TEMPORAL_TLS",
  "TEMPORAL_NAMESPACE",
  "TEMPORAL_TASK_QUEUE",
  "TEMPORAL_ALERT_DELIVERY_TASK_QUEUE",
  "SCHEDULER_DRIVER",
  "RANK_CHECK_SCHEDULER_MODE",
  "BISIBILITY_CLIENT_IP_HEADER",
  "EMAIL_PROVIDER",
  "no_provider_connected",
  "credentials_unavailable",
  "rate_limited",
  "provider_failed",
  "deferred",
  "budget_exhausted",
  "Manual checks work without Temporal",
  "EmailBudgetExceededError",
  "resolved scheduler configuration is invalid",
  "alone does not fail readiness",
  "Only when no connection succeeds",
];

const REQUIRED_LINKS = [
  "/self-hosting/upgrades#failure-paths",
  "/self-hosting/backup-restore",
  "/self-hosting/security#health-endpoint-exposure",
  "/self-hosting/security#oauth-and-public-origins",
  "/self-hosting/configuration#required-environment-variables",
  "/integrations",
  "/self-hosting/temporal#worker-startup-troubleshooting",
  "/self-hosting/temporal#scheduled-rank-checks",
  "/self-hosting/security#trusted-client-ip",
  "/self-hosting/email",
];

export function checkTroubleshootingContract(docsRoot) {
  const failures = [];
  const pagePath = join(docsRoot, TROUBLESHOOTING_PAGE);
  if (!existsSync(pagePath)) {
    failures.push(`docs/${TROUBLESHOOTING_PAGE} is missing.`);
    return failures;
  }
  const source = readFileSync(pagePath, "utf8");
  failures.push(...checkTroubleshootingContent(source));
  return failures;
}

export function checkTroubleshootingContent(source) {
  const failures = [];

  const opening = source.slice(0, 600);
  if (!opening.includes("[Production checklist](/self-hosting#production-checklist)")) {
    failures.push("troubleshooting.mdx must link to the production checklist at the top.");
  }

  for (const heading of RUNBOOK_HEADINGS) {
    if (!source.includes(heading)) {
      failures.push(`troubleshooting.mdx is missing heading: ${heading}`);
    }
  }

  for (const term of REQUIRED_TERMS) {
    if (!source.includes(term)) {
      failures.push(`troubleshooting.mdx is missing required coverage: ${term}`);
    }
  }

  for (const link of REQUIRED_LINKS) {
    if (!source.includes(link)) {
      failures.push(`troubleshooting.mdx is missing canonical link: ${link}`);
    }
  }

  const lines = source.split("\n");
  const livenessLine = lines.find((l) => l.includes("`/api/v1/liveness`")) ?? "";
  const readinessLine = lines.find((l) => l.includes("`/api/v1/readiness`")) ?? "";

  if (!livenessLine) {
    failures.push("troubleshooting.mdx must mention `/api/v1/liveness`.");
  } else if (!livenessLine.includes("Process/restart probe")) {
    failures.push("troubleshooting.mdx must define `/api/v1/liveness` as the process/restart probe on its line.");
  }
  if (livenessLine.includes("Traffic admission")) {
    failures.push("troubleshooting.mdx must not swap liveness/readiness roles.");
  }

  if (!readinessLine) {
    failures.push("troubleshooting.mdx must mention `/api/v1/readiness`.");
  } else if (!readinessLine.includes("Traffic admission")) {
    failures.push("troubleshooting.mdx must define `/api/v1/readiness` as the traffic-admission probe on its line.");
  }
  if (readinessLine.includes("Process/restart probe")) {
    failures.push("troubleshooting.mdx must not swap liveness/readiness roles.");
  }

  if (!readinessLine.includes("scheduler configuration")) {
    failures.push(
      "troubleshooting.mdx readiness probe must name scheduler configuration as a 503 cause.",
    );
  }

  if (source.includes("| Symptom | Check | Resolution |")) {
    failures.push("troubleshooting.mdx must not contain the Docker symptom table.");
  }

  return failures;
}

export function checkTroubleshootingHandoffs(selfHostingPages, docsRoot) {
  const failures = [];

  const docker = selfHostingPages.get("self-hosting/docker.mdx") ?? "";
  if (!docker) {
    failures.push("self-hosting/docker.mdx is missing.");
  } else {
    if (!docker.includes("### Verify and troubleshoot startup")) {
      failures.push("docker.mdx must preserve the ### Verify and troubleshoot startup heading.");
    }
    if (!docker.includes("ps --all")) {
      failures.push("docker.mdx must retain the ps --all command.");
    }
    if (!docker.includes("logs --no-color")) {
      failures.push("docker.mdx must retain the scoped logs command.");
    }
    if (!docker.includes("/api/v1/liveness")) {
      failures.push("docker.mdx must retain the liveness command.");
    }
    if (!docker.includes("/api/v1/readiness")) {
      failures.push("docker.mdx must retain the readiness command.");
    }
    if (docker.includes("| Symptom | Check | Resolution |")) {
      failures.push("docker.mdx must not contain the duplicated symptom table (moved to troubleshooting).");
    }
    if (!docker.includes("/self-hosting/troubleshooting")) {
      failures.push("docker.mdx must link to the canonical troubleshooting page.");
    }
  }

  const temporal = selfHostingPages.get("self-hosting/temporal.mdx") ?? "";
  if (!temporal) {
    failures.push("self-hosting/temporal.mdx is missing.");
  } else {
    if (!temporal.includes("### Worker startup troubleshooting")) {
      failures.push("temporal.mdx must preserve the ### Worker startup troubleshooting heading.");
    }
    if (!temporal.includes("/self-hosting/troubleshooting#worker-restart-loops")) {
      failures.push("temporal.mdx must link to the canonical worker-restart-loops section.");
    }
  }

  const email = selfHostingPages.get("self-hosting/email.mdx") ?? "";
  if (!email) {
    failures.push("self-hosting/email.mdx is missing.");
  } else if (!email.includes("/self-hosting/troubleshooting#email-failures")) {
    failures.push("email.mdx must link to the canonical email-failures section.");
  }

  const hub = selfHostingPages.get("self-hosting.mdx") ?? "";
  if (!hub) {
    failures.push("self-hosting.mdx is missing.");
  } else if (!hub.includes("/self-hosting/troubleshooting")) {
    failures.push("self-hosting.mdx must link to the canonical troubleshooting page.");
  }

  const guidePath = join(docsRoot, "guides/operations.mdx");
  if (existsSync(guidePath)) {
    const guide = readFileSync(guidePath, "utf8");
    if (!guide.includes("/self-hosting/troubleshooting")) {
      failures.push("guides/operations.mdx must link to the canonical troubleshooting page.");
    }
  }

  return failures;
}

export function runTroubleshootingNegativeProof(docsRoot) {
  const pagePath = join(docsRoot, TROUBLESHOOTING_PAGE);
  if (!existsSync(pagePath)) {
    return ["troubleshooting negative proof skipped: page is missing (reported elsewhere)."];
  }
  const original = readFileSync(pagePath, "utf8");
  const failures = [];

  const roleSwap = original
    .replace(
      "| Liveness | `/api/v1/liveness` | Process/restart probe",
      "| Liveness | `/api/v1/liveness` | Traffic admission probe",
    )
    .replace(
      "| Readiness | `/api/v1/readiness` | Traffic admission",
      "| Readiness | `/api/v1/readiness` | Process/restart probe",
    );
  const swapFailures = checkTroubleshootingContent(roleSwap);
  if (swapFailures.length === 0) {
    failures.push(
      "troubleshooting negative proof failed: a liveness/readiness role swap did not produce a failure.",
    );
  }

  const missingSchedules = original.replace(
    "Manual checks work without Temporal. Scheduled checks need both the worker\nand Temporal:",
    "Scheduled checks need both the worker and Temporal:",
  );
  const scheduleFailures = checkTroubleshootingContent(missingSchedules);
  if (scheduleFailures.length === 0) {
    failures.push(
      "troubleshooting negative proof failed: removing the schedules-without-Temporal rule did not produce a failure.",
    );
  }

  const missingSchedulerReady = original
    .replace("or scheduler configuration is not ready |", "are not ready |")
    .replace("resolved scheduler configuration is invalid", "resolved scheduler configuration is valid")
    .replace("alone does not fail readiness", "alone is fine for readiness");
  const schedulerFailures = checkTroubleshootingContent(missingSchedulerReady);
  if (schedulerFailures.length === 0) {
    failures.push(
      "troubleshooting negative proof failed: removing the scheduler-configuration readiness condition did not produce a failure.",
    );
  }

  const corruptedFallback = original.replace(
    "Only when no connection succeeds",
    "When one provider fails for a non-throttle reason",
  );
  const fallbackFailures = checkTroubleshootingContent(corruptedFallback);
  if (fallbackFailures.length === 0) {
    failures.push(
      "troubleshooting negative proof failed: reverting the fallback no-success condition did not produce a failure.",
    );
  }

  return failures;
}
