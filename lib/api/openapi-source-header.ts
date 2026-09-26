type SecuredOperation = {
  parameters?: object[];
  security?: unknown;
};

export const sourceHeaderParameterComponents = {
  SourceHeader: {
    description:
      "Declares the client that produced the request for usage reporting: sdk, cli or mcp. Optional; any other value counts as api. It never changes authentication or which budget applies (every bearer-authenticated request counts against the API, MCP and SDK budget).",
    in: "header",
    name: "X-Bisibility-Source",
    required: false,
    schema: { enum: ["sdk", "cli", "mcp"], type: "string" },
  },
} as const;

const sourceHeaderParameterRef = { $ref: "#/components/parameters/SourceHeader" } as const;

function hasSecurityRequirement(operation: SecuredOperation) {
  return Array.isArray(operation.security) && operation.security.length > 0;
}

/**
 * Declares the runtime contract of lib/api/request-origin.ts on every
 * authenticated operation, so generated clients can declare their source.
 */
export function withSourceHeaderParameter<T extends Record<string, Record<string, object>>>(
  paths: T,
): T {
  return Object.fromEntries(
    Object.entries(paths).map(([path, methods]) => [
      path,
      Object.fromEntries(
        Object.entries(methods).map(([method, operation]) => {
          if (!hasSecurityRequirement(operation as SecuredOperation)) {
            return [method, operation];
          }
          const parameters = (operation as SecuredOperation).parameters ?? [];
          return [method, { ...operation, parameters: [...parameters, sourceHeaderParameterRef] }];
        }),
      ),
    ]),
  ) as T;
}
