import type { PublicIdPrefix } from "@/lib/db/public-id-resources";
import { providerIdSchema } from "@/lib/schemas/provider";
import { publicIdSchema } from "./openapi-public-id";

/**
 * Router-validated public IDs. Ambiguous names are resolved by route below;
 * unknown names must be declared explicitly rather than guessed as strings.
 */
const publicIdPathParameters = {
  competitor_id: { description: "Public competitor ID.", prefix: "cmp" },
  invite_id: { description: "Public team invitation ID.", prefix: "inv" },
  key_id: { description: "Public API key ID.", prefix: "key" },
  keyword_id: { description: "Public keyword ID.", prefix: "kw" },
  member_id: { description: "Public team member ID.", prefix: "mbr" },
  project_id: {
    description: "Public project ID; membership and token scope are enforced.",
    prefix: "prj",
  },
  view_id: { description: "Public saved view ID.", prefix: "viw" },
  webhook_id: { description: "Public webhook endpoint ID.", prefix: "we" },
} as const satisfies Record<string, { description: string; prefix: PublicIdPrefix }>;

type Parameter = {
  $ref?: string;
  in?: string;
  name?: string;
  required?: boolean;
  schema?: object;
  content?: object;
};
type Operation = { parameters?: Parameter[] };
const httpMethods = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

function placeholders(path: string) {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
}

function inferredParameter(path: string, name: string): Parameter | undefined {
  const known = Object.hasOwn(publicIdPathParameters, name)
    ? publicIdPathParameters[name as keyof typeof publicIdPathParameters]
    : undefined;
  if (known)
    return {
      in: "path",
      name,
      required: true,
      schema: { ...publicIdSchema(known.prefix), description: known.description },
    };
  if (name === "provider_id" && path.includes("/providers/")) {
    return {
      in: "path",
      name,
      required: true,
      schema: {
        type: "string",
        enum: [...providerIdSchema.options],
        "x-bisibility-name": "ProviderId",
        "x-bisibility-enum": "open",
      },
    };
  }
  let prefix: PublicIdPrefix | undefined;
  if (name === "token_id") {
    if (path.includes("/migration-tokens/")) prefix = "ferry";
    else if (path.startsWith("/me/tokens/")) prefix = "pat";
  }
  if (name === "monitor_id") {
    if (path.includes("/sitemap-monitors/")) prefix = "prj";
    else if (path.includes("/local-monitors/")) prefix = "lmn";
  }
  return prefix ? { in: "path", name, required: true, schema: publicIdSchema(prefix) } : undefined;
}

function resolveParameter(parameter: Parameter, components: Record<string, Parameter>): Parameter {
  const seen = new Set<string>();
  let current = parameter;
  while (current.$ref) {
    const reference = current.$ref;
    const key = reference.startsWith("#/components/parameters/")
      ? reference
          .slice("#/components/parameters/".length)
          .replaceAll("~1", "/")
          .replaceAll("~0", "~")
      : undefined;
    if (!key || seen.has(reference) || !components[key])
      throw new Error(`Unresolved parameter reference: ${reference}`);
    seen.add(reference);
    current = components[key];
  }
  return current;
}

function effectiveParameters(levels: Parameter[][], components: Record<string, Parameter>) {
  const result = new Map<string, Parameter>();
  for (const level of levels) {
    const seen = new Set<string>();
    for (const raw of level) {
      const parameter = resolveParameter(raw, components);
      const key = `${parameter.in}:${parameter.name}`;
      if (seen.has(key)) throw new Error(`Duplicate parameter: ${key}`);
      seen.add(key);
      result.set(key, parameter);
    }
  }
  return [...result.values()];
}

export function withDeclaredPathParameters<T extends Record<string, Record<string, unknown>>>(
  paths: T,
  components: Record<string, Parameter> = {},
): T {
  return Object.fromEntries(
    Object.entries(paths).map(([path, methods]) => [
      path,
      Object.fromEntries(
        Object.entries(methods).map(([method, raw]) => {
          if (!httpMethods.has(method)) return [method, raw];
          const operation = raw as Operation;
          const names = placeholders(path);
          const declared = effectiveParameters(
            [(methods.parameters as Parameter[] | undefined) ?? [], operation.parameters ?? []],
            components,
          ).filter((parameter) => parameter.in === "path");
          for (const parameter of declared) {
            if (!parameter.name || !names.includes(parameter.name))
              throw new Error(
                `Extraneous path parameter ${parameter.name} at ${method.toUpperCase()} ${path}`,
              );
            if (parameter.required !== true)
              throw new Error(
                `Path parameter ${parameter.name} must be required at ${method.toUpperCase()} ${path}`,
              );
            if (Boolean(parameter.schema) === Boolean(parameter.content))
              throw new Error(
                `Path parameter ${parameter.name} needs either schema or content at ${method.toUpperCase()} ${path}`,
              );
          }
          const missing = names
            .filter((name) => !declared.some((parameter) => parameter.name === name))
            .map((name) => {
              const parameter = inferredParameter(path, name);
              if (!parameter)
                throw new Error(
                  `Undeclared path parameter ${name} at ${method.toUpperCase()} ${path}`,
                );
              return parameter;
            });
          return [
            method,
            missing.length
              ? { ...operation, parameters: [...missing, ...(operation.parameters ?? [])] }
              : operation,
          ];
        }),
      ),
    ]),
  ) as T;
}
