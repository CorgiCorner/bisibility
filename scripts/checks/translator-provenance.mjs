import ts from "@typescript/typescript6";
import { propertyName, unwrapExpression } from "./translator-syntax.mjs";

export function createTranslatorProvenance({
  source,
  bindings,
  resolve,
  writes,
  analyze,
  parameterType,
  parameterPropertyIsTranslator,
  isTranslatorType,
  unwrapType,
}) {
  function functionLike(binding) {
    if (
      !binding ||
      bindings.some(
        (other) =>
          other !== binding && other.name === binding.name && other.scope === binding.scope,
      )
    )
      return undefined;
    if (writes.some((id) => resolve(id) === binding)) return undefined;
    const declaration = binding.declaration;
    if (ts.isFunctionDeclaration(declaration)) return declaration.body ? declaration : undefined;
    const init = binding.immutable && binding.initializer && unwrapExpression(binding.initializer);
    return init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? init : undefined;
  }

  function terminates(node) {
    if (ts.isReturnStatement(node) || ts.isThrowStatement(node)) return true;
    if (ts.isBlock(node)) return !!node.statements.length && terminates(node.statements.at(-1));
    if (ts.isIfStatement(node))
      return (
        !!node.elseStatement && terminates(node.thenStatement) && terminates(node.elseStatement)
      );
    if (!ts.isSwitchStatement(node) || !node.caseBlock.clauses.some(ts.isDefaultClause))
      return false;
    const clauses = node.caseBlock.clauses;
    return (
      clauses.length > 0 &&
      clauses.every((clause, index) => {
        if (clause.statements.length) return terminates(clause.statements.at(-1));
        return index < clauses.length - 1;
      })
    );
  }

  function returnExpressions(fn) {
    if (fn.asteriskToken) return [];
    if (!ts.isBlock(fn.body)) return [fn.body];
    if (!terminates(fn.body)) return [];
    const returns = [];
    function walk(node) {
      if (ts.isReturnStatement(node)) returns.push(node.expression);
      else if (!ts.isFunctionLike(node)) ts.forEachChild(node, walk);
    }
    walk(fn.body);
    return returns;
  }

  function allReturns(fn, seen, test) {
    if (!fn || seen.has(fn)) return false;
    const next = new Set(seen).add(fn);
    const results = returnExpressions(fn);
    return (
      results.length > 0 &&
      results.every((expression) => expression !== undefined && test(expression, next))
    );
  }

  function isFactoryBinding(binding, seen = new Set()) {
    if (binding?.kind === "translator-factory") return true;
    return !binding?.importSource && allReturns(functionLike(binding), seen, isTranslatorValue);
  }

  function isTranslatorValue(expression, seen = new Set()) {
    const current = unwrapExpression(expression);
    if (!current) return false;
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      return allReturns(current, seen, (value) => {
        const call = unwrapExpression(value);
        return (
          !!call &&
          ts.isCallExpression(call) &&
          ts.isIdentifier(call.expression) &&
          isTranslatorValue(call.expression, seen)
        );
      });
    }
    if (ts.isCallExpression(current))
      return (
        ts.isIdentifier(current.expression) && isFactoryBinding(resolve(current.expression), seen)
      );
    const binding = ts.isIdentifier(current) ? resolve(current) : undefined;
    if (!binding || seen.has(binding) || writes.some((id) => resolve(id) === binding)) return false;
    if (binding.kind === "translator") return true;
    const next = new Set(seen).add(binding);
    if (binding.parameter) {
      const type = parameterType(binding) ?? contextualParameterType(binding.parameter);
      return !!type && isTranslatorType(type, type.getStart(source));
    }
    if (binding.bindingElement) return isTranslatorProperty(binding, next);
    return (
      !!binding.immutable && !!binding.initializer && isTranslatorValue(binding.initializer, next)
    );
  }

  function returnsTranslatorProperty(callee, key, seen) {
    return allReturns(functionLike(callee), seen, (expression, next) => {
      const object = unwrapExpression(expression);
      if (
        !object ||
        !ts.isObjectLiteralExpression(object) ||
        object.properties.some(ts.isSpreadAssignment)
      )
        return false;
      const matches = object.properties.filter(
        (property) => property.name && propertyName(property.name) === key,
      );
      if (matches.length !== 1) return false;
      const [property] = matches;
      return ts.isShorthandPropertyAssignment(property)
        ? isTranslatorValue(property.name, next)
        : ts.isPropertyAssignment(property) && isTranslatorValue(property.initializer, next);
    });
  }

  function isTranslatorProperty(binding, seen) {
    const element = binding.bindingElement;
    const pattern = element.parent;
    if (!binding.immutable || element.initializer || element.dotDotDotToken) return false;
    if (ts.isArrayBindingPattern(pattern) && pattern.parent === binding.declaration) {
      const call = unwrapExpression(binding.declaration.initializer);
      if (!call || !ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression))
        return false;
      const receiver = call.expression.expression;
      if (
        !ts.isIdentifier(receiver) ||
        receiver.text !== "Promise" ||
        resolve(receiver) ||
        call.expression.name.text !== "all"
      )
        return false;
      const [array] = call.arguments;
      const index = pattern.elements.indexOf(element);
      return (
        call.arguments.length === 1 &&
        !!array &&
        ts.isArrayLiteralExpression(array) &&
        !array.elements.some(ts.isSpreadElement) &&
        index >= 0 &&
        !!array.elements[index] &&
        isTranslatorValue(array.elements[index], seen)
      );
    }
    if (!ts.isObjectBindingPattern(pattern) || pattern.parent !== binding.declaration) return false;
    const key = element.propertyName ? propertyName(element.propertyName) : binding.name;
    const call = unwrapExpression(binding.declaration.initializer);
    if (key && call && ts.isIdentifier(call)) {
      const owner = resolve(call);
      return (
        !!owner &&
        !writes.some((id) => resolve(id) === owner) &&
        parameterPropertyIsTranslator(owner, key)
      );
    }
    if (!key || !call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression))
      return false;
    const callee = resolve(call.expression);
    if (!callee?.importSource) return returnsTranslatorProperty(callee, key, seen);
    return !!analyze(callee.importSource.specifier)?.exportedReturnsTranslatorProperty(
      callee.importSource.importedName,
      key,
    );
  }

  function contextualParameterType(parameter) {
    const fn = parameter.parent;
    const call = fn?.parent;
    if (
      !ts.isIdentifier(parameter.name) ||
      !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))
    )
      return undefined;
    if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return undefined;
    const index = call.arguments.indexOf(fn);
    if (index < 0 || call.arguments.slice(0, index).some(ts.isSpreadElement)) return undefined;
    const target = functionLike(resolve(call.expression))?.parameters[index];
    let type = target && !target.dotDotDotToken ? unwrapType(target.type) : undefined;
    if (type && ts.isUnionTypeNode(type)) {
      const functions = type.types.map(unwrapType).filter(ts.isFunctionTypeNode);
      type = functions.length === 1 ? functions[0] : undefined;
    }
    const contextual =
      type && ts.isFunctionTypeNode(type)
        ? type.parameters[fn.parameters.indexOf(parameter)]
        : undefined;
    return contextual && !contextual.dotDotDotToken ? contextual.type : undefined;
  }

  return {
    isFactoryBinding,
    isTranslatorValue,
    isTranslatorProperty,
    returnsTranslatorProperty,
    contextualParameterType,
  };
}
