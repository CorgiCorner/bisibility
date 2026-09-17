import { createHash } from "node:crypto";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "@typescript/typescript6";

const sourceExtensions = new Set([".ts", ".tsx"]);
const renderExtensions = new Set([".tsx"]);
const sourceStatuses = new Set(["migrated", "pending", "excluded"]);
const sourceKinds = new Set(["render", "ui-data"]);
const visibleAttributes = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-valuetext",
  "label",
  "placeholder",
  "title",
]);
const visiblePropertyNames = new Set([
  "ariaLabel",
  "description",
  "emptyMessage",
  "errorMessage",
  "helperText",
  "label",
  "message",
  "placeholder",
  "successMessage",
  "text",
  "title",
  "tooltip",
]);
const validationPropertyNames = new Set(["invalid_type_error", "message", "required_error"]);
const englishLocale = /^en(?:-|$)/iu;
const ignoredSourceSuffix = /\.(?:browser|endpoint|hydration|integration|stories|test|verification)\.(?:ts|tsx)$/u;
const registryRelativePath = "i18n/ui-surface-registry.json";
const coreTranslatorFactories = new Map([
  ["next-intl", new Set(["createTranslator", "useTranslations"])],
  ["next-intl/server", new Set(["createTranslator", "getTranslations"])],
  ["@/i18n/translator.server", new Set(["createIntlTranslator"])],
]);

export const coreUiI18nScope = {
  kind: "core",
  application: {
    routeRoot: "app/(regional)",
    sharedRenderRoot: "components",
    topLevelEntries: ["app/error.tsx", "app/global-error.tsx", "app/not-found.tsx", "app/providers.tsx"],
  },
  declaredUiDataSources: [],
};

export const uiI18nScope = coreUiI18nScope;

function lineAt(source, position) {
  return source.getLineAndCharacterOfPosition(position).line + 1;
}

function hasText(value) {
  return /[\p{L}]/u.test(value);
}

function normalizeText(text) {
  return text.replace(/\s+/gu, " ").trim();
}

function candidateFingerprint(kind, anchor, text) {
  return createHash("sha256").update(`${kind}\n${anchor}\n${text}`).digest("hex");
}

function propertyName(node) {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined;
}

function literalText(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined;
}

function unwrapExpression(node) {
  let current = node;
  while (
    current &&
    (ts.isAsExpression(current) ||
      ts.isAwaitExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isTypeAssertionExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function bindingScope(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      ts.isBlock(current) ||
      ts.isCatchClause(current) ||
      ts.isFunctionLike(current) ||
      ts.isModuleBlock(current) ||
      ts.isSourceFile(current)
    ) {
      return current;
    }
  }
  return undefined;
}

function bindingNames(name, add) {
  if (ts.isIdentifier(name)) {
    add(name);
    return;
  }
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isOmittedExpression(element)) continue;
      bindingNames(element.name, add);
    }
  }
}

function isConstDeclaration(declaration) {
  const list = declaration.parent;
  return ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0;
}

