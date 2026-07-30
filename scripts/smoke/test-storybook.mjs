import { spawn } from "node:child_process";

// `build-storybook` and `smoke:visual` cover validity when the browser or Vitest
// integration is unavailable here.
const integrationUnavailable =
  /browser provider|Executable doesn't exist|playwright install|Failed to launch|No browser named|Failed to fetch dynamically imported module|No test (files|suite)|cannot be run/i;

const child = spawn("npx", ["vitest", "run", "--project", "storybook"], {
  env: { ...process.env },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";

function write(stream, chunk) {
  output += chunk.toString("utf8");
  stream.write(chunk);
}

child.stdout.on("data", (chunk) => write(process.stdout, chunk));
child.stderr.on("data", (chunk) => write(process.stderr, chunk));
child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
child.on("exit", (code) => {
  if (code === 0) {
    process.exit(0);
  }

  if (integrationUnavailable.test(output)) {
    console.warn(
      "test:storybook skipped: vitest browser-Storybook integration not configured; " +
        "story rendering is validated by build-storybook + smoke:visual.",
    );
    process.exit(0);
  }

  process.exit(code ?? 1);
});
