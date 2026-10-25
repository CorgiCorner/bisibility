import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "@typescript/typescript6";
import { expect, it, vi } from "vitest";
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));

function localModule(from: string, specifier: string) {
  const candidate = specifier.startsWith("@/")
    ? resolve(specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : null;
  return (
    candidate &&
    [candidate, `${candidate}.ts`, `${candidate}.tsx`, `${candidate}/index.ts`].find(
      (path) => existsSync(path) && /\.[cm]?[jt]sx?$/.test(path),
    )
  );
}
function importGraph(roots: string[]) {
  const seen = new Set<string>(),
    queue = roots.map((path) => resolve(path));
  while (queue.length) {
    const file = queue.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node: ts.Node) {
      let specifier: ts.Expression | undefined;
      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly)
        specifier = node.moduleSpecifier;
      if (ts.isExportDeclaration(node) && !node.isTypeOnly) specifier = node.moduleSpecifier;
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
        specifier = node.arguments[0];
      if (specifier && ts.isStringLiteral(specifier)) {
        const dependency = localModule(file!, specifier.text);
        if (dependency) queue.push(dependency);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return [...seen];
}
it("WD-9 digest transitive imports stay separate from operator recovery notices and financial recovery execution", () => {
  const roots = readdirSync("lib/reports")
    .filter(
      (name) =>
        name.startsWith("weekly-digest-") && name.endsWith(".ts") && !name.includes(".test."),
    )
    .map((name) => `lib/reports/${name}`);
  const graph = importGraph([...roots, "lib/temporal/weekly-digest-activity.ts"]);
  expect(graph.length).toBeGreaterThan(10);
  expect(
    graph.filter((path) =>
      /provider-usage\/(recovery-notification-policy|recovery-notice)|metering\/recovery\/execute\./.test(
        path,
      ),
    ),
  ).toEqual([]);
  for (const file of graph)
    expect(readFileSync(file, "utf8")).not.toMatch(
      /\b(dataForSeoResponseCostCents|retainIncompleteAttemptMetering|reconcileSpendingGates|planRecoveryNotice)\b/,
    );
});
