import { describe, expect, it } from "vitest";
import {
  dashboardLocalSelectionSchema,
  effectiveLocalSelection,
  parseDashboardLocalSelection,
} from "./selection";

const localFixtureSelection = {
  scope: { kind: "keyword" as const, id: "kw_abcdefghijklmnopqrstuvwx" },
  locationId: "biz_abcdefghijklmnopqrstuvwx",
  identityRevisionId: "identity-1",
  assignmentRevision: 1,
} as const;

import {
  dashboardPresentationSchema,
  saveDashboardLocalSelectionSchema,
} from "@/lib/project-surface-preferences/dashboard-model";

describe("explicit Local presentation selection", () => {
  it("has no automatic first location and absent URL uses only the retained personal selection", () => {
    expect(effectiveLocalSelection(undefined, undefined)).toEqual({ status: "absent" });
    expect(effectiveLocalSelection(undefined, localFixtureSelection)).toEqual({
      status: "selected",
      selection: localFixtureSelection,
    });
  });
  it.each(["", "false", "{}", "[]", "null", "not-json", [JSON.stringify(localFixtureSelection)]])(
    "present invalid URL never revives a valid default: %j",
    (value) => {
      expect(effectiveLocalSelection(value, localFixtureSelection)).toEqual({ status: "invalid" });
    },
  );
  it("explicit valid URL outranks the retained choice, with strict identity/revision bounds", () => {
    const selection = { ...localFixtureSelection, assignmentRevision: 2 };
    expect(parseDashboardLocalSelection(JSON.stringify(selection))).toEqual({
      status: "selected",
      selection,
    });
    for (const patch of [
      { ownerId: "someone" },
      { assignmentRevision: 0 },
      { assignmentRevision: 2 ** 31 },
      { identityRevisionId: "" },
    ])
      expect(dashboardLocalSelectionSchema.safeParse({ ...selection, ...patch }).success).toBe(
        false,
      );
  });
  it("old presentations still parse and explicit clear persists null without changing the preset", () => {
    expect(dashboardPresentationSchema.parse({ schemaVersion: 1, layouts: {} })).toEqual({
      schemaVersion: 1,
      layouts: {},
    });
    const parsed = dashboardPresentationSchema.parse({
      schemaVersion: 1,
      layouts: {},
      localSelection: null,
    });
    expect(parsed.localSelection).toBeNull();
    const input = {
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      expectedRevision: 0,
      selection: localFixtureSelection,
    };
    expect(saveDashboardLocalSelectionSchema.safeParse(input).success).toBe(true);
    expect(saveDashboardLocalSelectionSchema.safeParse({ ...input, userId: "other" }).success).toBe(
      false,
    );
    expect(
      saveDashboardLocalSelectionSchema.safeParse({ ...input, frequency: "daily" }).success,
    ).toBe(false);
  });
});