function collectTranslatorBindings(source, translatorFactories) {
  const bindings = [];
  const typeAliases = [];

  function addBinding(
    name,
    declaration,
    { factory = false, immutable = false, initializer, nameNode = name, parameter, scope } = {},
  ) {
    if (!scope) return;
    bindings.push({
      declaration,
      factory,
      immutable,
      initializer,
      kind: factory ? "translator-factory" : "other",
      name: name.text,
      nameNode,
      parameter,
      scope,
      start: declaration.getStart(source),
    });
  }

  function visitBindings(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const factoryNames = translatorFactories.get(node.moduleSpecifier.text);
      const clause = node.importClause;
      if (clause?.name) addBinding(clause.name, clause, { scope: source });
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          const importedName = element.propertyName?.text ?? element.name.text;
          if (element.isTypeOnly && !factoryNames?.has(importedName)) continue;
          addBinding(element.name, element, {
            factory: factoryNames?.has(importedName),
            scope: source,
          });
        }
      }
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        addBinding(clause.namedBindings.name, clause.namedBindings, { scope: source });
      }
    }

    if (ts.isVariableDeclaration(node)) {
      const scope = bindingScope(node);
      bindingNames(node.name, (name) =>
        addBinding(name, node, {
          immutable: isConstDeclaration(node),
          initializer: ts.isIdentifier(node.name) ? node.initializer : undefined,
          scope,
        }),
      );
    }

    if (ts.isParameter(node)) {
      const scope = bindingScope(node);
      bindingNames(node.name, (name) => addBinding(name, node, { nameNode: name, parameter: node, scope }));
    }

    if ((ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name) {
      addBinding(node.name, node, { scope: bindingScope(node) });
    }

    if (ts.isTypeAliasDeclaration(node)) {
      typeAliases.push({
        declaration: node,
        name: node.name.text,
        scope: bindingScope(node),
        start: node.getStart(source),
      });
    }

    ts.forEachChild(node, visitBindings);
  }

  visitBindings(source);

  function resolve(identifier) {
    const position = identifier.getStart(source);
    return bindings
      .filter(
        (binding) =>
          binding.name === identifier.text &&
          binding.scope.pos <= identifier.pos &&
          identifier.end <= binding.scope.end &&
          (binding.factory || binding.start <= position),
      )
      .sort(
        (left, right) =>
          left.scope.end - left.scope.pos - (right.scope.end - right.scope.pos) || right.start - left.start,
      )[0];
  }

  function resolveTypeAlias(name, position) {
    return typeAliases
      .filter(
        (alias) =>
          alias.name === name &&
          alias.scope &&
          alias.scope.pos <= position &&
          position <= alias.scope.end &&
          alias.start <= position,
      )
      .sort(
        (left, right) =>
          left.scope.end - left.scope.pos - (right.scope.end - right.scope.pos) || right.start - left.start,
      )[0];
  }

  function unwrapType(type) {
    let current = type;
    while (current && ts.isParenthesizedTypeNode(current)) current = current.type;
    return current;
  }

  function isTranslatorType(type, position, seen = new Set()) {
    const current = unwrapType(type);
    if (!current || !ts.isTypeReferenceNode(current) || !ts.isIdentifier(current.typeName)) return false;
    const name = current.typeName.text;
    const [argument] = current.typeArguments ?? [];
    if (["Awaited", "Promise"].includes(name) && argument) return isTranslatorType(argument, position, seen);
    if (name === "ReturnType" && argument && ts.isTypeQueryNode(argument) && ts.isIdentifier(argument.exprName)) {
      return resolve(argument.exprName)?.kind === "translator-factory";
    }
    const alias = resolveTypeAlias(name, position);
    if (!alias || seen.has(alias.declaration)) return false;
    seen.add(alias.declaration);
    return isTranslatorType(alias.declaration.type, alias.declaration.type.getStart(source), seen);
  }

  function propertyType(type, name, position, seen = new Set()) {
    const current = unwrapType(type);
    if (!current) return undefined;
    if (ts.isTypeLiteralNode(current)) {
      for (const member of current.members) {
        if (ts.isPropertySignature(member) && propertyName(member.name) === name) return member.type;
      }
      return undefined;
    }
    if (ts.isIntersectionTypeNode(current)) {
      for (const nested of current.types) {
        const property = propertyType(nested, name, position, seen);
        if (property) return property;
      }
      return undefined;
    }
    if (!ts.isTypeReferenceNode(current) || !ts.isIdentifier(current.typeName)) return undefined;
    const alias = resolveTypeAlias(current.typeName.text, position);
    if (!alias || seen.has(alias.declaration)) return undefined;
    seen.add(alias.declaration);
    return propertyType(alias.declaration.type, name, alias.declaration.type.getStart(source), seen);
  }

  function parameterBindingType(binding) {
    const parameter = binding.parameter;
    if (!parameter?.type) return undefined;
    if (ts.isIdentifier(parameter.name)) return parameter.type;
    return propertyType(parameter.type, binding.name, binding.nameNode.getStart(source));
  }

  for (const binding of bindings.filter((entry) => entry.parameter)) {
    const type = parameterBindingType(binding);
    if (type && isTranslatorType(type, type.getStart(source))) binding.kind = "translator";
  }

  for (const binding of bindings.filter((entry) => entry.immutable && entry.initializer).sort((a, b) => a.start - b.start)) {
    const initializer = unwrapExpression(binding.initializer);
    if (!initializer) continue;
    if (ts.isIdentifier(initializer) && resolve(initializer)?.kind === "translator") binding.kind = "translator";
    if (ts.isCallExpression(initializer) && isTranslatorFactoryCall(initializer, { resolve })) {
      binding.kind = "translator";
    }
  }

  return { resolve };
}

function isTranslatorFactoryCall(call, bindings) {
  const expression = unwrapExpression(call.expression);
  return ts.isIdentifier(expression) && bindings.resolve(expression)?.kind === "translator-factory";
}

function sourceAnchor(node) {
  for (let current = node; current; current = current.parent) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) return `variable:${current.name.text}`;
    if (ts.isFunctionDeclaration(current) && current.name) return `function:${current.name.text}`;
    if (ts.isMethodDeclaration(current)) return `method:${propertyName(current.name) ?? "anonymous"}`;
    if (ts.isClassDeclaration(current) && current.name) return `class:${current.name.text}`;
  }
  return "module";
}

function addCandidate(candidates, source, node, kind, text) {
  const normalized = normalizeText(text);
  if (!hasText(normalized)) return;
  const anchor = sourceAnchor(node);
  const fingerprint = candidateFingerprint(kind, anchor, normalized);
  if (candidates.some((candidate) => candidate.fingerprint === fingerprint)) return;
  candidates.push({
    anchor,
    fingerprint,
    kind,
    line: lineAt(source, node.getStart(source)),
    path: source.fileName,
    text: normalized,
  });
}

function isProtocolIdentifier(text) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(text.trim());
}

