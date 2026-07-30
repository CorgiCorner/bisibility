import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadTextFile } from "./download";

describe("browser download", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("attaches the anchor for Firefox and revokes the object URL after the click", () => {
    vi.useFakeTimers();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(
      this: HTMLAnchorElement,
    ) {
      expect(document.body.contains(this)).toBe(true);
      expect(this.download).toBe("file.txt");
    });

    downloadTextFile("content", "file.txt", "text/plain;charset=utf-8");

    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download="file.txt"]')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:download");
  });
});
