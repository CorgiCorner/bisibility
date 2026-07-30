type OperationBuilder = (summary: string, operationId: string, schema: object) => object;

type CreatedOperationBuilder = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema: object,
) => object;

export function apiKeyPaths(input: {
  bearer: OperationBuilder;
  created: CreatedOperationBuilder;
  list: (schema: object) => object;
  ref: (name: string) => object;
}) {
  const { bearer, created, list, ref } = input;
  return {
    "/api-keys": {
      get: bearer("List API keys", "listApiKeys", list(ref("ApiKey"))),
      post: created(
        "Create an API key; omitted scope defaults to admin",
        "createApiKey",
        ref("ApiKeyIssued"),
        ref("ApiKeyCreate"),
      ),
    },
    "/api-keys/{key_id}": {
      delete: bearer("Revoke an API key", "revokeApiKey", ref("ApiKey")),
    },
  };
}
