import { spawn } from "node:child_process";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the PostgreSQL public ID contract harness.");
}

const scripts = [
  ...(process.env.PUBLIC_ID_FRESH_DATABASE_URL ? ["scripts/smoke/public-id-contract-fresh.ts"] : []),
  ...(process.env.PUBLIC_ID_CONTRACT_DATABASE_URL
    ? ["scripts/smoke/public-id-contract-final.ts"]
    : []),
];
if (scripts.length === 0) {
  throw new Error("PUBLIC_ID_FRESH_DATABASE_URL or PUBLIC_ID_CONTRACT_DATABASE_URL is required.");
}

for (const script of scripts) {
  const child = spawn(
    process.execPath,
    ["--experimental-transform-types", "--import", "./lib/temporal/register-loader.mjs", script],
    { env: process.env, stdio: "inherit" },
  );
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  if (code !== 0) {
    process.exitCode = code;
    break;
  }
}
