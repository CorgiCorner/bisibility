import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const recoveryRoot = resolve(root, "lib/provider-evidence/recovery");
const forbidden =
  /lib\/(?:metering\/(?:recovery\/execute|paid-dispatch|admission|settlement)|provider-usage\/(?:reconcile-gates)|private-adapters\/metering-coordinator\/admin-recovery|providers\/serp\/dataforseo-payload|rank-check\/queued-submit)(?:\.|\/|$)/;
it("INV-1 INV-6 recovery import graph cannot reach paid replay, dispatch, broad settlement, cost defaulting or gate reconciliation", () => {
  const seen = new Set<string>();
  function walk(file: string) {
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    expect(file.replace(`${root}/`, "")).not.toMatch(forbidden);
    const source = readFileSync(file, "utf8");
    const runtimeSource = source.replace(/(?:import|export)\s+type\s+[^;]+;/g, "");
    for (const match of runtimeSource.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)) {
      const name = match[1];
      if (!name.startsWith("@/") && !name.startsWith(".")) continue;
      const path = name.startsWith("@/")
        ? resolve(root, name.slice(2))
        : resolve(dirname(file), name);
      const target = [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`].find(
        (candidate) => existsSync(candidate) && /\.[cm]?[jt]sx?$/.test(candidate),
      );
      if (target && !target.includes("/generated/")) walk(target);
    }
  }
  for (const name of readdirSync(recoveryRoot)) {
    if (name.endsWith(".ts") && !name.includes(".test") && !name.includes(".postgres"))
      walk(resolve(recoveryRoot, name));
  }
  expect(seen.size).toBeGreaterThan(10);
});
