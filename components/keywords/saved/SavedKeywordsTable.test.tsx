import { appPath } from "@/lib/routing/app-path";
import { makeCostContext } from "@/tests/factories/cost-context";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SavedKeywordsTable } from "./SavedKeywordsTable";

const fetchMock = vi.fn(async () => ({ json: async () => ({ data: [] }), ok: true }));
vi.stubGlobal("fetch", fetchMock);

const costContext = makeCostContext({
  projectName: "Acme",
});

const rows: ComponentProps<typeof SavedKeywordsTable>["rows"] = [
  {
    cpc: 1.12,
    difficulty: 31,
    intent: "transactional",
    location: "US",
    publicId: "skw_1",
    savedAt: "2026-07-22T12:00:00.000Z",
    sourceSeed: "standing desk",
    text: "standing desk mat",
    trend: [{ month: 7, searchVolume: 12_100, year: 2026 }],
    variantCount: 0,
    volume: 12_100,
  },
  {
    cpc: 1.38,
    difficulty: 29,
    intent: "commercial",
    location: "US",
    publicId: "skw_2",
    savedAt: "2026-07-22T12:00:00.000Z",
    sourceSeed: "standing desk",
    text: "small standing desk",
    trend: [{ month: 7, searchVolume: 8_100, year: 2026 }],
    variantCount: 0,
    volume: 8_100,
  },
  {
    cpc: 0.51,
    difficulty: 24,
    intent: "informational",
    location: "US",
    publicId: "skw_3",
    savedAt: "2026-07-22T12:00:00.000Z",
    sourceSeed: "standing desk",
    text: "standing desk benefits",
    trend: [{ month: 7, searchVolume: 6_600, year: 2026 }],
    variantCount: 2,
    volume: 6_600,
  },
];

function renderTable(overrides: Partial<ComponentProps<typeof SavedKeywordsTable>> = {}) {
  const addKeywordsAction = vi.fn(async () => ({
    created: 3,
    keywords: rows.map((row, index) => ({ publicId: `kw_${index}`, text: row.text })),
  }));
  const onCountChange = vi.fn();
  const removeSavedKeywordsAction = vi.fn(async () => ({ removedCount: 1 }));
  render(
    <SavedKeywordsTable
      addKeywordsAction={addKeywordsAction}
      canCreateKeyword
      canDeleteKeyword
      costContext={costContext}
      defaultDevice="desktop"
      onCountChange={onCountChange}
      projectId="prj_1"
      removeSavedKeywordsAction={removeSavedKeywordsAction}
      rows={rows}
      total={rows.length}
      {...overrides}
    />,
  );
  return { addKeywordsAction, onCountChange, removeSavedKeywordsAction };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  fetchMock.mockClear();
});

describe("SavedKeywordsTable", () => {
  it("selects rows into the priced bulk bar and tracks through the prefilled drawer", async () => {
    const { addKeywordsAction, onCountChange } = renderTable();
    for (const row of rows) {
      fireEvent.click(screen.getByRole("checkbox", { name: `Select ${row.text}` }));
    }

    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.getByText("tracking all 3 adds ~$0.90/mo at daily checks")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Track 3 ~$0.90/mo" }));

    expect(screen.getByRole("textbox", { name: "Keywords" })).toHaveValue(
      rows.map((row) => row.text).join("\n"),
    );
    expect(screen.getByRole("combobox", { name: "Location" })).toHaveValue("United States");
    fireEvent.click(screen.getByRole("button", { name: "Add & track 3 keywords" }));

    await waitFor(() =>
      expect(addKeywordsAction).toHaveBeenCalledWith(
        expect.objectContaining({
          consumeSavedIds: ["skw_1", "skw_2", "skw_3"],
          keywords: rows.map((row) => row.text),
          projectId: "prj_1",
        }),
      ),
    );
    await waitFor(() => expect(onCountChange).toHaveBeenLastCalledWith(0));
    expect(screen.queryByText("standing desk mat")).not.toBeInTheDocument();
  });

  it("rejects bulk tracking across mixed saved locations", () => {
    const mixedRows = [
      rows[0],
      { ...rows[1], location: "PL", publicId: "skw_pl", text: "standing desk Poland" },
    ];
    renderTable({ rows: mixedRows, total: mixedRows.length });

    for (const row of mixedRows) {
      fireEvent.click(screen.getByRole("checkbox", { name: `Select ${row.text}` }));
    }

    expect(
      screen.getByText("Select keywords from one location to track them together."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Track 2 ~$0.60/mo" })).toBeDisabled();
    expect(screen.queryByRole("textbox", { name: "Keywords" })).not.toBeInTheDocument();
  });

  it("removes a saved row from the row menu", async () => {
    const { onCountChange, removeSavedKeywordsAction } = renderTable();

    fireEvent.click(screen.getByRole("button", { name: "Actions for standing desk mat" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from saved" }));

    await waitFor(() =>
      expect(removeSavedKeywordsAction).toHaveBeenCalledWith({
        projectId: "prj_1",
        publicIds: ["skw_1"],
      }),
    );
    expect(screen.queryByText("standing desk mat")).not.toBeInTheDocument();
    expect(onCountChange).toHaveBeenLastCalledWith(2);
  });

  it("marks snapshots older than 30 days amber with a clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T12:00:00.000Z"));
    renderTable({
      rows: [
        {
          ...rows[0],
          savedAt: "2026-06-23T11:59:59.000Z",
        },
        {
          ...rows[1],
          savedAt: "2026-06-24T12:00:00.000Z",
        },
      ],
      total: 2,
    });

    expect(screen.getByLabelText("Saved snapshot is getting stale")).toHaveClass(
      "text-yellow-text",
    );
    const freshRow = screen.getByRole("row", { name: /small standing desk/i });
    expect(within(freshRow).queryByLabelText("Saved snapshot is getting stale")).toBeNull();
  });

  it("links source chips to a prefilled Research search without selecting the row", () => {
    renderTable();

    const source = screen.getAllByRole("link", { name: "standing desk / US" })[0];
    expect(source).toHaveAttribute(
      "href",
      `${appPath("prj_1", "research")}?seed=standing+desk&location=US`,
    );
    source.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(source);
    expect(screen.queryByText("1 selected")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("row", { name: /standing desk mat/i }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });
});