function isTranslatorCall(call, bindings) {
  const expression = unwrapExpression(call.expression);
  if (ts.isIdentifier(expression) && bindings.resolve(expression)?.kind === "translator") return true;
  if (ts.isCallExpression(expression) && isTranslatorFactoryCall(expression, bindings)) return true;
  const receiver = ts.isPropertyAccessExpression(expression) ? unwrapExpression(expression.expression) : undefined;
  return Boolean(
    ts.isPropertyAccessExpression(expression) &&
      ["markup", "rich"].includes(expression.name.text) &&
      ts.isIdentifier(receiver) &&
      bindings.resolve(receiver)?.kind === "translator",
  );
}

function isTranslationInput(node, bindings) {
  let child = node;
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionLike(current)) return false;
    if (ts.isCallExpression(current) && isTranslatorCall(current, bindings)) {
      return current.arguments.includes(child);
    }
    child = current;
  }
  return false;
}

function isIgnoredCall(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (!ts.isCallExpression(current)) continue;
    const expression = current.expression;
    if (
      ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      ["console", "logger", "log"].includes(expression.expression.text)
    ) {
      return true;
    }
  }
  return false;
}

function nearestJsxAttribute(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxAttribute(current)) return current;
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) return undefined;
  }
  return undefined;
}

function nearestPropertyAssignment(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isPropertyAssignment(current)) return current;
    if (
      ts.isJsxAttribute(current) ||
      ts.isJsxElement(current) ||
      ts.isJsxSelfClosingElement(current) ||
      ts.isSourceFile(current) ||
      ts.isStatement(current)
    ) {
      return undefined;
    }
  }
  return undefined;
}

function isRenderedExpression(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxExpression(current)) return true;
    if (
      ts.isConditionalExpression(current) ||
      (ts.isBinaryExpression(current) &&
        [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(
          current.operatorToken.kind,
        ))
    ) {
      continue;
    }
    if (
      ts.isCallExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current)
    ) {
      continue;
    }
    return false;
  }
  return false;
}

function callName(call) {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
  return undefined;
}

function isUiFeedbackCall(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (!ts.isCallExpression(current)) continue;
    const name = callName(current);
    const argument = (() => {
      let child = node;
      while (child.parent && child.parent !== current) child = child.parent;
      return child;
    })();
    const index = current.arguments.indexOf(argument);
    if (["notify", "showToast", "toast"].includes(name ?? "")) return index === 0;
    if (!ts.isPropertyAccessExpression(current.expression)) continue;
    const receiver = current.expression.expression.getText();
    if (
      /(?:toast|notification|notifier|sonner|message|alert)/iu.test(receiver) &&
      ["error", "info", "success", "warning", "show"].includes(current.expression.name.text)
    ) {
      return index === 0;
    }
  }
  return false;
}

function isFormValidationContext(node) {
  const property = nearestPropertyAssignment(node);
  if (property && validationPropertyNames.has(propertyName(property.name) ?? "")) return true;
  for (let current = node.parent; current; current = current.parent) {
    if (!ts.isCallExpression(current)) continue;
    const name = callName(current);
    if (!["addIssue", "refine", "setError", "setFieldError", "superRefine"].includes(name ?? "")) continue;
    let argument = node;
    while (argument.parent && argument.parent !== current) argument = argument.parent;
    const index = current.arguments.indexOf(argument);
    if (index <= 0) continue;
    const argumentNode = current.arguments[index];
    if (!argumentNode || !ts.isObjectLiteralExpression(argumentNode)) return true;
    const argumentProperty = nearestPropertyAssignment(node);
    return Boolean(
      argumentProperty && validationPropertyNames.has(propertyName(argumentProperty.name) ?? ""),
    );
  }
  return false;
}

function isStableComparisonLiteral(node) {
  const parent = node.parent;
  return Boolean(
    parent &&
      ts.isBinaryExpression(parent) &&
      [
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ].includes(parent.operatorToken.kind),
  );
}

