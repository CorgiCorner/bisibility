#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function value(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return args[index + 1];
}

function optionalValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return args[index + 1];
}

function replace(contents, name, replacement) {
  const prefix = `${name}=`;
  const lines = contents.split("\n");
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index < 0) throw new Error(`Environment template is missing ${name}.`);
  lines[index] = `${prefix}${replacement}`;
  return lines.join("\n");
}

function run() {
  const args = process.argv.slice(2);
  const siteUrl = new URL(value(args, "--site-url"));
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(siteUrl.hostname);
  if (siteUrl.protocol !== "https:" && !(siteUrl.protocol === "http:" && isLoopback)) {
    throw new Error("--site-url must use HTTPS, except for a loopback-only install.");
  }
  if (siteUrl.pathname !== "/" || siteUrl.search || siteUrl.hash) {
    throw new Error("--site-url must be an origin without a path, query, or fragment.");
  }

  const output = path.resolve(optionalValue(args, "--output", ".env"));
  if (existsSync(output)) throw new Error(`Refusing to overwrite ${output}.`);
  const candidates = [
    optionalValue(args, "--template", ""),
    path.resolve("bisibility.env.example"),
    path.resolve(".env.example"),
  ].filter(Boolean);
  const template = candidates.find(existsSync);
  if (!template) throw new Error("Could not find bisibility.env.example or .env.example.");

  let contents = readFileSync(template, "utf8");
  const origin = siteUrl.origin;
  contents = replace(contents, "POSTGRES_PASSWORD", randomBytes(24).toString("hex"));
  contents = replace(contents, "BETTER_AUTH_SECRET", randomBytes(32).toString("base64"));
  contents = replace(contents, "BISIBILITY_SECRETS_KEY", randomBytes(32).toString("base64"));
  contents = replace(contents, "SITE_URL", origin);
  contents = replace(contents, "BETTER_AUTH_URL", origin);
  contents = replace(contents, "DEPLOYMENT_ENV", "production");
  writeFileSync(output, contents, { flag: "wx", mode: 0o600 });
  console.log(`Created ${output} with production defaults and unique secrets.`);
}

try {
  run();
} catch (error) {
  console.error(`Self-host environment generation failed: ${error.message}`);
  process.exitCode = 1;
}
