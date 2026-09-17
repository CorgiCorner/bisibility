import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const productionRoots = ["app", "components", "lib"];
const sourceExtensions = /\.(ts|tsx)$/;
const excluded = /\.(test|stories)\.(ts|tsx)$/;

function productionSources(directory: string): string[] {
  const absolute = join(root, directory);
  return readdirSync(absolute).flatMap((name) => {
    const path = join(absolute, name);
    if (statSync(path).isDirectory()) return productionSources(relative(root, path));
    return sourceExtensions.test(path) && !excluded.test(path) ? [path] : [];
  });
}

function showToastWithoutExplicitSeverity(source: string): boolean {
  let searchFrom = 0;
  while (searchFrom < source.length) {
    const nameStart = source.indexOf("showToast", searchFrom);
    if (nameStart < 0) return false;
    let open = nameStart + "showToast".length;
    while (/\s/.test(source[open] ?? "")) open += 1;
    if (source[open] !== "(") {
      searchFrom = open;
      continue;
    }
    let depth = 0;
    let quote: '"' | "'" | "`" | null = null;
    let close = -1;
    for (let index = open; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (character === "\\") {
          index += 1;
        } else if (character === quote) {
          quote = null;
        }
        continue;
      }
      if (character === '"' || character === "'" || character === "`") {
        quote = character;
      } else if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          close = index;
          break;
        }
      }
    }
    if (close < 0) return true;
    const argumentsSource = source.slice(open + 1, close);
    if (!/,[\s\S]*?\bseverity\s*:/.test(argumentsSource)) return true;
    searchFrom = close + 1;
  }
  return false;
}

describe("toast API contract", () => {
  const sources = productionRoots.flatMap(productionSources);

  it("does not expose icon or tint in ToastOptions", () => {
    const source = readFileSync(join(root, "components/ui/toast-context.ts"), "utf8");
    const options = source.match(/export type ToastOptions = \{([\s\S]*?)\n\};/)?.[1] ?? "";
    expect(options).not.toMatch(/\b(icon|tint)\??\s*:/);
    expect(options).toMatch(/severity\?: ToastSeverity/);
  });

  it("rejects caller-selected toast icon and tint options", () => {
    const violations = sources.flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return /showToast\s*\([\s\S]{0,500}?\{[\s\S]{0,220}?\b(icon|tint)\s*:/.test(source)
        ? [relative(root, path)]
        : [];
    });
    expect(violations).toEqual([]);
  });

  it("requires explicit severity at every production invocation", () => {
    const violations = sources.flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return showToastWithoutExplicitSeverity(source) ? [relative(root, path)] : [];
    });
    expect(violations).toEqual([]);
  });

  it("keeps canonical toast glyph imports inside the resolver", () => {
    const glyphs =
      /\b(CheckCircleIcon|XCircleIcon|WarningIcon|InfoIcon|PlugsIcon|CircleNotchIcon)\b/;
    const violations = sources.flatMap((path) => {
      if (path.endsWith("components/ui/toast-presentation.tsx")) return [];
      const source = readFileSync(path, "utf8");
      return source.includes("showToast") && glyphs.test(source) ? [relative(root, path)] : [];
    });
    expect(violations).toEqual([]);
  });
});
