import {
  ALERT_RULE_NAME_MIN_LENGTH,
  ALERT_RULE_PERCENT_MAX,
  ALERT_RULE_PERCENT_MIN,
  ALERT_RULE_RANK_MAX,
  ALERT_RULE_RANK_MIN,
  ALERT_RULE_TEXT_MAX_LENGTH,
} from "@/lib/alerts/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_TOOL_NAMES } from "./canonical-tools";
import { getMcpToolDefinitions } from "./definitions";
import { dispatchMcpTool } from "./tools";

const mocks = vi.hoisted(() => {
  const handler = async (req: Request, path: string[]) => {
    const contentType = req.headers.get("content-type") ?? "";
    const body = contentType.includes("json") ? await req.json() : null;
    const url = new URL(req.url);

    return Response.json({
      authorization: req.headers.get("authorization"),
      body,
      idempotencyKey: req.headers.get("idempotency-key"),
      method: req.method,
      path,
      prefer: req.headers.get("prefer"),
      search: url.search,
    });
  };
  return {
    handleApiRequest: vi.fn(handler),
    handleMcpPreauthenticatedApiRequest: vi.fn(handler),
  };
});

vi.mock("@/lib/api/router", () => ({
  handleApiRequest: mocks.handleApiRequest,
  handleMcpPreauthenticatedApiRequest: mocks.handleMcpPreauthenticatedApiRequest,
}));

