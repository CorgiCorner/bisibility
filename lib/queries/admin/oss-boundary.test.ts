import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "@typescript/typescript6";
import { expect, it } from "vitest";
import permitted from "./oss-dependencies.test-fixture.json";

const root = path.resolve(".");
const surface: Record<string, string[]> = permitted;
// Pin the complete reader graph. Auth, database, deployment and transport infrastructure
// are trusted seams. Only Tasks may enter the existing task recovery service; its
// accounting state is part of recovery, not an operational dashboard dependency.
const forbidden =
  /(?:provider-spend-usage|provider-usage\/connection-usage|provider-evidence\/projection\/(?:read|model)|heartbeat-evidence|heartbeat-data|instance-admin-operations|queries\/instance-admin(?:-administration)?$|instance-usage|instance-recovery-accounting|usage-read|usage-report|cost|growth|consumption|announcement|private-adapters|components\/private)/i;

function dependencies(file: string, source: string) {
  const found: { module: string; runtime: boolean }[] = [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function add(value: string, runtime = true) {
    const base = value.startsWith("@/")
      ? value.slice(2)
      : value.startsWith(".")
        ? path.relative(root, path.resolve(root, path.dirname(file), value))
        : value;
    found.push({ module: base.replace(/\.(ts|tsx)$/, ""), runtime });
  }
  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
      const typeOnly = ts.isExportDeclaration(node)
        ? node.isTypeOnly
        : clause?.isTypeOnly ||
          (clause?.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            !clause.name &&
            clause.namedBindings.elements.every((e) => e.isTypeOnly));
      add(node.moduleSpecifier.text, !typeOnly);
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    )
      add(node.arguments[0].text);
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    )
      add(node.argument.literal.text, false);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return found;
}
function violations(file: string, source: string) {
  const allowed = (surface[file] ?? []).map((v) => v.replace(/\.(ts|tsx)$/, ""));
  return dependencies(file, source)
    .filter((dep) => {
      // heartbeat-data supplies neutral types only; a runtime edge is forbidden.
      if (!dep.runtime && dep.module === "lib/ops/heartbeat-data") return false;
      if (forbidden.test(dep.module)) return true;
      if (!dep.runtime || !dep.module.startsWith("lib/")) return false;
      return !allowed.includes(dep.module);
    })
    .map((dep) => dep.module);
}
it("pins every OSS builder and transitive reader dependency before it can gain a business query", () => {
  const builders = readdirSync(path.join(root, "lib/queries/admin")).filter(
    (file) => file.startsWith("oss-") && file.endsWith(".ts") && !file.includes(".test"),
  );
  for (const file of builders) expect(surface).toHaveProperty(`lib/queries/admin/${file}`);
  for (const file of Object.keys(surface))
    expect(violations(file, readFileSync(path.join(root, file), "utf8")), file).toEqual([]);
});
it.each([
  'import { getInstanceAdminDashboard } from "../instance-admin";',
  'export { x } from "@/lib/queries/instance-usage-report";',
  'const load = import("@/lib/queries/instance-recovery-accounting");',
  'const load = require("@/lib/queries/instance-admin-administration");',
  'type X = import("@/lib/metering/usage-read").X;',
  'import { x } from "@/lib/queries/top-consumption";',
  'import { x } from "@/lib/queries/growth";',
  'import { x } from "@/lib/queries/announcement";',
  'import { x } from "@/lib/queries/provider-cost";',
  'import { providerCostBySource } from "@/lib/queries/provider-spend-usage";',
  'import { aggregateConnectionUsage } from "@/lib/provider-usage/connection-usage";',
  'import { x } from "@/lib/queries/new-business-reader";',
])("rejects an unapproved reader: %s", (source) => {
  expect(violations("lib/queries/admin/oss-operations.ts", source)).not.toEqual([]);
});
it("rejects the evidence query reached transitively through heartbeat collection", () => {
  const file = "lib/ops/heartbeat-rank-operational.ts";
  const source = readFileSync(path.join(root, file), "utf8");
  expect(
    violations(
      file,
      `${source}\nimport { readHeartbeatEvidence } from './heartbeat-evidence-read';`,
    ),
  ).toContain("lib/ops/heartbeat-evidence-read");
  expect(
    violations(
      file,
      `${source}\nimport { readCheckEvidence } from '@/lib/provider-evidence/projection/read';`,
    ),
  ).toContain("lib/provider-evidence/projection/read");
});
it("permits recovery service only on the documented Tasks dependency edge", () => {
  const source = 'import { getRecoveryPage } from "@/lib/metering/recovery/service";';
  expect(violations("lib/queries/admin/oss-tasks.ts", source)).toEqual([]);
  expect(violations("lib/queries/admin/oss-operations.ts", source)).not.toEqual([]);
});
