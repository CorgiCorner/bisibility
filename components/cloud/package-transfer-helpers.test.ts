import { beforeEach, describe, expect, it, vi } from "vitest";
import { postImportPackage } from "./package-transfer-helpers";

describe("package transfer helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps direct transfer on the JSON wire contract", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          counts: { keywords_created: 1 },
          job_id: "imp_abcdefghijklmnopqrstuvwx",
          state: "done",
        }),
        { status: 200 },
      ),
    );
    const file = {
      content: JSON.stringify({
        keywords: [{ id: "kw_abcdefghijklmnopqrstuvwx", keyword: "rank tracker" }],
        project_id: "prj_abcdefghijklmnopqrstuvwx",
        version: 5,
      }),
      counts: {
        alertRules: 0,
        competitors: 0,
        keywords: 1,
        notificationPreferences: 0,
        rankChecks: 0,
        savedViews: 0,
      },
      filename: "workspace.zip",
      mimeType: "application/zip",
    };
    const parsed = JSON.parse(file.content);

    await postImportPackage("mig_token", parsed);

    const init = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toEqual(parsed);
    expect(init?.headers).toEqual({
      Authorization: "Bearer mig_token",
      "Content-Type": "application/json",
    });
  });

  it("rejects a completed response with a non-public job ID", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ counts: {}, job_id: "job_1", state: "done" }), {
        status: 200,
      }),
    );

    await expect(postImportPackage("mig_token", {})).rejects.toThrow(
      "Destination did not confirm a completed import.",
    );
  });
});
