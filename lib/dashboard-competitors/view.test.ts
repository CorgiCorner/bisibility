import type { ViewTransaction } from "@/lib/saved-views/access";
import { expect, it, vi } from "vitest";
import {
  comparisonContext,
  comparisonProject,
  comparisonSelection,
  comparisonView,
} from "./fixture";
import {
  comparisonViewWhere,
  mapDashboardComparisonView,
  readDashboardComparisonView,
} from "./view";

it("uses actual private owner and project visibility predicates, never supplied owner authority", () => {
  expect(comparisonViewWhere(comparisonContext, comparisonProject.id)).toMatchObject({
    projectId: "db-project",
    surface: "competitors",
    OR: [{ visibility: "project" }, { visibility: "private", ownerId: "viewer" }],
  });
  expect(() =>
    comparisonViewWhere(
      { actor: { id: "viewer" }, auditActorId: null, transport: "project_api" },
      comparisonProject.id,
    ),
  ).toThrow();
});
it.each([
  { projectId: "foreign" },
  { ownerId: "foreign" },
  { revision: 0 },
  { surface: "keywords" },
  { publicId: "viw_bad" },
  { visibility: "project" as const, ownerId: "viewer" },
])("rejects corrupted/foreign identity %j", (changes) => {
  expect(
    mapDashboardComparisonView(
      { ...comparisonView(), ...changes },
      comparisonContext,
      comparisonProject,
    ),
  ).toBeNull();
});
it("minimizes a shared view and requires its exact revision", async () => {
  const row = { ...comparisonView(), visibility: "project" as const, ownerId: null };
  const findFirst = vi.fn().mockResolvedValue(row);
  const tx = { savedView: { findFirst } } as unknown as ViewTransaction;
  expect(
    await readDashboardComparisonView(
      tx,
      comparisonContext,
      comparisonProject,
      comparisonSelection,
    ),
  ).toMatchObject({
    id: comparisonSelection.viewId,
    revision: 3,
    canEdit: false,
    canDelete: false,
  });
  expect(
    await readDashboardComparisonView(tx, comparisonContext, comparisonProject, {
      ...comparisonSelection,
      revision: 2,
    }),
  ).toBeNull();
  expect(findFirst.mock.calls[0][0].where).toMatchObject({
    projectId: comparisonProject.id,
    publicId: comparisonSelection.viewId,
  });
});
