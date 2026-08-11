import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { KeywordLocation, KeywordRow } from "@/lib/queries/keywords";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeywordInlineEdit } from "./KeywordInlineEdit";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) }));
vi.stubGlobal("fetch", fetchMock);

afterEach(() => fetchMock.mockClear());

function location(overrides: Partial<KeywordLocation> = {}): KeywordLocation {
  return { ...keywordRows[0].location, ...overrides };
}

function keyword(overrides: Partial<KeywordRow> = {}): KeywordRow {
  const selectedLocation = overrides.location ?? keywordRows[0].location;
  return {
    ...keywordRows[0],
    ...overrides,
    location: selectedLocation,
    locationName: overrides.location ? selectedLocation.displayName : keywordRows[0].locationName,
  };
}

describe("KeywordInlineEdit location edge cases", () => {
  it("keeps a legacy stored country selectable without rewriting it when untouched", async () => {
    const updateKeywordAction = vi.fn();
    render(
      <KeywordInlineEdit
        keyword={keyword({
          location: location({ countryCode: "", displayName: "Global", id: "loc_legacy" }),
        })}
        onSaved={vi.fn()}
        updateKeywordAction={updateKeywordAction}
      />,
    );

    expect(screen.getByRole("combobox", { name: /location/i })).toHaveDisplayValue("Global");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateKeywordAction).toHaveBeenCalledOnce());
    expect(updateKeywordAction.mock.calls[0][0]).not.toHaveProperty("location");
  });

  it("uses the structured country code for city keywords", () => {
    render(
      <KeywordInlineEdit
        keyword={keyword({
          location: location({
            canonicalKey: "US/Texas/Austin",
            cityName: "Austin",
            countryCode: "US",
            displayName: "Austin, Texas, United States",
            id: "loc_austin",
            kind: "city",
          }),
          locationName: "Austin, Texas, United States",
        })}
        onSaved={vi.fn()}
        updateKeywordAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox", { name: /location/i })).toHaveDisplayValue(
      "Austin, Texas, United States",
    );
    expect(screen.queryByText(/Cities need a supported country/i)).not.toBeInTheDocument();
  });

  it("surfaces degraded location warnings without closing the edit form", async () => {
    const updateKeywordAction = vi.fn(async () => ({ warning: "Tracking at country level." }));
    const onSaved = vi.fn();
    render(
      <KeywordInlineEdit
        keyword={keyword({ keyword: "rank tracker updated" })}
        onSaved={onSaved}
        updateKeywordAction={updateKeywordAction}
      />,
    );

    fireEvent.change(screen.getByLabelText("Keyword"), {
      target: { value: "rank tracker updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Tracking at country level.")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
