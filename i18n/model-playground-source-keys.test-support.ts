import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "@typescript/typescript6";
import { createFlow } from "./model-playground-source-flow.test-support";
import { createSourceProgramReader } from "./model-playground-source-program.test-support";

function renderSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return renderSources(path);
    return entry.name.endsWith(".tsx") && !/\.(test|stories|test-support)\./.test(entry.name)
      ? [path]
      : [];
  });
}

function collectSourceKeys(
  file: string,
  pinned: ReadonlySet<string>,
  keys: Set<string>,
  roots: readonly string[],
  seen: Set<string>,
  sourceProgram: ReturnType<typeof createSourceProgramReader>,
) {
  const { checker, program } = sourceProgram(file);
  const flow = createFlow(checker, refuse);
  function at(node: ts.Node) {
    const owner = node.getSourceFile();
    const position = owner.getLineAndCharacterOfPosition(node.getStart(owner));
    return `${owner.fileName}:${position.line + 1}:${position.character + 1}`;
  }
  function refuse(node: ts.Node, kind: "binding" | "key" | "namespace", detail: string): never {
    const label =
      kind === "binding"
        ? "Unreviewed translation binding"
        : kind === "key"
          ? "Unreviewed translation key"
          : "Unreviewed translation namespace";
    const failClosed =
      "Fail closed for an early return, memo/forwardRef/FC props, a rest translator parameter, or a truthiness check of an optional translator.";
    throw new Error(
      kind === "binding"
        ? `${label} in ${at(node)}: ${detail}. ${failClosed}`
        : `${label} in ${at(node)}: ${detail}`,
    );
  }
  function intlFunction(expression: ts.Expression, expected: string) {
    const symbol = checker.getSymbolAtLocation(expression);
    if (!symbol) return false;
    let resolved = symbol;
    while (resolved.flags & ts.SymbolFlags.Alias) resolved = checker.getAliasedSymbol(resolved);
    const declaration = resolved.declarations?.[0]?.getSourceFile().fileName ?? "";
    return (
      (symbol.name === expected || resolved.name === expected) &&
      (declaration.includes("/use-intl/") || declaration.includes("/next-intl/"))
    );
  }
  function namespaceOf(type: ts.Type, node: ts.Node): { text?: string; inline?: Set<string> } {
    const messages = type.aliasTypeArguments?.[0];
    const namespace = type.aliasTypeArguments?.[1];
    if (!messages || !namespace) refuse(node, "namespace", "missing namespace");
    if (!messages.getStringIndexType() && messages.getProperties().length) {
      const inline = new Set<string>();
      messageLeaves(messages, "", inline, new Set());
      return { inline };
    }
    if (namespace.flags & ts.TypeFlags.Never) return { text: "" };
    if (namespace.isStringLiteral()) return { text: namespace.value };
    refuse(node, "namespace", checker.typeToString(namespace));
  }
  function messageLeaves(type: ts.Type, prefix: string, into: Set<string>, seen: Set<ts.Type>) {
    const properties =
      type.flags & (ts.TypeFlags.Any | ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike) ||
      type.getStringIndexType()
        ? []
        : type.getProperties().filter((property) => property.flags & ts.SymbolFlags.Property);
    if (!properties.length) {
      if (prefix) into.add(prefix);
      return;
    }
    if (seen.has(type)) return;
    seen.add(type);
    for (const property of properties) {
      const path = prefix ? `${prefix}.${property.name}` : property.name;
      messageLeaves(checker.getTypeOfSymbol(property), path, into, seen);
    }
    seen.delete(type);
  }
  function validateFactory(expression: ts.CallExpression) {
    const options = expression.arguments[0];
    const properties = options && ts.isObjectLiteralExpression(options) ? options.properties : [];
    const safe =
      properties.length > 0 &&
      properties.every(
        (entry) =>
          (ts.isPropertyAssignment(entry) ||
            (ts.isShorthandPropertyAssignment(entry) && entry.name.text === "locale")) &&
          ["locale", "messages"].includes(entry.name.getText()),
      ) &&
      properties.filter((entry) => entry.name?.getText() === "messages").length === 1;
    const messages = properties.find((entry) => entry.name?.getText() === "messages");
    if (
      !safe ||
      !messages ||
      !ts.isPropertyAssignment(messages) ||
      !ts.isObjectLiteralExpression(messages.initializer) ||
      messages.initializer.properties.some(
        (entry) => !ts.isPropertyAssignment(entry) || !ts.isIdentifier(entry.name),
      )
    )
      refuse(expression, "binding", expression.getText());
  }
  function writtenLiteral(argument: ts.Expression): boolean {
    if (ts.isParenthesizedExpression(argument)) return writtenLiteral(argument.expression);
    if (ts.isStringLiteralLike(argument)) return true;
    return (
      ts.isConditionalExpression(argument) &&
      writtenLiteral(argument.whenTrue) &&
      writtenLiteral(argument.whenFalse)
    );
  }
  function record(node: ts.CallExpression, namespace: string, inline?: Set<string>) {
    const argument = node.arguments[0];
    const type = argument ? checker.getTypeAtLocation(argument) : undefined;
    const parts = type?.isUnion() ? type.types : type ? [type] : [];
    const literals =
      parts.length && parts.every((part) => part.isStringLiteral())
        ? parts.flatMap((part) => (part.isStringLiteral() ? [part.value] : []))
        : undefined;
    if (!argument || !literals?.length) refuse(node, "key", argument?.getText() ?? "missing");
    const resolved = literals ?? [];
    const qualify = (key: string) => (namespace ? `${namespace}.${key}` : key);
    if (inline) {
      for (const key of resolved) if (!inline.has(key)) refuse(node, "key", key);
      return;
    }
    if (
      !writtenLiteral(argument) &&
      resolved.length !== 1 &&
      resolved.some((key) => !pinned.has(qualify(key)))
    )
      refuse(node, "key", argument.getText());
    if (!roots.length || !namespace || roots.includes(namespace.split(".")[0]))
      for (const key of resolved) if (!hasGuarded(node, key)) keys.add(qualify(key));
  }
  function hasGuarded(call: ts.CallExpression, key: string) {
    let current: ts.Node = call;
    while (current.parent && !ts.isFunctionLike(current.parent)) {
      const parent = current.parent;
      if (
        ts.isConditionalExpression(parent) &&
        parent.whenTrue.pos <= call.pos &&
        call.end <= parent.whenTrue.end &&
        guards(parent.condition, key, call.expression)
      )
        return true;
      current = parent;
    }
    return false;
  }
  function guards(condition: ts.Expression, key: string, callee: ts.Expression): boolean {
    const expression = ts.isParenthesizedExpression(condition) ? condition.expression : condition;
    if (ts.isBinaryExpression(expression))
      return (
        expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
        (guards(expression.left, key, callee) || guards(expression.right, key, callee))
      );
    if (!ts.isCallExpression(expression) || !flow.isHas(expression.expression)) return false;
    const argument = expression.arguments[0];
    const called = expression.expression;
    const left =
      ts.isPropertyAccessExpression(called) || ts.isElementAccessExpression(called)
        ? called.expression
        : called;
    const right =
      ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)
        ? callee.expression
        : callee;
    const symbol = ts.isIdentifier(left) ? checker.getSymbolAtLocation(left) : undefined;
    return (
      !!argument &&
      ts.isStringLiteralLike(argument) &&
      argument.text === key &&
      !!symbol &&
      ts.isIdentifier(right) &&
      symbol === checker.getSymbolAtLocation(right)
    );
  }
  function isValue(node: ts.Node): node is ts.Expression {
    if (!ts.isExpression(node) || !node.parent || ts.isTypeNode(node.parent)) return false;
    const parent = node.parent;
    if (ts.isJsxAttribute(parent) && parent.name === node) return false;
    if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
    if (ts.isBindingElement(parent) && parent.propertyName === node) return false;
    if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false;
    const named =
      ts.isVariableDeclaration(parent) ||
      ts.isBindingElement(parent) ||
      ts.isParameter(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isGetAccessor(parent) ||
      ts.isSetAccessor(parent);
    return !(named && parent.name === node);
  }
  function visit(node: ts.Node) {
    ts.forEachChild(node, visit);
    if (
      (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) &&
      flow.bindsTranslator(node)
    )
      refuse(node, "binding", node.getText());
    if (isValue(node) && !flow.accepted(node)) refuse(node, "binding", node.getText());
    if (!ts.isCallExpression(node)) return;
    if (intlFunction(node.expression, "createTranslator")) validateFactory(node);
    for (const translator of flow.typesOf(node.expression)) {
      const namespace = namespaceOf(translator, node);
      if (!flow.isHas(node.expression)) record(node, namespace.text ?? "", namespace.inline);
    }
  }
  for (const owner of program.getSourceFiles()) {
    if (seen.has(owner.fileName) || !collectsKeys(owner)) continue;
    seen.add(owner.fileName);
    visit(owner);
  }
}

function collectsKeys(owner: ts.SourceFile) {
  if (owner.isDeclarationFile || owner.fileName.includes("/node_modules/")) return false;
  return /\.(tsx|mts|cts|ts|jsx|js|mjs|cjs)$/.test(owner.fileName);
}

export function sourceKeys(
  directories: readonly string[],
  initialKeys: readonly string[],
  roots: readonly string[] = [],
  includeFile: (file: string) => boolean = () => true,
) {
  const sourceProgram = createSourceProgramReader();
  const pinned = new Set(initialKeys);
  const keys = new Set(initialKeys);
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const directory of directories)
    for (const file of renderSources(directory).filter(includeFile))
      try {
        // Imported sources have already been validated and visited with their owning program.
        if (seen.has(file)) continue;
        collectSourceKeys(file, pinned, keys, roots, seen, sourceProgram);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
  if (errors.length) throw new Error(errors.join("\n"));
  return [...keys].sort();
}
