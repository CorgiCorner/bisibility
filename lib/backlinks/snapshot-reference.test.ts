import { expect, it } from "vitest";
import { backlinksSnapshotReference, openBacklinksSnapshotReference } from "./snapshot-reference";

it("binds an opaque continuation to its project, snapshot and observed row revision", () => {
  const snapshot = { id: "private-snapshot", projectId: "private-project", fetchedRowCount: 100 };
  const token = backlinksSnapshotReference(snapshot);
  expect(token).not.toContain(snapshot.id);
  expect(token).not.toContain(snapshot.projectId);
  expect(openBacklinksSnapshotReference(token, snapshot.projectId)).toMatchObject(snapshot);
  expect(openBacklinksSnapshotReference(token, "another-project")).toBeNull();
  expect(openBacklinksSnapshotReference(`${token}tampered`, snapshot.projectId)).toBeNull();
  expect(openBacklinksSnapshotReference(undefined, snapshot.projectId)).toBeNull();
});
