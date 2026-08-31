import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  absoluteUrl: vi.fn(),
  deployment: { isCloud: true },
  getInstallApiKeySummary: vi.fn(),
  getOriginFromHeaders: vi.fn(),
  getPreferences: vi.fn(),
  headers: vi.fn(),
  resolveProjectAccess: vi.fn(),
}));

vi.mock("@/components/ui", () => ({
  CopyButton: ({ label }: { label?: string }) => <button aria-label={label} type="button" />,
}));
vi.mock("@/components/shell/PageContent", () => ({
  PageContent: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/lib/agent-ready/origin", () => ({
  absoluteUrl: mocks.absoluteUrl,
  getOriginFromHeaders: mocks.getOriginFromHeaders,
}));
vi.mock("@/lib/deployment/deployment", () => ({
  get isCloud() {
    return mocks.deployment.isCloud;
  },
}));
vi.mock("@/lib/queries/account", () => ({ getPreferences: mocks.getPreferences }));
vi.mock("@/lib/queries/_auth", () => ({ resolveProjectAccess: mocks.resolveProjectAccess }));
vi.mock("@/lib/queries/install", () => ({
  getInstallApiKeySummary: mocks.getInstallApiKeySummary,
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));

const projectRef = "prj_abcdefghijklmnopqrstuvwx";
const requestHeaders = new Headers({ host: "app.example.com", "x-forwarded-proto": "https" });

async function renderPage() {
  const { default: InstallPage } = await import("./page");
  render(await InstallPage({ params: Promise.resolve({ project: projectRef }) }));
}

describe("InstallPage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.deployment.isCloud = true;
    mocks.resolveProjectAccess.mockResolvedValue({ publicId: projectRef });
    mocks.getPreferences.mockResolvedValue({ dateFormat: "iso" });
    mocks.headers.mockResolvedValue(requestHeaders);
    mocks.getOriginFromHeaders.mockReturnValue("https://app.example.com");
    mocks.absoluteUrl.mockReturnValue("https://app.example.com/api/mcp");
    mocks.getInstallApiKeySummary.mockResolvedValue({
      createdLabel: "created 2026-08-16",
      maskedValue: "bsk_example_******",
      scopeLabel: "Read and write",
    });
  });

  it("renders the API key summary and passes the MCP URL derived from request headers", async () => {
    await renderPage();

    expect(screen.getByText("bsk_example_******")).toBeInTheDocument();
    expect(screen.getByText("scope: Read and write")).toBeInTheDocument();
    expect(mocks.getOriginFromHeaders).toHaveBeenCalledWith(requestHeaders);
    expect(mocks.absoluteUrl).toHaveBeenCalledWith("https://app.example.com", "/api/mcp");
    expect(screen.getByText("https://app.example.com/api/mcp")).toBeInTheDocument();
  });

  it("renders the empty state without a masked value when no active key exists", async () => {
    mocks.getInstallApiKeySummary.mockResolvedValue(null);

    await renderPage();

    const createKeyLink = screen.getByRole("link", {
      name: "Create one in Settings, Developers.",
    });
    expect(createKeyLink.parentElement).toHaveTextContent(
      "No API key yet. Create one in Settings, Developers.",
    );
    expect(screen.queryByText("bsk_example_******")).not.toBeInTheDocument();
  });

  it("renders the self-hosting line for Cloud mode", async () => {
    await renderPage();

    expect(
      screen.getByText("self-hosting? use your own address instead: <your-instance>/api/mcp"),
    ).toBeInTheDocument();
  });

  it("omits the self-hosting line for self-host mode", async () => {
    mocks.deployment.isCloud = false;
    await renderPage();

    expect(
      screen.queryByText("self-hosting? use your own address instead: <your-instance>/api/mcp"),
    ).not.toBeInTheDocument();
  });
});
