import { exportTestContext } from "@/lib/api/rank-history-api-test-fixture";
import { exportRankHistory } from "@/lib/api/rank-history-export";
import { AuthorizationError } from "@/lib/auth/authorize";
import fixture from "@/lib/rank-history/report-transport-fixture.json";
import { transportHistorySnapshot } from "@/lib/rank-history/report-transport-test-fixture";
import { createReportCursorCodec } from "@/lib/rank-reports/cursor";
import { reportAsOf, reportPolicy, reportProject } from "@/lib/rank-reports/report-test-fixture";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, expect, it, vi } from "vitest";
import { createBisibilityMcpServer } from "./server";

const state = vi.hoisted(() => ({ reads: 0, revoked: false, sourceChanged: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/rank-history/export-snapshot", () => ({
  loadHistoryExportSnapshot: async (
    _context: unknown,
    input: { keywordIds?: readonly string[]; includeUnobservedRuns?: boolean },
  ) => {
    state.reads++;
    if (state.revoked) throw new AuthorizationError("forbidden");
    const snapshot = await transportHistorySnapshot(input.keywordIds, input.includeUnobservedRuns);
    return state.sourceChanged ? { ...snapshot, sourceDigest: "a".repeat(64) } : snapshot;
  },
}));
vi.mock("@/lib/keywords/export-audit", () => ({ auditKeywordExport: async () => undefined }));
vi.mock("@/lib/rank-reports/host-cursor", () => ({
  hostRankReportCursorCodec: () => createReportCursorCodec("synthetic-transport-fixture-key-only"),
}));
vi.mock("@/lib/rank-history/export-host", () => ({
  historyExportReportOptions: (_context: unknown, asOf = reportAsOf) => ({
    asOf,
    limits: { maxTargets: 1000, maxChecks: 1000, maxItems: 1000 },
    policyAt: () => ({ ...reportPolicy(), asOf }),
    loadMetadata: async () => new Map(),
  }),
}));
vi.mock("@/lib/api/router", () => ({
  handleApiRequest: async (request: Request, path: string[]) => {
    expect(request.method).toBe("GET");
    expect(request.headers.get("authorization")).toBe("Bearer synthetic-reader");
    expect(request.headers.get("x-bisibility-source")).toBe("mcp");
    expect(path.slice(0, 1)).toEqual(["projects"]);
    expect(path.slice(2)).toEqual(["exports", "rank-history"]);
    return exportRankHistory(exportTestContext(new URL(request.url).search), path[1]);
  },
}));
afterEach(() => {
  state.revoked = false;
  state.sourceChanged = false;
  state.reads = 0;
  vi.useRealTimers();
});

async function served() {
  vi.setSystemTime(reportAsOf);
  const server = createBisibilityMcpServer({ authorization: "synthetic-reader" });
  const client = new Client({ name: "hosted-transport-fixture", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  return {
    client,
    close: async () => {
      try {
        await client.close();
      } finally {
        await server.close();
      }
    },
  };
}
const selection = {
  project_id: reportProject.publicId,
  version: "2",
  range: "all",
  aggregation: "none",
  keyword_ids: ["kw_abcdefghijklmnopqrstuvwx"],
  from: "1970-01-01T00:00:00Z",
  to: "2026-10-12T12:00:00Z",
};

it("verifies every scanner-exempt pagination value with the synthetic fixture key", () => {
  const codec = createReportCursorCodec("synthetic-transport-fixture-key-only");
  let cursors = 0;
  function visit(value: unknown, key = "") {
    if (typeof value === "string" && value.startsWith("eyJ") && value.includes(".")) {
      expect(key).toBe("next_cursor");
      expect(value.split(".")).toHaveLength(2);
      const decoded = codec.decode(value);
      expect(decoded).toMatchObject({
        asOf: reportAsOf.toISOString(),
        version: 1,
      });
      expect(codec.encode(decoded)).toBe(value);
      cursors++;
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item);
    } else if (value && typeof value === "object") {
      for (const [name, item] of Object.entries(value)) visit(item, name);
    }
  }
  visit(fixture);
  expect(cursors).toBe(11);
});

it("serves the authoritative export schema and preserves the actual two streams, nested CID and project-only run", async () => {
  const f = await served();
  try {
    const tool = (await f.client.listTools()).tools.find(
      (entry) => entry.name === "export_rank_history",
    );
    expect(tool?.inputSchema.properties).toMatchObject({
      version: { enum: ["1", "2"] },
      cursor: { maxLength: 8192 },
      basis: { enum: ["observed_at", "recorded_at"] },
    });
    for (const name of ["observations", "recorded", "attempts", "full_attempts"] as const) {
      const { keyword_ids: _ids, ...full } = selection;
      const result = await f.client.callTool({
        name: "export_rank_history",
        arguments: {
          ...(name === "full_attempts" ? full : selection),
          stream: name.includes("attempts") ? "attempts" : "observations",
          basis: name === "observations" ? "observed_at" : "recorded_at",
          limit: name === "attempts" ? 1 : 200,
        },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual(fixture[name]);
    }
  } finally {
    await f.close();
  }
});

it("keeps all signed pages and refuses revoked access, foreign project and changed retained source", async () => {
  const f = await served();
  try {
    const args = { ...selection, stream: "attempts", basis: "recorded_at", limit: 1 };
    for (const [index, page] of fixture.attempt_pages.entries()) {
      const result = await f.client.callTool({
        name: "export_rank_history",
        arguments: {
          ...args,
          ...(index > 0 ? { cursor: fixture.attempt_pages[index - 1].meta.next_cursor } : {}),
        },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual(page);
    }
    expect(state.reads).toBe(fixture.attempt_pages.length);
    const cursor = fixture.attempt_pages[0].meta.next_cursor;
    state.revoked = true;
    expect(
      (await f.client.callTool({ name: "export_rank_history", arguments: { ...args, cursor } }))
        .isError,
    ).toBe(true);
    state.revoked = false;
    state.sourceChanged = true;
    const changed = await f.client.callTool({
      name: "export_rank_history",
      arguments: { ...args, cursor },
    });
    expect(changed.isError).toBe(true);
    expect(changed.structuredContent).toMatchObject({
      error: {
        status: 409,
        payload: { status: 409, type: "https://bisibility.com/problems/conflict" },
      },
    });
    const before = state.reads;
    expect(
      (
        await f.client.callTool({
          name: "export_rank_history",
          arguments: { ...args, project_id: "prj_bbcdefghijklmnopqrstuvwx" },
        })
      ).isError,
    ).toBe(true);
    expect(state.reads).toBe(before);
  } finally {
    await f.close();
  }
});