function isExportedDataLiteral(node) {
  let declaration;
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isVariableDeclaration(current)) {
      declaration = current;
      break;
    }
    if (ts.isSourceFile(current) || ts.isFunctionLike(current)) return false;
  }
  if (!declaration || !ts.isVariableDeclaration(declaration)) return false;
  const statement = declaration.parent?.parent;
  return Boolean(statement && ts.isVariableStatement(statement) && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function isUiDataProperty(node) {
  const property = nearestPropertyAssignment(node);
  if (!property) return false;
  const name = propertyName(property.name) ?? "";
  return visiblePropertyNames.has(name) || validationPropertyNames.has(name);
}

function literalKind(node, mode, bindings) {
  if (isTranslationInput(node, bindings) || isIgnoredCall(node) || isStableComparisonLiteral(node)) {
    return undefined;
  }
  const text = literalText(node);
  if (text === undefined || isProtocolIdentifier(text)) return undefined;

  const attribute = nearestJsxAttribute(node);
  if (attribute) return visibleAttributes.has(attribute.name.text) ? "accessible-attribute" : undefined;
  if (isRenderedExpression(node)) return "jsx-expression";
  if (isFormValidationContext(node)) return "validation-message";
  if (mode === "ui-data" && isExportedDataLiteral(node) && isUiDataProperty(node)) return "ui-data";
  const property = nearestPropertyAssignment(node);
  if (property && visiblePropertyNames.has(propertyName(property.name) ?? "")) return "ui-property";
  if (isUiFeedbackCall(node)) return "ui-feedback";
  return undefined;
}

function templateHasText(node) {
  return hasText(node.head.text) || node.templateSpans.some((span) => hasText(span.literal.text));
}

function templateText(node, source) {
  return `${node.head.text}${node.templateSpans
    .map((span) => `\${${span.expression.getText(source)}}${span.literal.text}`)
    .join("")}`;
}

function templateKind(node, mode, bindings) {
  if (isTranslationInput(node, bindings) || isIgnoredCall(node)) return undefined;
  const attribute = nearestJsxAttribute(node);
  if (attribute) return visibleAttributes.has(attribute.name.text) ? "accessible-attribute" : undefined;
  if (isRenderedExpression(node)) return "jsx-expression";
  if (isFormValidationContext(node)) return "validation-message";
  if (mode === "ui-data" && isExportedDataLiteral(node) && isUiDataProperty(node)) return "ui-data";
  const property = nearestPropertyAssignment(node);
  if (property && visiblePropertyNames.has(propertyName(property.name) ?? "")) return "ui-property";
  if (isUiFeedbackCall(node)) return "ui-feedback";
  return undefined;
}

function visibleExpressionKind(node) {
  let expression = node;
  for (let parent = expression.parent; parent; parent = expression.parent) {
    if (
      (ts.isAsExpression(parent) ||
        ts.isNonNullExpression(parent) ||
        ts.isParenthesizedExpression(parent) ||
        ts.isTypeAssertionExpression(parent)) &&
      parent.expression === expression
    ) {
      expression = parent;
      continue;
    }
    if (ts.isJsxExpression(parent) && parent.expression === expression) {
      const attribute = parent.parent;
      if (ts.isJsxAttribute(attribute)) {
        return visibleAttributes.has(attribute.name.text) ? "accessible-attribute" : undefined;
      }
      return "jsx-expression";
    }
    if (ts.isConditionalExpression(parent)) {
      if (parent.condition === expression) return undefined;
      if (parent.whenTrue === expression || parent.whenFalse === expression) {
        expression = parent;
        continue;
      }
      return undefined;
    }
    if (
      ts.isBinaryExpression(parent) &&
      [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(
        parent.operatorToken.kind,
      )
    ) {
      if (parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && parent.left === expression) {
        return undefined;
      }
      if (parent.left === expression || parent.right === expression) {
        expression = parent;
        continue;
      }
    }
    return undefined;
  }
  return undefined;
}

function visitResolvedExpression(source, node, candidates, kind, bindings, resolving) {
  const expression = unwrapExpression(node);
  if (!expression) return;

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    if (!isProtocolIdentifier(expression.text) && !isTranslationInput(expression, bindings)) {
      addCandidate(candidates, source, expression, kind, expression.text);
    }
    return;
  }

  if (ts.isTemplateExpression(expression)) {
    if (templateHasText(expression) && !isTranslationInput(expression, bindings)) {
      addCandidate(candidates, source, expression, kind, templateText(expression, source));
    }
    return;
  }

  if (ts.isConditionalExpression(expression)) {
    visitResolvedExpression(source, expression.whenTrue, candidates, kind, bindings, resolving);
    visitResolvedExpression(source, expression.whenFalse, candidates, kind, bindings, resolving);
    return;
  }

  if (
    ts.isBinaryExpression(expression) &&
    [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(
      expression.operatorToken.kind,
    )
  ) {
    visitResolvedExpression(source, expression.left, candidates, kind, bindings, resolving);
    visitResolvedExpression(source, expression.right, candidates, kind, bindings, resolving);
    return;
  }

  if (!ts.isIdentifier(expression)) return;
  const binding = bindings.resolve(expression);
  if (!binding?.immutable || !binding.initializer || resolving.has(binding.declaration)) return;
  resolving.add(binding.declaration);
  visitResolvedExpression(source, binding.initializer, candidates, kind, bindings, resolving);
  resolving.delete(binding.declaration);
}

function visit(source, node, candidates, mode, bindings) {
  if (ts.isJsxText(node) && hasText(node.text)) addCandidate(candidates, source, node, "jsx-text", node.text);

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    const kind = literalKind(node, mode, bindings);
    if (kind) addCandidate(candidates, source, node, kind, node.text);
  }

  if (ts.isTemplateExpression(node) && templateHasText(node)) {
    const kind = templateKind(node, mode, bindings);
    if (!kind) {
      ts.forEachChild(node, (child) => visit(source, child, candidates, mode, bindings));
      return;
    }
    addCandidate(candidates, source, node, kind, templateText(node, source));
  }

  if (ts.isIdentifier(node)) {
    const kind = visibleExpressionKind(node);
    if (kind) visitResolvedExpression(source, node, candidates, kind, bindings, new Set());
  }

  if (
    ts.isNewExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.expression.getText(source) === "Intl" &&
    ["DateTimeFormat", "DisplayNames", "ListFormat", "NumberFormat", "RelativeTimeFormat"].includes(
      node.expression.name.text,
    ) &&
    node.arguments?.[0] &&
    ts.isStringLiteral(node.arguments[0]) &&
    englishLocale.test(node.arguments[0].text)
  ) {
    addCandidate(candidates, source, node, "english-pinned-formatter", node.getText(source));
  }

  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ["toLocaleDateString", "toLocaleString", "toLocaleTimeString"].includes(node.expression.name.text) &&
    node.arguments[0] &&
    ts.isStringLiteral(node.arguments[0]) &&
    englishLocale.test(node.arguments[0].text)
  ) {
    addCandidate(candidates, source, node, "english-pinned-formatter", node.getText(source));
  }

  ts.forEachChild(node, (child) => visit(source, child, candidates, mode, bindings));
}

