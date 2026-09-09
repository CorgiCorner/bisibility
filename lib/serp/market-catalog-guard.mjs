import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "@typescript/typescript6";

// Executable sources, including tests and generators. Historical plans and docs
// may name the retired module; a string in a guard fixture is not an import.
export const marketCatalogGuardRoots = [
  "app",
  "components",
  "hooks",
  "lib",
  "scripts",
  "tests",
  "e2e",
  "tools",
  "examples",
  "prisma",
  ".storybook",
  "instrumentation.ts",
  "instrumentation-client.ts",
  "middleware.ts",
  "next.config.ts",
];
export const marketCatalogGuardExemptFiles = [];
const executableFile = /\.(?:[cm]?[jt]sx?)$/u;
const retiredExports = new Set(["serpMarketNames", "SerpMarketName", "DEFAULT_SERP_MARKET"]);

function sourceFiles(root) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    if (error?.code === "ENOTDIR") return executableFile.test(root) ? [root] : [];
    throw error;
  }
  return entries.flatMap((entry) => {
    // Generated dependency clients cannot import application modules.
    if (
      entry.name === "node_modules" ||
      (entry.name === "generated" && root.endsWith(`${path.sep}lib`))
    )
      return [];
    const entryPath = path.join(root, entry.name);
    return entry.isDirectory()
      ? sourceFiles(entryPath)
      : executableFile.test(entry.name)
        ? [entryPath]
        : [];
  });
}

function resolvesToCatalog(specifier, fileName, root) {
  const catalog = path.join(root, "lib/serp/markets");
  const resolved = specifier.startsWith("@/")
    ? path.join(root, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(fileName), specifier)
      : null;
  return (
    resolved !== null &&
    ["", ".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"].some(
      (extension) => resolved === `${catalog}${extension}`,
    )
  );
}

function importSpecifier(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
    return node.moduleReference.expression;
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    if (
      callee.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(callee) && callee.text === "require") ||
      (ts.isPropertyAccessExpression(callee) &&
        ["mock", "doMock", "unmock", "importActual"].includes(callee.name.text))
    ) {
      return node.arguments[0];
    }
  }
  return undefined;
}

function exportsRetiredName(node) {
  if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
    return node.exportClause.elements.some((entry) => retiredExports.has(entry.name.text));
  }
  if (!node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
    return false;
  if (ts.isVariableStatement(node))
    return node.declarationList.declarations.some(
      (entry) => ts.isIdentifier(entry.name) && retiredExports.has(entry.name.text),
    );
  return node.name && ts.isIdentifier(node.name) && retiredExports.has(node.name.text);
}

function fileViolations(root, fileName) {
  const sourceText = readFileSync(fileName, "utf8");
  // Escapes can hide names; relative imports can get the catalog name from their file path.
  if (
    !fileName.includes("markets") &&
    !sourceText.includes("markets") &&
    !sourceText.includes("\\") &&
    ![...retiredExports].some((name) => sourceText.includes(name))
  )
    return [];
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const violations = new Set();
  function visit(node) {
    const specifier = importSpecifier(node);
    if (
      (specifier &&
        ts.isStringLiteralLike(specifier) &&
        resolvesToCatalog(specifier.text, fileName, root)) ||
      exportsRetiredName(node)
    ) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      violations.add(`${path.relative(root, fileName)}:${line}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...violations];
}

export function marketCatalogViolations(root) {
  const retiredFile = path.join(root, "lib/serp/markets.ts");
  return [
    ...(existsSync(retiredFile) ? ["lib/serp/markets.ts: retired module must not exist"] : []),
    ...marketCatalogGuardRoots
      .flatMap((sourceRoot) => sourceFiles(path.join(root, sourceRoot)))
      .flatMap((fileName) => fileViolations(root, fileName)),
  ].sort();
}

export function assertMarketCatalogBoundary(root) {
  const violations = marketCatalogViolations(root);
  if (violations.length)
    throw new Error(
      `Retired market catalog dependency. Use canonical locations or neutral SERP constants:\n${violations.join("\n")}`,
    );
}
