import {
  type Direction,
  isJson,
  type Json,
  moneyField,
  type SdkDocument,
  walkSchema,
} from "./openapi-sdk-lint-schema.test-support";
import { sdkOperationExtensionKeys } from "./openapi-sdk-schema";

/**
 * The `x-bisibility-*` gap list: for every operation, what a generator still lacks. Operation
 * entries hold their own problems plus `schema <Name>` / `parameter <Name>` for each component
 * they reach that has problems; each such component has its own entry. Only success responses
 * are walked: problem documents are modelled by each SDK's hand-written runtime.
 */

export type SdkGapEntry = { problems: string[]; subject: string };

const parameterRef = "#/components/parameters/";
const methods = new Set(["get", "put", "post", "delete", "patch", "head", "options"]);

type Walk = { problems: Set<string>; schemas: Set<string> };

function parameterWalk(parameter: Json, pointer: string, walk: Walk, visit: Visitor) {
  const name = String(parameter.name);
  const schema = isJson(parameter.schema) ? parameter.schema : {};
  if (moneyField.test(name) && !("x-bisibility-money" in schema)) {
    walk.problems.add(`money-without-kind ${pointer}/schema`);
  }
  walkSchema(schema, { direction: "request", pointer: `${pointer}/schema` }, visit.sink(walk));
}

type Visitor = { sink: (walk: Walk) => Parameters<typeof walkSchema>[2] };

function successContents(responses: unknown) {
  if (!isJson(responses)) return [];
  return Object.entries(responses)
    .filter(([status]) => /^2\d\d$/.test(status))
    .flatMap(([status, response]) =>
      isJson(response) && isJson(response.content)
        ? Object.entries(response.content)
            .filter(([type]) => type.includes("json") && !type.includes("problem"))
            .map(([type, content]) => ({ content, label: `${status} ${type}` }))
        : [],
    );
}

export function documentOperations(document: SdkDocument) {
  return Object.entries(document.paths).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([method, operation]) => methods.has(method) && isJson(operation))
      .map(([method, operation]) => ({ method, operation: operation as Json, path })),
  );
}

export function evaluateSdkExtensions(document: SdkDocument): SdkGapEntry[] {
  const components = new Map<string, Walk>();
  const parameters = new Map<string, Walk>();
  const pending: { direction: Direction; name: string }[] = [];
  const walked = new Set<string>();
  const visit: Visitor = {
    sink: (walk) => ({
      problem: (problem) => walk.problems.add(problem),
      reference: (name, direction) => {
        walk.schemas.add(name);
        pending.push({ direction, name });
      },
    }),
  };
  const drain = () => {
    for (let next = pending.pop(); next; next = pending.pop()) {
      const key = `${next.name} ${next.direction}`;
      if (walked.has(key)) continue;
      walked.add(key);
      const walk = components.get(next.name) ?? { problems: new Set(), schemas: new Set() };
      components.set(next.name, walk);
      walkSchema(
        document.components.schemas[next.name],
        { direction: next.direction, pointer: "", root: true },
        visit.sink(walk),
      );
    }
  };

  const operations = documentOperations(document).map(({ operation }) => {
    const walk: Walk = { problems: new Set(), schemas: new Set() };
    const usedParameters = new Set<string>();
    for (const key of sdkOperationExtensionKeys) {
      if (!(key in operation)) walk.problems.add(`missing ${key}`);
    }
    for (const parameter of (operation.parameters as Json[] | undefined) ?? []) {
      const ref = typeof parameter.$ref === "string" ? parameter.$ref : undefined;
      if (ref?.startsWith(parameterRef)) {
        const name = ref.slice(parameterRef.length);
        usedParameters.add(name);
        if (!parameters.has(name)) {
          const own: Walk = { problems: new Set(), schemas: new Set() };
          parameters.set(name, own);
          parameterWalk(document.components.parameters?.[name] ?? {}, "", own, visit);
        }
        for (const schema of parameters.get(name)?.schemas ?? []) walk.schemas.add(schema);
      } else {
        parameterWalk(parameter, `/parameters/${parameter.in}/${parameter.name}`, walk, visit);
      }
    }
    const body = isJson(operation.requestBody) ? operation.requestBody.content : undefined;
    for (const [type, content] of Object.entries(isJson(body) ? body : {})) {
      if (isJson(content)) {
        const pointer = `/requestBody/${type}`;
        walkSchema(content.schema, { direction: "request", pointer }, visit.sink(walk));
      }
    }
    for (const { content, label } of successContents(operation.responses)) {
      if (isJson(content)) {
        const pointer = `/responses/${label}`;
        walkSchema(content.schema, { direction: "response", pointer }, visit.sink(walk));
      }
    }
    drain();
    return { operationId: String(operation.operationId), usedParameters, walk };
  });

  const reachable = (roots: Set<string>) => {
    const seen = new Set<string>();
    const stack = [...roots];
    for (let name = stack.pop(); name; name = stack.pop()) {
      if (seen.has(name)) continue;
      seen.add(name);
      stack.push(...(components.get(name)?.schemas ?? []));
    }
    return seen;
  };
  const entries: SdkGapEntry[] = [];
  for (const { operationId, usedParameters, walk } of operations) {
    const problems = [...walk.problems];
    for (const name of usedParameters) {
      if (parameters.get(name)?.problems.size) problems.push(`parameter ${name}`);
    }
    for (const name of reachable(walk.schemas)) {
      if (components.get(name)?.problems.size) problems.push(`schema ${name}`);
    }
    if (problems.length)
      entries.push({ problems: problems.sort(), subject: `operation ${operationId}` });
  }
  for (const [kind, walks] of [
    ["parameter", parameters],
    ["schema", components],
  ] as const) {
    for (const [name, walk] of walks) {
      if (walk.problems.size) {
        entries.push({ problems: [...walk.problems].sort(), subject: `${kind} ${name}` });
      }
    }
  }
  return entries.sort((left, right) => left.subject.localeCompare(right.subject));
}

/** Subjects that block an operation: itself and every component it reaches with problems. */
export function blockingSubjects(entries: SdkGapEntry[], operationId: string) {
  const own = entries.find((entry) => entry.subject === `operation ${operationId}`);
  return own ? [own.subject, ...own.problems.filter((p) => /^(schema|parameter) /.test(p))] : [];
}
