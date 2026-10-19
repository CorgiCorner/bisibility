import { operationSpend } from "./operation-provider-spend";

/**
 * Generates `x-bisibility-cost` on every operation from the provider spend registry. Where the
 * estimate flag and the `max_cost_cents` cap live, and the cap's minimum and requiredness, are
 * read from the operation itself, so the extension cannot drift from the request it describes.
 */

type Json = Record<string, unknown>;
type Document = { components: { parameters?: Json; schemas: Json }; paths: Json };

const isJson = (value: unknown): value is Json =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function resolve(document: Document, value: unknown): Json {
  if (!isJson(value) || typeof value.$ref !== "string") return isJson(value) ? value : {};
  const [, , kind, name] = value.$ref.split("/");
  const target = (document.components as Record<string, Json | undefined>)[kind]?.[name];
  return resolve(document, target);
}

function locate(document: Document, operation: Json, name: string) {
  const parameter = ((operation.parameters as unknown[] | undefined) ?? [])
    .map((candidate) => resolve(document, candidate))
    .find((candidate) => candidate.in === "query" && candidate.name === name);
  if (parameter) {
    return {
      in: "query" as const,
      required: parameter.required === true,
      schema: resolve(document, parameter.schema),
    };
  }
  const content = isJson(operation.requestBody) ? operation.requestBody.content : undefined;
  const json = isJson(content) ? content["application/json"] : undefined;
  const body = resolve(document, isJson(json) ? json.schema : undefined);
  const properties = isJson(body.properties) ? body.properties : {};
  if (!(name in properties)) return undefined;
  const requiredIn = (schema: unknown) =>
    isJson(schema) && Array.isArray(schema.required) && schema.required.includes(name);
  const branches = [...((body.anyOf as unknown[]) ?? []), ...((body.oneOf as unknown[]) ?? [])];
  return {
    in: "body" as const,
    required: requiredIn(body) || branches.some(requiredIn),
    schema: resolve(document, properties[name]),
  };
}

function cost(document: Document, operationId: string, operation: Json) {
  const spend = operationSpend(operationId);
  if (!spend) return { kind: "free" };
  const estimate = spend.estimate && locate(document, operation, spend.estimate.param);
  if (spend.estimate && !estimate) {
    throw new Error(`${operationId} has no ${spend.estimate.param} parameter for its estimate`);
  }
  const cap = locate(document, operation, "max_cost_cents");
  return {
    kind: "paid",
    timing: spend.timing,
    ...(spend.estimate && estimate
      ? {
          estimate: {
            in: estimate.in,
            param: spend.estimate.param,
            ...(spend.estimate.response ? { response: spend.estimate.response } : {}),
          },
        }
      : {}),
    ...(cap
      ? {
          max_cost_cents: {
            in: cap.in,
            minimum: cap.schema.minimum ?? 0,
            required: cap.required,
          },
        }
      : {}),
  };
}

export function withSdkCost<T extends Document>(document: T): T {
  const paths = Object.fromEntries(
    Object.entries(document.paths).map(([path, item]) => [
      path,
      Object.fromEntries(
        Object.entries(item as Json).map(([method, operation]) =>
          isJson(operation) && typeof operation.operationId === "string"
            ? [
                method,
                {
                  ...operation,
                  "x-bisibility-cost": cost(document, operation.operationId, operation),
                },
              ]
            : [method, operation],
        ),
      ),
    ]),
  );
  return { ...document, paths };
}
