import fs from "node:fs";
import path from "node:path";
import ts from "@typescript/typescript6";
import { describe, expect, it } from "vitest";

function repositoryRuntimeImports(entry: string) {
  const found = new Set<string>();
  const visited = new Set<string>();
  function visit(relative: string) {
    const absolute = path.resolve(process.cwd(), relative);
    if (visited.has(absolute)) return;
    visited.add(absolute);
    const source = ts.createSourceFile(
      absolute,
      fs.readFileSync(absolute, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    // Next compiles Server Actions into references, not client runtime modules.
    if (
      source.statements.some(
        (statement) =>
          ts.isExpressionStatement(statement) &&
          ts.isStringLiteral(statement.expression) &&
          statement.expression.text === "use server",
      )
    )
      return;
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      if (
        (ts.isExportDeclaration(statement) && statement.isTypeOnly) ||
        (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly)
      )
        continue;
      const clause = ts.isImportDeclaration(statement) ? statement.importClause : null;
      if (
        clause &&
        !clause.name &&
        clause.namedBindings &&
        ts.isNamedImports(clause.namedBindings) &&
        clause.namedBindings.elements.every((element) => element.isTypeOnly)
      )
        continue;
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier)) continue;
      const name = specifier.text;
      if (!name.startsWith("@/") && !name.startsWith(".")) {
        found.add(name);
        continue;
      }
      const target = name.startsWith("@/")
        ? path.resolve(process.cwd(), name.slice(2))
        : path.resolve(path.dirname(absolute), name);
      const resolved = [
        target,
        `${target}.ts`,
        `${target}.tsx`,
        path.join(target, "index.ts"),
      ].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (!resolved) throw new Error(`Unresolved repository input import: ${name}`);
      visit(resolved);
    }
  }
  visit(entry);
  return [...found].sort();
}

describe("monitor client input graph", () => {
  it("keeps the actual form validation graph free of server-only and Node modules", () => {
    const dependencies = repositoryRuntimeImports("lib/local-monitors/form-model.ts");
    expect(dependencies).not.toContain("server-only");
    expect(dependencies.filter((name) => name.startsWith("node:"))).toEqual([]);
  });
  it("detects the real server execution schema path that previously reached hashing", () => {
    expect(repositoryRuntimeImports("lib/local-monitoring-store/schema.ts")).toContain(
      "node:crypto",
    );
  });
  it.each([
    "components/local-monitors/MonitorForm.tsx",
    "components/local-monitors/MonitorManualLaunch.tsx",
    "components/local-monitors/MonitorRecurringSchedule.tsx",
    "components/local-monitors/MonitorDetail.tsx",
  ])("keeps the actual %s client graph free of Node modules", (entry) => {
    const dependencies = repositoryRuntimeImports(entry);
    expect(dependencies).not.toContain("server-only");
    expect(dependencies.filter((name) => name.startsWith("node:"))).toEqual([]);
  });
});