export function findUncatalogedUiStrings(fileName, code, { mode = "render", translatorFactories = coreTranslatorFactories } = {}) {
  const scriptKind = fileName.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.TSX;
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, scriptKind);
  const candidates = [];
  visit(source, source, candidates, mode, collectTranslatorBindings(source, translatorFactories));
  return candidates;
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function isSourcePath(path, extensions = sourceExtensions) {
  return extensions.has(extname(path)) && !ignoredSourceSuffix.test(path);
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(directory) {
  if (!(await pathExists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const entryPath = resolve(directory, entry.name);
        if (entry.isDirectory()) return walkFiles(entryPath);
        return entry.isFile() ? [entryPath] : [];
      }),
  );
  return nested.flat();
}

function resolveAlias(root, specifier) {
  if (specifier.startsWith("@/components/content/")) {
    return resolve(root, "components/marketing/content", specifier.slice("@/components/content/".length));
  }
  if (specifier.startsWith("@/app/(auth)/")) return resolve(root, "app/(regional)/(auth)", specifier.slice(13));
  if (specifier.startsWith("@/app/app/")) return resolve(root, "app/(regional)/app", specifier.slice(10));
  if (specifier.startsWith("@/app/cloud/")) return resolve(root, "app/(regional)/cloud", specifier.slice(12));
  if (specifier.startsWith("@/app/email/")) return resolve(root, "app/(regional)/email", specifier.slice(12));
  if (specifier.startsWith("@/app/invite/")) return resolve(root, "app/(regional)/invite", specifier.slice(13));
  if (specifier.startsWith("@/app/onboarding/")) return resolve(root, "app/(regional)/onboarding", specifier.slice(17));
  if (specifier.startsWith("@/app/setup/")) return resolve(root, "app/(regional)/setup", specifier.slice(12));
  return specifier.startsWith("@/") ? resolve(root, specifier.slice(2)) : undefined;
}

async function resolveLocalImport(root, fromFile, specifier) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return undefined;
  const base = specifier.startsWith(".") ? resolve(dirname(fromFile), specifier) : resolveAlias(root, specifier);
  if (!base) return undefined;
  const candidates = sourceExtensions.has(extname(base))
    ? [base]
    : [".ts", ".tsx"].flatMap((extension) => [base + extension, resolve(base, `index${extension}`)]);
  for (const candidate of candidates) if (await pathExists(candidate)) return candidate;
  return undefined;
}

function localImportSpecifiers(fileName, sourceText) {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, false, kind);
  const specifiers = [];
  source.forEachChild((statement) => {
    const isValueImport =
      ts.isImportDeclaration(statement) &&
      !statement.importClause?.isTypeOnly &&
      !(
        statement.importClause?.namedBindings &&
        ts.isNamedImports(statement.importClause.namedBindings) &&
        !statement.importClause.name &&
        statement.importClause.namedBindings.elements.every((element) => element.isTypeOnly)
      );
    const isValueExport = ts.isExportDeclaration(statement) && !statement.isTypeOnly;
    if ((isValueImport || isValueExport) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      specifiers.push(statement.moduleSpecifier.text);
    }
  });
  function visitDynamicImports(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visitDynamicImports);
  }
  ts.forEachChild(source, visitDynamicImports);
  return [...new Set(specifiers)];
}

async function importedSourceGraph(root, entries) {
  const queued = [...entries.map((entry) => resolve(root, entry))];
  const visited = new Set();
  while (queued.length > 0) {
    const current = queued.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    const source = await readFile(current, "utf8");
    const imports = await Promise.all(
      localImportSpecifiers(current, source).map((specifier) => resolveLocalImport(root, current, specifier)),
    );
    for (const imported of imports) if (imported && !visited.has(imported)) queued.push(imported);
  }
  return visited;
}

function relativeSource(root, path) {
  const normalized = toPosix(relative(root, path));
  if (normalized.startsWith("../") || normalized === "..") throw new Error(`Source escapes workspace: ${path}`);
  return normalized;
}

