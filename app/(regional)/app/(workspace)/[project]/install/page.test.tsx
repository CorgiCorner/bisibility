import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import projectInstallMessages from "@/messages/core/en/project-install.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  absoluteUrl: vi.fn(),
  deployment: { isCloud: true },
  getInstallApiKeySummary: vi.fn(),
  getInstallHasKeywordAndCheck: vi.fn(),
  getOriginFromHeaders: vi.fn(),
  headers: vi.fn(),
  loadCoreMessages: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
  resolveProjectAccess: vi.fn(),
}));

vi.mock("@/components/ui/CopyButton", () => ({
  CopyButton: ({ label }: { label?: string }) => <button aria-label={label} type="button" />,
}));
vi.mock("@/components/shell/PageContent", () => ({
  PageContent: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
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
vi.mock("@/lib/queries/_auth", () => ({ resolveProjectAccess: mocks.resolveProjectAccess }));
vi.mock("@/lib/queries/install", () => ({
  getInstallApiKeySummary: mocks.getInstallApiKeySummary,
  getInstallHasKeywordAndCheck: mocks.getInstallHasKeywordAndCheck,
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));

const starterPrompts = projectInstallMessages.projectInstall.gettingStarted.firstChat.prompt;
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
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
    mocks.loadCoreMessages.mockResolvedValue(
      mergeMessageCatalogs(sharedMessages, projectInstallMessages),
    );
    mocks.headers.mockResolvedValue(requestHeaders);
    mocks.getOriginFromHeaders.mockReturnValue("https://app.example.com");
    mocks.absoluteUrl.mockReturnValue("https://app.example.com/api/mcp");
    mocks.getInstallApiKeySummary.mockResolvedValue({
      createdAt: new Date("2026-08-16T12:00:00.000Z"),
      maskedValue: "bsk_example_******",
      scope: "write",
    });
    mocks.getInstallHasKeywordAndCheck.mockResolvedValue(false);
  });

  it("renders the API key summary and passes the MCP URL derived from request headers", async () => {
    await renderPage();

    expect(screen.getByText("bsk_example_******")).toBeInTheDocument();
    expect(screen.getByText("scope: Read and write")).toBeInTheDocument();
    expect(mocks.getOriginFromHeaders).toHaveBeenCalledWith(requestHeaders);
    expect(mocks.absoluteUrl).toHaveBeenCalledWith("https://app.example.com", "/api/mcp");
    expect(screen.getAllByText("https://app.example.com/api/mcp")).toHaveLength(4);
  }, 15_000);

  it("renders the empty state without a masked value when no active key exists", async () => {
    mocks.getInstallApiKeySummary.mockResolvedValue(null);

    await renderPage();

    expect(
      screen.getByText(
        "No API key yet. Project admins can create one under Settings → Developers.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Create one in Settings, Developers." }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("bsk_example_******")).not.toBeInTheDocument();
  }, 15_000);

  it("renders the self-hosting line for Cloud mode", async () => {
    await renderPage();

    expect(
      screen.getByText("self-hosting? use your own address instead: <your-instance>/api/mcp"),
    ).toBeInTheDocument();
  });

  it("suggests adding keywords when the project has no keyword and check", async () => {
    await renderPage();

    expect(
      screen.getByText((content) => content.includes(starterPrompts.withoutChecks)),
    ).toBeInTheDocument();
  });

  it("suggests a rank-history question when the project has a keyword and a check", async () => {
    mocks.getInstallHasKeywordAndCheck.mockResolvedValue(true);

    await renderPage();

    expect(
      screen.getByText((content) => content.includes(starterPrompts.withChecks)),
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
