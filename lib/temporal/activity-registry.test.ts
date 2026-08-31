import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as activities from "./activities";

const TEMPORAL_DIRECTORY = join(process.cwd(), "lib/temporal");

function workflowSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return workflowSourceFiles(path);
    return /workflow.*\.ts$/.test(entry.name) ? [path] : [];
  });
}

function proxyActivityNames(sourceText: string, fileName = "workflow.ts"): Set<string> {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const proxyFactories = new Set<string>();
  const proxyObjects = new Set<string>();
  const names = new Set<string>();

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "@temporalio/workflow"
    )
      continue;
    for (const element of statement.importClause?.namedBindings &&
    ts.isNamedImports(statement.importClause.namedBindings)
      ? statement.importClause.namedBindings.elements
      : []) {
      if ((element.propertyName ?? element.name).text === "proxyActivities") {
        proxyFactories.add(element.name.text);
      }
    }
  }

  function recordBinding(binding: ts.BindingName) {
    if (ts.isIdentifier(binding)) {
      proxyObjects.add(binding.text);
      return;
    }
    for (const element of binding.elements) {
      if (ts.isOmittedExpression(element)) continue;
      const property = element.propertyName ?? element.name;
      if (ts.isIdentifier(property) || ts.isStringLiteral(property)) names.add(property.text);
    }
  }

  function visitProxyCalls(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      proxyFactories.has(node.initializer.expression.text)
    ) {
      recordBinding(node.name);
    }
    ts.forEachChild(node, visitProxyCalls);
  }
  visitProxyCalls(source);

  function visitProxyUses(node: ts.Node) {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      proxyObjects.has(node.expression.text)
    ) {
      names.add(node.name.text);
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      proxyObjects.has(node.expression.text) &&
      node.argumentExpression &&
      ts.isStringLiteralLike(node.argumentExpression)
    ) {
      names.add(node.argumentExpression.text);
    }
    ts.forEachChild(node, visitProxyUses);
  }
  visitProxyUses(source);

  return names;
}

function missingProxyActivities(sourceTexts: string[], registry: Record<string, unknown>) {
  const referenced = new Set(sourceTexts.flatMap((source) => [...proxyActivityNames(source)]));
  return [...referenced]
    .filter((name) => typeof registry[name] !== "function")
    .sort((left, right) => left.localeCompare(right));
}

describe("Temporal activity registry", () => {
  it("exports every activity referenced by workflow proxies", () => {
    const sources = workflowSourceFiles(TEMPORAL_DIRECTORY).map((path) =>
      readFileSync(path, "utf8"),
    );

    expect(missingProxyActivities(sources, activities)).toEqual([]);
  });

  it("detects destructured aliases, proxy objects, and string member access", () => {
    const source = `
      import { proxyActivities as proxy } from "@temporalio/workflow";
      const { firstActivity: first } = proxy<{ firstActivity(): void }>({});
      const activityGroup = proxy<{ secondActivity(): void; thirdActivity(): void }>({});
      first();
      activityGroup.secondActivity();
      activityGroup["thirdActivity"]();
    `;

    expect(missingProxyActivities([source], { firstActivity() {}, secondActivity() {} })).toEqual([
      "thirdActivity",
    ]);
  });
});
