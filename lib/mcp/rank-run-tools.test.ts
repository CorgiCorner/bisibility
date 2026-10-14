import { describe, expect, it } from "vitest";
import { dispatchRankRunTool, rankRunToolSchemas } from "./rank-run-tools";

const project = "prj_abcdefghijklmnopqrstuvwx";
const run = "rcr_abcdefghijklmnopqrstuvwx";
describe("retained run MCP routing", () => {
  it("keeps list scope and opaque cursors on a read-only request", () => {
    const route = dispatchRankRunTool("listRankCheckRuns", {
      project_id: project,
      segment: "planned",
      status: "blocked,cancelled",
      limit: 25,
      cursor: "opaque+cursor/=",
    });
    expect(route?.method).toBe("GET");
    expect(route?.projectId).toBe(project);
    if (!route) throw new Error("retained run route missing");
    const url = new URL(route.path, "https://example.com");
    expect(url.pathname).toBe(`/projects/${project}/rank-check-runs`);
    expect(url.searchParams.get("cursor")).toBe("opaque+cursor/=");
    expect(url.searchParams.get("status")).toBe("blocked,cancelled");
  });
  it("reads a run even when it has no observation", () => {
    expect(dispatchRankRunTool("getRankCheckRun", { project_id: project, run_id: run })).toEqual({
      method: "GET",
      path: `/projects/${project}/rank-check-runs/${run}`,
      projectId: project,
    });
  });
  it.each([
    { project_id: project, run_id: "lmr_abcdefghijklmnopqrstuvwx" },
    { project_id: "prj/escape", run_id: run },
    { project_id: project, run_id: run, force: true },
  ])("rejects invalid or launch-shaped detail input before REST", (input) => {
    expect(() => dispatchRankRunTool("getRankCheckRun", input)).toThrow();
  });
  it("rejects oversize pagination and never catches launch commands", () => {
    expect(() =>
      dispatchRankRunTool("listRankCheckRuns", { project_id: project, limit: 201 }),
    ).toThrow();
    expect(dispatchRankRunTool("runRankCheck", { project_id: project })).toBeNull();
    expect(rankRunToolSchemas.getRankCheckRun.additionalProperties).toBe(false);
  });
});
