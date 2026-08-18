import { describe, expect, it } from "vitest";
import { API_VERSION_HEADER } from "./api-versions";
import { getOpenApiDocument } from "./openapi";
import { savedViewSchema } from "./openapi-saved-views";
import type { Parameter } from "./openapi-test-helpers";

describe("OpenAPI document", () => {
  it("documents actual keyword resource fields", () => {
    const keyword = getOpenApiDocument().components.schemas.Keyword;

    expect(keyword.required).toEqual(
      expect.arrayContaining([
        "created_at",
        "language_code",
        "language_label",
        "location",
        "location_key",
        "previous_position",
        "schedule",
        "updated_at",
      ]),
    );
    expect(keyword.properties).toMatchObject({
      created_at: { format: "date-time", type: "string" },
      language_code: { type: "string" },
      language_label: { type: "string" },
      location: { type: "string" },
      location_key: { type: "string" },
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
});
