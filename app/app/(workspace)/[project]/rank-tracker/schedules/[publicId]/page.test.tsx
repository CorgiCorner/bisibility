import { ApiNotFoundError } from "@/lib/api/errors";
import { notFound } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SchedulePage from "./page";

const mocks = vi.hoisted(() => ({
  getDefaults: vi.fn(),
  getSerpProviderChain: vi.fn(),
  listCandidates: vi.fn(),
  getSchedule: vi.fn(),
  listSchedules: vi.fn(),
  requireReadableProject: vi.fn(),
  resolveProjectAccess: vi.fn(),
}));

vi.mock("@/lib/queries/_auth", () => mocks);
vi.mock("@/lib/queries/rank-check-runs", () => ({
  getCheckSchedule: mocks.getSchedule,
  listCheckSchedules: mocks.listSchedules,
}));
vi.mock("@/lib/queries/check-schedule-members", () => ({
  listScheduleMemberCandidates: mocks.listCandidates,
}));
vi.mock("@/lib/queries/workspace-request-data", () => ({
  getRequestProjectDefaults: mocks.getDefaults,
  getRequestSerpProviderChain: mocks.getSerpProviderChain,
}));

describe("SchedulePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveProjectAccess.mockResolvedValue({ projectId: "project_1", publicId: "prj_1" });
    mocks.requireReadableProject.mockResolvedValue({ project: { id: "project_1" } });
    mocks.getDefaults.mockResolvedValue({ serpDepth: 20, timezone: "Europe/Madrid" });
    mocks.getSerpProviderChain.mockResolvedValue([{ provider: "serpapi" }]);
    mocks.listSchedules.mockResolvedValue([{ isDefault: true, name: "Daily 06:00" }]);
    mocks.listCandidates.mockResolvedValue([]);
    mocks.getSchedule.mockResolvedValue({
      cronExpression: null,
      enabled: true,
      frequency: "daily",
      isDefault: true,
      jitterMinutes: 15,
      keywordCount: 0,
      name: "Daily 06:00",
      providerPolicy: null,
      publicId: "sch_1",
      serpDepth: null,
      timeOfDay: "06:00",
      timezone: null,
    });
  });

  it("renders the authorized schedule editor from the merged schedule read API", async () => {
    render(
      await SchedulePage({
        params: Promise.resolve({ project: "prj_1", publicId: "sch_1" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "Daily 06:00" })).toBeVisible();
    expect(screen.getByRole("link", { name: "All schedules" })).toHaveAttribute(
      "href",
      "/app/prj_1/rank-tracker/schedules",
    );
    expect(screen.getByText("daily, 06:00 · sch_1")).toBeVisible();
    expect(screen.getByRole("region", { name: "Schedule editor" })).toHaveTextContent(
      "Save schedule",
    );
    expect(mocks.getSchedule).toHaveBeenCalledWith("project_1", "sch_1");
  });

  it("renders the unsaved schedule subtitle and data-derived primary defaults", async () => {
    mocks.listSchedules.mockResolvedValue([]);

    render(
      await SchedulePage({
        params: Promise.resolve({ project: "prj_1", publicId: "new" }),
      }),
    );

    expect(
      screen.getByText(
        "Not saved yet. It runs on its cadence once saved with at least one keyword.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Depth" })).toHaveTextContent(
      `Project default (Top ${20})`,
    );
    expect(screen.getByRole("button", { name: "Provider" })).toHaveTextContent(
      "Project default (SerpApi)",
    );
    expect(mocks.getSchedule).not.toHaveBeenCalled();
  });

  it("returns not found instead of rendering the new schedule for an unknown id", async () => {
    mocks.getSchedule.mockResolvedValue(null);
    vi.mocked(notFound).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      SchedulePage({
        params: Promise.resolve({ project: "prj_1", publicId: "sch_deleted" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getSchedule).toHaveBeenCalledWith("project_1", "sch_deleted");
  });

  it("uses the request reference time for a custom cron preview", async () => {
    mocks.getSchedule.mockResolvedValue({
      cronExpression: "0 6 * * 1-5",
      enabled: true,
      frequency: "custom_cron",
      isDefault: true,
      jitterMinutes: 15,
      keywordCount: 0,
      name: "Weekday cron",
      providerPolicy: null,
      publicId: "sch_1",
      serpDepth: null,
      timeOfDay: null,
      timezone: null,
    });

    render(
      await SchedulePage({
        params: Promise.resolve({ project: "prj_1", publicId: "sch_1" }),
        referenceIso: "2026-09-03T10:00:00.000Z",
      }),
    );

    expect(
      screen.getByText(/Next three: Fri 06:00, Mon 06:00, Tue 06:00 Europe\/Madrid/),
    ).toBeVisible();
  });

  it("rejects an unauthorized actor before rendering the route", async () => {
    mocks.requireReadableProject.mockRejectedValue(new Error("Unauthorized"));

    await expect(
      SchedulePage({
        params: Promise.resolve({ project: "prj_1", publicId: "sch_1" }),
      }),
    ).rejects.toThrow("Unauthorized");
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
  });

  it("renders not found for a foreign or unknown schedule", async () => {
    mocks.getSchedule.mockRejectedValueOnce(new ApiNotFoundError("Check schedule not found."));
    const missing = new Error("NEXT_NOT_FOUND");
    vi.mocked(notFound).mockImplementationOnce(() => {
      throw missing;
    });

    await expect(
      SchedulePage({ params: Promise.resolve({ project: "prj_1", publicId: "sch_missing" }) }),
    ).rejects.toBe(missing);
    expect(notFound).toHaveBeenCalledOnce();
  });
});
