import ts from "@typescript/typescript6";
import {
  bindingNames,
  bindingScope,
  isConstDeclaration,
  propertyName,
  unwrapExpression,
  unwrapType,
} from "./translator-syntax.mjs";
import { analyzeImportedModule } from "./translator-modules.mjs";
import { createTranslatorProvenance } from "./translator-provenance.mjs";
import { createTranslatorTypeProof } from "./translator-types.mjs";
import { provesContractAlias } from "./translator-contracts.mjs";

export function collectTranslatorBindings(source, translatorFactories, context) {
  const bindings = [];
  const typeAliases = [];
  const writes = [];
  const namedImports = new Map();
  const starExports = [];

  function addBinding(
    name,
    declaration,
    {
      factory = false,
      immutable = false,
      initializer,
      nameNode = name,
      parameter,
      scope,
      hoisted = false,
      importSource,
      bindingElement,
    } = {},
  ) {
    if (!scope) return;
    bindings.push({
      declaration,
      hoisted,
      importSource,
      bindingElement,
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
          const importSource = { specifier: node.moduleSpecifier.text, importedName };
          namedImports.set(element.name.text, importSource);
          if (element.isTypeOnly && !factoryNames?.has(importedName)) continue;
          addBinding(element.name, element, {
            factory: factoryNames?.has(importedName),
            importSource,
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
          bindingElement: ts.isBindingElement(name.parent) ? name.parent : undefined,
          initializer: ts.isIdentifier(node.name) ? node.initializer : undefined,
          scope,
        }),
      );
    }

    if (ts.isParameter(node)) {
      const scope = bindingScope(node);
      bindingNames(node.name, (name) =>
        addBinding(name, node, { nameNode: name, parameter: node, scope }),
      );
    }

    if ((ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name) {
      addBinding(node.name, node, {
        scope: bindingScope(node),
        hoisted: ts.isFunctionDeclaration(node),
      });
    }

    if (
      ts.isTypeAliasDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      (ts.isClassDeclaration(node) && node.name)
    ) {
      typeAliases.push({
        declaration: node,
        name: node.name.text,
        scope: bindingScope(node),
        start: node.getStart(source),
      });
    }

    if (
      ts.isExportDeclaration(node) &&
      !node.exportClause &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      starExports.push(node.moduleSpecifier.text);
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      const target = ts.isPropertyAccessExpression(node.left) ? node.left.expression : node.left;
      if (ts.isIdentifier(target)) writes.push(target);
    }
    if (
      (ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node)) &&
      ts.isIdentifier(node.operand) &&
      [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)
    )
      writes.push(node.operand);
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
          (binding.factory || binding.hoisted || binding.start <= position),
      )
      .sort(
        (left, right) =>
          left.scope.end - left.scope.pos - (right.scope.end - right.scope.pos) ||
          right.start - left.start,
      )[0];
  }

  function resolveTypeAlias(name, position) {
    return typeAliases
      .filter(
        (alias) =>
          alias.name === name &&
          alias.scope &&
          alias.scope.pos <= position &&
          position <= alias.scope.end,
      )
      .sort(
        (left, right) =>
          left.scope.end - left.scope.pos - (right.scope.end - right.scope.pos) ||
          right.start - left.start,
      )[0];
  }

  const analyze = (specifier) =>
    analyzeImportedModule(specifier, context, collectTranslatorBindings);
  let types;
  const proof = createTranslatorProvenance({
    source,
    bindings,
    resolve,
    writes,
    analyze,
    parameterType: (binding) => types.parameterBindingType(binding),
    parameterPropertyIsTranslator: (binding, key) =>
      !!binding.parameter?.type &&
      types.isTranslatorPropertyType(
        binding.parameter.type,
        key,
        binding.parameter.type.getStart(source),
      ),
    isTranslatorType: (...args) => types.isTranslatorType(...args),
    unwrapType,
  });
  types = createTranslatorTypeProof({
    source,
    resolve,
    resolveTypeAlias,
    namedImports,
    analyze,
    proof,
    provesContract: (declaration) => provesContractAlias(declaration, context, analyze),
  });

  for (const binding of bindings.filter((entry) => entry.parameter)) {
    const type =
      types.parameterBindingType(binding) ?? proof.contextualParameterType(binding.parameter);
    if (
      !writes.some((id) => resolve(id) === binding) &&
      (types.parameterIsTranslator(binding) ||
        (type && types.isTranslatorType(type, type.getStart(source))))
    )
      binding.kind = "translator";
  }
  for (const binding of bindings
    .filter((entry) => entry.immutable)
    .sort((a, b) => a.start - b.start)) {
    if (
      !writes.some((id) => resolve(id) === binding) &&
      (binding.bindingElement
        ? proof.isTranslatorProperty(binding, new Set())
        : binding.initializer && proof.isTranslatorValue(binding.initializer))
    )
      binding.kind = "translator";
  }
  const exported = (name, guard) =>
    source.statements.find(
      (s) =>
        guard(s) &&
        s.name?.text === name &&
        s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
    );
  return {
    resolve,
    exportedTranslatorPropertyType: (name, key) => {
      const declaration = exported(name, ts.isTypeAliasDeclaration);
      if (declaration)
        return types.isTranslatorPropertyType(
          declaration.type,
          key,
          declaration.type.getStart(source),
        );
      return starExports.some((specifier) =>
        analyze(specifier)?.exportedTranslatorPropertyType(name, key),
      );
    },
    exportedTranslatorFactory: (name) => {
      const declaration = exported(name, ts.isFunctionDeclaration);
      return (
        !!declaration &&
        proof.isFactoryBinding(bindings.find((binding) => binding.declaration === declaration))
      );
    },
    exportedReturnsTranslatorProperty: (name, key) => {
      const declaration = exported(name, ts.isFunctionDeclaration);
      return (
        !!declaration &&
        proof.returnsTranslatorProperty(
          bindings.find((b) => b.declaration === declaration),
          key,
          new Set(),
        )
      );
    },
    exportedTranslatorType: (name) => {
      const declaration = exported(name, ts.isTypeAliasDeclaration);
      if (declaration)
        return (
          provesContractAlias(declaration, context, analyze) ||
          types.isTranslatorType(declaration.type, declaration.type.getStart(source))
        );
      return starExports.some((specifier) => analyze(specifier)?.exportedTranslatorType(name));
    },
  };
}