describe("MCP tool dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes the canonical unprefixed 84-tool contract", () => {
    const definitions = getMcpToolDefinitions();

    expect(definitions.map((tool) => tool.name)).toEqual(MCP_TOOL_NAMES);
    expect(definitions).toHaveLength(84);
    expect(definitions.every((tool) => /^[a-z][a-z0-9_]*$/.test(tool.name))).toBe(true);
    expect(definitions.some((tool) => tool.name.startsWith("bisibility_"))).toBe(false);
    expect(definitions.some((tool) => tool.name === "list_rank_checks")).toBe(false);
  });

  it("describes every required top-level input and publishes safety annotations", () => {
    const definitions = getMcpToolDefinitions();

    for (const tool of definitions) {
      const required = Array.isArray(tool.inputSchema.required) ? tool.inputSchema.required : [];
      const properties = tool.inputSchema.properties as Record<string, { description?: string }>;
      for (const name of required) {
        expect(properties[name]?.description, `${tool.name}.${name}`).toBeTruthy();
      }
    }
    expect(definitions.find((tool) => tool.name === "get_rank_history")?.annotations).toEqual({
      destructiveHint: false,
      openWorldHint: false,
      readOnlyHint: true,
    });
    expect(definitions.find((tool) => tool.name === "run_rank_check")?.annotations).toEqual({
      destructiveHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    });
    expect(definitions.find((tool) => tool.name === "delete_project")?.annotations).toEqual({
      destructiveHint: true,
      openWorldHint: false,
      readOnlyHint: false,
    });
  });

  it("publishes API key scope and expiry controls", () => {
    const createApiKey = getMcpToolDefinitions().find((tool) => tool.name === "create_api_key");

    expect(createApiKey?.inputSchema).toMatchObject({
      properties: {
        expires_in_days: {
          anyOf: expect.arrayContaining([
            expect.objectContaining({ const: 30 }),
            expect.objectContaining({ const: 90 }),
            expect.objectContaining({ const: 365 }),
            expect.objectContaining({ type: "null" }),
          ]),
        },
        name: { type: "string" },
        scope: {
          default: "admin",
          description: expect.stringContaining("omitted"),
          enum: ["read", "write", "admin"],
        },
      },
      required: ["name"],
    });
  });

  it("publishes the schedule jitter range", () => {
    const tools = getMcpToolDefinitions();

    expect(tools.find((tool) => tool.name === "add_keywords")?.inputSchema).toMatchObject({
      properties: {
        schedule: {
          properties: { jitter_minutes: { maximum: 120, minimum: 0 } },
        },
      },
    });
    expect(
      tools.find((tool) => tool.name === "update_project_defaults")?.inputSchema,
    ).toMatchObject({
      properties: { jitter_minutes: { maximum: 120, minimum: 0 } },
    });
  });

  it("publishes strict v3 public-ID schemas and rejects raw MCP inputs", async () => {
    const keyword = getMcpToolDefinitions().find((tool) => tool.name === "get_keyword");
    expect(keyword?.inputSchema).toMatchObject({
      properties: {
        keyword_id: { pattern: "^kw_[a-z][a-z0-9]{23}$" },
        project_id: { pattern: "^prj_[a-z][a-z0-9]{23}$" },
      },
    });

    await expect(
      dispatchMcpTool("get_keyword", { keyword_id: "keyword_db_1" }, "bsb_key_live_test"),
    ).rejects.toMatchObject({ code: "invalid_public_id" });
    await expect(
      dispatchMcpTool(
        "create_alert_rule",
        {
          condition_type: "threshold",
          name: "Track ranking",
          project_id: "prj_a00000000000000000000000",
          target_ids: ["keyword_db_1"],
          target_type: "keyword",
        },
        "bsb_key_live_test",
      ),
    ).rejects.toMatchObject({ code: "invalid_public_id" });
    expect(mocks.handleApiRequest).not.toHaveBeenCalled();
  });

  it("lists project keywords through the REST router", async () => {
    const result = await dispatchMcpTool(
      "list_keywords",
      {
        limit: 25,
        project_id: "prj_a00000000000000000000000",
        search: "rank tracker",
        tag: "Product",
      },
      "bsb_key_live_test",
    );

    expect(result).toMatchObject({ ok: true, status: 200 });
    expect(result.payload).toMatchObject({
      authorization: "Bearer bsb_key_live_test",
      method: "GET",
      path: ["projects", "prj_a00000000000000000000000", "keywords"],
      search: "?limit=25&search=rank+tracker&tag=Product",
    });
  });

  it("passes OAuth authorization as internal context without forwarding the token", async () => {
    const oauthAuth = {
      kind: "personal_token",
      memberships: [],
      token: {
        id: "oauth:test",
        name: "MCP OAuth",
        prefix: "oauth",
        publicId: null,
        scopes: ["read"],
        userId: "user_1",
      },
      user: {
        email: "owner@example.com",
        id: "user_1",
        name: "Owner",
        publicId: "usr_a00000000000000000000000",
      },
    } as const;

    await dispatchMcpTool("list_projects", {}, oauthAuth);

    const [request, , preauthenticated] = mocks.handleMcpPreauthenticatedApiRequest.mock.calls.at(
      -1,
    ) as unknown as [Request, string[], { auth: unknown }];
    expect(request.headers.get("authorization")).toBeNull();
    expect(preauthenticated.auth).toBe(oauthAuth);
    expect(mocks.handleApiRequest).not.toHaveBeenCalled();
  });

  it("normalizes keyword creation payloads and forwards idempotency", async () => {
    const result = await dispatchMcpTool(
      "add_keywords",
      {
        idempotency_key: "idem_1",
        keywords: ["rank tracker", { keyword: "seo api", target_url: "/api" }],
        project_id: "prj_a00000000000000000000000",
        tags: ["Product"],
        target_url: "/rank-tracker",
      },
      "bsb_key_live_test",
    );

    expect(result.payload).toMatchObject({
      body: {
        keywords: [
          { keyword: "rank tracker", tags: ["Product"], target_url: "/rank-tracker" },
          { keyword: "seo api", tags: ["Product"], target_url: "/api" },
        ],
      },
      idempotencyKey: "idem_1",
      method: "POST",
      path: ["projects", "prj_a00000000000000000000000", "keywords"],
    });
  });

  it("maps rank history to keyword rank-check routes", async () => {
    const result = await dispatchMcpTool(
      "get_rank_history",
      {
        keyword_id: "kw_a00000000000000000000000",
        limit: 2,
        project_id: "prj_a00000000000000000000000",
        status: "completed",
      },
      "bsb_key_live_test",
    );

    expect(result.payload).toMatchObject({
      method: "GET",
      path: ["keywords", "kw_a00000000000000000000000", "rank-checks"],
      search: "?limit=2&status=completed",
    });
    const request = mocks.handleApiRequest.mock.calls.at(-1)?.[0] as Request;
    expect(request.headers.get("x-bisibility-project")).toBe("prj_a00000000000000000000000");
  });

  it("forwards async rank checks through the standard Prefer header", async () => {
    const result = await dispatchMcpTool(
      "run_rank_check",
      {
        async: true,
        keyword_id: "kw_a00000000000000000000000",
        project_id: "prj_a00000000000000000000000",
      },
      "bsb_key_live_test",
    );

    expect(result.payload).toMatchObject({
      body: {},
      method: "POST",
      prefer: "respond-async",
    });
  });

  it.each([
    ["get_cloud_import_compatibility", {}, "GET", ["cloud", "import", "compatibility"]],
    ["get_provider_rates", {}, "GET", ["provider-rates"]],
    [
      "get_project_defaults",
      { project_id: "prj_a00000000000000000000000" },
      "GET",
      ["projects", "prj_a00000000000000000000000", "defaults"],
    ],
    [
      "list_project_api_keys",
      { limit: 25, project_id: "prj_a00000000000000000000000" },
      "GET",
      ["projects", "prj_a00000000000000000000000", "api-keys"],
    ],
    [
      "list_signals",
      { project_id: "prj_a00000000000000000000000", source: "deploy" },
      "GET",
      ["projects", "prj_a00000000000000000000000", "signals"],
    ],
  ])(
    "routes the added %s operation through the shared API router",
    async (name, input, method, path) => {
      const result = await dispatchMcpTool(name, input, "bsb_key_live_test");

      expect(result.payload).toMatchObject({ method, path });
    },
  );

  it("maps the added write operations without duplicating domain logic", async () => {
    const projectId = "prj_a00000000000000000000000";
    const cases = [
      [
        "update_project",
        { name: "Renamed", project_id: projectId },
        "PATCH",
        ["projects", projectId],
      ],
      ["delete_project", { project_id: projectId }, "DELETE", ["projects", projectId]],
      [
        "analyze_backlinks",
        { project_id: projectId, target: "example.com" },
        "GET",
        ["projects", projectId, "backlinks"],
      ],
      [
        "create_signal",
        { project_id: projectId, source: "deploy", type: "deploy.completed" },
        "POST",
        ["signals"],
      ],
      [
        "create_project_api_key",
        { name: "Automation", project_id: projectId },
        "POST",
        ["projects", projectId, "api-keys"],
      ],
      [
        "set_provider_enabled",
        { enabled: false, project_id: projectId, provider_id: "dataforseo" },
        "PATCH",
        ["projects", projectId, "providers", "dataforseo"],
      ],
    ] as const;

    for (const [name, input, method, path] of cases) {
      const result = await dispatchMcpTool(name, input, "bsb_key_live_test");
      expect(result.payload).toMatchObject({ method, path });
    }
  });

  it("preserves cost, backlink pagination, and provider-setting arguments", async () => {
    const projectId = "prj_a00000000000000000000000";

    const estimate = await dispatchMcpTool(
      "get_cost_estimate",
      {
        devices: 2,
        frequency: "weekly",
        keywords: 100,
        locations: 3,
        option: "priority",
        plan: "business",
        provider: "dataforseo",
      },
      "bsb_key_live_test",
    );
    expect(estimate.payload).toMatchObject({
      method: "GET",
      path: ["cost-estimate"],
      search:
        "?keywords=100&devices=2&locations=3&frequency=weekly&provider=dataforseo&option=priority&plan=business",
    });

    const rows = await dispatchMcpTool(
      "load_more_backlink_rows",
      {
        include_subdomains: true,
        limit: 300,
        project_id: projectId,
        target: "example.com",
        target_scope: "site",
      },
      "bsb_key_live_test",
    );
    expect(rows.payload).toMatchObject({
      body: {
        include_subdomains: true,
        limit: 300,
        target: "example.com",
        target_scope: "site",
      },
      method: "POST",
      path: ["projects", projectId, "backlinks", "rows"],
    });

    const priority = await dispatchMcpTool(
      "set_provider_priority",
      { priority: 7, project_id: projectId, provider_id: "dataforseo" },
      "bsb_key_live_test",
    );
    expect(priority.payload).toMatchObject({
      body: { priority: 7 },
      method: "PATCH",
      path: ["projects", projectId, "providers", "dataforseo"],
    });

    const primary = await dispatchMcpTool(
      "set_primary_provider",
      { project_id: projectId, provider_id: "dataforseo" },
      "bsb_key_live_test",
    );
    expect(primary.payload).toMatchObject({
      body: { primary: true },
      method: "PATCH",
      path: ["projects", projectId, "providers", "dataforseo"],
    });
  });

  it("maps optional project_id to the PAT project-selection header", async () => {
    const result = await dispatchMcpTool(
      "get_keyword",
      { keyword_id: "kw_a00000000000000000000000", project_id: "prj_a00000000000000000000000" },
      "bsb_pat_live_test",
    );

    expect(result.payload).toMatchObject({
      method: "GET",
      path: ["keywords", "kw_a00000000000000000000000"],
    });
    const request = mocks.handleApiRequest.mock.calls.at(-1)?.[0] as Request;
    expect(request.headers.get("x-bisibility-project")).toBe("prj_a00000000000000000000000");
  });

  it("routes ranked-keyword suggestions through the shared REST endpoint", async () => {
    const result = await dispatchMcpTool(
      "list_ranked_keyword_suggestions",
      {
        connection_id: "conn_a00000000000000000000000",
        fresh: true,
        limit: 100,
        offset: 100,
        project_id: "prj_a00000000000000000000000",
      },
      "bsb_key_live_test",
    );
    expect(result.payload).toMatchObject({
      method: "GET",
      path: ["projects", "prj_a00000000000000000000000", "ranked-keyword-suggestions"],
      search: "?connection_id=conn_a00000000000000000000000&offset=100&limit=100&fresh=true",
    });
    expect(
      getMcpToolDefinitions().find((tool) => tool.name === "list_ranked_keyword_suggestions")
        ?.description,
    ).toContain("$0.02");
  });

  it("routes keyword research and metrics through the shared REST endpoints", async () => {
    const research = await dispatchMcpTool(
      "research_keywords",
      {
        connection_id: "conn_a00000000000000000000000",
        estimate_only: true,
        fresh: true,
        include_clickstream: true,
        mode: "ideas",
        max_cost_cents: 7,
        project_id: "prj_a00000000000000000000000",
        result_limit: 300,
        seed: "rank tracker",
      },
      "bsb_key_live_test",
    );
    expect(research.payload).toMatchObject({
      method: "GET",
      path: ["projects", "prj_a00000000000000000000000", "keyword-research"],
      search:
        "?seed=rank+tracker&mode=ideas&result_limit=300&connection_id=conn_a00000000000000000000000&include_clickstream=true&fresh=true&estimate_only=true&max_cost_cents=7",
    });
    const metrics = await dispatchMcpTool(
      "get_keyword_metrics",
      {
        connection_id: "conn_a00000000000000000000000",
        estimate_only: true,
        include_clickstream: false,
        keywords: ["rank tracker", "seo api"],
        max_cost_cents: 7,
        project_id: "prj_a00000000000000000000000",
      },
      "bsb_key_live_test",
    );
    expect(metrics.payload).toMatchObject({
      body: {
        connection_id: "conn_a00000000000000000000000",
        estimate_only: true,
        include_clickstream: false,
        keywords: ["rank tracker", "seo api"],
        max_cost_cents: 7,
      },
      method: "POST",
      path: ["projects", "prj_a00000000000000000000000", "keyword-metrics"],
    });
    expect(
      getMcpToolDefinitions().find((tool) => tool.name === "research_keywords")?.description,
    ).toContain("one seed per call");
    expect(
      getMcpToolDefinitions().find((tool) => tool.name === "get_keyword_metrics")?.description,
    ).toContain("up to 700 keywords");
    expect(
      getMcpToolDefinitions().find((tool) => tool.name === "research_keywords")?.description,
    ).toContain("estimate_only first");
  });

  it("maps canonical location search to the project-independent REST endpoint", async () => {
    const result = await dispatchMcpTool(
      "search_locations",
      { country: "US", limit: 20, q: "Austin" },
      "bsb_key_live_test",
    );
    expect(result.payload).toMatchObject({
      method: "GET",
      path: ["locations", "search"],
      search: "?q=Austin&country=US&limit=20",
    });
    expect(
      getMcpToolDefinitions().find((tool) => tool.name === "search_locations")?.description,
    ).toContain("location_key verbatim");
  });

  it("maps team mutations to guarded project REST routes", async () => {
    const updated = await dispatchMcpTool(
      "update_team_member_role",
      {
        member_id: "mbr_a00000000000000000000000",
        project_id: "prj_a00000000000000000000000",
        role: "viewer",
      },
      "bsb_key_live_test",
    );
    expect(mocks.handleApiRequest.mock.calls.at(-1)?.[1]).toEqual([
      "projects",
      "prj_a00000000000000000000000",
      "team",
      "members",
      "mbr_a00000000000000000000000",
    ]);
    expect(updated.payload).toMatchObject({ body: { role: "viewer" }, method: "PATCH" });

    await dispatchMcpTool(
      "resend_team_invite",
      { invite_id: "inv_a00000000000000000000000", project_id: "prj_a00000000000000000000000" },
      "bsb_key_live_test",
    );
    expect(mocks.handleApiRequest.mock.calls.at(-1)?.[1]).toEqual([
      "projects",
      "prj_a00000000000000000000000",
      "team",
      "invites",
      "inv_a00000000000000000000000",
      "resend",
    ]);

    await dispatchMcpTool(
      "remove_team_member",
      { member_id: "mbr_a00000000000000000000000", project_id: "prj_a00000000000000000000000" },
      "bsb_key_live_test",
    );
    expect(
      getMcpToolDefinitions().find((tool) => tool.name === "remove_team_member")?.description,
    ).toContain("Confirm the user's intent");
  });

  it("maps analytics reads and sync to project REST routes", async () => {
    const snapshots = await dispatchMcpTool(
      "list_traffic_snapshots",
      {
        end_date: "2026-06-30",
        limit: 50,
        paths: ["/", "/pricing"],
        project_id: "prj_a00000000000000000000000",
        start_date: "2026-06-01",
      },
      "bsb_key_live_test",
    );
    expect(snapshots.payload).toMatchObject({
      method: "GET",
      path: ["projects", "prj_a00000000000000000000000", "analytics", "traffic-snapshots"],
      search: "?start_date=2026-06-01&end_date=2026-06-30&limit=50&path=%2F&path=%2Fpricing",
    });

    const queries = await dispatchMcpTool(
      "list_search_performance_query_stats",
      {
        connection_id: "conn_a00000000000000000000000",
        end_date: "2026-06-30",
        project_id: "prj_a00000000000000000000000",
        query: "rank tracker",
        start_date: "2026-06-01",
      },
      "bsb_key_live_test",
    );
    expect(queries.payload).toMatchObject({
      path: ["projects", "prj_a00000000000000000000000", "analytics", "query-stats"],
      search:
        "?start_date=2026-06-01&end_date=2026-06-30&connection_id=conn_a00000000000000000000000&query=rank+tracker",
    });

    const sync = await dispatchMcpTool(
      "sync_project_traffic",
      { idempotency_key: "sync_1", project_id: "prj_a00000000000000000000000" },
      "bsb_key_live_test",
    );
    expect(sync.payload).toMatchObject({
      idempotencyKey: "sync_1",
      method: "POST",
      path: ["projects", "prj_a00000000000000000000000", "analytics", "sync"],
    });
    expect(
      getMcpToolDefinitions().find((tool) => tool.name === "list_traffic_snapshots")?.description,
    ).toContain("project's own connected analytics accounts");
  });

  it("maps alert, rank export, and sitemap tools through REST", async () => {
    const marked = await dispatchMcpTool(
      "mark_project_alerts_read",
      { idempotency_key: "alerts_1", project_id: "prj_a00000000000000000000000" },
      "bsb_key_live_test",
    );
    expect(marked.payload).toMatchObject({
      idempotencyKey: "alerts_1",
      method: "POST",
      path: ["projects", "prj_a00000000000000000000000", "triggered-alerts", "mark-read"],
    });

    const muted = await dispatchMcpTool(
      "mute_triggered_alert",
      { alert_id: "al_a00000000000000000000000", project_id: "prj_a00000000000000000000000" },
      "bsb_key_live_test",
    );
    expect(muted.payload).toMatchObject({
      method: "POST",
      path: [
        "projects",
        "prj_a00000000000000000000000",
        "triggered-alerts",
        "al_a00000000000000000000000",
        "mute",
      ],
    });

    const exported = await dispatchMcpTool(
      "export_rank_history",
      {
        granularity: "weekly",
        keyword_ids: ["kw_a00000000000000000000000", "kw_a00000000000000000000000"],
        limit: 100,
        project_id: "prj_a00000000000000000000000",
        range: "90",
      },
      "bsb_key_live_test",
    );
    expect(exported.payload).toMatchObject({
      method: "GET",
      path: ["projects", "prj_a00000000000000000000000", "exports", "rank-history"],
      search:
        "?format=json&granularity=weekly&limit=100&range=90&keyword_id=kw_a00000000000000000000000&keyword_id=kw_a00000000000000000000000",
    });

    await dispatchMcpTool(
      "list_sitemap_monitors",
      { project_id: "prj_a00000000000000000000000" },
      "bsb_key_live_test",
    );
    expect(mocks.handleApiRequest.mock.calls.at(-1)?.[1]).toEqual([
      "projects",
      "prj_a00000000000000000000000",
      "sitemap-monitors",
    ]);

    const enabled = await dispatchMcpTool(
      "enable_sitemap_monitor",
      { monitor_id: "prj_a00000000000000000000000", project_id: "prj_a00000000000000000000000" },
      "bsb_key_live_test",
    );
    expect(enabled.payload).toMatchObject({ body: { enabled: true }, method: "PATCH" });
    const disabled = await dispatchMcpTool(
      "disable_sitemap_monitor",
      { monitor_id: "prj_a00000000000000000000000", project_id: "prj_a00000000000000000000000" },
      "bsb_key_live_test",
    );
    expect(disabled.payload).toMatchObject({ body: { enabled: false }, method: "PATCH" });

    const definitions = getMcpToolDefinitions();
    expect(definitions.find((tool) => tool.name === "export_rank_history")?.description).toContain(
      "JSON",
    );
    expect(
      definitions.find((tool) => tool.name === "mute_triggered_alert")?.inputSchema,
    ).toMatchObject({
      required: expect.arrayContaining(["project_id", "alert_id"]),
    });
  });

  it("advertises and forwards complete alert rule mutation inputs", async () => {
    const definitions = getMcpToolDefinitions();
    const createdDefinition = definitions.find((tool) => tool.name === "create_alert_rule");
    const updatedDefinition = definitions.find((tool) => tool.name === "update_alert_rule");

    expect(createdDefinition?.inputSchema).toMatchObject({
      properties: expect.objectContaining({
        channels: expect.objectContaining({
          items: expect.objectContaining({ enum: ["email", "slack", "webhook"] }),
        }),
        condition_type: expect.objectContaining({ enum: expect.arrayContaining(["downtrend"]) }),
        name: expect.anything(),
        recipient_ids: expect.objectContaining({ type: "array" }),
        severity: expect.objectContaining({ enum: ["info", "warning", "urgent"] }),
        target_ids: expect.objectContaining({ type: "array" }),
        target_type: expect.objectContaining({ enum: ["all", "keyword", "tag"] }),
        threshold_position: expect.anything(),
      }),
      required: expect.arrayContaining(["project_id", "name", "condition_type"]),
    });
    expect(createdDefinition?.inputSchema).toMatchObject({
      properties: {
        change_pct: {
          anyOf: expect.arrayContaining([
            expect.objectContaining({
              maximum: ALERT_RULE_PERCENT_MAX,
              minimum: ALERT_RULE_PERCENT_MIN,
            }),
            expect.objectContaining({ type: "null" }),
          ]),
        },
        name: {
          maxLength: ALERT_RULE_TEXT_MAX_LENGTH,
          minLength: ALERT_RULE_NAME_MIN_LENGTH,
        },
        recipient_ids: {
          items: {
            pattern: "^usr_[a-z][a-z0-9]{23}$",
            type: "string",
          },
        },
        target_ids: {
          items: {
            anyOf: expect.arrayContaining([
              expect.objectContaining({ pattern: "^kw_[a-z][a-z0-9]{23}$" }),
              expect.objectContaining({ pattern: "^tag_[a-z][a-z0-9]{23}$" }),
            ]),
          },
        },
        threshold_position: {
          anyOf: expect.arrayContaining([
            expect.objectContaining({
              maximum: ALERT_RULE_RANK_MAX,
              minimum: ALERT_RULE_RANK_MIN,
            }),
            expect.objectContaining({ type: "null" }),
          ]),
        },
      },
    });
    expect(updatedDefinition?.inputSchema).toMatchObject({
      properties: expect.objectContaining({ rule_id: expect.anything() }),
      required: expect.arrayContaining(["rule_id", "name", "condition_type"]),
    });
    expect(updatedDefinition?.inputSchema.required).not.toContain("project_id");

    const created = await dispatchMcpTool(
      "create_alert_rule",
      {
        channels: ["email"],
        condition_type: "threshold",
        name: "Lost page one",
        project_id: "prj_a00000000000000000000000",
        recipient_ids: ["usr_a00000000000000000000000"],
        severity: "warning",
        target_ids: ["kw_a00000000000000000000000"],
        target_type: "keyword",
        threshold_position: 10,
      },
      "bsb_key_live_test",
    );
    expect(created.payload).toMatchObject({
      body: {
        channels: ["email"],
        condition_type: "threshold",
        name: "Lost page one",
        recipient_ids: ["usr_a00000000000000000000000"],
        severity: "warning",
        target_ids: ["kw_a00000000000000000000000"],
        target_type: "keyword",
        threshold_position: 10,
      },
      method: "POST",
      path: ["projects", "prj_a00000000000000000000000", "alert-rules"],
    });

    const updated = await dispatchMcpTool(
      "update_alert_rule",
      {
        channels: ["webhook"],
        condition_type: "threshold",
        name: "Lost page one",
        project_id: "prj_a00000000000000000000000",
        recipient_ids: [],
        rule_id: "alr_a00000000000000000000000",
        severity: "info",
        target_ids: [],
        target_type: "all",
        threshold_position: 12,
      },
      "bsb_key_live_test",
    );
    expect(updated.payload).toMatchObject({
      body: expect.objectContaining({
        channels: ["webhook"],
        condition_type: "threshold",
        recipient_ids: [],
        severity: "info",
        threshold_position: 12,
      }),
      method: "PATCH",
      path: ["alert-rules", "alr_a00000000000000000000000"],
    });
  });

  it("maps project defaults updates to the REST defaults route", async () => {
    const result = await dispatchMcpTool(
      "update_project_defaults",
      {
        country: "Germany",
        device: "mobile",
        frequency: "weekly",
        idempotency_key: "idem_defaults",
        project_id: "prj_a00000000000000000000000",
        serp_stop_on_match: false,
      },
      "bsb_key_live_test",
    );

    expect(result.payload).toMatchObject({
      body: {
        country: "Germany",
        device: "mobile",
        frequency: "weekly",
        serp_stop_on_match: false,
      },
      idempotencyKey: "idem_defaults",
      method: "PATCH",
      path: ["projects", "prj_a00000000000000000000000", "defaults"],
    });
  });

  it("forwards the saved-view surface for list and create tools", async () => {
    const listed = await dispatchMcpTool(
      "list_saved_views",
      { project_id: "prj_a00000000000000000000000", surface: "competitors" },
      "bsb_key_live_test",
    );
    const created = await dispatchMcpTool(
      "create_saved_view",
      {
        config: {
          scope: {
            device: "desktop",
            engine: "google",
            location_id: "loc_us",
          },
          surface: "competitors",
          version: 1,
        },
        name: "US desktop",
        project_id: "prj_a00000000000000000000000",
        surface: "competitors",
      },
      "bsb_key_live_test",
    );

    expect(listed.payload).toMatchObject({ search: "?surface=competitors" });
    expect(created.payload).toMatchObject({
      body: expect.objectContaining({ name: "US desktop", surface: "competitors" }),
      method: "POST",
      path: ["projects", "prj_a00000000000000000000000", "saved-views"],
    });
    const definition = getMcpToolDefinitions().find((tool) => tool.name === "list_saved_views");
    expect(definition?.inputSchema).toMatchObject({
      properties: expect.objectContaining({
        surface: expect.objectContaining({ enum: ["keywords", "competitors"] }),
      }),
    });
  });

  it("does not advertise api_key in hosted tool schemas", () => {
    const listKeywords = getMcpToolDefinitions().find((tool) => tool.name === "list_keywords");
    expect(listKeywords?.inputSchema).toMatchObject({
      properties: expect.objectContaining({
        country: expect.objectContaining({ type: "string" }),
        device: expect.objectContaining({ enum: ["desktop", "mobile"] }),
      }),
      required: ["project_id"],
    });
    expect(listKeywords?.inputSchema).toMatchObject({
      properties: expect.not.objectContaining({ api_key: expect.anything() }),
    });
  });

  it("warns agents before provider-backed rank checks", () => {
    const runRankCheck = getMcpToolDefinitions().find((tool) => tool.name === "run_rank_check");

    expect(runRankCheck?.description).toContain("may incur provider cost");
    expect(runRankCheck?.description).toContain("explicit user approval");
    expect(runRankCheck?.description).toContain("cannot enforce the client's confirmation UI");
  });

  it("advertises canonical country naming for keyword market tools", () => {
    const definitions = getMcpToolDefinitions();
    const addKeywords = definitions.find((tool) => tool.name === "add_keywords");
    const updateKeyword = definitions.find((tool) => tool.name === "update_keyword");
    const setKeywordTargetUrl = definitions.find((tool) => tool.name === "set_keyword_target_url");
    const updateProjectDefaults = definitions.find(
      (tool) => tool.name === "update_project_defaults",
    );

    expect(addKeywords?.inputSchema).toMatchObject({
      properties: expect.objectContaining({ country: expect.anything() }),
    });
    expect(addKeywords?.inputSchema).toMatchObject({
      properties: expect.objectContaining({
        location: expect.anything(),
        location_key: expect.anything(),
      }),
    });
    expect(updateKeyword?.inputSchema).toMatchObject({
      properties: expect.objectContaining({ country: expect.anything() }),
    });
    expect(updateKeyword?.inputSchema).toMatchObject({
      properties: expect.objectContaining({
        location: expect.anything(),
        location_key: expect.anything(),
      }),
    });
    expect(setKeywordTargetUrl?.inputSchema).toMatchObject({
      properties: {
        keyword_id: expect.anything(),
        target_url: expect.anything(),
      },
      required: ["keyword_id", "target_url"],
    });
    expect(updateProjectDefaults?.inputSchema).toMatchObject({
      properties: expect.objectContaining({
        country: expect.objectContaining({ type: "string" }),
        device: expect.objectContaining({ enum: ["desktop", "mobile"] }),
        serp_stop_on_match: expect.objectContaining({ type: "boolean" }),
      }),
      required: expect.arrayContaining(["frequency", "project_id"]),
    });
  });
});
