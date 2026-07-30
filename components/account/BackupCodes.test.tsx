import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackupCodes } from "./BackupCodes";

describe("BackupCodes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads recovery codes as a Bisibility text file", async () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:recovery-codes");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    let downloadedFilename = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(
      this: HTMLAnchorElement,
    ) {
      downloadedFilename = this.download;
    });

    render(<BackupCodes codes={["abcde-12345", "vwxyz-67890"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Download recovery codes" }));

    expect(downloadedFilename).toBe("bisibility_recovery_codes.txt");
    expect(createObjectUrl).toHaveBeenCalledOnce();
    const blob = createObjectUrl.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    if (!(blob instanceof Blob)) throw new Error("Expected recovery codes blob.");
    expect(blob.type).toBe("text/plain;charset=utf-8");
    expect(await blob.text()).toBe("abcde-12345\nvwxyz-67890\n");
    await waitFor(() => expect(revokeObjectUrl).toHaveBeenCalledWith("blob:recovery-codes"));
  });
});
