import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { track } from "@/lib/analytics/client";
import { challengeProgress } from "@/lib/challenge-report/challenge-window";
import challenge from "@/messages/core/en/challenge-report.json";
import shared from "@/messages/core/en/shared.json";
import { deferred } from "@/tests/deferred";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ProjectChallengeCard } from "./ProjectChallengeCard";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

const messages = { ...shared, ...challenge };
const start = vi.fn();
const mark = vi.fn();

function renderCard() {
  return renderWithFeatureMessages(
    <ProjectChallengeCard
      canStart
      challenge={null}
      mark={mark}
      projectId="prj_project1"
      start={start}
    />,
    { messages },
  );
}

beforeEach(() => vi.clearAllMocks());

it("opens a labelled Day 1 preview and Learn more without enrolling or marking", async () => {
  const user = userEvent.setup();
  renderCard();
  const open = screen.getByRole("button", { name: "Open challenge" });
  expect(screen.getByRole("button", { name: "Learn more" })).toBeInTheDocument();
  await user.click(open);
  expect(screen.getByText("Day 1 preview")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Day 1: set your starting point" })).toBeVisible();
  expect(screen.getByText("Product pages")).toBeInTheDocument();
  expect(screen.getByText("Example plan")).toBeVisible();
  expect(screen.getByText("Pick a page or a group of pages")).toBeVisible();
  expect(screen.getByRole("region", { name: "Your badge and report after 30 days" })).toBeVisible();
  expect(screen.getByRole("region", { name: "30 days of SEO" })).toHaveFocus();
  expect(screen.queryByRole("button", { name: /^Mark day/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Learn more" }));
  expect(
    await screen.findByRole("heading", { name: "Build a steady SEO habit that never resets" }),
  ).toBeInTheDocument();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Hide preview" }));
  expect(screen.getByRole("button", { name: "Open challenge" })).toHaveFocus();
  expect(start).not.toHaveBeenCalled();
  expect(mark).not.toHaveBeenCalled();
});

it("enrolls only from the explicit Start, once even when clicked twice", async () => {
  const user = userEvent.setup();
  const pending = deferred<null>();
  start.mockReturnValue(pending.promise);
  renderCard();
  await user.click(screen.getByRole("button", { name: "Open challenge" }));
  const startButton = screen.getByRole("button", { name: "Start 30 days of SEO" });
  await user.click(startButton);
  await user.click(startButton);
  expect(start).toHaveBeenCalledTimes(1);
  expect(start).toHaveBeenCalledWith(
    "prj_project1",
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  pending.resolve(null);
  start.mockResolvedValue(null);
  await waitFor(() => expect(startButton).not.toBeDisabled());
  await user.click(screen.getByRole("button", { name: "Start 30 days of SEO" }));
  expect(start).toHaveBeenCalledTimes(2);
});

it("measures from explicit Start to the first Day 1 card load only", async () => {
  const user = userEvent.setup();
  const today = "2026-10-20";
  const pending = deferred<{
    baselineClicks: null;
    baselineOn: string;
    joinedOn: string;
    pageCount: number;
    progress: ReturnType<typeof challengeProgress>;
    snapshotId: string;
    today: string;
    workDays: number;
  }>();
  start.mockReturnValue(pending.promise);
  renderCard();
  await user.click(screen.getByRole("button", { name: "Open challenge" }));
  const clock = vi.spyOn(performance, "now").mockReturnValue(100);
  try {
    await user.click(screen.getByRole("button", { name: "Start 30 days of SEO" }));
    clock.mockReturnValue(175);
    pending.resolve({
      baselineClicks: null,
      baselineOn: today,
      joinedOn: today,
      pageCount: 2,
      progress: challengeProgress({ checkedDays: [today], joinedOn: today, today }),
      snapshotId: "snapshot-1",
      today,
      workDays: 0,
    });
    const card = await screen.findByRole("img", { name: "Day 1 challenge card" });
    fireEvent.load(card);
    fireEvent.load(card);
    expect(
      vi.mocked(track).mock.calls.filter(([event]) => event === "seo_challenge_card_ready"),
    ).toEqual([["seo_challenge_card_ready", { elapsed_ms: 75 }]]);
  } finally {
    clock.mockRestore();
  }
});
