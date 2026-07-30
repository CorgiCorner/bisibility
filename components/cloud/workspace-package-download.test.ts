import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadWorkspacePackage } from "./workspace-package-download";

describe("workspace package download", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads real zip bytes with a zip filename and MIME type", async () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:workspace");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    const filename = await downloadWorkspacePackage({
      content: JSON.stringify({
        competitors: [],
        keywords: [],
        project_id: "prj_abcdefghijklmnopqrstuvwx",
        rank_checks: [],
        version: 5,
      }),
      counts: {
        alertRules: 0,
        competitors: 0,
        keywords: 0,
        notificationPreferences: 0,
        rankChecks: 0,
        savedViews: 0,
      },
      filename: "bisibility-cloud-import-prj_abcdefghijklmnopqrstuvwx.json",
      mimeType: "application/json",
    });

    const blob = createObjectUrl.mock.calls[0]?.[0];
    const anchor = click.mock.instances[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob).toHaveProperty("type", "application/zip");
    expect(anchor).toHaveProperty(
      "download",
      "bisibility-cloud-import-prj_abcdefghijklmnopqrstuvwx.zip",
    );
    expect(filename).toBe("bisibility-cloud-import-prj_abcdefghijklmnopqrstuvwx.zip");
    await vi.waitFor(() => expect(revokeObjectUrl).toHaveBeenCalledWith("blob:workspace"));
  });
});
