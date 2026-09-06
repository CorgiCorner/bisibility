import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keyword, mocks, renderCard, resetHeaderCardMocks } from "./KeywordHeaderCard.test-utils";

describe("KeywordHeaderCard", () => {
  const originalTZ = process.env.TZ;

  beforeEach(() => {
    resetHeaderCardMocks();
    process.env.TZ = "UTC";
  });

  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
    vi.unstubAllGlobals();
  });

  it("wiring: opens preflight from the single-keyword trigger and launches with its preview token", async () => {
    const actions = renderCard({
      costContext: { costPerCheckCents: 2, providerId: "dataforseo", timezone: "UTC" },
      projectMarkets: {
        markets: [],
        maxMarkets: 5,
        monthlyCostCents: 0,
        perMarketChecks: 0,
        projectId: "prj_1",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 100)" }));
    expect(
      await screen.findByRole("dialog", { name: /Check rank tracker in United States/ }),
    ).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/api/rank-check-runs/preview",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(String(mocks.fetch.mock.calls[0]?.[1]?.body))).toEqual({
      depth: 100,
      projectId: "prj_1",
      providerId: "dataforseo",
      spec: { kind: "single", keywordId: "keyword_1", v: 1 },
    });
    expect(actions.runCheckNowAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    await waitFor(() =>
      expect(mocks.launchRankCheckRunAction).toHaveBeenCalledWith(
        expect.objectContaining({
          depth: 100,
          previewToken: "preview-header-token",
          projectId: "prj_1",
        }),
      ),
    );
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  });

  it("passes a selected depth override to the preflight preview", async () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 20)" }));
    await screen.findByRole("dialog", { name: /Check rank tracker in United States/ });
    expect(JSON.parse(String(mocks.fetch.mock.calls[0]?.[1]?.body))).toMatchObject({ depth: 20 });
  });

  it("uses the project default depth instead of a legacy keyword schedule depth", async () => {
    renderCard({
      keyword: {
        ...keyword,
        projectSerpDepth: 50,
        schedule: { ...keyword.schedule, serp_depth: 100 },
      },
    });
    expect(screen.getByText("Selected depth 50")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 50)" }));
    await screen.findByRole("dialog", { name: /Check rank tracker in United States/ });
    expect(JSON.parse(String(mocks.fetch.mock.calls[0]?.[1]?.body))).toMatchObject({ depth: 50 });
  });

  it("keeps the preflight open when the verified launch refuses a sample project", async () => {
    mocks.launchRankCheckRunAction.mockResolvedValue({
      code: "sample_project",
      message: "Sample projects don't run real checks.",
      status: "not_started",
    });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 100)" }));
    await screen.findByRole("dialog", { name: /Check rank tracker in United States/ });
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sample projects don't run real checks.",
    );
    expect(
      screen.getByRole("dialog", { name: /Check rank tracker in United States/ }),
    ).toBeInTheDocument();
  });

  it("renders slots rather than old summary metadata", () => {
    renderCard({
      costContext: { providerId: "dataforseo" },
      providerLabel: "DataForSEO",
      keyword: {
        ...keyword,
        lastCheckAt: "2026-08-10T10:00:00.000Z",
        targetUrl: "https://example.com/rank-tracker",
      },
    });
    const metadata = screen.getByLabelText("Keyword check metadata");
    expect(screen.getByRole("link", { name: "/rank-tracker" })).toHaveAttribute(
      "href",
      "https://example.com/rank-tracker",
    );
    expect(metadata).toHaveTextContent("Target /rank-tracker");
    expect(metadata).toHaveTextContent("DataForSEO");
    expect(metadata.querySelectorAll('[data-testid="keyword-detail-slot"]')).toHaveLength(8);
  });

  it("keeps the locale search link and target switcher without legacy tracking controls", () => {
    renderCard();
    expect(screen.getByRole("link", { name: "View SERP" })).toHaveAttribute(
      "href",
      expect.stringContaining("gl=us&hl=en"),
    );
    expect(screen.getByRole("button", { name: /United States \/ English/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Track location" })).not.toBeInTheDocument();
  });

  it("lists target schedules and opens SetScheduleModal for the selected target", async () => {
    renderCard({
      targets: [
        keyword,
        {
          ...keyword,
          checkSchedule: { name: "Weekly Monday", nextCheckAt: null, publicId: "sch_weekly" },
          device: "mobile",
          id: "keyword_mobile",
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: /United States \/ English/ }));
    expect(await screen.findByText("United States / English · desktop")).toBeInTheDocument();
    expect(screen.getByText("Weekly Monday")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu", { name: "United States / English" }), {
      key: "Escape",
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("menu", { name: "United States / English" }),
      ).not.toBeInTheDocument(),
    );
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: [] })));
    fireEvent.click(screen.getByRole("button", { name: "change" }));
    expect(await screen.findByRole("dialog", { name: /Set schedule/ })).toBeInTheDocument();
  });

  it("keeps market editing and scheduling available without a legacy schedule editor", () => {
    renderCard({
      projectMarkets: {
        markets: [],
        maxMarkets: 5,
        monthlyCostCents: 0,
        perMarketChecks: 0,
        projectId: "prj_1",
      },
    });
    const drawer = screen.getByText("Markets and devices drawer");
    expect(drawer).toHaveAttribute("data-open", "false");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(drawer).toHaveAttribute("data-open", "true");
    expect(screen.getByRole("button", { name: "change" })).toBeInTheDocument();
  });
});
