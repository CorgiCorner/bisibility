import { stubBlobDownload } from "@/tests/blob-download";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BackupCodes } from "./BackupCodes";

describe("BackupCodes", () => {
  it("downloads recovery codes as a bisibility text file", async () => {
    const { anchorClicks, objectUrls } = stubBlobDownload();

    render(<BackupCodes codes={["abcde-12345", "vwxyz-67890"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Download recovery codes" }));

    expect(anchorClicks).toHaveBeenCalledOnce();
    expect(anchorClicks.mock.contexts[0]).toHaveProperty(
      "download",
      "bisibility_recovery_codes.txt",
    );
    expect(objectUrls).toHaveBeenCalledOnce();
    const blob = objectUrls.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    if (!(blob instanceof Blob)) throw new Error("Expected recovery codes blob.");
    expect(blob.type).toBe("text/plain;charset=utf-8");
    expect(await blob.text()).toBe("abcde-12345\nvwxyz-67890\n");
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith(`blob:${blob.size}`));
  });
});
