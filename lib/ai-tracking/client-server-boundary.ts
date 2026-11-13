import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { readGuardSourcePaths } from "@/lib/test-support/source-file-discovery";
import ts from "@typescript/typescript6";

const SCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const FORBIDDEN_SPECIFIERS = new Set([
  "server-only",
  "next/headers",
  "next/cache",
  "@/lib/db/prisma",
]);

type Directive = "use client" | "use server" | null;

type ModuleInfo = {
  directive: Directive;
  specifiers: string[];
};

/** Import traces from a "use client" file to a server-only module. */
export function findClientServerLeaks(root: string, directories: readonly string[]): string[] {
  return findClientServerLeaksFromFiles(root, trackedUseClientFiles(root, directories));
}

export function findClientServerLeaksFromFiles(root: string, files: readonly string[]): string[] {
  const resolveLocal = localResolver(root);
  const traces: string[] = [];
  const seen = new Set<string>();

  function visit(fileName: string, trail: string[]) {
    const absolute = path.resolve(fileName);
    if (seen.has(absolute)) return;
    seen.add(absolute);
    const info = moduleInfo(absolute);
    if (info.directive === "use server") return;
    const here = repoRelative(root, absolute);
    for (const specifier of info.specifiers) {
      if (isForbiddenSpecifier(specifier)) {
        traces.push([...trail, here, specifier].join(" -> "));
        continue;
      }
      const target = resolveLocal(specifier, absolute);
      if (!target) continue;
      const targetPath = repoRelative(root, target);
      if (isPrismaModule(targetPath)) {
        traces.push([...trail, here, targetPath].join(" -> "));
        continue;
      }
      visit(target, [...trail, here]);
    }
  }

  for (const fileName of files) visit(fileName, []);
  return traces.sort();
}

export function trackedUseClientFiles(root: string, directories: readonly string[]): string[] {
  const existing = directories.filter((directory) => existsSync(path.join(root, directory)));
  if (existing.length === 0) return [];
  return readGuardSourcePaths(root, existing, isProductSource)
    .map((relative) => path.join(root, relative))
    .filter((fileName) => moduleInfo(fileName).directive === "use client")
    .sort();
}

function isProductSource(relativePath: string) {
  if (relativePath.endsWith(".d.ts")) return false;
  const extension = path.extname(relativePath);
  if (!SCRIPT_EXTENSIONS.has(extension)) return false;
  return !/\.(?:test|spec|stories)\.[cm]?[jt]sx?$/u.test(relativePath);
}

function isForbiddenSpecifier(specifier: string) {
  const bare = specifier.replace(/\.(?:tsx?|jsx?|mjs|cjs)$/u, "");
  return FORBIDDEN_SPECIFIERS.has(bare);
}

function isPrismaModule(relativePath: string) {
  return /^lib\/db\/prisma\.(?:tsx?|jsx?|mjs|cjs)$/u.test(relativePath);
}

function repoRelative(root: string, fileName: string) {
  return path.relative(root, fileName).split(path.sep).join("/");
}

function localResolver(root: string) {
  const options = readCompilerOptions(root);
  const cache = ts.createModuleResolutionCache(root, (fileName) => fileName, options);
  const rootPrefix = `${path.resolve(root)}${path.sep}`;
  return (specifier: string, importer: string) => {
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
    const resolved = ts.resolveModuleName(
      specifier,
      importer,
      options,
      ts.sys,
      cache,
    ).resolvedModule;
    const fileName = resolved?.resolvedFileName;
    if (!fileName) return null;
    const absolute = path.resolve(fileName);
    if (absolute !== path.resolve(root) && !absolute.startsWith(rootPrefix)) return null;
    if (!SCRIPT_EXTENSIONS.has(path.extname(absolute)) || absolute.endsWith(".d.ts")) return null;
    if (!statSync(absolute, { throwIfNoEntry: false })?.isFile()) return null;
    return absolute;
  };
}

function readCompilerOptions(root: string): ts.CompilerOptions {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) {
    return {
      baseUrl: root,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      paths: { "@/*": ["*"] },
    };
  }
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  return ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath).options;
}

const modules = new Map<string, ModuleInfo>();

function moduleInfo(fileName: string): ModuleInfo {
  const cached = modules.get(fileName);
  if (cached) return cached;
  const sourceFile = ts.createSourceFile(
    fileName,
    readFileSync(fileName, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const specifiers = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteralLike(statement.moduleSpecifier) &&
      hasRuntimeModuleEdge(statement)
    ) {
      specifiers.add(statement.moduleSpecifier.text);
    }
  }
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      const specifier = literalText(node.arguments[0]);
      if (specifier) specifiers.add(specifier);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  const info = { directive: moduleDirective(sourceFile), specifiers: [...specifiers].sort() };
  modules.set(fileName, info);
  return info;
}

function moduleDirective(sourceFile: ts.SourceFile): Directive {
  const first = sourceFile.statements[0];
  if (!first || !ts.isExpressionStatement(first) || !ts.isStringLiteral(first.expression))
    return null;
  if (first.expression.text === "use client" || first.expression.text === "use server") {
    return first.expression.text;
  }
  return null;
}

function hasRuntimeModuleEdge(statement: ts.ImportDeclaration | ts.ExportDeclaration) {
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause;
    if (clause?.isTypeOnly) return false;
    if (!clause) return true;
    if (clause.name) return true;
    const bindings = clause.namedBindings;
    if (!bindings || ts.isNamespaceImport(bindings)) return true;
    return bindings.elements.some((element) => !element.isTypeOnly);
  }
  if (statement.isTypeOnly) return false;
  const clause = statement.exportClause;
  if (!clause || ts.isNamespaceExport(clause)) return true;
  return clause.elements.some((element) => !element.isTypeOnly);
}

function literalText(node: ts.Node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}
