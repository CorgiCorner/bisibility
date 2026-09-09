import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AddKeywordDrawer } from "./AddKeywordDrawer";

const mocks = vi.hoisted(() => ({
  addKeywordsMatrix: vi.fn(async (_input: unknown) => ({ created: 1, keywords: [] })),
}));
vi.mock("@/lib/actions/keyword", () => mocks);
vi.mock("@/lib/actions/project-market-create", () => ({ createProjectMarket: vi.fn() }));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const id = `sch_${"a".repeat(24)}`;
const projectId = `prj_${"b".repeat(24)}`;
function setup() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: { publicId: id } }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  render(
    <AddKeywordDrawer
      addKeywordsAction={vi.fn()}
      onClose={vi.fn()}
      open
      projectId={projectId}
      projectMarkets={{
        projectId,
        maxMarkets: 5,
        monthlyCostCents: null,
        perMarketChecks: 1,
        markets: [
          {
            canonicalKey: "US",
            countryCode: "US",
            displayName: "United States",
            id: "pmkt_us",
            languageCode: "en",
            languageLabel: "English",
            monthlyCostCents: null,
            researchAvailable: true,
            status: "active",
          },
        ],
        marketCreation: {
          registry: [],
          schedules: [],
          sources: [],
          scheduleContext: {
            connectedProviders: [{ label: "DataForSEO", value: "dataforseo" }],
            defaultScheduleName: null,
            projectDefaults: {
              provider: { label: "DataForSEO", value: "dataforseo" },
              serpDepth: 100,
            },
            projectTimezone: "Europe/Warsaw",
          },
        },
      }}
    />,
  );
  return fetchMock;
}

it("keeps one drawer and restores the draft when going back from New schedule", async () => {
  setup();
  const user = userEvent.setup();
  fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "rank tracker" } });
  await user.click(screen.getByRole("button", { name: "New schedule" }));
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "New schedule" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Depth" })).toHaveTextContent("Top 100");
  expect(screen.getByRole("button", { name: "Time zone" })).toHaveTextContent("Europe/Warsaw");
  await user.click(screen.getByRole("button", { name: "Back to keywords" }));
  expect(screen.getByLabelText("Keywords")).toHaveValue("rank tracker");
  expect(screen.getByRole("button", { name: "Schedule" })).toHaveTextContent("Manual");
});

it("selects a newly created weekly schedule and submits its ID with the preserved draft", async () => {
  const fetchMock = setup();
  const user = userEvent.setup();
  fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "rank tracker" } });
  await user.click(screen.getByRole("button", { name: "New schedule" }));
  await user.click(screen.getByRole("radio", { name: "Weekly" }));
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Schedule" })).toHaveTextContent("Weekly"),
  );
  const [, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(request.body as string)).toMatchObject({
    frequency: "weekly",
    serpDepth: null,
    timezone: null,
  });
  expect(JSON.parse(request.body as string).name).toContain("Weekly");
  await user.click(screen.getByRole("button", { name: "New schedule" }));
  expect(screen.getByRole("switch")).not.toBeChecked();
  await user.click(screen.getByRole("button", { name: "Back to keywords" }));
  await user.click(screen.getByRole("button", { name: "Add keywords" }));
  await waitFor(() => expect(mocks.addKeywordsMatrix).toHaveBeenCalledOnce());
  expect(mocks.addKeywordsMatrix.mock.calls[0]?.[0]).toMatchObject({
    checkScheduleId: id,
    keywords: ["rank tracker"],
  });
});
