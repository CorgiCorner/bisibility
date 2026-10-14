import { loopClosureToolInputSchemas } from "@/lib/api/loop-closure-capabilities";
import { expect, it } from "vitest";
import { dispatchLoopClosureTool } from "./loop-closure-tools";

it("forwards explicit report scope/time/stream/cursor through the actual existing MCP operation", () => {
  const call = dispatchLoopClosureTool("exportRankHistory", {
    project_id: "prj_abcdefghijklmnopqrstuvwx",
    version: "2",
    stream: "attempts",
    basis: "recorded_at",
    from: "2026-01-01T00:00:00Z",
    to: "2026-01-31T00:00:00Z",
    aggregation: "none",
    limit: 20,
    cursor: "opaque_signed_cursor",
    keyword_ids: ["kw_abcdefghijklmnopqrstuvwx"],
  });
  if (!call) throw new Error("Missing route");
  const url = new URL(call.path, "https://example.test");
  expect(call.method).toBe("GET");
  expect(url.pathname).toContain("exports/rank-history");
  for (const key of [
    "version",
    "stream",
    "basis",
    "from",
    "to",
    "aggregation",
    "limit",
    "cursor",
    "keyword_id",
  ])
    expect(url.searchParams.has(key)).toBe(true);
  expect(loopClosureToolInputSchemas.exportRankHistory.properties).toHaveProperty("version");
});
