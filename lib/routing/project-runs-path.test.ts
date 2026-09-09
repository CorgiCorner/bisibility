import { describe, expect, it } from "vitest";
import { projectRunRankCheckPath, projectRunsPath } from "./project-runs-path";

const projectRef = "prj_a00000000000000000000000";
const rankRunId = "rcr_a00000000000000000000000";

describe("project runs paths", () => {
  it("builds the canonical default URL without query parameters", () => {
    expect(projectRunsPath(projectRef)).toBe(`/app/${projectRef}/runs`);
  });

  it("includes only non-default filters in a stable query order", () => {
    expect(
      projectRunsPath(projectRef, {
        cursor: "next_cursor",
        limit: 50,
        source: "rank_checks",
        status: "attention",
        view: "planned",
      }),
    ).toBe(
      `/app/${projectRef}/runs?view=planned&source=rank_checks&status=attention&limit=50&cursor=next_cursor`,
    );
  });

  it("builds a rank-check detail path only for a strict rcr public ID", () => {
    expect(projectRunRankCheckPath(projectRef, rankRunId)).toBe(
      `/app/${projectRef}/runs/rank-checks/${rankRunId}`,
    );
    expect(() => projectRunRankCheckPath(projectRef, "check_a00000000000000000000000")).toThrow(
      "rcr_",
    );
    expect(() => projectRunRankCheckPath(projectRef, "rcr_1")).toThrow("rcr_");
  });
});
