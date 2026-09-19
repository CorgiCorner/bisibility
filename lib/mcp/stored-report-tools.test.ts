import { describe, expect, it } from "vitest";
import { internalMcpToolName, MCP_TOOL_NAMES, PHASE_C_PENDING_TOOL_NAMES } from "./canonical-tools";
import { getMcpToolDefinitions } from "./definitions";
import { dispatchExtendedToolRoute } from "./extended-tool-routes";

describe("stored report tool dispatch", () => {
  it("routes list_stored_reports to the stored reports list endpoint", () => {
    const route = dispatchExtendedToolRoute("listStoredReports", {
      project_id: "proj_123",
    });

    expect(route).toEqual({
      body: undefined,
      idempotencyKey: undefined,
      method: "GET",
      path: "/projects/proj_123/research/reports",
      projectId: "proj_123",
    });
  });

  it("routes get_stored_report to the stored backlinks report endpoint", () => {
    const route = dispatchExtendedToolRoute("getStoredReport", {
      project_id: "proj_123",
      kind: "backlinks",
      target: "example.com",
      target_scope: "page",
    });

    expect(route?.method).toBe("GET");
    expect(route?.path).toBe(
      "/projects/proj_123/research/reports/backlinks?target=example.com&target_scope=page",
    );
  });

  it("routes get_stored_report to the stored domain overview report endpoint", () => {
    const route = dispatchExtendedToolRoute("getStoredReport", {
      project_id: "proj_123",
      kind: "domain_overview",
      target: "example.com",
      target_scope: "root",
      language_code: "en",
      location_code: 2840,
    });

    expect(route?.method).toBe("GET");
    expect(route?.path).toBe(
      "/projects/proj_123/research/reports/domain_overview?target=example.com&target_scope=root&language_code=en&location_code=2840",
    );
  });

  it("routes get_stored_report to the stored keyword research report endpoint", () => {
    const route = dispatchExtendedToolRoute("getStoredReport", {
      project_id: "proj_123",
      kind: "keyword_research",
      seed: "corgi toys",
      mode: "related",
      include_clickstream: false,
      result_limit: 300,
      connection_id: "conn_abc",
    });

    expect(route?.method).toBe("GET");
    expect(route?.path).toBe(
      "/projects/proj_123/research/reports/keyword_research?seed=corgi+toys&mode=related&include_clickstream=false&result_limit=300&connection_id=conn_abc",
    );
  });

  it("omits undefined and empty query values like the estimate routes do", () => {
    const route = dispatchExtendedToolRoute("getStoredReport", {
      project_id: "proj_123",
      kind: "backlinks",
      target: "example.com",
      target_scope: "",
      mode: undefined,
    });

    expect(route?.path).toBe("/projects/proj_123/research/reports/backlinks?target=example.com");
  });

  it("rejects an unknown report kind", () => {
    expect(() =>
      dispatchExtendedToolRoute("getStoredReport", {
        project_id: "proj_123",
        kind: "rank_checks",
      }),
    ).toThrow(/kind must be one of: backlinks, domain_overview, keyword_research/);
  });
});

describe("stored report tools stay unserved until Phase C", () => {
  it("keeps every Phase C pending name out of the canonical tool names", () => {
    for (const name of PHASE_C_PENDING_TOOL_NAMES) {
      expect(MCP_TOOL_NAMES).not.toContain(name);
    }
  });

  it("keeps every Phase C pending name out of the served tool definitions", () => {
    const servedNames = getMcpToolDefinitions().map((tool) => tool.name);
    for (const name of PHASE_C_PENDING_TOOL_NAMES) {
      expect(servedNames).not.toContain(name);
    }
  });

  it("keeps internalMcpToolName throwing for every Phase C pending name", () => {
    for (const name of PHASE_C_PENDING_TOOL_NAMES) {
      expect(() => internalMcpToolName(name)).toThrow(`Unknown MCP tool: ${name}`);
    }
  });
});
