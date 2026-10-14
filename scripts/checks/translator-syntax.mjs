import ts from "@typescript/typescript6";

export function unwrapExpression(node) {
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

export function bindingScope(node) {
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

export function bindingNames(name, add) {
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

export function isConstDeclaration(declaration) {
  const list = declaration.parent;
  return ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0;
}

export function propertyName(node) {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined;
}
export function unwrapType(type) {
  let current = type;
  while (current && ts.isParenthesizedTypeNode(current)) current = current.type;
  return current;
}
