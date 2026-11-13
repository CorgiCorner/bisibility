import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { TooltipProvider } from "@/components/ui/Tooltip";
import type { AchievementView } from "@/lib/achievements/schema";
import { progressForThirtyDays } from "@/lib/achievements/thirty-days";
import account from "@/messages/core/en/account.json";
import shared from "@/messages/core/en/shared.json";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AchievementsPanel } from "./AchievementsPanel";

const m = vi.hoisted(() => ({
  save: vi.fn(),
  share: vi.fn(),
  join: vi.fn(),
  leave: vi.fn(),
}));
vi.mock("@/lib/actions/achievements", () => ({
  saveAchievementPreferences: m.save,
  shareAchievement: m.share,
  joinThirtyDaysChallenge: m.join,
  leaveThirtyDaysChallenge: m.leave,
}));

const base = {
  available: true,
  enabled: true,
  showHeader: true,
  emailEnabled: true,
  timeZone: "Europe/Warsaw",
  epoch: 1,
  revision: 0,
  today: "2026-11-10",
  presence: { current: 3, longest: 9, days: ["2026-11-08", "2026-11-09", "2026-11-10"] },
  practice: { current: 3, longest: 5, days: ["2026-11-08", "2026-11-09", "2026-11-10"] },
  awards: [] as Array<{
    kind: "presence" | "practice" | "thirty_days";
    earnedAt: string;
    earnedDay: string;
    published: boolean;
  }>,
  snapshotProjects: [{ publicId: "prj_examplepagesnapshot", name: "Example" }],
};
const dayThree = progressForThirtyDays({
  joinedOn: "2026-11-07",
  leftOn: null,
  practiceDays: ["2026-11-07", "2026-11-08", "2026-11-10"],
  today: "2026-11-10",
});

function mount(view: AchievementView) {
  return render(
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={{ ...shared, ...account }}>
      <TooltipProvider>
        <AchievementsPanel view={view} />
      </TooltipProvider>
    </FeatureMessagesProvider>,
  );
}
function card() {
  const node = document.querySelector('[data-achievement-card="thirty_days"]');
  if (!node) throw new Error("missing 30-day card");
  return within(node as HTMLElement);
}

describe("30-day badge card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.join.mockResolvedValue({ kind: "joined", joinedOn: "2026-11-10" });
    m.leave.mockResolvedValue({ kind: "left", leftOn: "2026-11-10" });
    m.share.mockResolvedValue({ kind: "saved", token: "public-thirty-day-example" });
  });
  it("offers a start and a project snapshot link before joining", () => {
    mount({
      ...base,
      thirtyDays: {
        joinedOn: null,
        leftOn: null,
        dayNumber: 0,
        earned: false,
        paused: false,
        overflowDays: 0,
        slots: [],
      },
    });
    expect(screen.getByRole("heading", { name: "30 days of SEO" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Start my 30 days" })).toBeVisible();
    expect(screen.queryByRole("list", { name: "30 days of SEO" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Pages" })).toHaveAttribute(
      "href",
      "/app/prj_examplepagesnapshot/pages",
    );
    expect(screen.getByText("In a good rhythm")).toBeVisible();
    expect(screen.getByText("From data to action")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Start my 30 days" }));
    expect(m.join).toHaveBeenCalledOnce();
  });
  it("shows day 3 with a skipped day and pauses instead of offering a task", () => {
    mount({
      ...base,
      thirtyDays: {
        joinedOn: dayThree.joinedOn,
        leftOn: null,
        dayNumber: dayThree.dayNumber,
        earned: false,
        paused: dayThree.paused,
        overflowDays: dayThree.overflowDays,
        slots: dayThree.slots,
      },
    });
    const thirty = card();
    expect(thirty.getByText("Day 3")).toBeVisible();
    expect(thirty.getByText(/started Nov 7/)).toBeVisible();
    expect(thirty.getByRole("list", { name: "30 days of SEO" }).children).toHaveLength(30);
    expect(thirty.getByText(/Nov 9: Skipped/)).toBeInTheDocument();
    expect(thirty.queryByRole("button", { name: "Start task" })).not.toBeInTheDocument();
    expect(thirty.queryByRole("button", { name: "Create public link" })).not.toBeInTheDocument();
  });
  it("shares an earned badge through the same public actions and confirms leaving", async () => {
    const earned = progressForThirtyDays({
      joinedOn: "2026-10-01",
      leftOn: null,
      practiceDays: Array.from({ length: 30 }, (_, index) => {
        const day = new Date(Date.parse("2026-10-01T12:00:00Z") + index * 86_400_000)
          .toISOString()
          .slice(0, 10);
        return day;
      }),
      today: "2026-10-30",
    });
    mount({
      ...base,
      today: "2026-10-30",
      thirtyDays: {
        joinedOn: earned.joinedOn,
        leftOn: null,
        dayNumber: earned.dayNumber,
        earned: true,
        paused: false,
        overflowDays: 0,
        slots: earned.slots,
      },
      awards: [
        {
          kind: "thirty_days",
          earnedAt: "2026-10-30T12:00:00Z",
          earnedDay: "2026-10-30",
          published: false,
        },
      ],
    });
    const thirty = card();
    fireEvent.click(thirty.getByRole("button", { name: "Create public link" }));
    expect(await thirty.findByText(/public-thirty-day-example/)).toBeVisible();
    expect(m.share).toHaveBeenCalledWith({ kind: "thirty_days", published: true });
    fireEvent.click(thirty.getByRole("button", { name: "Badge options" }));
    const download = await screen.findByRole("menuitem", { name: "Download image" });
    expect(download).toHaveAttribute("href", "/api/achievements/badge/thirty_days");
    fireEvent.click(download);
    fireEvent.click(screen.getByRole("button", { name: "Leave the 30 days" }));
    fireEvent.click(await screen.findByRole("button", { name: "Leave" }));
    expect(m.leave).toHaveBeenCalledOnce();
  });
});
