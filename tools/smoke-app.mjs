import { spawn } from "node:child_process";
import { access } from "node:fs/promises";

const port = Number(process.env.SMOKE_APP_PORT ?? 3100);
const url = `http://127.0.0.1:${port}/`;

async function hasBuild() {
  try {
    await access(".next/BUILD_ID");
    return true;
  } catch {
    return false;
  }
}

async function waitForOk(deadline) {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`GET ${url} did not return 200`);
}

// `release:check` runs this before build; use dev without a build, otherwise start,
// then require the public homepage to respond.
const command = (await hasBuild())
  ? ["run", "start", "--", "-p", String(port)]
  : ["run", "dev", "--", "-p", String(port)];
const server = spawn("npm", command, {
  stdio: "ignore",
  env: { ...process.env, PORT: String(port) },
});

try {
  await waitForOk(Date.now() + 60_000);
  console.log(`GET ${url} 200`);
} finally {
  server.kill("SIGTERM");
}
