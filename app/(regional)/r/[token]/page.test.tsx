import { sampleChallengeBody } from "@/lib/challenge-report/fixtures";
import { publicReportView } from "@/lib/report-sharing/projection";
import { parseShareSettings } from "@/lib/report-sharing/settings";
import challenge from "@/messages/core/en/challenge-report.json";
import shared from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateMetadata, default as PublicReportPage } from "./page";

const token = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN12";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), schedule: vi.fn(), viewer: vi.fn() }));
vi.mock("@/lib/report-sharing/resolve", () => ({
  resolveShareToken: mocks.resolve,
  scheduleShareView: mocks.schedule,
  viewerCanShare: mocks.viewer,
}));
vi.mock("@/lib/challenge-report/feature", () => ({
  projectSeoChallengeEnabled: async () => false,
}));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: async () => ({ locale: "en", timeZone: "UTC" }),
}));
vi.mock("@/i18n/catalog-loader.server", () => ({
  loadCoreMessages: async () => ({ ...shared, ...challenge }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

function share() {
  const body = sampleChallengeBody();
  if (body.tiles.clicks.state === "ok") body.tiles.clicks.current = 1104;
  if (body.tiles.activeDays.state === "ok") body.tiles.activeDays.activeCount = 987654;
  const view = publicReportView(
    body,
    parseShareSettings({ roundNumbers: true, showLessons: false, visibleTiles: ["clicks"] }),
  );
  return {
    domain: "example.com",
    linkId: "link-internal",
    projectId: "project-internal",
    reports: [{ id: "agr_abcdefghijklmnopqrstuvwx", stage: "day30" as const }],
    title: "30 days of SEO",
    view,
    writeMode: "active",
  };
}

describe("public report page", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_URL", "");
    vi.clearAllMocks();
    vi.mocked(notFound).mockImplementation(() => {
      throw new Error("not-found");
    });
    mocks.viewer.mockResolvedValue(false);
    mocks.resolve.mockResolvedValue(share());
  });

  it("renders only the allowed tiles for a signed-out visitor", async () => {
    render(await PublicReportPage({ params: Promise.resolve({ token }) }));
    expect(screen.getByRole("heading", { name: "30 days of SEO" })).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("1.1k")).toBeInTheDocument();
    expect(screen.getByText("bisibility · Public report")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("987654");
    expect(document.body.innerHTML).not.toContain("secret@");
    expect(screen.queryByText("Share the result")).not.toBeInTheDocument();
    expect(screen.queryByText("Days with work")).not.toBeInTheDocument();
    expect(mocks.schedule).toHaveBeenCalledWith("link-internal", expect.any(Headers));
  });

  it("shows the share block only to a member who can edit", async () => {
    mocks.viewer.mockResolvedValue(true);
    render(await PublicReportPage({ params: Promise.resolve({ token }) }));
    expect(screen.getByText("Share the result")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Post on X" })).toHaveAttribute("target", "_blank");
  });

  it("uses the same not-found result for an unknown token", async () => {
    mocks.resolve.mockResolvedValue(null);
    await expect(PublicReportPage({ params: Promise.resolve({ token }) })).rejects.toThrow(
      "not-found",
    );
    await expect(generateMetadata({ params: Promise.resolve({ token }) })).rejects.toThrow(
      "not-found",
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("marks a noindex report and omits it when the setting is off", async () => {
    const value = share();
    mocks.resolve.mockResolvedValue(value);
    const hidden = await generateMetadata({ params: Promise.resolve({ token }) });
    expect(hidden.robots).toMatchObject({ index: false });
    value.view = { ...value.view, noindex: false };
    mocks.resolve.mockResolvedValue(value);
    const visible = await generateMetadata({ params: Promise.resolve({ token }) });
    expect(visible.robots).toBeUndefined();
    expect(hidden.openGraph && "images" in hidden.openGraph).toBe(false);
  });
});
