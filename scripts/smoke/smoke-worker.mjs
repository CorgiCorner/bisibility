import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = fileURLToPath(import.meta.url);
const bundleChildEnv = "TEMPORAL_WORKER_BUNDLE_SMOKE_CHILD";
const workerModuleEnv = "TEMPORAL_WORKER_MODULE_URL";

const silentLogger = {
  debug() {},
  error() {},
  info() {},
  trace() {},
  warn() {},
};

function output(stdout, stderr) {
  return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n") || "(no output)";
}

function runNode(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stderr, stdout });
        return;
      }
      reject(new Error(`Child node exited with ${code ?? "unknown"}.\n${output(stdout, stderr)}`));
    });
  });
}

async function checkWorkerImportGraph() {
  console.log("worker import graph check...");
  try {
    await runNode(
      [
        "--experimental-transform-types",
        "--import",
        "./lib/temporal/register-loader.mjs",
        "--input-type=module",
        "--eval",
        `await import(process.env.${workerModuleEnv});`,
      ],
      {
        TEMPORAL_WORKER_SMOKE: "1",
        [workerModuleEnv]: pathToFileURL(path.join(root, "lib/temporal/worker.ts")).href,
      },
    );
  } catch (error) {
    throw new Error(`Worker import graph check failed.\n${error.message}`);
  }
  console.log("worker import graph check ok");
}

async function bundleWorkflows() {
  const { bundleWorkflowCode } = await import("@temporalio/worker");
  await bundleWorkflowCode({
    logger: silentLogger,
    workflowsPath: path.join(root, "lib/temporal/workflows.ts"),
  });
}

async function checkWorkflowBundle() {
  console.log("workflow bundle check...");
  try {
    await runNode([scriptPath], { [bundleChildEnv]: "1" });
  } catch (error) {
    throw new Error(`Workflow bundle check failed.\n${error.message}`);
  }
  console.log("workflow bundle check ok");
}

if (process.env[bundleChildEnv] === "1") {
  await bundleWorkflows();
} else {
  try {
    await checkWorkerImportGraph();
    await checkWorkflowBundle();
    console.log("worker smoke ok");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
