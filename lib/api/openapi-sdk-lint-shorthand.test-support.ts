import { documentOperations } from "./openapi-sdk-lint.test-support";
import {
  isJson,
  type Json,
  referencedComponent,
  type SdkDocument,
  unionMembers,
} from "./openapi-sdk-lint-schema.test-support";

function resolvedBranch(document: SdkDocument, branch: Json): { schema: Json; name: unknown } {
  let schema = branch;
  let name: string | undefined;
  const seen = new Set<string>();
  for (let ref = referencedComponent(schema); ref; ref = referencedComponent(schema)) {
    if (seen.has(ref)) return { schema: {}, name: undefined };
    seen.add(ref);
    name = ref;
    schema = document.components.schemas[ref] ?? {};
  }
  return { schema, name: schema["x-bisibility-name"] ?? name };
}

export function shorthandUnionValid(document: SdkDocument, schema: Json, union: Json) {
  const members = unionMembers(schema);
  if (!members || Object.keys(union).length !== 2 || typeof union.canonical !== "string")
    return false;
  const matches = members
    .filter(isJson)
    .map((branch) => resolvedBranch(document, branch))
    .filter((branch) => branch.name === union.canonical);
  if (matches.length !== 1) return false;
  const canonical = matches[0].schema;
  if (canonical.type === "object") return true;
  return (
    canonical.type === "array" &&
    isJson(canonical.items) &&
    resolvedBranch(document, canonical.items).schema.type === "object"
  );
}

/** Follow references in each usage context: shared components may be used in several places. */
export function shorthandLocationProblems(document: SdkDocument) {
  const problems: string[] = [];
  const walk = (value: unknown, at: string, body: boolean, seen: Set<unknown>) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    const next = new Set(seen).add(value);
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) walk(item, `${at}/${index}`, body, next);
      return;
    }
    const schema = value as Json;
    if (
      isJson(schema["x-bisibility-union"]) &&
      schema["x-bisibility-union"].style === "shorthand" &&
      !body
    ) {
      problems.push(`shorthand-outside-request-body ${at}`);
    }
    if (typeof schema.$ref === "string" && schema.$ref.startsWith("#/")) {
      let target: unknown = document;
      for (const part of schema.$ref.slice(2).split("/")) {
        target = isJson(target)
          ? target[part.replaceAll("~1", "/").replaceAll("~0", "~")]
          : undefined;
      }
      walk(target, `${at}/$ref`, body, next);
    }
    for (const [key, child] of Object.entries(schema)) {
      if (!["enum", "const", "default", "example", "examples"].includes(key))
        walk(child, `${at}/${key}`, body, next);
    }
  };
  for (const { path, method, operation } of documentOperations(document)) {
    const at = `/paths/${path.replaceAll("~", "~0").replaceAll("/", "~1")}/${method}`;
    walk(operation.requestBody, `${at}/requestBody`, true, new Set());
    walk(operation.responses, `${at}/responses`, false, new Set());
    walk(operation.parameters, `${at}/parameters`, false, new Set());
    walk(document.paths[path].parameters, `${at}/path-parameters`, false, new Set());
  }
  walk(document.components.parameters, "/components/parameters", false, new Set());
  return problems;
}
