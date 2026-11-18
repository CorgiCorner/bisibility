import { expect, it } from "vitest";
import {
  dataSyncPublicId,
  internalScheduleId,
  isPublicScheduleId,
  parseInternalDataSyncId,
} from "./schedule-public-id";

const projectId = "prj_a00000000000000000000000";
const otherProject = "prj_b00000000000000000000000";
const kinds = ["domain_rating", "page_indexing", "search_console", "sitemap"] as const;

it("derives a dsy_ ID with the public ID suffix rules", () => {
  for (const kind of kinds) {
    expect(dataSyncPublicId(projectId, kind)).toMatch(/^dsy_[a-z][a-z0-9]{23}$/);
  }
});

it("keeps derived data sync IDs stable across calls and distinct per project and kind", () => {
  const first = kinds.map((kind) => dataSyncPublicId(projectId, kind));
  const second = kinds.map((kind) => dataSyncPublicId(projectId, kind));
  expect(second).toEqual(first);
  expect(new Set(first).size).toBe(kinds.length);
  const other = kinds.map((kind) => dataSyncPublicId(otherProject, kind));
  expect(other.some((id) => first.includes(id))).toBe(false);
});

it("does not reveal the project public ID or an internal database ID", () => {
  const id = dataSyncPublicId(projectId, "sitemap");
  expect(id).not.toContain(projectId);
  expect(id).not.toContain("project_1");
  expect(id).not.toContain("sync:");
  expect(parseInternalDataSyncId(id)).toBeNull();
  expect(() => dataSyncPublicId("project_1", "sitemap")).toThrow(/public project ID/);
});

it("round-trips a derived ID only for the same project", () => {
  for (const kind of kinds) {
    const publicId = dataSyncPublicId(projectId, kind);
    expect(internalScheduleId(projectId, publicId)).toBe(`sync:${projectId}:${kind}`);
    expect(internalScheduleId(otherProject, publicId)).toBeNull();
  }
});

it("rejects the sync form and keeps native schedule IDs", () => {
  expect(isPublicScheduleId(`sync:${projectId}:sitemap`)).toBe(false);
  expect(isPublicScheduleId("sch_a00000000000000000000000")).toBe(true);
  expect(isPublicScheduleId("ais_a00000000000000000000000")).toBe(true);
  expect(isPublicScheduleId("lmn_a00000000000000000000000")).toBe(true);
  expect(internalScheduleId(projectId, "lmn_a00000000000000000000000")).toBe(
    "lmn_a00000000000000000000000",
  );
});
