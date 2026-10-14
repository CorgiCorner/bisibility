import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  fixture = process.env.SOURCE_FIXTURE_ROOT ?? root;
function locate(relative: string) {
  return [path.join(root, relative), path.join(fixture, relative)]
    .flatMap((base) => [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")])
    .find(existsSync);
}
describe("client scope validation graph", () => {
  it("keeps scope, saved-view validation and navigation free of server and crypto modules", () => {
    const pending = [
        "lib/keywords/rank-tracker-report-scope.ts",
        "lib/keywords/rank-tracker-as-of-input.ts",
        "lib/keywords/saved-view-v2-model.ts",
        "lib/keywords/rank-tracker-detail-navigation.ts",
      ],
      seen = new Set<string>();
    while (pending.length) {
      const relative = pending.pop();
      if (!relative || seen.has(relative)) continue;
      seen.add(relative);
      const file = locate(relative);
      if (!file) throw new Error(`Missing graph module ${relative}`);
      const text = readFileSync(file, "utf8");
      expect(text, relative).not.toMatch(
        /(?:from\s*|import\s*)["'](?:server-only|node:crypto|node:fs|next\/headers)["']/,
      );
      for (const match of text.matchAll(
        /(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s*["']([^"']+)["']/g,
      )) {
        const source = match[1];
        if (source.startsWith("@/")) pending.push(source.slice(2));
        else if (source.startsWith("."))
          pending.push(path.normalize(path.join(path.dirname(relative), source)));
      }
    }
    expect(seen.size).toBeGreaterThan(5);
  });
});
