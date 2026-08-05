#!/usr/bin/env node
import { chmodSync, cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tempRoot = mkdtempSync(path.join(tmpdir(), "bisibility-quickstart-"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  mkdirSync(path.join(tempRoot, "scripts/dev"), { recursive: true });
  mkdirSync(path.join(tempRoot, "bin"), { recursive: true });
  cpSync(
    path.join(root, "scripts/dev/bootstrap-local.sh"),
    path.join(tempRoot, "scripts/dev/bootstrap-local.sh"),
  );
  cpSync(path.join(root, ".env.example"), path.join(tempRoot, ".env.example"));
  cpSync(path.join(root, "compose.yaml"), path.join(tempRoot, "compose.yaml"));

  const dockerArgsPath = path.join(tempRoot, "docker-args.txt");
  const fakeDocker = path.join(tempRoot, "bin/docker");
  writeFileSync(
    fakeDocker,
    '#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$BISIBILITY_DOCKER_ARGS_FILE"\n',
  );
  chmodSync(fakeDocker, 0o755);

  const result = spawnSync("bash", [path.join(tempRoot, "scripts/dev/bootstrap-local.sh")], {
    cwd: tempRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      BISIBILITY_DOCKER_ARGS_FILE: dockerArgsPath,
      PATH: `${path.join(tempRoot, "bin")}:${process.env.PATH ?? ""}`,
    },
  });
  assert(result.status === 0, result.stderr || result.stdout || "bootstrap exited non-zero");

  const environment = readFileSync(path.join(tempRoot, ".env"), "utf8");
  for (const required of [
    "POSTGRES_PASSWORD",
    "TEMPORAL_POSTGRES_PASSWORD",
    "BETTER_AUTH_SECRET",
    "BISIBILITY_SECRETS_KEY",
    "BISIBILITY_DEPLOYMENT_SUFFIX",
  ]) {
    assert(new RegExp(`^${required}=.+$`, "m").test(environment), `${required} is missing`);
  }
  assert(environment.includes("DEMO_FIXED_OTP=1\n"), "demo OTP is not enabled");
  assert(
    environment.includes("DEMO_INSTANCE_INSECURE_AUTH_ACK=1\n"),
    "demo acknowledgement is not enabled",
  );

  const dockerArgs = readFileSync(dockerArgsPath, "utf8").trim().split("\n");
  assert(dockerArgs.includes("--env-file"), "Docker Compose did not receive --env-file");
  assert(dockerArgs.includes("config"), "Docker Compose config was not validated");
  assert(dockerArgs.includes("--quiet"), "Docker Compose validation was not quiet");
  assert(result.stdout.includes("http://localhost:3000"), "App endpoint is missing from output");
  assert(
    result.stdout.includes("http://localhost:8233"),
    "Temporal UI endpoint is missing from output",
  );
  assert(result.stdout.includes("compose.worker.yaml"), "Worker overlay is missing from output");
  assert(result.stdout.includes("compose.temporal.yaml"), "Temporal overlay is missing from output");
  assert(result.stdout.includes("--profile temporal-ui"), "Temporal UI profile is missing from output");

  console.log("Public quickstart generates every required value and validates Docker Compose.");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