export async function discoverScopedSources(root, scope = coreUiI18nScope) {
  const applicationFiles = [];
  if (scope.kind === "core") {
    const applicationRoots = [resolve(root, "app/(regional)"), resolve(root, "components")];
    applicationFiles.push(
      ...(await Promise.all(applicationRoots.map((directory) => walkFiles(directory))))
        .flat()
        .filter((path) => isSourcePath(path, renderExtensions))
        .filter((path) => {
          const sourcePath = relativeSource(root, path);
          return !sourcePath.startsWith("components/marketing/") && !sourcePath.startsWith("components/docs/");
        }),
    );
    for (const path of coreUiI18nScope.application.topLevelEntries) {
      const absolute = resolve(root, path);
      if (await pathExists(absolute)) applicationFiles.push(absolute);
    }
  }

  const extensionRenderFiles = [];
  if (scope.kind === "extension") {
    const missingRenderEntries = [];
    for (const entry of scope.renderEntries) if (!(await pathExists(resolve(root, entry)))) missingRenderEntries.push(entry);
    if (missingRenderEntries.length > 0) {
      throw new Error(`Missing declared extension render entries:\n${missingRenderEntries.join("\n")}`);
    }
    const extensionGraph = await importedSourceGraph(root, scope.renderEntries);
    extensionRenderFiles.push(
      ...[...extensionGraph].filter(
        (path) =>
          isSourcePath(path, renderExtensions) &&
          (scope.renderSourcePrefixes.some((prefix) => relativeSource(root, path).startsWith(prefix)) ||
            scope.renderEntries.includes(relativeSource(root, path))),
      ),
    );
  }
  const renderFiles = [...new Set([...applicationFiles, ...extensionRenderFiles])].sort((left, right) =>
    relativeSource(root, left).localeCompare(relativeSource(root, right)),
  );
  const imported = await importedSourceGraph(root, renderFiles.map((path) => relativeSource(root, path)));
  const dataFiles = [];
  for (const path of imported) {
    if (extname(path) !== ".ts" || ignoredSourceSuffix.test(path)) continue;
    const sourcePath = relativeSource(root, path);
    const isCoreUiData =
      (sourcePath.startsWith("app/") || sourcePath.startsWith("components/")) &&
      !sourcePath.startsWith("components/docs/") &&
      !sourcePath.startsWith("components/marketing/");
    const isExtensionUiData = scope.kind === "extension" && scope.uiDataPrefixes.some((prefix) => sourcePath.startsWith(prefix));
    if ((scope.kind === "core" && !isCoreUiData) || (scope.kind === "extension" && !isExtensionUiData)) continue;
    dataFiles.push(path);
  }
  for (const path of scope.declaredUiDataSources) {
    assertExactSourcePath(path, "scope.declaredUiDataSources entry");
    if (extname(path) !== ".ts") throw new Error(`Declared UI data source must be a .ts file: ${path}`);
    const absolute = resolve(root, path);
    if (!(await pathExists(absolute))) throw new Error(`Missing declared UI data source: ${path}`);
    dataFiles.push(absolute);
  }

  return [
    ...renderFiles.map((path) => ({ kind: "render", path: relativeSource(root, path) })),
    ...dataFiles.map((path) => ({ kind: "ui-data", path: relativeSource(root, path) })),
  ].sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind));
}

function assertExactSourcePath(path, label) {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.includes("*") ||
    path.split("/").includes("..") ||
    path.endsWith("/")
  ) {
    throw new Error(`${label} must name one exact source file.`);
  }
  if (!sourceExtensions.has(extname(path))) throw new Error(`${label} must name a .ts or .tsx source file.`);
}

function assertException(exception, label) {
  assertExactSourcePath(exception?.path, `${label}.path`);
  for (const field of ["anchor", "fingerprint", "kind", "reason", "text"]) {
    if (typeof exception?.[field] !== "string" || exception[field].trim() === "") {
      throw new Error(`${label}.${field} is required.`);
    }
  }
  if (!/^[a-f\d]{64}$/u.test(exception.fingerprint)) throw new Error(`${label}.fingerprint must be a SHA-256 fingerprint.`);
}

function exceptionIdentity(path, fingerprint) {
  return `${path}\u0000${fingerprint}`;
}

function assertTranslatorFactoryProvenance(scope, scopeKind) {
  if (scope.translatorFactories === undefined) return;
  if (scopeKind !== "extension" || !Array.isArray(scope.translatorFactories)) {
    throw new Error("Only extension scopes may declare translatorFactories.");
  }
  const modules = new Set();
  for (const [index, factory] of scope.translatorFactories.entries()) {
    const label = `scope.translatorFactories[${index}]`;
    if (
      !factory ||
      typeof factory.module !== "string" ||
      !factory.module.startsWith("@/") ||
      factory.module.includes("*") ||
      factory.module.split("/").includes("..") ||
      !Array.isArray(factory.exports) ||
      factory.exports.length === 0
    ) {
      throw new Error(`${label} must declare one module and at least one exact export.`);
    }
    if (modules.has(factory.module)) throw new Error(`${label}.module is duplicated.`);
    modules.add(factory.module);
    const exports = new Set();
    for (const name of factory.exports) {
      if (typeof name !== "string" || !/^[$A-Z_a-z][$\w]*$/u.test(name) || exports.has(name)) {
        throw new Error(`${label}.exports must contain unique exact export names.`);
      }
      exports.add(name);
    }
  }
}

