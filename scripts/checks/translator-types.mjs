import ts from "@typescript/typescript6";
import { propertyName, unwrapType } from "./translator-syntax.mjs";

export function createTranslatorTypeProof({
  source,
  resolve,
  resolveTypeAlias,
  namedImports,
  analyze,
  proof,
  provesContract,
}) {
  function shadowsAlias(type, name) {
    for (let node = type.parent; node; node = node.parent)
      if (node.typeParameters?.some((parameter) => parameter.name.text === name)) return true;
    return false;
  }

  function isTranslatorType(type, position, seen = new Set()) {
    const current = unwrapType(type);
    if (!current || !ts.isTypeReferenceNode(current) || !ts.isIdentifier(current.typeName))
      return false;
    const name = current.typeName.text;
    if (shadowsAlias(current, name)) return false;
    const alias = resolveTypeAlias(name, position);
    if (alias) {
      if (!ts.isTypeAliasDeclaration(alias.declaration)) return false;
      if (seen.has(alias.declaration)) return false;
      if (provesContract(alias.declaration)) return true;
      return isTranslatorType(
        alias.declaration.type,
        alias.declaration.type.getStart(source),
        new Set(seen).add(alias.declaration),
      );
    }
    const imported = namedImports.get(name);
    if (imported?.specifier === "next-intl" && imported.importedName === "_Translator") return true;
    if (imported)
      return !!analyze(imported.specifier)?.exportedTranslatorType(imported.importedName);
    const [argument] = current.typeArguments ?? [];
    if (["Awaited", "Promise"].includes(name) && argument)
      return isTranslatorType(argument, position, seen);
    return (
      name === "ReturnType" &&
      argument &&
      ts.isTypeQueryNode(argument) &&
      ts.isIdentifier(argument.exprName) &&
      proof.isFactoryBinding(resolve(argument.exprName))
    );
  }

  function propertyType(type, name, position, seen = new Set()) {
    const current = unwrapType(type);
    if (!current) return undefined;
    if (ts.isTypeLiteralNode(current)) {
      return current.members.find(
        (member) => ts.isPropertySignature(member) && propertyName(member.name) === name,
      )?.type;
    }
    if (ts.isIntersectionTypeNode(current)) {
      for (const nested of current.types) {
        const property = propertyType(nested, name, position, seen);
        if (property) return property;
      }
      return undefined;
    }
    if (!ts.isTypeReferenceNode(current) || !ts.isIdentifier(current.typeName)) return undefined;
    if (shadowsAlias(current, current.typeName.text)) return undefined;
    if (
      current.typeName.text === "Readonly" &&
      current.typeArguments?.[0] &&
      !resolveTypeAlias("Readonly", position) &&
      !namedImports.has("Readonly")
    )
      return propertyType(current.typeArguments[0], name, position, seen);
    const alias = resolveTypeAlias(current.typeName.text, position);
    if (!alias || !ts.isTypeAliasDeclaration(alias.declaration) || seen.has(alias.declaration))
      return undefined;
    return propertyType(
      alias.declaration.type,
      name,
      alias.declaration.type.getStart(source),
      new Set(seen).add(alias.declaration),
    );
  }

  function parameterBindingType(binding) {
    const parameter = binding.parameter;
    if (!parameter?.type) return undefined;
    return ts.isIdentifier(parameter.name)
      ? parameter.type
      : propertyType(
          parameter.type,
          binding.nameNode.parent.propertyName?.text ?? binding.name,
          binding.nameNode.getStart(source),
        );
  }

  function isTranslatorPropertyType(type, name, position, seen = new Set()) {
    const property = propertyType(type, name, position);
    if (property) return isTranslatorType(property, property.getStart(source));
    const current = unwrapType(type);
    if (!current || !ts.isTypeReferenceNode(current) || !ts.isIdentifier(current.typeName))
      return false;
    if (shadowsAlias(current, current.typeName.text)) return false;
    if (
      current.typeName.text === "Readonly" &&
      current.typeArguments?.[0] &&
      !resolveTypeAlias("Readonly", position) &&
      !namedImports.has("Readonly")
    )
      return isTranslatorPropertyType(current.typeArguments[0], name, position, seen);
    const alias = resolveTypeAlias(current.typeName.text, position);
    if (alias) {
      if (!ts.isTypeAliasDeclaration(alias.declaration)) return false;
      if (seen.has(alias.declaration)) return false;
      return isTranslatorPropertyType(
        alias.declaration.type,
        name,
        alias.declaration.type.getStart(source),
        new Set(seen).add(alias.declaration),
      );
    }
    const imported = namedImports.get(current.typeName.text);
    return (
      !!imported &&
      !!analyze(imported.specifier)?.exportedTranslatorPropertyType(imported.importedName, name)
    );
  }

  function parameterIsTranslator(binding) {
    const parameter = binding.parameter;
    if (!parameter?.type) return false;
    if (ts.isIdentifier(parameter.name))
      return isTranslatorType(parameter.type, parameter.type.getStart(source));
    return isTranslatorPropertyType(
      parameter.type,
      binding.nameNode.parent.propertyName?.text ?? binding.name,
      binding.nameNode.getStart(source),
    );
  }

  return {
    isTranslatorType,
    parameterBindingType,
    parameterIsTranslator,
    isTranslatorPropertyType,
  };
}
