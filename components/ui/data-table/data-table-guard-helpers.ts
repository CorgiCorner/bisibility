import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "@typescript/typescript6";
import { readDataTableGuardSourcePaths } from "./data-table-guard-file-discovery";

export type TableSource = {
  path: string;
  source: string;
};

export type TableViolation = {
  kind: "html-table" | "mui-table-import";
  line: number;
  path: string;
};

export type TableOwnershipExemptions = {
  permanentStaticPaths: ReadonlySet<string>;
  permanentStaticRoots: readonly string[];
  temporaryMigrationPaths: ReadonlySet<string>;
};

export type DataTableLibraryImportViolation = {
  kind: "data-table-library-import";
  line: number;
  path: string;
  specifier: string;
};

const fixturePathPattern =
  /(?:^|\/)(?:__fixtures__|__tests__)(?:\/|$)|\.(?:spec|stories|test)\.tsx$/u;

export function isTableFixturePath(path: string) {
  return fixturePathPattern.test(path);
}

function readTrackedSourcePaths(
  repoRoot: string,
  roots: readonly string[],
  matchesSource: (path: string) => boolean,
) {
  return readDataTableGuardSourcePaths(repoRoot, roots, matchesSource);
}

function readSources(repoRoot: string, paths: readonly string[]): TableSource[] {
  return paths.map((path) => ({
    path,
    source: readFileSync(resolve(repoRoot, path), "utf8"),
  }));
}

export function readTrackedTablePaths(repoRoot = process.cwd()) {
  return readTrackedSourcePaths(repoRoot, ["app", "components"], (path) => path.endsWith(".tsx"));
}

export function readTrackedTableSources(repoRoot = process.cwd()): TableSource[] {
  return readSources(repoRoot, readTrackedTablePaths(repoRoot));
}

export function readTrackedApplicationSources(repoRoot = process.cwd()): TableSource[] {
  const paths = readTrackedSourcePaths(repoRoot, ["app", "components", "hooks", "lib"], (path) =>
    /\.(?:ts|tsx)$/u.test(path),
  );

  return readSources(repoRoot, paths);
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function isMuiTableImport(node: ts.ImportDeclaration) {
  if (!ts.isStringLiteral(node.moduleSpecifier)) return false;

  const specifier = node.moduleSpecifier.text;
  if (specifier.startsWith("@mui/material/Table")) return true;
  if (specifier !== "@mui/material") return false;

  const bindings = node.importClause?.namedBindings;
  return (
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    bindings.elements.some((element) =>
      (element.propertyName?.text ?? element.name.text).startsWith("Table"),
    )
  );
}

export function mayContainTableOwnershipSyntax(source: string) {
  const hasEscapedToken = source.includes("\\");

  // Every supported violation needs JSX's '<' or a static import. Keep escaped
  // candidates for AST inspection because TypeScript resolves escaped names and specifiers.
  return (
    (source.includes("<") && (source.includes("table") || hasEscapedToken)) ||
    (source.includes("import") && (source.includes("@mui") || hasEscapedToken))
  );
}

export function inspectTableSource({ path, source }: TableSource): TableViolation[] {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const violations: TableViolation[] = [];
  let foundHtmlTable = false;
  let foundMuiTableImport = false;

  function visit(node: ts.Node) {
    if (
      !foundHtmlTable &&
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sourceFile) === "table"
    ) {
      foundHtmlTable = true;
      violations.push({ kind: "html-table", line: lineOf(sourceFile, node), path });
    }

    if (!foundMuiTableImport && ts.isImportDeclaration(node) && isMuiTableImport(node)) {
      foundMuiTableImport = true;
      violations.push({ kind: "mui-table-import", line: lineOf(sourceFile, node), path });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function isPermanentStaticPath(path: string, exemptions: TableOwnershipExemptions) {
  return (
    exemptions.permanentStaticPaths.has(path) ||
    exemptions.permanentStaticRoots.some((root) => path === root || path.startsWith(`${root}/`))
  );
}

export function findTableOwnershipViolations(
  sources: readonly TableSource[],
  exemptions: TableOwnershipExemptions,
) {
  return sources.flatMap((source) => {
    if (
      isTableFixturePath(source.path) ||
      isPermanentStaticPath(source.path, exemptions) ||
      exemptions.temporaryMigrationPaths.has(source.path)
    ) {
      return [];
    }

    if (!mayContainTableOwnershipSyntax(source.source)) return [];

    return inspectTableSource(source);
  });
}

const dataTableLibrarySpecifierPattern =
  /^@tanstack\/(?:react-table|table-core|react-virtual|virtual-core)(?:\/|$)/u;
const moduleSyntaxPattern = /\b(?:import|export)\b/u;

function mayContainDataTableLibraryImport(source: string) {
  if (!moduleSyntaxPattern.test(source)) return false;

  // An escaped package specifier may not contain the raw prefix, but it must
  // contain a backslash. Those candidates still go through the full AST scan.
  return source.includes("@tanstack/") || source.includes("\\");
}

function literalSpecifier(node: ts.Node | undefined) {
  if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
    return node.text;
  }

  return null;
}

function moduleSpecifierForNode(node: ts.Node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return literalSpecifier(node.moduleSpecifier);
  }

  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length > 0
  ) {
    return literalSpecifier(node.arguments[0]);
  }

  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    return literalSpecifier(node.argument.literal);
  }

  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return literalSpecifier(node.moduleReference.expression);
  }

  return null;
}

export function inspectDataTableLibraryImports({
  path,
  source,
}: TableSource): DataTableLibraryImportViolation[] {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations: DataTableLibraryImportViolation[] = [];

  function visit(node: ts.Node) {
    const specifier = moduleSpecifierForNode(node);

    if (specifier && dataTableLibrarySpecifierPattern.test(specifier)) {
      violations.push({
        kind: "data-table-library-import",
        line: lineOf(sourceFile, node),
        path,
        specifier,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function isDataTablePrimitivePath(path: string) {
  return path.startsWith("components/ui/data-table/");
}

export function findDataTableLibraryImportViolations(sources: readonly TableSource[]) {
  return sources.flatMap((source) => {
    if (isDataTablePrimitivePath(source.path) || !mayContainDataTableLibraryImport(source.source)) {
      return [];
    }

    return inspectDataTableLibraryImports(source);
  });
}