function translatorFactoriesForScope(scope) {
  const factories = new Map([...coreTranslatorFactories].map(([module, names]) => [module, new Set(names)]));
  for (const factory of scope.translatorFactories ?? []) {
    factories.set(factory.module, new Set(factory.exports));
  }
  return factories;
}

function validateRegistryShape(registry) {
  const scope = registry?.scope;
  const isCoreScope = scope?.kind === "core";
  const isExtensionScope = scope?.kind === "extension";
  if (
    !registry ||
    registry.schemaVersion !== 1 ||
    !scope ||
    (!isCoreScope && !isExtensionScope) ||
    (isCoreScope && JSON.stringify(scope.application) !== JSON.stringify(coreUiI18nScope.application)) ||
    !Array.isArray(scope.declaredUiDataSources) ||
    !Array.isArray(registry.sources) ||
    !Array.isArray(registry.exceptions)
  ) {
    throw new Error("Invalid UI i18n surface registry.");
  }
  if (isExtensionScope) {
    for (const field of ["excludedFamilies", "renderEntries", "renderSourcePrefixes", "uiDataPrefixes"]) {
      if (!Array.isArray(scope[field])) throw new Error(`Extension scope.${field} must be an array.`);
    }
    for (const [index, path] of scope.renderEntries.entries()) {
      assertExactSourcePath(path, `scope.renderEntries[${index}]`);
    }
    for (const field of ["excludedFamilies", "renderSourcePrefixes", "uiDataPrefixes"]) {
      for (const [index, path] of scope[field].entries()) {
        if (typeof path !== "string" || path.length === 0 || path.includes("*") || path.split("/").includes("..")) {
          throw new Error(`scope.${field}[${index}] must be a safe source prefix.`);
        }
      }
    }
  }
  assertTranslatorFactoryProvenance(scope, scope.kind);
  for (const [index, path] of scope.declaredUiDataSources.entries()) {
    assertExactSourcePath(path, `scope.declaredUiDataSources[${index}]`);
    if (extname(path) !== ".ts") throw new Error(`scope.declaredUiDataSources[${index}] must be a .ts file.`);
  }
  const paths = new Set();
  for (const [index, source] of registry.sources.entries()) {
    assertExactSourcePath(source?.path, `sources[${index}].path`);
    if (paths.has(source.path)) throw new Error(`Duplicate registry source: ${source.path}`);
    paths.add(source.path);
    if (!sourceKinds.has(source.kind)) throw new Error(`Invalid source kind for ${source.path}.`);
    if (!sourceStatuses.has(source.status)) throw new Error(`Invalid source status for ${source.path}.`);
  }
  const exceptionIdentities = new Set();
  for (const [index, exception] of registry.exceptions.entries()) {
    assertException(exception, `exceptions[${index}]`);
    const identity = exceptionIdentity(exception.path, exception.fingerprint);
    if (exceptionIdentities.has(identity)) {
      throw new Error(`Duplicate exception fingerprint for ${exception.path}: ${exception.fingerprint}`);
    }
    exceptionIdentities.add(identity);
    const source = registry.sources.find((entry) => entry.path === exception.path);
    if (!source || source.status !== "excluded") {
      throw new Error(`Exception ${exception.path} must belong to an exact excluded source.`);
    }
  }
  for (const source of registry.sources.filter((entry) => entry.status === "excluded")) {
    if (!registry.exceptions.some((exception) => exception.path === source.path)) {
      throw new Error(`Excluded source ${source.path} needs at least one exact exception.`);
    }
  }
}

function sourceMap(sources) {
  return new Map(sources.map((source) => [source.path, source]));
}

function exceptionMatchesCandidate(exception, candidate) {
  return (
    exception.path === candidate.path &&
    exception.anchor === candidate.anchor &&
    exception.fingerprint === candidate.fingerprint &&
    exception.kind === candidate.kind &&
    exception.text === candidate.text
  );
}

