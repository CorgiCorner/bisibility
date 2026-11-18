import ts from "@typescript/typescript6";

const translatorMethods = new Set(["rich", "markup", "raw", "has"]);
const reactHooks = new Set(["useCallback", "useMemo", "useEffect"]);

type Refuse = (node: ts.Node, kind: "binding" | "namespace", detail: string) => never;
type Parts = { parts: ts.Type[]; foreign: boolean };

export function createFlow(checker: ts.TypeChecker, refuse: Refuse) {
  function unwrapPromise(type: ts.Type) {
    const name = (type.getSymbol() ?? type.aliasSymbol)?.getName();
    return name === "Promise" || name === "PromiseLike"
      ? (checker.getAwaitedType(type) ?? type)
      : type;
  }
  function translatorType(type: ts.Type) {
    const symbol = type.aliasSymbol;
    const declaration = symbol?.declarations?.[0]?.getSourceFile().fileName ?? "";
    return symbol?.name === "Translator" && declaration.includes("/use-intl/") ? type : undefined;
  }
  function classify(type: ts.Type): Parts {
    if (type.flags & ts.TypeFlags.TypeParameter) {
      const constraint = checker.getBaseConstraintOfType(type);
      return constraint && constraint !== type
        ? classify(constraint)
        : { parts: [], foreign: false };
    }
    const awaited = unwrapPromise(type);
    if (awaited !== type) return classify(awaited);
    if (!type.isUnion()) {
      const one = translatorType(type);
      return one ? { parts: [one], foreign: false } : { parts: [], foreign: false };
    }
    const members = type.types.filter(
      (part) => !(part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)),
    );
    const parts: ts.Type[] = [];
    let foreign = false;
    for (const member of members) {
      const found = translatorType(unwrapPromise(member));
      if (found) parts.push(found);
      else foreign = true;
    }
    return parts.length ? { parts, foreign } : { parts: [], foreign: false };
  }
  function sameNamespace(source: ts.Type, context: ts.Type) {
    const left = source.aliasTypeArguments?.[1];
    const right = context.aliasTypeArguments?.[1];
    if (!left || !right) return false;
    if (left.flags & ts.TypeFlags.Never && right.flags & ts.TypeFlags.Never) return true;
    return left.isStringLiteral() && right.isStringLiteral() && left.value === right.value;
  }
  function matches(parts: readonly ts.Type[], slot: ts.Type | undefined) {
    const expected = slot ? classify(slot) : undefined;
    return (
      !!expected &&
      !expected.foreign &&
      expected.parts.length > 0 &&
      parts.every((part) => expected.parts.some((item) => sameNamespace(part, item)))
    );
  }
  function outermost(expression: ts.Expression): ts.Expression {
    let current = expression;
    while (
      current.parent &&
      ts.isParenthesizedExpression(current.parent) &&
      current.parent.expression === current
    )
      current = current.parent;
    return current;
  }
  function isConst(declaration: ts.VariableDeclaration) {
    const list = declaration.parent;
    return ts.isVariableDeclarationList(list) && !!(list.flags & ts.NodeFlags.Const);
  }
  function methodObject(expression: ts.Expression) {
    const parent = expression.parent;
    const member =
      parent && ts.isPropertyAccessExpression(parent) && parent.expression === expression
        ? parent.name.text
        : parent &&
            ts.isElementAccessExpression(parent) &&
            parent.expression === expression &&
            ts.isStringLiteralLike(parent.argumentExpression)
          ? parent.argumentExpression.text
          : undefined;
    return member !== undefined && translatorMethods.has(member);
  }
  function callee(expression: ts.Expression) {
    const node = outermost(expression);
    const parent = node.parent;
    if (parent && ts.isCallExpression(parent) && parent.expression === node) return true;
    if (!methodObject(node)) return false;
    const call = node.parent?.parent;
    return !!call && ts.isCallExpression(call) && call.expression === node.parent;
  }
  function reactHook(expression: ts.Expression) {
    const symbol = checker.getSymbolAtLocation(expression);
    if (!symbol || !reactHooks.has(symbol.name)) return false;
    let resolved = symbol;
    while (resolved.flags & ts.SymbolFlags.Alias) resolved = checker.getAliasedSymbol(resolved);
    return (resolved.declarations?.[0]?.getSourceFile().fileName ?? "").includes("/react/");
  }
  function dependencyElement(expression: ts.Expression) {
    const node = outermost(expression);
    const list = node.parent;
    const call = list?.parent;
    return (
      !!list &&
      ts.isArrayLiteralExpression(list) &&
      !!call &&
      ts.isCallExpression(call) &&
      call.arguments[0] !== list &&
      call.arguments.includes(list) &&
      reactHook(call.expression)
    );
  }
  function parameterType(signature: ts.Signature | undefined, index: number) {
    const declaration = signature?.declaration;
    const declared =
      declaration && ts.isFunctionLike(declaration)
        ? checker.getSignatureFromDeclaration(declaration)
        : undefined;
    const parameters = declared?.getParameters() ?? [];
    const last = parameters[parameters.length - 1];
    const parameterDeclaration = last?.valueDeclaration ?? last?.declarations?.[0];
    const rest =
      parameterDeclaration &&
      ts.isParameter(parameterDeclaration) &&
      parameterDeclaration.dotDotDotToken
        ? last
        : undefined;
    const parameter = rest && index >= parameters.length - 1 ? rest : parameters[index];
    return parameter ? checker.getTypeOfSymbol(parameter) : undefined;
  }
  function constInitializer(expression: ts.Expression, parts: readonly ts.Type[]) {
    const node = outermost(expression);
    const parent = node.parent;
    if (!parent || !ts.isVariableDeclaration(parent) || parent.initializer !== node) return false;
    if (!ts.isIdentifier(parent.name) || !isConst(parent)) return false;
    return parent.type ? matches(parts, checker.getTypeFromTypeNode(parent.type)) : true;
  }
  function propertyOf(expression: ts.Expression) {
    const node = outermost(expression);
    const parent = node.parent;
    if (
      parent &&
      ts.isPropertyAssignment(parent) &&
      parent.initializer === node &&
      (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name))
    )
      return { object: parent.parent, name: parent.name.text };
    if (parent && ts.isShorthandPropertyAssignment(parent) && parent.name === node)
      return { object: parent.parent, name: parent.name.text };
    return undefined;
  }
  function destructureValue(expression: ts.Expression) {
    const property = propertyOf(expression);
    if (!property || !ts.isObjectLiteralExpression(property.object)) return false;
    const node = outermost(property.object);
    const declaration = node.parent;
    return (
      !!declaration &&
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer === node &&
      !declaration.type &&
      !ts.isIdentifier(declaration.name) &&
      isConst(declaration)
    );
  }
  function argumentSlot(expression: ts.Expression, parts: readonly ts.Type[]) {
    const node = outermost(expression);
    const parent = node.parent;
    if (!parent || !ts.isCallExpression(parent)) return false;
    const index = parent.arguments.indexOf(node);
    return index >= 0 && matches(parts, parameterType(checker.getResolvedSignature(parent), index));
  }
  function jsxSlot(expression: ts.Expression, parts: readonly ts.Type[]) {
    const node = outermost(expression);
    const holder = node.parent;
    const attribute = holder && ts.isJsxExpression(holder) ? holder.parent : holder;
    const opening = attribute?.parent?.parent;
    if (
      !attribute ||
      !ts.isJsxAttribute(attribute) ||
      !ts.isIdentifier(attribute.name) ||
      !opening ||
      !ts.isJsxOpeningLikeElement(opening)
    )
      return false;
    const symbol = checker.getSymbolAtLocation(opening.tagName);
    if (!symbol) return false;
    const resolved =
      symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const props = parameterType(checker.getTypeOfSymbol(resolved).getCallSignatures()[0], 0);
    const property = props?.getProperty(attribute.name.text);
    return matches(parts, property ? checker.getTypeOfSymbol(property) : undefined);
  }
  function ownerOf(expression: ts.Expression) {
    const node = outermost(expression);
    const parent = node.parent;
    if (parent && ts.isArrowFunction(parent) && parent.body === node) return parent;
    if (!parent || !ts.isReturnStatement(parent) || parent.expression !== node) return undefined;
    const owner = parent.parent?.parent;
    return owner && ts.isFunctionLike(owner) ? owner : undefined;
  }
  function declaredReturn(owner: ts.SignatureDeclaration | undefined) {
    return owner?.type ? unwrapPromise(checker.getTypeFromTypeNode(owner.type)) : undefined;
  }
  function returnedProperty(expression: ts.Expression, parts: readonly ts.Type[]) {
    const property = propertyOf(expression);
    if (!property || !ts.isObjectLiteralExpression(property.object)) return false;
    const slot = declaredReturn(ownerOf(property.object));
    const field = slot ? checker.getApparentType(slot).getProperty(property.name) : undefined;
    return matches(parts, field ? checker.getTypeOfSymbol(field) : undefined);
  }
  function returnedValue(expression: ts.Expression, parts: readonly ts.Type[]) {
    return matches(parts, declaredReturn(ownerOf(expression)));
  }
  function placed(expression: ts.Expression, parts: readonly ts.Type[]) {
    return (
      callee(expression) ||
      dependencyElement(expression) ||
      constInitializer(expression, parts) ||
      destructureValue(expression) ||
      argumentSlot(expression, parts) ||
      jsxSlot(expression, parts) ||
      returnedProperty(expression, parts) ||
      returnedValue(expression, parts)
    );
  }
  function allowed(expression: ts.Expression, parts: readonly ts.Type[]) {
    if (placed(expression, parts)) return true;
    const node = outermost(expression);
    const parent = node.parent;
    return (
      !!parent &&
      ts.isAwaitExpression(parent) &&
      parent.expression === node &&
      placed(parent, parts)
    );
  }
  function bindsTranslator(node: ts.Node) {
    return classify(checker.getTypeAtLocation(node)).parts.length > 0;
  }
  function accepted(expression: ts.Expression) {
    const found = classify(checker.getTypeAtLocation(expression));
    if (!found.parts.length) return true;
    if (found.foreign) return false;
    return allowed(expression, found.parts);
  }
  function memberName(expression: ts.Expression) {
    if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
    if (
      ts.isElementAccessExpression(expression) &&
      ts.isStringLiteralLike(expression.argumentExpression)
    )
      return expression.argumentExpression.text;
    return undefined;
  }
  function typesOf(expression: ts.Expression) {
    const direct = classify(checker.getTypeAtLocation(expression));
    if (direct.parts.length && !direct.foreign) return direct.parts;
    if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression))
      return [];
    const parent = classify(checker.getTypeAtLocation(expression.expression));
    if (!parent.parts.length || parent.foreign) return [];
    const member = memberName(expression);
    if (member && translatorMethods.has(member)) return parent.parts;
    return refuse(expression, "namespace", "unresolved translator member");
  }
  function isHas(expression: ts.Expression) {
    return memberName(expression) === "has";
  }
  return { accepted, bindsTranslator, typesOf, isHas };
}
