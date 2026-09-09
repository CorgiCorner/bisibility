import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "@typescript/typescript6";

const REQUEST_ROOTS = ["app", "lib/actions", "lib/api", "lib/auth"];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
const SOURCE_EXTENSION_SET = new Set(SOURCE_EXTENSIONS);
const TEST_HELPER_SOURCE_SUFFIX = /\.test-helpers\.[cm]?[jt]sx?$/u;
export const MAX_PATH_LENGTH = 50;
export const MAX_PATHS_PER_ROOT = 10_000;

function toRepoPath(root, fileName) {
  return path.relative(root, fileName).split(path.sep).join("/");
}

function isProductionSource(fileName) {
  const extension = path.extname(fileName);
  if (!SOURCE_EXTENSION_SET.has(extension)) return false;
  return !/(?:\.d|\.test|\.spec|\.stories)\.[cm]?[jt]sx?$/u.test(fileName);
}

function isRequestEntrypointSource(fileName) {
  return isProductionSource(fileName) && !TEST_HELPER_SOURCE_SUFFIX.test(fileName);
}

function sourceFiles(directory, includeSource = isProductionSource) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(entryPath, includeSource));
    else if (entry.isFile() && includeSource(entryPath)) files.push(entryPath);
  }
  return files;
}

function readCompilerOptions(root) {
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
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  return ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath).options;
}

function localModuleResolver(root) {
  const options = readCompilerOptions(root);
  const cache = ts.createModuleResolutionCache(root, (fileName) => fileName, options);
  return (specifier, importer) => {
    if (!specifier.startsWith("./") && !specifier.startsWith("../") && !specifier.startsWith("@/")) {
      return null;
    }

    const resolved = ts.resolveModuleName(specifier, importer, options, ts.sys, cache).resolvedModule;
    let fileName = resolved?.resolvedFileName;
    if (!fileName && specifier.startsWith("@/")) {
      const base = path.join(root, specifier.slice(2));
      fileName = SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`).find(existsSync);
    }
    if (!fileName && specifier.startsWith(".")) {
      const base = path.resolve(path.dirname(importer), specifier);
      fileName = SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`).find(existsSync);
    }
    if (!fileName || !statSync(fileName).isFile() || !isProductionSource(fileName)) return null;

    const relative = path.relative(root, fileName);
    return relative.startsWith("..") || path.isAbsolute(relative) ? null : path.resolve(fileName);
  };
}

function staticSpecifiers(fileName) {
  const source = readFileSync(fileName, "utf8");
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const specifiers = new Set();

  for (const statement of sourceFile.statements) {
    if (
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteralLike(statement.moduleSpecifier) &&
      hasRuntimeModuleEdge(statement)
    ) {
      specifiers.add(statement.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(statement) &&
      !statement.isTypeOnly &&
      ts.isExternalModuleReference(statement.moduleReference) &&
      statement.moduleReference.expression &&
      ts.isStringLiteralLike(statement.moduleReference.expression)
    ) {
      specifiers.add(statement.moduleReference.expression.text);
    }
  }

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      specifiers.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...specifiers];
}

function hasRuntimeModuleEdge(statement) {
  if (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly) return false;
  if (ts.isExportDeclaration(statement) && statement.isTypeOnly) return false;

  const bindings = ts.isImportDeclaration(statement)
    ? statement.importClause?.namedBindings
    : statement.exportClause;
  if (!bindings || (!ts.isNamedImports(bindings) && !ts.isNamedExports(bindings))) return true;
  return bindings.elements.length === 0 || bindings.elements.some((element) => !element.isTypeOnly);
}

function engineClients(root) {
  const temporalRoot = path.join(root, "lib/temporal");
  return sourceFiles(temporalRoot)
    .filter((fileName) => path.dirname(fileName) === temporalRoot)
    .filter((fileName) => path.basename(fileName).includes("client"))
    .map((fileName) => path.resolve(fileName))
    .sort();
}

