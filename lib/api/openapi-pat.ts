type OperationBuilder = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
) => { security: object[] };

type CreatedOperationBuilder = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema: object,
) => { security: object[] };

export const apiCredentialSecurity = [{ ProjectApiKey: [] }, { PersonalAccessToken: [] }];

export const personalAccessTokenSecurity = [{ PersonalAccessToken: [] }];

export const apiCredentialSecuritySchemes = {
  PersonalAccessToken: {
    bearerFormat: "bsb_pat_live_...",
    description:
      "Personal access token for account routes and projects visible to the authenticated user.",
    scheme: "bearer",
    type: "http",
  },
  ProjectApiKey: {
    bearerFormat: "bsb_key_live_...",
    description:
      "Project-scoped API key. It cannot access account routes or create additional projects.",
    scheme: "bearer",
    type: "http",
  },
};

export function personalAccessPaths(input: {
  bearer: OperationBuilder;
  created: CreatedOperationBuilder;
  list: (schema: object) => object;
  ref: (name: string) => object;
}) {
  const { bearer, created, list, ref } = input;
  const personalBearer: OperationBuilder = (...args) => ({
    ...bearer(...args),
    security: personalAccessTokenSecurity,
  });
  const personalCreated: CreatedOperationBuilder = (...args) => ({
    ...created(...args),
    security: personalAccessTokenSecurity,
  });
  return {
    "/me": {
      get: personalBearer("Get the authenticated user", "getMe", ref("Me")),
      patch: personalBearer("Update the authenticated user", "updateMe", ref("Me"), ref("MePatch")),
    },
    "/me/tokens": {
      get: personalBearer(
        "List personal access tokens",
        "listPersonalAccessTokens",
        list(ref("PersonalAccessToken")),
      ),
      post: personalCreated(
        "Create or exchange for a personal access token",
        "createPersonalAccessToken",
        ref("PersonalAccessTokenIssued"),
        ref("PersonalAccessTokenCreate"),
      ),
    },
    "/me/tokens/{token_id}": {
      delete: personalBearer(
        "Revoke a personal access token",
        "revokePersonalAccessToken",
        ref("PersonalAccessToken"),
      ),
    },
    "/projects/{project_id}/api-keys": {
      get: bearer("List project API keys", "listProjectApiKeys", list(ref("ApiKey"))),
      post: created(
        "Create a project API key; omitted scope defaults to admin",
        "createProjectApiKey",
        ref("ApiKeyIssued"),
        ref("ApiKeyCreate"),
      ),
    },
    "/projects/{project_id}/webhooks": {
      get: bearer("List webhook endpoints", "listWebhookEndpoints", list(ref("WebhookEndpoint"))),
      post: created(
        "Create a webhook endpoint",
        "createWebhookEndpoint",
        ref("WebhookEndpoint"),
        ref("WebhookEndpointCreate"),
      ),
    },
    "/projects/{project_id}/webhooks/{webhook_id}": {
      delete: bearer("Delete a webhook endpoint", "deleteWebhookEndpoint", ref("WebhookEndpoint")),
      patch: bearer(
        "Update a webhook endpoint",
        "updateWebhookEndpoint",
        ref("WebhookEndpoint"),
        ref("WebhookEndpointPatch"),
      ),
    },
  };
}
