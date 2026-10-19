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
      delete: deleteAccountOperation(personalBearer, ref),
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
    "/me/push-tokens": {
      get: personalBearer(
        "List this account's device push tokens",
        "listDevicePushTokens",
        list(ref("DevicePushToken")),
      ),
      post: {
        ...personalBearer(
          "Register a device push token",
          "registerDevicePushToken",
          ref("DevicePushToken"),
          ref("DevicePushTokenRegister"),
        ),
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        description:
          "Idempotent. A token belongs to one user: registering it from another account moves it there. Tokens are deleted when the push service reports them unregistered and when the account is deleted.",
        requestBody: {
          content: { "application/json": { schema: ref("DevicePushTokenRegister") } },
          required: true,
        },
      },
    },
    "/me/push-tokens/{push_token_id}": {
      delete: {
        ...personalBearer(
          "Delete a device push token",
          "deleteDevicePushToken",
          ref("DevicePushToken"),
        ),
        parameters: [
          { $ref: "#/components/parameters/IdempotencyKey" },
          {
            in: "path",
            name: "push_token_id",
            required: true,
            schema: { pattern: "^dpt_[a-z][a-z0-9]{23}$", type: "string" },
          },
        ],
      },
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

/**
 * Permanent account deletion. Owned projects with their keywords and history,
 * sessions, linked sign-ins, personal access tokens and OAuth grants are
 * deleted; billing and audit records are retained as the retention policy states.
 */
function deleteAccountOperation(personalBearer: OperationBuilder, ref: (name: string) => object) {
  const problem = (description: string) => ({
    content: { "application/problem+json": { schema: ref("Problem") } },
    description,
  });
  const operation = personalBearer(
    "Delete the authenticated account",
    "deleteMe",
    ref("MeDeleted"),
    ref("MeDelete"),
  ) as { responses?: Record<string, object>; security: object[] };
  return {
    ...operation,
    parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
    description:
      "Permanently deletes the account and its owned data. Requires an admin-scope personal access token, or an app token with api:write and a sign-in within 10 minutes, plus the account email as confirmation.",
    requestBody: { content: { "application/json": { schema: ref("MeDelete") } }, required: true },
    responses: {
      ...operation.responses,
      "403": {
        content: { "application/problem+json": { schema: ref("MeDeletionForbidden") } },
        description:
          "Insufficient scope, or app sign-in older than 10 minutes (details.code reauthentication_required and details.max_age_seconds 600).",
      },
      "409": problem("The account is the last instance administrator"),
      "422": problem("The confirmation email does not match"),
    },
  };
}
