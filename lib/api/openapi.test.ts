import { describe, expect, it } from "vitest";
import { API_VERSION_HEADER } from "./api-versions";
import { getCapabilities, getLlmsText } from "./capabilities";
import { getOpenApiDocument } from "./openapi";
import { ref } from "./openapi-components";
import { savedViewSchema } from "./openapi-saved-views";

type Parameter = { name: string; schema: object };

describe("OpenAPI document", () => {
  it("groups every operation into an ordered API reference section", () => {
    const doc = getOpenApiDocument();
    const operations = Object.values(doc.paths).flatMap((path) => Object.values(path)) as Array<{
      operationId?: string;
      summary: string;
      tags?: string[];
    }>;

    expect(doc).toHaveProperty(
      "tags",
      [
        "discovery",
        "account-access",
        "projects",
        "api-keys",
        "keywords",
        "rank-checks",
        "keyword-research",
        "backlinks",
        "analytics",
        "alerts",
        "competitors",
        "sitemap-monitoring",
        "saved-keywords",
        "saved-views",
        "signals",
        "providers",
        "webhooks",
        "team",
        "migration",
      ].map((name) => expect.objectContaining({ name })),
    );
    expect(operations).toHaveLength(96);
    expect(operations.every((operation) => operation.tags?.length === 1)).toBe(true);
    expect(
      operations.every(
        (operation) => typeof operation.summary === "string" && operation.summary.length <= 48,
      ),
    ).toBe(true);
    const referenceTitles = operations.map(
      (operation) => `${operation.tags?.[0]}:${operation.summary}`,
    );
    expect(new Set(referenceTitles).size).toBe(referenceTitles.length);
    expect(doc.paths["/projects"].get.tags).toEqual(["projects"]);
    expect(doc.paths["/projects/{project_id}/keywords"].get.tags).toEqual(["keywords"]);
    expect(doc.paths["/projects/{project_id}/alert-rules"].post.tags).toEqual(["alerts"]);
    expect(doc.paths["/projects/{project_id}/webhooks"].get.tags).toEqual(["webhooks"]);
  });

  it("documents optional API version declarations and mismatch responses", () => {
    const doc = getOpenApiDocument();
    const operations = Object.values(doc.paths).flatMap((path) => Object.values(path)) as Array<{
      parameters: Array<{
        in: string;
        name: string;
        required: boolean;
        schema: { enum: string[]; type: string };
      }>;
      responses: Record<string, unknown>;
    }>;

    for (const operation of operations) {
      expect(operation.parameters).toContainEqual({
        description: expect.stringContaining("Omit this header"),
        in: "header",
        name: API_VERSION_HEADER,
        required: false,
        schema: { enum: ["v1"], type: "string" },
      });
      expect(operation.responses["409"]).toMatchObject({
        description: expect.stringContaining("Unsupported API version"),
      });
    }

    expect(
      doc.paths["/capabilities"].get.responses["200"].content["application/json"].schema,
    ).toMatchObject({
      properties: {
        apiVersions: {
          items: { enum: ["v1"], type: "string" },
          minItems: 1,
          type: "array",
        },
      },
      required: ["apiVersions", "data"],
    });
  });

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

  it("documents alert severity on REST mutation inputs", () => {
    const doc = getOpenApiDocument();

    expect(doc.components.schemas.AlertRuleInput.properties.severity).toMatchObject({
      enum: ["info", "warning", "urgent"],
      type: "string",
    });
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

  it("documents keyword list filters", () => {
    const operation = getOpenApiDocument().paths["/projects/{project_id}/keywords"].get;
    const parameters = operation.parameters as Parameter[];

    expect(parameters.map((parameter) => parameter.name)).toEqual([
      API_VERSION_HEADER,
      "limit",
      "cursor",
      "search",
      "tag",
      "topic",
      "intent",
      "device",
      "country",
      "position_gt",
      "position_lt",
      "sort",
    ]);
    expect(parameters.find((parameter) => parameter.name === "topic")?.schema).toMatchObject({
      maxLength: 80,
      minLength: 1,
      type: "string",
    });
    expect(parameters.find((parameter) => parameter.name === "intent")?.schema).toMatchObject({
      maxLength: 80,
      minLength: 1,
      type: "string",
    });
    expect(parameters.find((parameter) => parameter.name === "sort")?.schema).toMatchObject({
      enum: [
        "created_at",
        "-created_at",
        "keyword",
        "-keyword",
        "text",
        "-text",
        "updated_at",
        "-updated_at",
      ],
    });
  });

  it("documents bounded, joinable keyword matching with market and position fields", () => {
    const doc = getOpenApiDocument();
    const operation = doc.paths["/projects/{project_id}/keyword-matches"].post;
    const request = doc.components.schemas.KeywordMatchRequest;
    const match = doc.components.schemas.KeywordMatch;
    const market = doc.components.schemas.KeywordMatchMarket;

    expect(operation).toMatchObject({
      operationId: "matchProjectKeywords",
      requestBody: { required: true },
    });
    expect(request.properties.texts).toMatchObject({
      items: { maxLength: 180, minLength: 1, type: "string" },
      maxItems: 50,
      minItems: 1,
    });
    expect(match.required).toEqual(
      expect.arrayContaining(["matched_text", "market", "latest_position", "previous_position"]),
    );
    expect(match.properties.text).toMatchObject({
      description: expect.stringContaining("Stored keyword text"),
    });
    expect(market.properties.location_key).toMatchObject({ example: "US/Texas/Austin" });
    expect(market.required).toEqual(
      expect.arrayContaining(["location", "location_key", "country_code", "device"]),
    );
  });

  it("documents both project defaults verbs", () => {
    const doc = getOpenApiDocument();
    const path = doc.paths["/projects/{project_id}/defaults"];

    expect(Object.keys(path).sort()).toEqual(["get", "patch"]);
    expect(path.get).toMatchObject({ operationId: "getProjectDefaults" });
    expect(path.patch).toMatchObject({ operationId: "updateProjectDefaults" });
    expect(doc.components.schemas.ProjectDefaultsPatch.properties.jitter_minutes).toMatchObject({
      maximum: 120,
      minimum: 0,
    });
    expect(doc.components.schemas.ProjectDefaultsPatch.properties.timezone).toMatchObject({
      description: expect.stringContaining("anchors monthly and custom cron wall-clock schedules"),
    });
    expect(doc.components.schemas.KeywordCreateItem.properties.schedule).toMatchObject({
      properties: {
        jitter_minutes: { default: 60, maximum: 120, minimum: 0 },
        timezone: {
          description: expect.stringContaining(
            "Daily and weekly use a stable keyword-specific interval phase",
          ),
        },
      },
    });
    expect(
      getCapabilities().find((tool) => tool.name === "updateProjectDefaults")?.input_schema,
    ).toMatchObject({
      properties: { jitter_minutes: { maximum: 120, minimum: 0 } },
    });
  });

  it("documents rank-check list filters and cursor pagination", () => {
    const operation = getOpenApiDocument().paths["/keywords/{id}/rank-checks"].get;
    const parameters = operation.parameters as Parameter[];
    const responseSchema = operation.responses["200"].content["application/json"].schema;

    expect(parameters.map((parameter) => parameter.name)).toEqual([
      API_VERSION_HEADER,
      "limit",
      "cursor",
      "status",
      "since",
      "until",
    ]);
    expect(parameters.find((parameter) => parameter.name === "status")?.schema).toMatchObject({
      enum: ["completed", "failed", "running"],
    });
    expect(responseSchema).toMatchObject({
      properties: {
        meta: {
          properties: {
            next_cursor: { type: ["string", "null"] },
          },
        },
      },
    });
  });

  it("documents actual keyword resource fields", () => {
    const keyword = getOpenApiDocument().components.schemas.Keyword;

    expect(keyword.required).toEqual(
      expect.arrayContaining([
        "created_at",
        "location",
        "previous_position",
        "schedule",
        "updated_at",
      ]),
    );
    expect(keyword.properties).toMatchObject({
      created_at: { format: "date-time", type: "string" },
      location: { type: "string" },
      previous_position: { type: ["integer", "null"] },
      schedule: { type: ["object", "null"] },
      updated_at: { format: "date-time", type: "string" },
    });
  });

  it("documents rank-check resource fields emitted by the API", () => {
    const rankCheck = getOpenApiDocument().components.schemas.RankCheck;

    expect(rankCheck.required).toEqual(
      expect.arrayContaining([
        "attempts",
        "cost_cents",
        "error",
        "previous_position",
        "provider",
        "ranking_url",
      ]),
    );
    expect(rankCheck.properties).toMatchObject({
      attempts: { type: ["array", "null"] },
      provider: { type: "string" },
    });
  });

  it("documents agent-facing location, team, keyword, and analytics operations", () => {
    const paths = getOpenApiDocument().paths;
    expect(paths["/locations/search"].get).toMatchObject({ operationId: "searchLocations" });
    expect(paths["/projects/{project_id}/ranked-keyword-suggestions"].get).toMatchObject({
      operationId: "listRankedKeywordSuggestions",
    });
    expect(paths["/projects/{project_id}/team/members/{member_id}"]).toMatchObject({
      delete: { operationId: "removeTeamMember" },
      patch: { operationId: "updateTeamMemberRole" },
    });
    expect(paths["/projects/{project_id}/team/invites/{invite_id}/resend"].post).toMatchObject({
      operationId: "resendTeamInvite",
    });
    expect(paths["/projects/{project_id}/analytics/traffic-snapshots"].get).toMatchObject({
      operationId: "listTrafficSnapshots",
    });
    expect(paths["/projects/{project_id}/analytics/query-stats"].get).toMatchObject({
      operationId: "listSearchPerformanceQueryStats",
    });
    expect(paths["/projects/{project_id}/analytics/sync"].post).toMatchObject({
      operationId: "syncProjectTraffic",
    });
    expect(paths["/projects/{project_id}/exports/rank-history"].get).toMatchObject({
      operationId: "exportRankHistory",
      responses: {
        "200": {
          content: {
            "application/json": expect.any(Object),
            "text/csv": expect.any(Object),
          },
        },
      },
    });
    expect(paths["/projects/{project_id}/triggered-alerts/mark-read"].post).toMatchObject({
      operationId: "markProjectAlertsRead",
    });
    expect(paths["/projects/{project_id}/triggered-alerts/{alert_id}/mute"].post).toMatchObject({
      operationId: "muteTriggeredAlert",
    });
    expect(paths["/projects/{project_id}/sitemap-monitors"].get).toMatchObject({
      operationId: "listSitemapMonitors",
    });
    expect(paths["/projects/{project_id}/sitemap-monitors/{monitor_id}"].patch).toMatchObject({
      operationId: "updateSitemapMonitor",
    });
  });

  it("documents signal ingestion and listing", () => {
    const doc = getOpenApiDocument();
    const createSignal = doc.paths["/signals"].post;
    const listSignals = doc.paths["/projects/{project_id}/signals"].get;
    const signal = doc.components.schemas.Signal;

    expect(createSignal).toMatchObject({
      operationId: "createSignal",
      requestBody: {
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/SignalCreate" },
          },
        },
        required: true,
      },
      responses: { "201": expect.any(Object), "423": expect.any(Object) },
    });
    expect((listSignals.parameters as Parameter[]).map((parameter) => parameter.name)).toEqual([
      API_VERSION_HEADER,
      "limit",
      "cursor",
      "source",
      "type",
      "from",
      "to",
    ]);
    expect(signal.required).toEqual(expect.arrayContaining(["public_id", "keyword_id"]));
    expect(signal.properties).toMatchObject({
      id: { type: "string" },
      public_id: { type: "string" },
      source: { enum: expect.arrayContaining(["deploy", "cms", "api"]) },
    });
  });

  it("documents provider natural IDs and optional analytics connection IDs", () => {
    const doc = getOpenApiDocument();
    const provider = doc.components.schemas.Provider;
    const listProviders = doc.paths["/projects/{project_id}/providers"].get;

    expect(listProviders.responses["200"]).toMatchObject({
      content: {
        "application/json": {
          schema: {
            properties: {
              data: {
                items: { $ref: "#/components/schemas/Provider" },
              },
            },
          },
        },
      },
    });
    expect(provider).toMatchObject({
      properties: {
        connection_id: {
          pattern: "^conn_[a-z][a-z0-9]{23}$",
          type: "string",
        },
        id: { description: "Natural provider catalog ID.", type: "string" },
      },
    });
    expect(provider.required).toContain("id");
    expect(provider.required).not.toContain("connection_id");
  });

  it("documents typed v3 patterns for public resource identifiers", () => {
    const schemas = getOpenApiDocument().components.schemas;
    const fields = [
      [schemas.Me.properties.id, "usr"],
      [schemas.PersonalAccessToken.properties.id, "pat"],
      [schemas.Project.properties.id, "prj"],
      [schemas.ProjectDefaults.properties.project_id, "prj"],
      [schemas.ProjectOverview.properties.project_id, "prj"],
      [schemas.RankCheck.properties.id, "check"],
      [schemas.RankCheck.properties.keyword_id, "kw"],
      [schemas.RankHistoryExportRow.properties.id, "check"],
      [schemas.RankHistoryExportRow.properties.keyword_id, "kw"],
      [savedViewSchema.properties.id, "viw"],
      [schemas.Signal.properties.id, "sig"],
      [schemas.Signal.properties.public_id, "sig"],
      [schemas.Signal.properties.project_id, "prj"],
      [schemas.TeamInviteResendResult.properties.id, "inv"],
      [schemas.TeamMemberMutationResult.properties.id, "mbr"],
      [schemas.WebhookEndpoint.properties.id, "we"],
    ] as const;

    for (const [schema, prefix] of fields) {
      expect(schema).toMatchObject({
        pattern: `^${prefix}_[a-z][a-z0-9]{23}$`,
        type: expect.anything(),
      });
    }
    expect(schemas.SitemapMonitor.properties.latest_snapshot.properties).not.toHaveProperty("id");
    expect(schemas.SitemapMonitor.properties.latest_snapshot.required).not.toContain("id");
  });

  it("documents strict provider connection IDs for ranked keywords and research", () => {
    const schemas = getOpenApiDocument().components.schemas;

    expect(schemas.RankedKeywordConnection).toMatchObject({
      properties: {
        id: { pattern: "^conn_[a-z][a-z0-9]{23}$", type: "string" },
      },
    });
    expect(schemas.KeywordMetricsRequest).toMatchObject({
      properties: {
        connection_id: { pattern: "^conn_[a-z][a-z0-9]{23}$", type: "string" },
      },
    });
    expect(schemas.KeywordResearchResponse).toMatchObject({
      properties: {
        connections: {
          items: {
            properties: {
              id: { pattern: "^conn_[a-z][a-z0-9]{23}$", type: "string" },
            },
          },
        },
      },
    });
  });

  it("documents cloud import migration-token operations", () => {
    const doc = getOpenApiDocument();
    const importOperation = doc.paths["/cloud/import"].post;
    const createSession = doc.paths["/cloud/import/sessions"].post;
    const uploadChunk = doc.paths["/cloud/import/sessions/{sessionId}/chunks/{index}"].put;
    const finalizeSession = doc.paths["/cloud/import/sessions/{sessionId}/finalize"].post;
    const compatibility = doc.paths["/cloud/import/compatibility"].get;

    expect(doc.components.securitySchemes).toMatchObject({
      MigrationToken: { bearerFormat: "mig_...", scheme: "bearer", type: "http" },
    });
    expect(importOperation).toMatchObject({
      operationId: "importCloudExport",
      requestBody: { content: { "application/json": { schema: ref("CloudImportPackage") } } },
      security: [{ MigrationToken: [] }],
    });
    expect(createSession.responses).toMatchObject({
      "201": expect.any(Object),
      "409": expect.any(Object),
      "419": expect.any(Object),
      "423": expect.any(Object),
    });
    expect(doc.components.schemas.CloudImportSessionCreate.required).toContain("source_project_id");
    expect(doc.components.schemas.CloudImportCompetitor).toMatchObject({
      properties: { id: { pattern: "^cmp_[a-z][a-z0-9]{23}$" } },
      required: ["id", "domain"],
    });
    expect(doc.components.schemas.CloudImportAlertRuleTarget).toMatchObject({
      discriminator: { propertyName: "type" },
      oneOf: [ref("CloudImportKeywordAlertTarget"), ref("CloudImportTagAlertTarget")],
    });
    expect(doc.components.schemas.CloudImportAlertRule.properties.severity).toMatchObject({
      enum: ["info", "warning", "urgent"],
    });
    expect(uploadChunk).toMatchObject({
      operationId: "uploadCloudImportChunk",
      requestBody: { content: { "application/json": { schema: ref("CloudImportUploadChunk") } } },
    });
    expect((uploadChunk.parameters as Parameter[]).map((parameter) => parameter.name)).toEqual([
      API_VERSION_HEADER,
      "sessionId",
      "index",
      "Content-Encoding",
    ]);
    expect(finalizeSession).toMatchObject({
      requestBody: {
        content: {
          "application/json": {
            schema: { additionalProperties: false, properties: {}, type: "object" },
          },
        },
      },
      responses: { "200": expect.any(Object) },
    });
    expect(compatibility).toMatchObject({
      operationId: "getCloudImportCompatibility",
      responses: { "200": expect.any(Object), "429": expect.any(Object) },
    });
  });

  it("exposes signal operations as capabilities", () => {
    expect(getCapabilities()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "createSignal", operationId: "createSignal" }),
        expect.objectContaining({ name: "listSignals", operationId: "listSignals" }),
      ]),
    );
  });

  it("exposes cloud import operations as capabilities", () => {
    const capabilities = getCapabilities();

    expect(capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "importCloudExport" }),
        expect.objectContaining({ name: "createCloudImportSession" }),
        expect.objectContaining({ name: "uploadCloudImportChunk" }),
        expect.objectContaining({ name: "finalizeCloudImportSession" }),
        expect.objectContaining({ name: "getCloudImportCompatibility" }),
      ]),
    );
    expect(
      capabilities.find((tool) => tool.name === "uploadCloudImportChunk")?.input_schema,
    ).toMatchObject({
      additionalProperties: false,
      properties: {
        checksum: { pattern: "^sha256:[0-9a-f]{64}$" },
        session_id: { pattern: "^imp_[a-z][a-z0-9]{23}$" },
      },
      required: ["session_id", "index", "checksum", "kind"],
    });
    expect(
      capabilities.find((tool) => tool.name === "createCloudImportSession")?.input_schema,
    ).toMatchObject({
      additionalProperties: false,
      properties: {
        source_project_id: { pattern: "^prj_[a-z][a-z0-9]{23}$" },
        version: { const: 5 },
      },
      required: ["version", "chunk_count", "source_project_id"],
    });
    expect(
      capabilities.find((tool) => tool.name === "importCloudExport")?.input_schema,
    ).not.toHaveProperty("properties.migration_token");
    expect(getLlmsText()).not.toMatch(/Migration-Token|migration_token body/);
  });
});
