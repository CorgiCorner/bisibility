import { makePublicId } from "@/lib/db/public-id-resources";
import { expect, test } from "vitest";
import { assistantResultLink } from "./tool-links";

test("links are constructed from verified project and run IDs, never supplied URLs", () => {
  const project = makePublicId("prj"),
    run = makePublicId("rcr");
  expect(
    assistantResultLink(
      "run_rank_check",
      { project_id: project },
      { payload: { data: { id: run, status: "running", href: "https://evil.example" } } },
    ),
  ).toMatchObject({ id: run, href: `/app/${project}/runs/rank-checks/${run}`, status: "running" });
  expect(
    assistantResultLink(
      "run_rank_check",
      { project_id: "prj_bad" },
      { payload: { data: { id: run } } },
    ),
  ).toBeNull();
});
