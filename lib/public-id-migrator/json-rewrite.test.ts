import { describe, expect, it } from "vitest";
import type { PublicIdMaps } from "./json-rewrite";
import {
  rewriteAuditRecord,
  rewriteCloudImportManifest,
  rewriteMigrationChunkPayload,
  rewriteNotificationPayload,
  rewriteSavedViewConfig,
} from "./json-rewrite";

const maps = {
  external: new Map([
    ["triggered_alert", new Map([["alert_Legacy", "al_abcdefghijklmnopqrstuvwx"]])],
    ["alert_rule", new Map([["rule_Legacy", "alr_abcdefghijklmnopqrstuvwx"]])],
    ["cloud_import_job", new Map([["job_Legacy", "imp_abcdefghijklmnopqrstuvwx"]])],
    ["competitor", new Map([["comp_Legacy", "cmp_abcdefghijklmnopqrstuvwx"]])],
    ["ingest_hook", new Map([["hook_Legacy", "dwh_abcdefghijklmnopqrstuvwx"]])],
    ["invite", new Map([["invite_Legacy", "inv_abcdefghijklmnopqrstuvwx"]])],
    ["project", new Map([["prj_Legacy", "prj_abcdefghijklmnopqrstuvwx"]])],
    ["migration_token", new Map([["mtok_Legacy", "ferry_abcdefghijklmnopqrstuvwx"]])],
    ["saved_keyword", new Map([["skw_Legacy", "svkw_abcdefghijklmnopqrstuvwx"]])],
    ["saved_view", new Map([["view_Legacy", "viw_abcdefghijklmnopqrstuvwx"]])],
    ["session", new Map([["ses_Legacy", "sid_abcdefghijklmnopqrstuvwx"]])],
    ["keyword", new Map([["kw_Legacy", "kw_abcdefghijklmnopqrstuvwx"]])],
    ["signal", new Map([["sig_Legacy", "sig_abcdefghijklmnopqrstuvwx"]])],
    ["webhook_endpoint", new Map([["webhook_Legacy", "we_abcdefghijklmnopqrstuvwx"]])],
  ]),
  internal: new Map([["signal", new Map([["signal_raw", "sig_abcdefghijklmnopqrstuvwx"]])]]),
} as PublicIdMaps;

