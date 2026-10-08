import { renderWithInstallMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { SETUP_VIDEO_MANIFEST } from "@/lib/getting-started/video-manifest";
import installMessages from "@/messages/core/en/project-install.json";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallGettingStarted } from "./InstallGettingStarted";

vi.mock("@/components/ui/CopyButton", () => ({
  CopyButton: ({ label, text }: { label: string; text: string }) => (
    <button type="button" aria-label={label} data-copy-text={text} />
  ),
}));
const prompts = installMessages.projectInstall.gettingStarted.firstChat.prompt;
const mcpUrl = "https://app.example.com/api/mcp";
beforeEach(() => localStorage.clear());
afterEach(() => {
  delete SETUP_VIDEO_MANIFEST["connect-chatgpt"];
  vi.restoreAllMocks();
});

describe("install getting started", () => {
  it("shows written steps and the current MCP URL without an unpublished video", () => {
    const { container } = render(
      <InstallGettingStarted hasKeywordAndCheck={false} mcpUrl={mcpUrl} />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Copy ChatGPT MCP URL" })).toHaveAttribute(
      "data-copy-text",
      mcpUrl,
    );
    expect(container.querySelector("video")).toBeNull();
    expect(screen.getByText((content) => content.includes(prompts.withoutChecks))).toBeVisible();
  });
  it("suggests a rank-history question when the project already has a keyword and a check", () => {
    render(<InstallGettingStarted hasKeywordAndCheck mcpUrl={mcpUrl} />);
    expect(screen.getByText((content) => content.includes(prompts.withChecks))).toBeVisible();
    expect(
      screen.queryByText((content) => content.includes(prompts.withoutChecks)),
    ).not.toBeInTheDocument();
  });
  it("switches instructions, scope and help link between clients", () => {
    render(<InstallGettingStarted hasKeywordAndCheck={false} mcpUrl={mcpUrl} />);
    expect(screen.getByRole("radio", { name: "ChatGPT" })).toBeChecked();
    expect(screen.getByText("Read-only access")).toBeVisible();
    expect(screen.queryByText(/Add my first keywords/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Claude" }));
    expect(screen.getByText("Read and write access")).toBeVisible();
    expect(screen.getByText("1. Open connectors")).toBeVisible();
    expect(screen.queryByText("1. Open Plugins")).not.toBeInTheDocument();
    const guide = screen.getByRole("link", { name: "Claude setup guide" });
    expect(new URL(guide.getAttribute("href") ?? "").pathname).toBe(
      "/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
    );
    expect(screen.getByRole("button", { name: "Copy Claude MCP URL" })).toHaveAttribute(
      "data-copy-text",
      mcpUrl,
    );
    fireEvent.click(screen.getByRole("radio", { name: "ChatGPT" }));
    expect(screen.getByText("1. Open Plugins")).toBeVisible();
    expect(screen.getByText("Read-only access")).toBeVisible();
  });

  it("persists dismissal after remount and lets the user restore the guide", () => {
    const { unmount } = render(
      <InstallGettingStarted hasKeywordAndCheck={false} mcpUrl={mcpUrl} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss how to start" }));
    expect(screen.queryByRole("region", { name: "How to start" })).not.toBeInTheDocument();
    unmount();
    render(<InstallGettingStarted hasKeywordAndCheck={false} mcpUrl={mcpUrl} />);
    expect(screen.queryByRole("region", { name: "How to start" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show how to start" }));
    expect(screen.getByRole("region", { name: "How to start" })).toBeVisible();
  });
  it("can dismiss and restore even when browser storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<InstallGettingStarted hasKeywordAndCheck={false} mcpUrl={mcpUrl} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss how to start" }));
    fireEvent.click(screen.getByRole("button", { name: "Show how to start" }));
    expect(screen.getByRole("region", { name: "How to start" })).toBeVisible();
  });
  it("uses the setup video player when the recording is published", () => {
    SETUP_VIDEO_MANIFEST["connect-chatgpt"] = {
      src: "/videos/setup/connect-chatgpt.mp4",
      poster: "/videos/setup/connect-chatgpt.webp",
      width: 1600,
      height: 1000,
      durationSeconds: 60,
    };
    render(<InstallGettingStarted hasKeywordAndCheck={false} mcpUrl={mcpUrl} />);
    expect(screen.getByTestId("setup-video")).toHaveAttribute(
      "src",
      "/videos/setup/connect-chatgpt.mp4",
    );
    expect(screen.getByTestId("setup-video")).toHaveAttribute("preload", "none");
    fireEvent.click(screen.getByRole("radio", { name: "Claude" }));
    expect(screen.queryByTestId("setup-video")).not.toBeInTheDocument();
  });
});