export async function checkUiI18nBoundaries({ complete = false, registryPath, root = process.cwd(), scopeKind } = {}) {
  const absoluteRegistryPath = registryPath ? resolve(registryPath) : resolve(root, registryRelativePath);
  const registry = JSON.parse(await readFile(absoluteRegistryPath, "utf8"));
  validateRegistryShape(registry);
  if (scopeKind && registry.scope.kind !== scopeKind) {
    throw new Error(`Registry scope is ${registry.scope.kind}, not ${scopeKind}.`);
  }
  const translatorFactories = translatorFactoriesForScope(registry.scope);
  const discovered = await discoverScopedSources(root, registry.scope);
  const discoveredByPath = sourceMap(discovered);
  const registryByPath = sourceMap(registry.sources);
  const errors = [];

  for (const source of discovered) {
    const registered = registryByPath.get(source.path);
    if (!registered) errors.push(`Unclassified scoped source: ${source.path}`);
    else if (registered.kind !== source.kind) errors.push(`Stale source kind for ${source.path}: expected ${source.kind}.`);
  }
  for (const source of registry.sources) {
    if (!discoveredByPath.has(source.path)) errors.push(`Stale registry source: ${source.path}`);
  }

  const pending = registry.sources.filter((source) => source.status === "pending");
  if (complete && pending.length > 0) {
    errors.push(`Strict final completion is blocked by ${pending.length} pending source(s):\n${pending.map((source) => source.path).join("\n")}`);
  }

  const scannedExceptions = new Set();
  for (const source of registry.sources.filter((entry) => entry.status !== "pending" && discoveredByPath.has(entry.path))) {
    const candidates = findUncatalogedUiStrings(
      source.path,
      await readFile(resolve(root, source.path), "utf8"),
      { mode: source.kind, translatorFactories },
    );
    for (const candidate of candidates) {
      const exception = registry.exceptions.find(
        (entry) => entry.path === source.path && exceptionMatchesCandidate(entry, candidate),
      );
      if (exception) scannedExceptions.add(exceptionIdentity(exception.path, exception.fingerprint));
      else errors.push(`${source.path}:${candidate.line} ${candidate.kind} (${candidate.anchor})`);
    }
  }
  for (const exception of registry.exceptions) {
    if (!scannedExceptions.has(exceptionIdentity(exception.path, exception.fingerprint))) {
      errors.push(`Unused or stale exception: ${exception.path} ${exception.anchor} ${exception.fingerprint}`);
    }
  }

  return {
    completed: registry.sources.filter((source) => source.status !== "pending").length,
    discovered,
    errors,
    pending: pending.length,
    registry,
  };
}

export async function writeUiI18nRegistry({ registryPath, root = process.cwd(), scopeKind = "core" } = {}) {
  const absoluteRegistryPath = registryPath ? resolve(registryPath) : resolve(root, registryRelativePath);
  const existing = (await pathExists(absoluteRegistryPath))
    ? JSON.parse(await readFile(absoluteRegistryPath, "utf8"))
    : { exceptions: [], schemaVersion: 1, sources: [] };
  if (existing.schemaVersion !== 1 || !Array.isArray(existing.sources) || !Array.isArray(existing.exceptions)) {
    throw new Error("Cannot update an invalid UI i18n surface registry.");
  }
  if (scopeKind !== "core" && scopeKind !== "extension") throw new Error(`Unknown UI i18n scope: ${scopeKind}.`);
  if (scopeKind === "extension" && !existing.scope) throw new Error("An extension registry must declare its scope.");
  const expectedScope = scopeKind === "core" ? coreUiI18nScope : existing.scope;
  if (existing.scope?.kind && existing.scope.kind !== scopeKind) {
    throw new Error(`Registry scope is ${existing.scope.kind}, not ${scopeKind}.`);
  }
  const scope = scopeKind === "core"
    ? { ...coreUiI18nScope, ...existing.scope, declaredUiDataSources: existing.scope?.declaredUiDataSources ?? [] }
    : { ...expectedScope, declaredUiDataSources: existing.scope.declaredUiDataSources ?? [] };
  const known = sourceMap(existing.sources);
  const discovered = await discoverScopedSources(root, scope);
  const sources = discovered.map((source) => {
    const current = known.get(source.path);
    return current ? { ...current, kind: source.kind } : { ...source, status: "pending" };
  });
  const knownPaths = new Set(sources.map((source) => source.path));
  const registry = {
    exceptions: existing.exceptions.filter((exception) => knownPaths.has(exception.path)),
    schemaVersion: 1,
    scope,
    sources,
  };
  validateRegistryShape(registry);
  await writeFile(absoluteRegistryPath, `${JSON.stringify(registry, null, 2)}\n`);
  return registry;
}

function formatResult(result) {
  return `UI i18n inventory: ${result.completed} completed, ${result.pending} pending, ${result.discovered.length} scoped source(s).`;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write-registry");
  const complete = args.includes("--complete");
  const scopeIndex = args.indexOf("--scope");
  const scopeKind = scopeIndex >= 0 ? args[scopeIndex + 1] : "core";
  const registryIndex = args.indexOf("--registry");
  const registryPath = registryIndex >= 0 ? args[registryIndex + 1] : undefined;
  if (scopeIndex >= 0 && !scopeKind) throw new Error("--scope requires core or extension.");
  if (registryIndex >= 0 && !registryPath) throw new Error("--registry requires a path.");
  if (write) {
    const registry = await writeUiI18nRegistry({ registryPath, scopeKind });
    process.stdout.write(`Wrote UI i18n inventory with ${registry.sources.length} scoped source(s).\n`);
    return;
  }
  const result = await checkUiI18nBoundaries({ complete, registryPath, scopeKind });
  if (result.errors.length > 0) throw new Error(`UI i18n coverage check failed:\n${result.errors.join("\n")}`);
  process.stdout.write(`${formatResult(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
