import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const scanEntries = [
  "app",
  "lib",
  "components",
  "middleware.ts",
  "instrumentation.ts",
  "instrumentation-client.ts",
  "next.config.ts",
  "sentry.edge.config.ts",
  "sentry.server.config.ts",
];

const excludePatterns = [
  /\.test\./,
  /\.spec\./,
  /lib\/generated\//,
  /lib\/deployment\/runtime-env\.generated\./,
  /lib\/private-adapters\//,
];

const ENV_NAME_RE = /[A-Z][A-Z0-9_]*$/;

function shouldExclude(relPath) {
  return excludePatterns.some((pattern) => pattern.test(relPath));
}

function walkDir(dir, repoRoot) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(repoRoot, fullPath).split(path.sep).join("/");
    if (entry.isDirectory()) return walkDir(fullPath, repoRoot);
    if (!entry.isFile()) return [];
    if (!sourceExtensions.has(path.extname(entry.name))) return [];
    if (shouldExclude(relPath)) return [];
    return [fullPath];
  });
}

function isProcessEnv(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process" &&
    ts.isIdentifier(node.name) &&
    node.name.text === "env"
  );
}

function containsBareProcessEnv(node) {
  if (isProcessEnv(node)) return true;
  if (
    (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
    isProcessEnv(node.expression)
  ) {
    return false;
  }
  return node.getChildren().some(containsBareProcessEnv);
}

function scriptKindFor(fullPath) {
  switch (path.extname(fullPath)) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function lineFor(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
}

function extractObjectBindingNames(pattern, sf, relPath, errors) {
  const names = [];
  for (const element of pattern.elements) {
    if (element.dotDotDotToken) {
      errors.push(`${relPath}:${lineFor(sf, element)}: unresolved process.env rest destructuring`);
      continue;
    }
    const sourceName = element.propertyName ?? element.name;
    if (ts.isIdentifier(sourceName) || ts.isStringLiteral(sourceName)) {
      if (ENV_NAME_RE.test(sourceName.text)) names.push(sourceName.text);
      continue;
    }
    errors.push(`${relPath}:${lineFor(sf, element)}: unresolved process.env destructuring`);
  }
  return names;
}

function scanFile(fullPath, repoRoot) {
  const names = new Set();
  const errors = [];
  const relPath = path.relative(repoRoot, fullPath).split(path.sep).join("/");
  const source = readFileSync(fullPath, "utf8");
  const sf = ts.createSourceFile(relPath, source, ts.ScriptTarget.Latest, true, scriptKindFor(fullPath));
  for (const diagnostic of sf.parseDiagnostics) {
    const line = diagnostic.start == null
      ? 1
      : sf.getLineAndCharacterOfPosition(diagnostic.start).line + 1;
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    errors.push(`${relPath}:${line}: TypeScript parse error: ${message}`);
  }
  const envAliases = new Set();
  function collectAliases(node) {
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      containsBareProcessEnv(node.initializer)
    ) {
      envAliases.add(node.name.text);
    }
    ts.forEachChild(node, collectAliases);
  }
  collectAliases(sf);

  function isInsideAliasInitializer(node) {
    let current = node.parent;
    while (current && !ts.isSourceFile(current)) {
      if (
        (ts.isVariableDeclaration(current) || ts.isParameter(current)) &&
        ts.isIdentifier(current.name) &&
        envAliases.has(current.name.text) &&
        current.initializer
      ) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  function isEnvExpression(node) {
    return isProcessEnv(node) || (ts.isIdentifier(node) && envAliases.has(node.text));
  }

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      isProcessEnv(node.initializer) &&
      ts.isObjectBindingPattern(node.name)
    ) {
      for (const n of extractObjectBindingNames(node.name, sf, relPath, errors)) {
        if (ENV_NAME_RE.test(n)) names.add(n);
      }
    }

    if (isProcessEnv(node)) {
      const parent = node.parent;
      const resolved =
        (ts.isPropertyAccessExpression(parent) && parent.expression === node) ||
        (ts.isElementAccessExpression(parent) && parent.expression === node) ||
        (ts.isVariableDeclaration(parent) &&
          parent.initializer === node &&
          ts.isObjectBindingPattern(parent.name)) ||
        isInsideAliasInitializer(node);
      if (!resolved) {
        errors.push(`${relPath}:${lineFor(sf, node)}: unresolved process.env object access`);
      }
    }

    if (ts.isPropertyAccessExpression(node) && isEnvExpression(node.expression)) {
      const name = node.name.text;
      if (ENV_NAME_RE.test(name)) names.add(name);
    }

    if (ts.isElementAccessExpression(node) && isEnvExpression(node.expression)) {
      const arg = node.argumentExpression;
      const line = lineFor(sf, node);
      if (arg && ts.isStringLiteral(arg)) {
        if (ENV_NAME_RE.test(arg.text)) names.add(arg.text);
      } else if (arg && ts.isNoSubstitutionTemplateLiteral(arg)) {
        if (ENV_NAME_RE.test(arg.text)) names.add(arg.text);
      } else errors.push(`${relPath}:${line}: unresolved computed process.env access`);
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);
  return { names, errors };
}

export function scanRuntimeEnvNames(repoRoot = root) {
  const names = new Set();
  const errors = [];
  for (const entry of scanEntries) {
    const fullPath = path.join(repoRoot, entry);
    if (!existsSync(fullPath)) {
      errors.push(`Expected scan root not found: ${entry}`);
      continue;
    }
    const stats = statSync(fullPath);
    const files = stats.isDirectory() ? walkDir(fullPath, repoRoot) : [fullPath];
    for (const file of files) {
      const relPath = path.relative(repoRoot, file).split(path.sep).join("/");
      if (shouldExclude(relPath)) continue;
      const result = scanFile(file, repoRoot);
      for (const n of result.names) names.add(n);
      errors.push(...result.errors);
    }
  }
  if (errors.length > 0) {
    for (const e of errors) console.error(`[scanner] ${e}`);
    throw new Error(`Runtime env scan failed:\n${errors.join("\n")}`);
  }
  return [...names].sort();
}
