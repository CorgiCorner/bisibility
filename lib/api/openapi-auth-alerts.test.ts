import { describe, expect, it } from "vitest";
import { getOpenApiDocument } from "./openapi";
import { normalizeWhitespace } from "./openapi-test-helpers";

describe("OpenAPI document", () => {
  it("documents personal-token account, project, API-key, and webhook routes", () => {
    const doc = getOpenApiDocument();

    expect(doc.components.securitySchemes.ProjectApiKey).toMatchObject({
      bearerFormat: "bsb_key_live_...",
    });
    expect(doc.paths["/me"]).toMatchObject({
      get: { operationId: "getMe" },
      patch: { operationId: "updateMe", requestBody: expect.any(Object) },
    });
    expect(doc.paths["/me/tokens"]).toMatchObject({
      get: { operationId: "listPersonalAccessTokens" },
      post: { operationId: "createPersonalAccessToken" },
    });
    expect(doc.paths["/projects"]).toMatchObject({
      get: { operationId: "listProjects" },
      post: { operationId: "createProject" },
    });
    expect(doc.paths["/projects/{project_id}/api-keys"]).toMatchObject({
      get: { operationId: "listProjectApiKeys" },
      post: { operationId: "createProjectApiKey" },
    });
    expect(doc.paths["/projects/{project_id}/webhooks/{webhook_id}"]).toMatchObject({
      delete: { operationId: "deleteWebhookEndpoint" },
      patch: { operationId: "updateWebhookEndpoint" },
    });
    expect(doc.components.schemas.WebhookEndpoint.properties).not.toHaveProperty("hmac_secret");
  });

  it("documents API key scope and expiry creation policy", () => {
    const doc = getOpenApiDocument();
    const apiKey = doc.components.schemas.ApiKey;
    const create = doc.components.schemas.ApiKeyCreate;

    expect(apiKey.required).toEqual(expect.arrayContaining(["expires_at", "scope"]));
    expect(apiKey.properties).toMatchObject({
      expires_at: { format: "date-time", type: ["string", "null"] },
      scope: { enum: ["read", "write", "admin"], type: "string" },
    });
    expect(create.required).toEqual(["name"]);
    expect(create.properties).toMatchObject({
      expires_in_days: { enum: [30, 90, 365, null], type: ["integer", "null"] },
      name: { type: "string" },
      scope: {
        default: "admin",
        description: expect.stringContaining("omitted"),
        enum: ["read", "write", "admin"],
      },
    });
    expect(doc.paths["/api-keys"].post).toMatchObject({
      requestBody: {
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/ApiKeyCreate" } },
        },
      },
      responses: {
        "201": {
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ApiKeyIssued" } },
          },
        },
      },
    });
    expect(doc.paths["/projects/{project_id}/api-keys"].post).toMatchObject({
      requestBody: {
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/ApiKeyCreate" } },
        },
      },
    });
  });

  it("documents alert severity and market scope on REST mutation inputs", () => {
    const doc = getOpenApiDocument();

    expect(doc.components.schemas.AlertRuleInput.properties.severity).toMatchObject({
      enum: ["info", "warning", "urgent"],
      type: "string",
    });
    expect(doc.components.schemas.AlertRuleInput.properties.market_ids).toMatchObject({
      items: { pattern: "^pmkt_[a-z][a-z0-9]{23}$", type: "string" },
      type: "array",
    });
    const slackPreviewStatus =
      "Slack tenant delivery is available as an API-only preview. Workspace installation and channel management are not yet exposed in the dashboard.";
    for (const schemaName of ["AlertRuleInput", "CloudImportAlertRule"] as const) {
      const channels = doc.components.schemas[schemaName].properties.channels;
      expect(channels).toMatchObject({
        items: { enum: ["email", "slack", "webhook"], type: "string" },
        type: "array",
      });
      expect(channels.items.enum).toEqual(["email", "slack", "webhook"]);
      expect(normalizeWhitespace(channels.description)).toContain(slackPreviewStatus);
    }
    expect(doc.paths["/projects/{project_id}/alert-rules"].post).toMatchObject({
      requestBody: {
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/AlertRuleInput" } },
        },
      },
    });
    expect(doc.paths["/alert-rules/{rule_id}"].patch).toMatchObject({
      requestBody: {
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/AlertRuleInput" } },
        },
      },
    });
  });

  it("states which credential each authenticated operation accepts", () => {
    const doc = getOpenApiDocument();
    const personalOnlyOperations = [
      doc.paths["/me"].get,
      doc.paths["/me"].patch,
      doc.paths["/me/tokens"].get,
      doc.paths["/me/tokens"].post,
      doc.paths["/me/tokens/{token_id}"].delete,
      doc.paths["/projects"].post,
    ];

    expect(doc.components.securitySchemes).toMatchObject({
      PersonalAccessToken: { bearerFormat: "bsb_pat_live_...", scheme: "bearer", type: "http" },
      ProjectApiKey: { bearerFormat: "bsb_key_live_...", scheme: "bearer", type: "http" },
    });
    for (const operation of personalOnlyOperations) {
      expect(operation.security).toEqual([{ PersonalAccessToken: [] }]);
      expect(operation.security).not.toContainEqual({ ProjectApiKey: [] });
    }
    expect(doc.paths["/projects"].get.security).toEqual([
      { ProjectApiKey: [] },
      { PersonalAccessToken: [] },
    ]);
    expect(doc.paths["/projects/{project_id}/keywords"].get.security).toContainEqual({
      ProjectApiKey: [],
    });
  });
});
