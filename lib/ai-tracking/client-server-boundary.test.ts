import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findClientServerLeaks,
  findClientServerLeaksFromFiles,
  trackedUseClientFiles,
} from "./client-server-boundary";

const root = process.cwd();
const scratch: string[] = [];

const GUARD_DIRECTORIES = [
  "components/ai-tracking",
  "components/pages",
  "components/annotations",
  "components/charts",
  "components/settings/tags",
];

afterEach(() => {
  for (const directory of scratch.splice(0)) rmSync(directory, { force: true, recursive: true });
});

describe("client server boundary", () => {
  it("keeps server-only modules out of the challenge client trees", () => {
    expect(trackedUseClientFiles(root, ["components/ai-tracking"]).length).toBeGreaterThan(0);
    const leaks = findClientServerLeaks(root, GUARD_DIRECTORIES);
    expect(leaks, leaks.join("\n")).toEqual([]);
  }, 30_000);

  it("reports the import trace when a client module reaches server-only code", () => {
    const directory = tempDir();
    writeModule(directory, "prices.ts", `import "server-only";\nexport const price = 1;\n`);
    writeModule(
      directory,
      "middle.ts",
      `import { price } from "./prices";\nexport const value = price;\n`,
    );
    const client = writeModule(
      directory,
      "ui/panel.tsx",
      `"use client";\nimport { value } from "../middle";\nexport const Panel = () => value;\n`,
    );
    expect(findClientServerLeaksFromFiles(directory, [client])).toEqual([
      "ui/panel.tsx -> middle.ts -> prices.ts -> server-only",
    ]);
  });

  it("ignores type-only imports and stops at a server action boundary", () => {
    const directory = tempDir();
    writeModule(directory, "prices.ts", `import "server-only";\nexport const price = 1;\n`);
    writeModule(
      directory,
      "action.ts",
      `"use server";\nimport { prisma } from "@/lib/db/prisma";\nimport { cookies } from "next/headers";\nexport async function load() { return prisma ?? cookies; }\n`,
    );
    const typed = writeModule(
      directory,
      "ui/typed.tsx",
      `"use client";\nimport type { price } from "../prices";\nexport const Typed = () => price;\n`,
    );
    const actionClient = writeModule(
      directory,
      "ui/action.tsx",
      `"use client";\nimport { load } from "../action";\nexport const ActionPanel = () => load;\n`,
    );
    expect(findClientServerLeaksFromFiles(directory, [typed, actionClient])).toEqual([]);
  });

  it("flags next/headers, next/cache, and the database client", () => {
    const directory = tempDir();
    writeModule(directory, "lib/db/prisma.ts", `export const prisma = {};\n`);
    const headers = writeModule(
      directory,
      "ui/headers.tsx",
      `"use client";\nimport { cookies } from "next/headers";\nexport const HeadersPanel = () => cookies;\n`,
    );
    const cache = writeModule(
      directory,
      "ui/cache.tsx",
      `"use client";\nimport { revalidatePath } from "next/cache";\nexport const CachePanel = () => revalidatePath;\n`,
    );
    const database = writeModule(
      directory,
      "ui/database.tsx",
      `"use client";\nimport { prisma } from "../lib/db/prisma";\nexport const DatabasePanel = () => prisma;\n`,
    );
    expect(findClientServerLeaksFromFiles(directory, [headers, cache, database])).toEqual([
      "ui/cache.tsx -> next/cache",
      "ui/database.tsx -> lib/db/prisma.ts",
      "ui/headers.tsx -> next/headers",
    ]);
  });
});

function tempDir() {
  const directory = mkdtempSync(path.join(tmpdir(), "client-boundary-"));
  scratch.push(directory);
  return directory;
}

function writeModule(directory: string, name: string, source: string) {
  const fileName = path.join(directory, name);
  mkdirSync(path.dirname(fileName), { recursive: true });
  writeFileSync(fileName, source);
  return fileName;
}