describe("public ID migration JSON rewrites", () => {
  it("rewrites only documented notification payload paths", () => {
    expect(
      rewriteNotificationPayload(maps, {
        href: "/app/prj_Legacy/keywords/kw_Legacy?tab=history#run",
        alertId: "alert_Legacy",
        jobId: "job_raw",
        keywordId: "kw_Legacy",
        rankCheckId: "check_raw",
        ruleId: "rule_Legacy",
      }),
    ).toEqual({
      href: "/app/prj_abcdefghijklmnopqrstuvwx/keywords/kw_abcdefghijklmnopqrstuvwx?tab=history#run",
      alertId: "al_abcdefghijklmnopqrstuvwx",
      jobId: "job_raw",
      keywordId: "kw_abcdefghijklmnopqrstuvwx",
      rankCheckId: "check_raw",
      ruleId: "alr_abcdefghijklmnopqrstuvwx",
    });
  });

  it("rewrites competitor filters but preserves raw location IDs", () => {
    expect(
      rewriteSavedViewConfig(maps, {
        filters: { excludedKeywordIds: ["kw_Legacy"] },
        scope: { locationId: "loc_raw" },
        surface: "competitors",
      }),
    ).toEqual({
      filters: { excludedKeywordIds: ["kw_abcdefghijklmnopqrstuvwx"] },
      scope: { locationId: "loc_raw" },
      surface: "competitors",
    });
  });

  it("rewrites active import payloads without changing raw identifiers", () => {
    expect(
      rewriteMigrationChunkPayload(maps, "sections", {
        sections: {
          alertRules: [{ id: "rule_Legacy", targets: [{ keywordId: "kw_Legacy" }] }],
          competitors: [{ domain: "competitor.example", id: "comp_Legacy" }],
          savedViews: [
            {
              config: { filters: { excludedKeywordIds: ["kw_Legacy"] }, surface: "competitors" },
              id: "view_Legacy",
            },
          ],
          sourceKeywordIds: { kw_Legacy: "keyword_raw" },
        },
      }),
    ).toEqual({
      sections: {
        alertRules: [
          {
            id: "alr_abcdefghijklmnopqrstuvwx",
            targets: [{ keywordId: "kw_abcdefghijklmnopqrstuvwx" }],
          },
        ],
        competitors: [{ domain: "competitor.example", id: "cmp_abcdefghijklmnopqrstuvwx" }],
        savedViews: [
          {
            config: {
              filters: { excludedKeywordIds: ["kw_abcdefghijklmnopqrstuvwx"] },
              surface: "competitors",
            },
            id: "viw_abcdefghijklmnopqrstuvwx",
          },
        ],
        sourceKeywordIds: { kw_abcdefghijklmnopqrstuvwx: "keyword_raw" },
      },
    });
  });

  it("uses action and path allowlists for audit and manifest changes", () => {
    expect(
      rewriteAuditRecord(maps, {
        action: "signal.ingested",
        after: { id: "sig_Legacy", payload: { id: "leave-me" } },
        before: null,
        targetId: "signal_raw",
        targetType: "signal",
      }),
    ).toEqual({
      action: "signal.ingested",
      after: { id: "sig_abcdefghijklmnopqrstuvwx", payload: { id: "leave-me" } },
      before: null,
      targetId: "sig_abcdefghijklmnopqrstuvwx",
      targetType: "signal",
    });
    expect(rewriteCloudImportManifest(maps, { source_project_id: "prj_Legacy" })).toEqual({
      source_project_id: "prj_abcdefghijklmnopqrstuvwx",
      version: 5,
    });
  });

  it.each([
    {
      action: "account.session_revoked",
      expected: "sid_abcdefghijklmnopqrstuvwx",
      field: "id",
      legacy: "ses_Legacy",
      position: "before" as const,
    },
    ...(["before", "after"] as const).map((position) => ({
      action: "alert_rule.update",
      expected: "alr_abcdefghijklmnopqrstuvwx",
      field: "id",
      legacy: "rule_Legacy",
      position,
    })),
    ...(["before", "after"] as const).map((position) => ({
      action: "competitor.rename",
      expected: "cmp_abcdefghijklmnopqrstuvwx",
      field: "id",
      legacy: "comp_Legacy",
      position,
    })),
    ...(["before", "after"] as const).map((position) => ({
      action: "ingest_hook.rotate",
      expected: "dwh_abcdefghijklmnopqrstuvwx",
      field: "id",
      legacy: "hook_Legacy",
      position,
    })),
    ...(["before", "after"] as const).map((position) => ({
      action: "webhook_endpoint.update",
      expected: "we_abcdefghijklmnopqrstuvwx",
      field: "publicId",
      legacy: "webhook_Legacy",
      position,
    })),
    ...[
      "cloud_import.begin",
      "cloud_import.create",
      "cloud_import.done",
      "cloud_import.fail",
      "cloud_import.session_create",
    ].map((action) => ({
      action,
      expected: "imp_abcdefghijklmnopqrstuvwx",
      field: "jobId",
      legacy: "job_Legacy",
      position: "after" as const,
    })),
    ...(["cloud_import.advance", "cloud_import.cancel"] as const).flatMap((action) =>
      (["before", "after"] as const).map((position) => ({
        action,
        expected: "imp_abcdefghijklmnopqrstuvwx",
        field: "id",
        legacy: "job_Legacy",
        position,
      })),
    ),
    {
      action: "migration_token.consume",
      expected: "ferry_abcdefghijklmnopqrstuvwx",
      field: "id",
      legacy: "mtok_Legacy",
      position: "after" as const,
    },
    ...(["before", "after"] as const).map((position) => ({
      action: "saved_view.update",
      expected: "viw_abcdefghijklmnopqrstuvwx",
      field: "savedViewId",
      legacy: "view_Legacy",
      position,
    })),
    {
      action: "team.invite.accept",
      expected: "inv_abcdefghijklmnopqrstuvwx",
      field: "inviteId",
      legacy: "invite_Legacy",
      position: "after" as const,
    },
  ])(
    "rewrites $action $position $field and preserves unrelated audit values",
    ({ action, expected, field, legacy, position }) => {
      const selected = { [field]: legacy, nested: { id: "leave-me" } };
      const untouched = { marker: "leave-me", nested: { id: legacy } };
      const row = {
        action,
        after: position === "after" ? selected : untouched,
        before: position === "before" ? selected : untouched,
        targetId: "opaque-target",
        targetType: "opaque",
      };

      const rewritten = rewriteAuditRecord(maps, row);

      expect(rewritten[position]).toEqual({
        [field]: expected,
        nested: { id: "leave-me" },
      });
      expect(rewritten[position === "after" ? "before" : "after"]).toEqual(untouched);
      expect(rewritten.targetId).toBe("opaque-target");
    },
  );

  it("rewrites saved keyword audit arrays only in the documented before path", () => {
    expect(
      rewriteAuditRecord(maps, {
        action: "saved_keyword.remove",
        after: { publicIds: ["skw_Legacy"] },
        before: { publicIds: ["skw_Legacy"], rows: [{ id: "leave-me" }] },
        targetId: "opaque-target",
        targetType: "opaque",
      }),
    ).toMatchObject({
      after: { publicIds: ["skw_Legacy"] },
      before: {
        publicIds: ["svkw_abcdefghijklmnopqrstuvwx"],
        rows: [{ id: "leave-me" }],
      },
    });
  });
});
