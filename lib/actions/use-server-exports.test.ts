import { readFileSync } from "node:fs";
import { readGuardSourcePaths } from "@/lib/test-support/source-file-discovery";
import ts from "@typescript/typescript6";
import { expect, it } from "vitest";

// Pre-existing "use server" modules that already export a runtime value other
// than an async function. This hotfix does not rewrite them.
const legacyUseServerRuntimeExports = [
  {
    // Const alias of an imported async action.
    exports: ["const updateProviderAllocation"],
    file: "app/(regional)/app/(workspace)/[project]/settings/(sections)/usage/actions.ts",
  },
];

type RuntimeExportViolation = { exports: string[]; file: string };

function modifiers(node: ts.Node): readonly ts.ModifierLike[] {
  return ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return modifiers(node).some((modifier) => modifier.kind === kind);
}

function isAsyncFunctionDeclaration(node: ts.Node): node is ts.FunctionDeclaration {
  return ts.isFunctionDeclaration(node) && hasModifier(node, ts.SyntaxKind.AsyncKeyword);
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.(?:mjs|cjs|js)$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function isUseServerModule(source: ts.SourceFile): boolean {
  const first = source.statements[0];
  if (!first || !ts.isExpressionStatement(first)) return false;
  const expression = first.expression;
  return (
    (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) &&
    expression.text === "use server"
  );
}

function asyncFunctionNames(source: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (isAsyncFunctionDeclaration(statement) && statement.name) names.add(statement.name.text);
  }
  return names;
}

function localExportName(element: ts.ExportSpecifier): string {
  const local = element.propertyName ?? element.name;
  return local.text;
}

function illegalRuntimeExports(source: ts.SourceFile): string[] {
  const asyncNames = asyncFunctionNames(source);
  const found: string[] = [];
  for (const statement of source.statements) {
    if (hasModifier(statement, ts.SyntaxKind.DeclareKeyword)) continue;
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue;
    if (
      ts.isFunctionDeclaration(statement) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      if (!hasModifier(statement, ts.SyntaxKind.AsyncKeyword)) {
        found.push(`sync function ${statement.name?.text ?? "(default)"}`);
      }
      continue;
    }
    if (ts.isClassDeclaration(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      found.push(`class ${statement.name?.text ?? "(default)"}`);
      continue;
    }
    if (ts.isEnumDeclaration(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      found.push(`enum ${statement.name.text}`);
      continue;
    }
    if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      const names = statement.declarationList.declarations.map((declaration) =>
        declaration.name.getText(source),
      );
      found.push(`const ${names.join(", ")}`);
      continue;
    }
    if (ts.isModuleDeclaration(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      found.push(`namespace ${statement.name.getText(source)}`);
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      const expression = statement.expression;
      if (ts.isIdentifier(expression) && asyncNames.has(expression.text)) continue;
      if (
        ts.isFunctionExpression(expression) &&
        hasModifier(expression, ts.SyntaxKind.AsyncKeyword)
      ) {
        continue;
      }
      found.push("export default");
      continue;
    }
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;
    if (!statement.exportClause || ts.isNamespaceExport(statement.exportClause)) {
      found.push("export *");
      continue;
    }
    for (const element of statement.exportClause.elements) {
      if (element.isTypeOnly) continue;
      const local = localExportName(element);
      if (statement.moduleSpecifier || !asyncNames.has(local)) found.push(`export { ${local} }`);
    }
  }
  return found;
}

function trackedSourceFiles(): string[] {
  return readGuardSourcePaths(
    process.cwd(),
    ["app", "components", "lib"],
    (file) => /\.(?:[cm]?tsx?|[cm]?jsx?)$/.test(file) && !file.endsWith(".d.ts"),
  );
}

function useServerRuntimeExportViolations(): RuntimeExportViolation[] {
  const violations: RuntimeExportViolation[] = [];
  for (const file of trackedSourceFiles()) {
    const text = readFileSync(file, "utf8");
    if (!text.includes("use server")) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, scriptKind(file));
    if (!isUseServerModule(source)) continue;
    const exports = illegalRuntimeExports(source);
    if (exports.length > 0) violations.push({ exports, file });
  }
  return violations.sort((left, right) => left.file.localeCompare(right.file));
}

// The scan reads every tracked source file. The default 5s limit is too low
// when this file runs with the rest of the action suite.
it("keeps use server modules to async function exports", { timeout: 30_000 }, () => {
  expect(useServerRuntimeExportViolations()).toEqual(legacyUseServerRuntimeExports);
});
