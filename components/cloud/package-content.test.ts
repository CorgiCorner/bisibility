import { IMPORT_PACKAGE_MAX_BODY_BYTES } from "@/lib/migration/package-limits";
import { buildCloudWorkspacePackage } from "@/lib/migration/workspace-package";
import { describe, expect, it } from "vitest";
import { assertPackageFileSize, parsePackageContent, parsePackageUpload } from "./package-content";

const projectId = "prj_abcdefghijklmnopqrstuvwx";

describe("package content preflight", () => {
  it("previews section counts before package validation", () => {
    const result = parsePackageContent(
      JSON.stringify({
        alert_rules: [{}],
        competitors: [{}, {}],
        keywords: [{}, {}, {}],
        notification_preferences: [{}],
        project_id: projectId,
        rank_checks: [{}, {}, {}, {}],
        saved_views: [{}, {}],
        version: 5,
      }),
    );

    expect(result.counts).toEqual({
      alertRules: 1,
      competitors: 2,
      keywords: 3,
      notificationPreferences: 1,
      rankChecks: 4,
      savedViews: 2,
    });
  });

  it("rejects keyword counts with the threshold and chunked-flow remedy", () => {
    const content = JSON.stringify({
      keywords: Array.from({ length: 501 }, () => ({})),
      project_id: projectId,
      version: 5,
    });

    expect(() => parsePackageContent(content)).toThrow(
      "Package contains 501 keywords; this upload path supports up to 500. Reduce the package or use the chunked push flow.",
    );
  });

  it("rejects oversized files with the byte threshold and chunked-flow remedy", () => {
    expect(() => assertPackageFileSize(IMPORT_PACKAGE_MAX_BODY_BYTES + 1)).toThrow(
      "Package exceeds the 8 MiB upload maximum. Reduce the package or use the chunked push flow.",
    );
  });

  it("accepts both JSON and zip uploads", async () => {
    const content = JSON.stringify({ keywords: [{}], project_id: projectId, version: 5 });
    const json = await parsePackageUpload(new TextEncoder().encode(content));
    const zipped = await parsePackageUpload(await buildCloudWorkspacePackage(content));

    expect(json).toMatchObject({ content, counts: { keywords: 1 } });
    expect(zipped).toMatchObject({ content, counts: { keywords: 1 } });
  });

  it("applies the keyword limit after zip decompression", async () => {
    const content = JSON.stringify({
      keywords: Array.from({ length: 501 }, () => ({ keyword: "duplicate" })),
      project_id: projectId,
      version: 5,
    });
    const zipped = await buildCloudWorkspacePackage(content);

    await expect(parsePackageUpload(zipped)).rejects.toThrow("Package contains 501 keywords");
  });

  it("returns clean errors for invalid JSON", async () => {
    await expect(parsePackageUpload(new TextEncoder().encode("{broken"))).rejects.toThrow(
      "Package must contain valid JSON.",
    );
  });

  it("rejects legacy versions and raw project IDs before transfer", () => {
    expect(() =>
      parsePackageContent(JSON.stringify({ keywords: [{}], project_id: projectId, version: 3 })),
    ).toThrow("Package must use the strict v5 transfer format.");
    expect(() =>
      parsePackageContent(JSON.stringify({ keywords: [{}], project_id: "project_1", version: 5 })),
    ).toThrow("Package must contain a strict prj_ v3 project ID.");
  });
});
