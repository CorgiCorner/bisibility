import fs from "node:fs";
import path from "node:path";
import { renderWithInstallMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CHATGPT_ICON, ChatGptIconDownload } from "./ChatGptIconDownload";

vi.mock("@/components/ui/CopyButton", () => ({
  CopyButton: ({ label, text }: { label: string; text: string }) => (
    <button type="button" aria-label={label} data-copy-text={text} />
  ),
}));
describe("ChatGPT icon download", () => {
  it("ships a 256px PNG under 10 KB and displays its actual byte count", () => {
    const png = fs.readFileSync(path.join(process.cwd(), "public", CHATGPT_ICON.path));
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(CHATGPT_ICON.width);
    expect(png.readUInt32BE(20)).toBe(CHATGPT_ICON.height);
    expect(CHATGPT_ICON.width).toBeGreaterThanOrEqual(256);
    expect(CHATGPT_ICON.height).toBeGreaterThanOrEqual(256);
    expect(png.length).toBe(CHATGPT_ICON.bytes);
    expect(png.length).toBeLessThanOrEqual(10_000);
    render(<ChatGptIconDownload origin="https://app.example.com" />);
    expect(screen.getByText(/2,391 bytes/)).toBeVisible();
  });
  it("downloads the PNG directly and copies an absolute URL for this instance", () => {
    render(<ChatGptIconDownload origin="https://self-host.example.com" />);
    expect(screen.getByRole("link", { name: "Download PNG" })).toHaveAttribute(
      "download",
      "bisibility-mcp-icon.png",
    );
    expect(screen.getByRole("link", { name: "Download PNG" })).toHaveAttribute(
      "href",
      CHATGPT_ICON.path,
    );
    expect(screen.getByRole("button", { name: "Copy icon URL" })).toHaveAttribute(
      "data-copy-text",
      `https://self-host.example.com${CHATGPT_ICON.path}`,
    );
  });
});
