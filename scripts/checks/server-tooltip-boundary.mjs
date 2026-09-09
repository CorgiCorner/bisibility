import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import ts from "@typescript/typescript6";

const SOURCE_ROOTS = ["app", "components", "hooks", "lib"];
const TOOLTIP_MODULES = new Set(["@/components/ui", "@/components/ui/Tooltip"]);
const MESSAGE =
  "Server Components must not render Tooltip directly; create a client boundary that owns both Tooltip and trigger.";
const VIOLATION_BASELINE = 16;

function hasUseClientDirective(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      return false;
    }
    if (statement.expression.text === "use client") return true;
  }
  return false;
}

function importedTooltipNames(sourceFile) {
  const names = new Set();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !TOOLTIP_MODULES.has(statement.moduleSpecifier.text) ||
      statement.importClause?.isTypeOnly ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }

    for (const element of statement.importClause.namedBindings.elements) {
      if (!element.isTypeOnly && (element.propertyName?.text ?? element.name.text) === "Tooltip") {
        names.add(element.name.text);
      }
    }
  }

  return names;
}

export function inspectServerTooltipSource(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (hasUseClientDirective(sourceFile)) return [];

  const tooltipNames = importedTooltipNames(sourceFile);
  if (tooltipNames.size === 0) return [];

  const violations = [];
  function visit(node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      tooltipNames.has(node.tagName.text)
    ) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.tagName.getStart(sourceFile));
      violations.push({
        fileName,
        line: position.line + 1,
        column: position.character + 1,
        message: MESSAGE,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return violations;
}

function sourceFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(entryPath));
    } else if (/\.tsx$/u.test(entry.name) && !/\.(?:test|stories)\.tsx$/u.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

export function inspectRepository(root = process.cwd()) {
  const violations = SOURCE_ROOTS.flatMap((sourceRoot) => {
    const absoluteRoot = path.join(root, sourceRoot);
    try {
      return sourceFiles(absoluteRoot).flatMap((fileName) =>
        inspectServerTooltipSource(readFileSync(fileName, "utf8"), path.relative(root, fileName)),
      );
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  });

  return violations.length > VIOLATION_BASELINE ? violations : [];
}

function main() {
  const violations = inspectRepository();
  if (violations.length === 0) return;

  for (const violation of violations) {
    console.error(
      `${violation.fileName}:${violation.line}:${violation.column} ${violation.message}`,
    );
  }
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
