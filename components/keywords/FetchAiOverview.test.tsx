import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ preview: vi.fn(), launch: vi.fn(), read: vi.fn(), saved: vi.fn() }));
vi.mock("@/lib/actions/serp-overview-fetch", () => ({
  previewSerpOverviewFetchAction: m.preview,
  readSavedSerpOverviewAction: m.saved,
}));
vi.mock("@/lib/actions/serp-playground", () => ({
  launchSerpPlaygroundAction: m.launch,
  readSerpPlaygroundAction: m.read,
}));

import { FetchAiOverview } from "./FetchAiOverview";

const keyword = { id: "", text: "Coffee", device: "desktop", locationLabel: "United States" };
const preview = {
  id: "preview",
  hash: "hash",
  expiresAt: "2026-11-09T11:00:00Z",
  keyword,
  depth: 10,
  sides: [
    {
      provider: "serpapi",
      estimatedCostCents: 2,
      nativeUnit: "searches",
      nativeQuantity: 2,
      fundingSource: "own",
    },
  ],
};
const run = {
  id: "run",
  keyword,
  createdAt: "2026-11-09T10:00:00Z",
  depth: 10,
  sides: [
    {
      provider: "serpapi",
      status: "queued",
      result: null,
      reason: null,
      costCents: null,
      quantity: null,
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  m.preview.mockResolvedValue(preview);
  m.saved.mockResolvedValue({ run: null });
  m.launch.mockResolvedValue({ ok: true, run });
  m.read.mockResolvedValue({
    ok: true,
    run: {
      ...run,
      sides: [
        {
          ...run.sides[0],
          status: "completed",
          result: {
            features: {
              aiOverview: { present: true, paragraphs: ["Fresh overview content."], sources: [] },
            },
          },
        },
      ],
    },
  });
});
it("reviews the cost and requires explicit confirmation before any paid lookup", async () => {
  render(
    <FetchAiOverview
      projectRef="prj_fixture"
      target={{ kind: "check", checkId: "check_abcdefgh" }}
    />,
  );
  expect(m.preview).not.toHaveBeenCalled();
  expect(m.launch).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Fetch AI overview" }));
  await screen.findByRole("dialog", { name: "Fetch a fresh AI overview?" });
  expect(screen.getByText(/Up to 2 SerpApi searches/)).toBeInTheDocument();
  expect(screen.getByText("Maximum cost")).toBeInTheDocument();
  expect(m.launch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Fetch overview" }));
  await screen.findByText("Fresh overview content.");
  expect(m.launch).toHaveBeenCalledTimes(1);
  expect(m.launch).toHaveBeenCalledWith(
    expect.objectContaining({
      previewId: "preview",
      previewHash: "hash",
      projectRef: "prj_fixture",
    }),
  );
});
it("keeps the same request key when a launch response is interrupted", async () => {
  m.launch.mockResolvedValueOnce({ ok: false });
  render(
    <FetchAiOverview
      projectRef="prj_fixture"
      target={{ kind: "check", checkId: "check_abcdefgh" }}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Fetch AI overview" }));
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Fetch overview" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Fetch overview" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Fetch overview" }));
  await screen.findByText("Fresh overview content.");
  expect(m.launch.mock.calls[1][0].requestKey).toBe(m.launch.mock.calls[0][0].requestKey);
});
it("shows an overview fetched earlier for the same search without a new paid request", async () => {
  const completed = {
    ...run,
    sides: [
      {
        ...run.sides[0],
        status: "completed",
        quantity: 2,
        result: {
          observedAt: "2026-11-09T10:00:05Z",
          features: {
            aiOverview: { present: true, paragraphs: ["Saved overview content."], sources: [] },
          },
        },
      },
    ],
  };
  m.saved.mockResolvedValue({ run: completed });
  m.read.mockResolvedValue({ ok: true, run: completed });
  render(
    <FetchAiOverview
      projectRef="prj_fixture"
      target={{ kind: "comparison", runId: "source", provider: "serpapi" }}
    />,
  );
  await screen.findByText("Saved overview content.");
  expect(screen.getByText(/Saved overview from/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Fetch a fresh overview" })).toBeInTheDocument();
  expect(m.saved).toHaveBeenCalledWith({
    projectRef: "prj_fixture",
    target: { kind: "comparison", runId: "source", provider: "serpapi" },
  });
  expect(m.preview).not.toHaveBeenCalled();
  expect(m.launch).not.toHaveBeenCalled();
});
