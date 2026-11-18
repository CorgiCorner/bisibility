import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "@typescript/typescript6";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localSource = /\.(tsx|mts|cts|ts)$/;
const scriptSource = /\.(jsx|mjs|cjs|js)$/;
const assetExtensions = new Set([
  ".css",
  ".scss",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".avif",
  ".webp",
  ".woff",
  ".woff2",
  ".ttf",
  ".json",
]);
let repositoryOptions: ts.CompilerOptions | undefined;

// Each root owns its compiler graph; only checked import paths survive across roots.
export function createSourceProgramReader(
  buildProgram: typeof ts.createProgram = ts.createProgram,
) {
  const assertedFiles = new Set<string>();
  return function sourceProgram(file: string) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const options = compilerOptions();
    const programOptions: ts.CompilerOptions = {
      ...options,
      lib: ["lib.es2022.d.ts"],
      types: [],
    };
    const resolutionHost = ts.createCompilerHost(options);
    const host = ts.createCompilerHost(programOptions);
    const readSource = host.getSourceFile;
    host.getSourceFile = (name, ...args) => (name === file ? source : readSource(name, ...args));
    host.resolveModuleNames = (names, containingFile) =>
      names.map((name) => {
        const resolved = resolveSpecifier(name, containingFile, options, resolutionHost);
        if (!resolved) return undefined;
        if (!includeResolved(resolved) && localImplementation(resolved.resolvedFileName))
          throw new Error(
            `Unreviewed translation binding in ${containingFile}: excluded import ${name}`,
          );
        return includeResolved(resolved) ? resolved : undefined;
      });
    const program = buildProgram([file], programOptions, host);
    assertLocalImportsResolve(program, options, resolutionHost, assertedFiles);
    return {
      source: program.getSourceFile(file) ?? source,
      checker: program.getTypeChecker(),
      program,
    };
  };
}

function compilerOptions(): ts.CompilerOptions {
  if (repositoryOptions) return repositoryOptions;
  const config = ts.findConfigFile(projectRoot, ts.sys.fileExists, "tsconfig.json");
  if (!config) throw new Error("Unreviewed translation binding: tsconfig.json was not found");
  const parsed = ts.getParsedCommandLineOfConfigFile(config, {}, configHost());
  if (!parsed) throw new Error("Unreviewed translation binding: tsconfig.json could not be parsed");
  const { plugins: _plugins, ...options } = parsed.options;
  repositoryOptions = { ...options, incremental: false, noEmit: true };
  return repositoryOptions;
}

function configHost(): ts.ParseConfigFileHost {
  return {
    getCurrentDirectory: () => projectRoot,
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    readDirectory: ts.sys.readDirectory,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(
        `Unreviewed translation binding: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
      );
    },
  };
}

function includeResolved(resolved: ts.ResolvedModuleFull) {
  const target = resolved.resolvedFileName;
  return target.includes("/node_modules/") || localTypeScript(target);
}

function localImplementation(target: string) {
  return (
    !target.includes("/node_modules/") && (localTypeScript(target) || scriptSource.test(target))
  );
}

function extensionOf(path: string) {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot).toLowerCase();
}

function localTypeScript(target: string) {
  return !target.includes("/node_modules/") && localSource.test(target);
}

function resolveSpecifier(
  name: string,
  containingFile: string,
  options: ts.CompilerOptions,
  host: ts.CompilerHost,
): ts.ResolvedModuleFull | undefined {
  const resolved = ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
  if (containingFile.includes("/node_modules/")) return resolved;
  if (
    resolved &&
    scriptSource.test(resolved.resolvedFileName) &&
    !resolved.resolvedFileName.includes("/node_modules/")
  ) {
    throw new Error(`Unreviewed translation binding in ${containingFile}: excluded import ${name}`);
  }
  if (resolved) return resolved;
  if (name.startsWith("node:")) return { resolvedFileName: name, extension: ts.Extension.Dts };
  return (
    assetModule(name, containingFile, options) ??
    (name.startsWith(".") || mappedPaths(name, options).length
      ? undefined
      : ts.resolveModuleName(name, resolve(projectRoot, "package.json"), options, host)
          .resolvedModule) ??
    assetModule(name, resolve(projectRoot, "package.json"), options)
  );
}

function assetModule(name: string, containingFile: string, options: ts.CompilerOptions) {
  const candidates = name.startsWith(".") ? [resolve(dirname(containingFile), name)] : [];
  candidates.push(...mappedPaths(name, options));
  if (!name.startsWith(".") && !mappedPaths(name, options).length)
    candidates.push(resolve(projectRoot, "node_modules", name));
  for (const path of candidates) {
    if (scriptSource.test(path) && !path.includes("/node_modules/") && isFile(path)) {
      throw new Error(
        `Unreviewed translation binding in ${containingFile}: excluded import ${name}`,
      );
    }
    if (isFile(path) && assetExtensions.has(extensionOf(path)))
      return { resolvedFileName: path, extension: ts.Extension.Json };
  }
  return undefined;
}

function mappedPaths(name: string, options: ts.CompilerOptions) {
  const paths = options.paths;
  if (!paths) return [];
  const base = options.baseUrl ?? projectRoot;
  for (const [pattern, targets] of Object.entries(paths)) {
    const star = pattern.indexOf("*");
    const prefix = star === -1 ? pattern : pattern.slice(0, star);
    const suffix = star === -1 ? "" : pattern.slice(star + 1);
    if (!name.startsWith(prefix) || !name.endsWith(suffix)) continue;
    if (star === -1 && name !== pattern) continue;
    const matched = star === -1 ? "" : name.slice(prefix.length, name.length - suffix.length);
    return targets.map((target) => resolve(base, target.replaceAll("*", matched)));
  }
  return [];
}

function isFile(path: string) {
  return existsSync(path) && statSync(path).isFile();
}

function assertLocalImportsResolve(
  program: ts.Program,
  options: ts.CompilerOptions,
  host: ts.CompilerHost,
  assertedFiles: Set<string>,
) {
  for (const source of program.getSourceFiles()) {
    if (source.fileName.includes("/node_modules/") || assertedFiles.has(source.fileName)) continue;
    assertedFiles.add(source.fileName);
    for (const statement of source.statements) {
      const specifier = moduleSpecifier(statement);
      if (!specifier) continue;
      if (!resolveSpecifier(specifier.text, source.fileName, options, host))
        throw new Error(
          `Unreviewed translation binding in ${source.fileName}: unresolved import ${specifier.text}`,
        );
    }
  }
}

function moduleSpecifier(statement: ts.Statement) {
  if (
    (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
    statement.moduleSpecifier &&
    ts.isStringLiteral(statement.moduleSpecifier)
  )
    return statement.moduleSpecifier;
  return undefined;
}
