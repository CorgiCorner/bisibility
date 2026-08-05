import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { schedulerDriver } from "../../lib/scheduler/driver";
import { temporalConnectionOptions } from "../../lib/temporal/connection-options";
import { temporalDeploymentConfig } from "../../lib/temporal/deployment-config";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const composeEnv = {
  ...process.env,
  BETTER_AUTH_SECRET: "test-auth-secret",
  BETTER_AUTH_URL: "https://example.com",
  BISIBILITY_DEPLOYMENT_SUFFIX: "a1b2c3d4",
  BISIBILITY_SECRETS_KEY: "test-secrets-key",
  DATABASE_URL: "postgresql://bisibility:test@postgres:5432/bisibility",
  DIRECT_URL: "postgresql://bisibility:test@postgres:5432/bisibility",
  POSTGRES_PASSWORD: "test",
  SITE_URL: "https://example.com",
  TEMPORAL_POSTGRES_PASSWORD: "temporal-test",
};

type ComposeConfig = {
  services: Record<string, { environment?: Record<string, string> }>;
};

function renderCompose(
  files: string[],
  profiles: string[] = [],
  environment: Record<string, string> = {},
) {
  const args = [
    "compose",
    ...profiles.flatMap((profile) => ["--profile", profile]),
    ...files.flatMap((file) => ["-f", file]),
    "config",
  ];
  const result = spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...composeEnv, ...environment },
  });

  expect(result.error, result.error?.message).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  return parse(result.stdout) as ComposeConfig;
}

describe("scheduler driver Compose compatibility matrix", () => {
  it("keeps old core Compose in internal legacy compatibility mode", () => {
    const config = renderCompose(["docker-compose.yml"]);

    expect(schedulerDriver(config.services.app?.environment)).toBe("legacy-auto");
  });

  it("keeps the old scheduled profile in internal legacy compatibility mode", () => {
    const config = renderCompose(["docker-compose.yml"], ["scheduled"]);

    expect(config.services.worker).toBeDefined();
    expect(schedulerDriver(config.services.worker?.environment)).toBe("legacy-auto");
  });

  it("preserves plaintext external Temporal when an old install has no API key", () => {
    const options = temporalConnectionOptions({
      TEMPORAL_ADDRESS: "temporal.internal.example.com:7233",
    });

    expect(options).toEqual({
      address: "temporal.internal.example.com:7233",
      tlsSource: "auto-no-api-key",
    });
  });

  it("sets the driver explicitly in every new topology", () => {
    const core = renderCompose(["compose.yaml"]);
    const scheduled = renderCompose(["compose.yaml", "compose.worker.yaml"]);

    expect(schedulerDriver(core.services.app?.environment)).toBe("none");
    expect(schedulerDriver(scheduled.services.app?.environment)).toBe("temporal");
    expect(schedulerDriver(scheduled.services.worker?.environment)).toBe("temporal");
    expect(temporalDeploymentConfig(scheduled.services.app?.environment)).toEqual({
      alertDeliveryTaskQueue: "bisibility-alert-deliveries-a1b2c3d4",
      deploymentSuffix: "a1b2c3d4",
      namespace: "bisibility-a1b2c3d4",
      taskQueue: "bisibility-rank-checks-a1b2c3d4",
    });
    expect(temporalDeploymentConfig(scheduled.services.worker?.environment)).toEqual(
      temporalDeploymentConfig(scheduled.services.app?.environment),
    );
  });

  it("accepts every explicit Temporal identifier without a deployment suffix", () => {
    const config = renderCompose(["compose.yaml", "compose.worker.yaml"], [], {
      BISIBILITY_DEPLOYMENT_SUFFIX: "",
      TEMPORAL_ADDRESS: "temporal.internal.example.com:7233",
      TEMPORAL_ALERT_DELIVERY_TASK_QUEUE: "explicit-alert-deliveries",
      TEMPORAL_NAMESPACE: "explicit-namespace",
      TEMPORAL_TASK_QUEUE: "explicit-rank-checks",
    });

    expect(config.services.worker?.environment).toMatchObject({
      BISIBILITY_DEPLOYMENT_SUFFIX: "",
      TEMPORAL_ALERT_DELIVERY_TASK_QUEUE: "explicit-alert-deliveries",
      TEMPORAL_NAMESPACE: "explicit-namespace",
      TEMPORAL_TASK_QUEUE: "explicit-rank-checks",
    });
  });
});

describe("Temporal namespace retention ownership", () => {
  it("keeps retention mutation inside the bundled Temporal overlay", () => {
    const workerOverlay = readFileSync(resolve(root, "compose.worker.yaml"), "utf8");
    const temporalOverlay = readFileSync(resolve(root, "compose.temporal.yaml"), "utf8");
    const temporalRuntime = readFileSync(resolve(root, "lib/temporal/worker.ts"), "utf8");

    expect(workerOverlay).not.toContain("BISIBILITY_DEPLOYMENT_SUFFIX:?");
    expect(workerOverlay).not.toContain("TEMPORAL_NAMESPACE_RETENTION");
    expect(temporalRuntime).not.toContain("TEMPORAL_NAMESPACE_RETENTION");
    expect(temporalOverlay).toContain(
      "TEMPORAL_NAMESPACE_RETENTION: ${TEMPORAL_NAMESPACE_RETENTION:-24h}",
    );
    expect(temporalOverlay).toContain("temporal operator namespace update");
    expect(temporalOverlay).toContain("temporal operator search-attribute create");
    for (const attribute of ["keywordId", "projectId", "provider"]) {
      expect(temporalOverlay).toContain(attribute);
    }
    expect(temporalOverlay).not.toContain('user: "0:0"');
    expect(temporalOverlay).not.toContain("temporal-dynamic-config:");
    expect(temporalOverlay).toContain("/tmp/temporal-dynamic/docker.yaml");
    expect(temporalOverlay).toContain("TEMPORAL_POSTGRES_PASSWORD");
  });
});
