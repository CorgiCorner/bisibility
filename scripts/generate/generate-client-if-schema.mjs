#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const requiredFiles = ["prisma.config.ts", "prisma/schema.prisma"];

if (!requiredFiles.every((path) => existsSync(path))) {
  console.log("[postinstall] skipped Prisma generation because the schema is not present");
  process.exit(0);
}

const prismaExecutable = process.platform === "win32" ? "prisma.cmd" : "prisma";
const result = spawnSync(prismaExecutable, ["generate"], { stdio: "inherit" });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
