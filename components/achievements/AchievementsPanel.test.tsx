import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { TooltipProvider } from "@/components/ui/Tooltip";
import account from "@/messages/core/en/account.json";
import shared from "@/messages/core/en/shared.json";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AchievementsPanel } from "./AchievementsPanel";

const m = vi.hoisted(() => ({ save: vi.fn(), share: vi.fn() }));
vi.mock("@/lib/actions/achievements", () => ({
  saveAchievementPreferences: m.save,
  shareAchievement: m.share,
}));
const view = {
  available: true,
  enabled: true,
  showHeader: true,
  emailEnabled: true,
  timeZone: "UTC",
  epoch: 1,
  revision: 0,
  today: "2026-10-16",
  presence: {
    current: 7,
    longest: 7,
    days: [
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ],
  },
  practice: {
    current: 4,
    longest: 4,
    days: ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"],
  },
  awards: [
    {
      kind: "presence" as const,
      earnedAt: "2026-10-16T10:00:00Z",
      earnedDay: "2026-10-16",
      published: false,
    },
  ],
};
function mount() {
  return render(
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={{ ...shared, ...account }}>
      <TooltipProvider>
        <AchievementsPanel view={view} />
      </TooltipProvider>
    </FeatureMessagesProvider>,
  );
}
describe("activity and badges UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.save.mockResolvedValue({ kind: "saved" });
    m.share.mockResolvedValue({ kind: "saved", token: "public-link-example" });
  });
  it("renders real calendar dates and translated progress without exposing a public link by default", () => {
    mount();
    expect(screen.getByText("7 days")).toBeVisible();
    expect(screen.getByText("4 of 7 days")).toBeVisible();
    expect(screen.queryByText(/account\.achievements/)).not.toBeInTheDocument();
    expect(screen.queryByText(/public-link-example/)).not.toBeInTheDocument();
    expect(m.share).not.toHaveBeenCalled();
  });
  it("publishes only after the explicit action and keeps copy feedback in place", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Create public link" }));
    expect(await screen.findByText(/public-link-example/)).toBeVisible();
    expect(m.share).toHaveBeenCalledWith({ kind: "presence", published: true });
  });
  it("saves only personal preferences using the current revision", async () => {
    mount();
    fireEvent.click(screen.getByRole("switch", { name: "Email me when I earn a badge" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved")).toBeVisible();
    expect(m.save).toHaveBeenCalledWith(
      expect.objectContaining({ emailEnabled: false, revision: 0, timeZone: "UTC" }),
    );
  });
  it("keeps the PNG download in the badge menu without publishing", async () => {
    mount();
    expect(screen.queryByRole("menuitem", { name: "Download image" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Badge options" }));
    const download = await screen.findByRole("menuitem", { name: "Download image" });
    expect(download).toHaveAttribute("href", "/api/achievements/badge/presence");
    expect(download).toHaveAttribute("download", "bisibility-presence.png");
    expect(m.share).not.toHaveBeenCalled();
  });
});
