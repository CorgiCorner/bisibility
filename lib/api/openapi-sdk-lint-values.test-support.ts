import { documentOperations } from "./openapi-sdk-lint.test-support";
import { operationExtensionProblems } from "./openapi-sdk-lint-operations.test-support";
import {
  isEnumSchema,
  isJson,
  type Json,
  nonNullMembers,
  resolveSchema,
  type SdkDocument,
} from "./openapi-sdk-lint-schema.test-support";
import {
  shorthandLocationProblems,
  shorthandUnionValid,
} from "./openapi-sdk-lint-shorthand.test-support";
import {
  publicIdPrefix,
  sdkOperationExtensionKeys,
  sdkSchemaExtensionKeys,
} from "./openapi-sdk-schema";

/**
 * Hard rules for every `x-bisibility-*` value anywhere in the document, first wave or not: the
 * vocabulary is closed, values are well formed, and a name means one type.
 */

const operationKeys = new Set<string>(sdkOperationExtensionKeys);
const schemaKeys = new Set<string>(sdkSchemaExtensionKeys);
const typeName = /^[A-Z][A-Za-z0-9]*$/;
const caseName = /^[a-z][A-Za-z0-9]*$/;
const documentation = new Set(["default", "deprecated", "description", "example", "examples"]);

function types(schema: Json): string[] {
  const own = Array.isArray(schema.type) ? schema.type : [schema.type];
  return [...own, ...nonNullMembers(schema).flatMap(types)].filter(
    (type): type is string => typeof type === "string",
  );
}

/** The shape a name stands for: the schema without documentation keywords. */
function signature(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(signature);
  if (!isJson(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !documentation.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, signature(item)]),
  );
}

function tagValue(schema: Json, tag: string) {
  const property = isJson(schema.properties) ? schema.properties[tag] : undefined;
  if (!isJson(property)) return undefined;
  if ("const" in property) return { value: property.const };
  return Array.isArray(property.enum) && property.enum.length === 1
    ? { value: property.enum[0] }
    : undefined;
}

function unionProblems(document: SdkDocument, schema: Json, union: unknown, at: string) {
  if (!isJson(union)) return [`invalid x-bisibility-union ${at}`];
  if (union.style === "shorthand") {
    return shorthandUnionValid(document, schema, union) ? [] : [`invalid x-bisibility-union ${at}`];
  }
  const members = nonNullMembers(schema).map((member) => resolveSchema(document, member));
  const cases = union.cases;
  const casesValid =
    Array.isArray(cases) &&
    cases.length === members.length &&
    new Set(cases).size === cases.length &&
    cases.every((name) => typeof name === "string" && caseName.test(name));
  if (union.style === "constraint") {
    const own = isJson(schema.properties) ? schema.properties : {};
    const extra = members.some(
      (member) =>
        "$ref" in member ||
        Object.keys(isJson(member.properties) ? member.properties : {}).some(
          (key) => !(key in own),
        ),
    );
    return Object.keys(union).length !== 1 || extra || !members.length
      ? [`invalid x-bisibility-union ${at}`]
      : [];
  }
  if (union.style === "public_id") {
    const prefixes = members.map((member) => member["x-bisibility-public-id"]);
    const valid =
      casesValid &&
      Object.keys(union).length === 2 &&
      prefixes.every((prefix) => typeof prefix === "string") &&
      new Set(prefixes).size === prefixes.length;
    return valid ? [] : [`invalid x-bisibility-union ${at}`];
  }
  if (union.style === "tagged" && typeof union.tag === "string") {
    const tags = members.map((member) => tagValue(member, String(union.tag)));
    const values = tags.flatMap((tag) => (tag ? [JSON.stringify(tag.value)] : []));
    const valid =
      casesValid &&
      Object.keys(union).length === 3 &&
      tags.filter((tag) => !tag).length <= 1 &&
      new Set(values).size === values.length;
    return valid ? [] : [`invalid x-bisibility-union ${at}`];
  }
  return [`invalid x-bisibility-union ${at}`];
}

function schemaValueProblems(document: SdkDocument, schema: Json, key: string, at: string) {
  const value = schema[key];
  const bad = [`invalid ${key} ${at}`];
  switch (key) {
    case "x-bisibility-public-id":
      return value === publicIdPrefix(schema.pattern) ? [] : bad;
    case "x-bisibility-money": {
      if (value === "usd_number") {
        const base = Array.isArray(schema.type) ? schema.type : [schema.type];
        return base.includes("number") && base.every((type) => type === "number" || type === "null")
          ? []
          : bad;
      }
      const kinds = types(schema);
      if (value === "usd_cents") return kinds.some((t) => /number|integer/.test(t)) ? [] : bad;
      return value === "usd_decimal" && kinds.includes("string") ? [] : bad;
    }
    case "x-bisibility-enum":
      return (value === "open" || value === "closed") && isEnumSchema(schema) ? [] : bad;
    case "x-bisibility-name":
      return typeof value === "string" && typeName.test(value) ? [] : bad;
    case "x-bisibility-union":
      return unionProblems(document, schema, value, at);
    case "x-bisibility-legacy-type":
      return isJson(value) &&
        Object.entries(value).every(
          ([language, name]) =>
            ["go", "python", "ts"].includes(language) && typeof name === "string",
        )
        ? []
        : bad;
    default:
      return [`unknown ${key} ${at}`];
  }
}

export function extensionValueProblems(document: SdkDocument): string[] {
  const problems: string[] = [];
  const names = new Map<string, string>();
  const operations = new Set(documentOperations(document).map((entry) => entry.operation));
  const visit = (value: unknown, at: string): void => {
    if (Array.isArray(value)) {
      for (const [i, item] of value.entries()) visit(item, `${at}/${i}`);
      return;
    }
    if (!isJson(value)) return;
    const isOperation = operations.has(value);
    for (const [key, item] of Object.entries(value)) {
      if (key.startsWith("x-bisibility-")) {
        if (isOperation ? !operationKeys.has(key) : !schemaKeys.has(key)) {
          problems.push(`unknown ${key} ${at}`);
        } else if (!isOperation) {
          problems.push(...schemaValueProblems(document, value, key, at));
        }
      } else if (!["enum", "const", "default", "example", "examples"].includes(key)) {
        visit(item, `${at}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`);
      }
    }
    const name = value["x-bisibility-name"];
    if (typeof name === "string") {
      if (/^\/components\/schemas\/[^/]+$/.test(at) || name in document.components.schemas) {
        problems.push(`name-is-a-component ${name} ${at}`);
      }
      const shape = JSON.stringify(signature(value));
      if (names.has(name) && names.get(name) !== shape) problems.push(`name-conflict ${name}`);
      names.set(name, shape);
    }
  };
  visit(document, "");
  problems.push(...operationExtensionProblems(document));
  problems.push(...shorthandLocationProblems(document));
  return [...new Set(problems)].sort();
}
