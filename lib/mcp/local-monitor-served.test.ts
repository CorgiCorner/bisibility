import { readLocalMonitorApi } from "@/lib/api/local-monitor-results";
import { localTransportFixture } from "@/lib/api/local-monitor-transport-fixture";
import fixture from "@/lib/api/local-monitor-transport-fixture.json";
import { exportTestContext } from "@/lib/api/rank-history-api-test-fixture";
import { AuthorizationError } from "@/lib/auth/authorize";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it, vi } from "vitest";
import { createBisibilityMcpServer } from "./server";

const state = vi.hoisted(() => ({ reads: 0, revoked: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/keywords/export-audit", () => ({ auditKeywordExport: async () => undefined }));
vi.mock("@/lib/api/router", () => ({
  handleApiRequest: async (request: Request, path: string[]) => {
    expect(request.method).toBe("GET");
    expect(request.headers.get("authorization")).toBe("Bearer synthetic-reader");
    expect(request.headers.get("x-bisibility-source")).toBe("mcp");
    const ctx = exportTestContext(new URL(request.url).search);
    ctx.auth.project.id = "synthetic-project";
    ctx.auth.apiKey.projectId = ctx.auth.project.id;
    const f = localTransportFixture();
    state.reads++;
    if (state.revoked)
      vi.spyOn(f.ports, "result").mockRejectedValue(new AuthorizationError("forbidden"));
    const projectId = path[1],
      monitorId = path[3];
    if (!projectId || !monitorId) throw new Error("Missing Local scope");
    const kind =
      path.length === 5
        ? "history"
        : path.at(-1) === "results"
          ? "result"
          : path.at(-1) === "export"
            ? "export"
            : path.at(-1) === "listings"
              ? "listings"
              : "point_history";
    return readLocalMonitorApi(
      ctx,
      {
        kind,
        projectId,
        monitorId,
        ...(path[5] ? { runId: path[5] } : {}),
        ...(path[7] ? { targetId: path[7] } : {}),
      },
      f.ports,
    );
  },
}));
it("serves all five actual Local RPC reads with original policy/source/CID and revoked credential refusal", async () => {
  state.reads = 0;
  state.revoked = false;
  vi.setSystemTime(new Date("2026-10-13T00:00:00.000Z"));
  const server = createBisibilityMcpServer({ authorization: "synthetic-reader" });
  const client = new Client({ name: "local-hosted", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  try {
    const tools = (await client.listTools()).tools;
    for (const [name, key] of [
      ["list_local_monitor_runs", "history"],
      ["get_local_monitor_run_results", "result"],
      ["list_local_monitor_point_listings", "listings"],
      ["list_local_monitor_point_history", "point_history"],
      ["export_local_monitor_run", "export_json"],
    ] as const) {
      const tool = tools.find((t) => t.name === name);
      if (!tool) throw new Error("Local read tool absent");
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
      const result = await client.callTool({
        name,
        arguments: {
          project_id: "prj_abcdefghijklmnopqrstuvwx",
          monitor_id: "lmn_abcdefghijklmnopqrstuvwx",
          ...(key === "history" ? {} : { run_id: "lmr_abcdefghijklmnopqrstuvwx" }),
          ...(key === "listings" || key === "point_history"
            ? { target_id: "lmt_aaaaaaaaaaaaaaaaaaaaaaa0" }
            : {}),
          as_of: "2026-10-12T12:00:00.000Z",
          ...(key === "history"
            ? {
                cursor: "c".repeat(8000),
                from: "2026-10-12T00:00:00.000Z",
                to: "2026-10-12T12:00:00.000Z",
              }
            : {}),
        },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual(fixture[key]);
    }
    expect(state.reads).toBe(5);
    state.revoked = true;
    expect(
      (
        await client.callTool({
          name: "get_local_monitor_run_results",
          arguments: {
            project_id: "prj_abcdefghijklmnopqrstuvwx",
            monitor_id: "lmn_abcdefghijklmnopqrstuvwx",
            run_id: "lmr_abcdefghijklmnopqrstuvwx",
          },
        })
      ).isError,
    ).toBe(true);
  } finally {
    state.revoked = false;
    try {
      await client.close();
    } finally {
      await server.close();
    }
  }
});
