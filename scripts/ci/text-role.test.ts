import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { UI_TYPE_ROLES } from "@/lib/ui/design-role-tokens";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const sourceRoots = ["app", "components", "lib"];
const rolePattern = /text-(ui-[a-z0-9]+(?:-[a-z0-9]+)*)/gu;
const allowed = new Set(Object.keys(UI_TYPE_ROLES));

function posixPath(filename: string) {
  return relative(root, filename).split(sep).join("/");
}

function sourceFiles(directory: string): string[] {
  const absolute = resolve(root, directory);
  const files: string[] = [];
  for (const entry of readdirSync(absolute)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const path = join(absolute, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...sourceFiles(posixPath(path)));
    else if (/\.(?:tsx?|css)$/u.test(entry) && !entry.endsWith(".d.ts")) files.push(path);
  }
  return files;
}

export function unknownTextRoles(source: string, file: string) {
  const findings: string[] = [];
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    for (const match of lines[index].matchAll(rolePattern)) {
      const name = match[1];
      if (!allowed.has(name)) findings.push(`${file}:${index + 1}: text-${name}`);
    }
  }
  return findings;
}

describe("text role contract", () => {
  it("uses only typography roles defined by the design tokens", () => {
    const findings: string[] = [];
    for (const directory of sourceRoots) {
      for (const filename of sourceFiles(directory)) {
        const source = readFileSync(filename, "utf8");
        findings.push(...unknownTextRoles(source, posixPath(filename)));
      }
    }
    expect(findings).toEqual([]);
  });

  it("rejects a class that is not a token key", () => {
    expect(unknownTextRoles('className="text-ui-xs text-ui-caption"', "fixture.tsx")).toEqual([
      "fixture.tsx:1: text-ui-xs",
    ]);
  });
});