function reachablePaths(root, roots, sinks) {
  const resolveLocalModule = localModuleResolver(root);
  const edgeCache = new Map();
  const found = new Map();

  function edges(fileName) {
    const cached = edgeCache.get(fileName);
    if (cached) return cached;
    const resolved = staticSpecifiers(fileName)
      .map((specifier) => resolveLocalModule(specifier, fileName))
      .filter((target) => target !== null)
      .sort();
    edgeCache.set(fileName, [...new Set(resolved)]);
    return edgeCache.get(fileName);
  }

  const expanded = new Set();
  function expand(fileName) {
    if (expanded.has(fileName) || sinks.has(fileName)) return;
    expanded.add(fileName);
    for (const target of edges(fileName)) expand(target);
  }
  for (const rootFile of roots) expand(rootFile);

  const reverseEdges = new Map();
  for (const [source, targets] of edgeCache) {
    for (const target of targets) {
      const sources = reverseEdges.get(target) ?? [];
      sources.push(source);
      reverseEdges.set(target, sources);
    }
  }
  const canReachSink = new Set(sinks);
  const pending = [...sinks];
  while (pending.length > 0) {
    const target = pending.pop();
    for (const source of reverseEdges.get(target) ?? []) {
      if (canReachSink.has(source)) continue;
      canReachSink.add(source);
      pending.push(source);
    }
  }

  for (const rootFile of roots) {
    const pendingPaths = [[rootFile]];
    let pathsForRoot = 0;
    while (pendingPaths.length > 0) {
      const absoluteModules = pendingPaths.shift();
      const fileName = absoluteModules.at(-1);
      for (const target of edges(fileName)) {
        if (absoluteModules.includes(target) || !canReachSink.has(target)) continue;
        const nextModules = [...absoluteModules, target];
        if (nextModules.length > MAX_PATH_LENGTH) {
          throw new Error(
            `Path from ${toRepoPath(root, rootFile)} exceeded the ${MAX_PATH_LENGTH}-module limit.`,
          );
        }
        const modules = nextModules.map((modulePath) => toRepoPath(root, modulePath));
        if (sinks.has(target)) {
          if (pathsForRoot >= MAX_PATHS_PER_ROOT) {
            throw new Error(
              `Path cap of ${MAX_PATHS_PER_ROOT} reached for ${toRepoPath(root, rootFile)}.`,
            );
          }
          pathsForRoot += 1;
          const key = modules.join(" -> ");
          found.set(key, { key, modules, sink: modules.at(-1) });
        } else {
          pendingPaths.push(nextModules);
        }
      }
    }
  }
  return [...found.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function invalidDispositionEntries(dispositions) {
  return [...dispositions]
    .filter(([, value]) => value !== "converted" && !/^allowed: \S.+/u.test(value))
    .map(([key]) => key)
    .sort();
}

export function inspectRepository(root = process.cwd(), dispositions = new Map()) {
  const absoluteRoot = path.resolve(root);
  const clients = engineClients(absoluteRoot);
  const sinks = new Set(clients);
  const roots = REQUEST_ROOTS.flatMap((requestRoot) =>
    sourceFiles(path.join(absoluteRoot, requestRoot), isRequestEntrypointSource),
  ).sort();
  const paths = reachablePaths(absoluteRoot, roots, sinks);
  const pathKeys = new Set(paths.map(({ key }) => key));
  const dispositionKeys = new Set(dispositions.keys());

  return {
    engineClients: clients.map((fileName) => toRepoPath(absoluteRoot, fileName)),
    reachablePaths: paths.map((entry) => ({ ...entry, disposition: dispositions.get(entry.key) })),
    missingDispositions: [...pathKeys].filter((key) => !dispositionKeys.has(key)).sort(),
    staleDispositions: [...dispositionKeys].filter((key) => !pathKeys.has(key)).sort(),
    invalidDispositions: invalidDispositionEntries(dispositions),
    limits: { maxPathLength: MAX_PATH_LENGTH, maxPathsPerRoot: MAX_PATHS_PER_ROOT },
  };
}

function printList(title, entries) {
  console.log(`${title} (${entries.length}):`);
  if (entries.length === 0) console.log("- none");
  else for (const entry of entries) console.log(`- ${entry}`);
}

export function runGuard(dispositions) {
  const result = inspectRepository(process.cwd(), dispositions);
  printList("Matched engine client modules", result.engineClients);
  printList(
    "Request-to-engine paths",
    result.reachablePaths.map(({ key, disposition }) => `${key} [${disposition ?? "UNRULED"}]`),
  );
  printList("Missing dispositions", result.missingDispositions);
  printList("Stale dispositions", result.staleDispositions);
  printList("Invalid dispositions", result.invalidDispositions);
  printList("Traversal limits", [
    `Maximum modules per path: ${result.limits.maxPathLength}`,
    `Maximum paths per root: ${result.limits.maxPathsPerRoot}`,
  ]);
  return (
    result.missingDispositions.length === 0 &&
    result.staleDispositions.length === 0 &&
    result.invalidDispositions.length === 0
  );
}
