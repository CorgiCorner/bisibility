import {
  CommandRegistryProvider,
  useRegisteredCommands,
} from "@/components/shell/command-registry";
import type { SavedKeywordRow } from "@/lib/saved-keywords/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SavedKeywordsToolbar } from "./SavedKeywordsTableChrome";

vi.mock("./saved-keywords-export", () => ({
  downloadSavedKeywordsCsv: vi.fn(),
}));

import { downloadSavedKeywordsCsv } from "./saved-keywords-export";

function CommandProbe() {
  const commands = useRegisteredCommands();
  return (
    <ul data-testid="cmd-list">
      {commands.map((c) => (
        <li key={c.id} data-testid={`cmd-${c.id}`}>
          <span data-testid={`label-${c.id}`}>{c.label}</span>
          <span data-testid={`hint-${c.id}`}>{c.hint}</span>
          <button data-testid={`run-${c.id}`} onClick={() => c.run()} type="button">
            Run
          </button>
        </li>
      ))}
    </ul>
  );
}

function makeRow(text: string): SavedKeywordRow {
  return {
    countryCode: "US",
    cpc: null,
    difficulty: null,
    intent: null,
    languageCode: "en",
    location: "United States",
    publicId: `sk_${text}`,
    savedAt: "2026-01-01T00:00:00.000Z",
    sourceSeed: null,
    text,
    trend: [],
    variantCount: 0,
    volume: null,
  };
}

function renderToolbar(rows: SavedKeywordRow[] = [makeRow("alpha")]) {
  render(
    <CommandRegistryProvider>
      <SavedKeywordsToolbar onSearchChange={vi.fn()} projectRef="prj_1" rows={rows} search="" />
      <CommandProbe />
    </CommandRegistryProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SavedKeywordsToolbar command registration", () => {
  it("registers Filter and Export with saved-keywords scope", () => {
    renderToolbar();
    expect(screen.getByTestId("cmd-sk-filter")).toBeTruthy();
    expect(screen.getByTestId("cmd-sk-export")).toBeTruthy();
    expect(screen.getByTestId("label-sk-filter").textContent).toBe("Filter");
    expect(screen.getByTestId("hint-sk-filter").textContent).toBe("Search saved keywords");
    expect(screen.getByTestId("label-sk-export").textContent).toBe("Export");
    expect(screen.getByTestId("hint-sk-export").textContent).toBe("Download CSV");
  });

  it("Filter command focuses the search input", () => {
    renderToolbar();
    fireEvent.click(screen.getByTestId("run-sk-filter"));
    expect(screen.getByRole("searchbox", { name: "Filter saved keywords" })).toHaveFocus();
  });

  it("Export command calls downloadSavedKeywordsCsv with current filtered rows", () => {
    const rows = [makeRow("alpha"), makeRow("beta")];
    renderToolbar(rows);
    fireEvent.click(screen.getByTestId("run-sk-export"));
    expect(downloadSavedKeywordsCsv).toHaveBeenCalledWith(rows);
  });

  it("Export is absent when the filtered list is empty", () => {
    renderToolbar([]);
    expect(screen.queryByTestId("cmd-sk-export")).toBeNull();
    expect(screen.getByTestId("cmd-sk-filter")).toBeTruthy();
  });
});
