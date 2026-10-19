import { publicIdSchema } from "./openapi-public-id";

/**
 * Path placeholders whose value the router validates as one public-ID type for every route
 * (`requireApiPathPublicIds` in public-id.ts: `/projects/{x}` is a project, `/keywords/{x}` a
 * keyword). Operations that do not declare such a placeholder get it declared here, so a client
 * generator never has to infer a path parameter.
 */
const publicIdPathParameters = {
  keyword_id: { description: "Public keyword ID.", prefix: "kw" },
  project_id: {
    description: "Public project ID; membership and token scope are enforced.",
    prefix: "prj",
  },
} as const;

type Parameter = { in?: string; name?: string };
type Operation = { parameters?: Parameter[] };

function placeholders(path: string) {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
}

export function withDeclaredPathParameters<T extends Record<string, Record<string, object>>>(
  paths: T,
): T {
  return Object.fromEntries(
    Object.entries(paths).map(([path, methods]) => [
      path,
      Object.fromEntries(
        Object.entries(methods).map(([method, raw]) => {
          const operation = raw as Operation;
          const declared = new Set(
            (operation.parameters ?? [])
              .filter((parameter) => parameter.in === "path")
              .map((parameter) => parameter.name),
          );
          const missing = placeholders(path).flatMap((name) => {
            const known = publicIdPathParameters[name as keyof typeof publicIdPathParameters];
            return known && !declared.has(name)
              ? [
                  {
                    in: "path",
                    name,
                    required: true,
                    schema: { ...publicIdSchema(known.prefix), description: known.description },
                  },
                ]
              : [];
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
