import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddKeywordDrawer } from "./AddKeywordDrawer";

const { addKeywordsMatrix } = vi.hoisted(() => ({
  addKeywordsMatrix: vi.fn(async () => ({ created: 1, keywords: [] })),
}));
vi.mock("@/lib/actions/keyword", () => ({ addKeywordsMatrix }));
vi.mock("@/lib/actions/project-markets", () => ({
  addProjectMarkets: vi.fn(),
}));

const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) }));
vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  addKeywordsMatrix.mockClear();
  fetchMock.mockClear();
});

const projectMarkets = {
  markets: [
    {
      canonicalKey: "US",
      countryCode: "US",
      displayName: "United States",
      id: "pmkt_us",
      languageCode: "en",
      languageLabel: "English",
      monthlyCostCents: 30,
      researchAvailable: true,
      status: "active" as const,
    },
  ],
  maxMarkets: 5,
  monthlyCostCents: 30,
  perMarketChecks: 1,
  projectId: "prj_1",
};

function renderDrawer(props: Partial<ComponentProps<typeof AddKeywordDrawer>> = {}) {
  const addKeywordsAction = vi.fn(async () => ({ created: 1, keywords: [] }));
  const onClose = vi.fn();

  const view = render(
    <AddKeywordDrawer
      addKeywordsAction={addKeywordsAction}
      onClose={onClose}
      open
      projectId="prj_1"
      projectMarkets={projectMarkets}
      {...props}
    />,
  );

  return { ...view, addKeywordsAction, onClose };
}

function addKeywordForm() {
  const form = document.querySelector<HTMLFormElement>("form#add-keyword-form");
  if (!form) throw new Error("Add keyword form was not rendered.");
  return form;
}

describe("AddKeywordDrawer", () => {
  it("shows target-matrix math and a paused switch without a cost estimate", () => {
    renderDrawer();
    expect(
      screen.getByText("0 keywords x 1 market x 1 device = 0 checks per run for this keyword."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /pause new targets/i })).toBeInTheDocument();
  });

  it("blocks manual submission until at least one active market is selected", () => {
    renderDrawer();
    fireEvent.change(screen.getByLabelText("Keywords"), {
      target: { value: "rank tracker" },
    });
    const submit = screen.getByRole("button", { name: "Add & track" });
    expect(submit).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "United States / English" }));

    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(addKeywordsMatrix).not.toHaveBeenCalled();
  });

  it("appends suggested project tags", () => {
    renderDrawer({ tagSuggestions: ["Product", "Docs"] });

    fireEvent.click(screen.getByRole("button", { name: "Product" }));

    expect(screen.getByLabelText("Tags")).toHaveValue("Product");
  });

  it("hides tag suggestions when the project has no tags", () => {
    renderDrawer();

    expect(screen.queryByText("Suggested")).not.toBeInTheDocument();
  });

  it("updates plural tracking and paused CTA labels", () => {
    renderDrawer();
    fireEvent.change(screen.getByLabelText("Keywords"), {
      target: { value: "first keyword\nsecond keyword" },
    });
    expect(screen.getByRole("button", { name: "Add & track 2 keywords" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: /pause new targets/i }));
    expect(screen.getByRole("button", { name: "Add 2 paused" })).toBeInTheDocument();
  });

  it("opens duplicate-aware CSV review from the CTA before submitting", async () => {
    const { addKeywordsAction } = renderDrawer({
      existingKeywords: [{ device: "desktop", keyword: "rank tracker", locationKey: "US" }],
      initialTab: "csv",
    });

    fireEvent.change(screen.getByLabelText("Paste CSV"), {
      target: { value: "rank tracker" },
    });
    fireEvent.click(screen.getByRole("button", { name: /review keywords/i }));

    expect(await screen.findByRole("heading", { name: "Review keywords" })).toBeInTheDocument();
    expect(screen.getByText("Already tracked - will be skipped")).toBeInTheDocument();
    expect(addKeywordsAction).not.toHaveBeenCalled();
  });

  it("routes native CSV submits into review before saving", async () => {
    const { addKeywordsAction } = renderDrawer({
      initialTab: "csv",
    });

    fireEvent.change(screen.getByLabelText("Paste CSV"), {
      target: { value: "rank tracker" },
    });
    fireEvent.submit(addKeywordForm());

    expect(await screen.findByRole("heading", { name: "Review keywords" })).toBeInTheDocument();
    expect(addKeywordsAction).not.toHaveBeenCalled();
  });

  it.each([
    [
      "semicolon",
      "keyword;target_url;tags;country;device\nrank tracker;/rank;Core;US;desktop",
      "This file appears to use semicolons (;) as separators. Export it as comma-separated CSV and try again.",
    ],
    [
      "tab",
      "keyword\ttarget_url\ttags\tcountry\tdevice\nrank tracker\t/rank\tCore\tUS\tdesktop",
      "This file appears to use tabs as separators. Export it as comma-separated CSV and try again.",
    ],
  ])("shows %s CSV parser guidance and blocks review", async (_separator, csv, message) => {
    const { addKeywordsAction } = renderDrawer({ initialTab: "csv" });

    fireEvent.change(screen.getByLabelText("Paste CSV"), { target: { value: csv } });
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText("0 keywords parsed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /review keywords/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /review keywords/i }));
    expect(screen.queryByRole("heading", { name: "Review keywords" })).not.toBeInTheDocument();
    expect(addKeywordsAction).not.toHaveBeenCalled();
  });

  it("submits per-row CSV country, device, tags, and target URL", async () => {
    const { addKeywordsAction } = renderDrawer({
      defaultDevice: "desktop",
      defaultLocation: "United States",
      initialTab: "csv",
    });

    fireEvent.change(screen.getByLabelText("Paste CSV"), {
      target: {
        value:
          'keyword,target_url,tags,country,device\nrank tracker,/rank,"Core; Product",GB,mobile',
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /review keywords/i }));
    await screen.findByRole("heading", { name: "Review keywords" });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(addKeywordsAction).toHaveBeenCalledTimes(1));
    expect(addKeywordsAction).toHaveBeenCalledWith({
      projectId: "prj_1",
      rows: [
        expect.objectContaining({
          city: null,
          device: "mobile",
          keyword: "rank tracker",
          location: "United Kingdom",
          tags: ["Core", "Product"],
          targetUrl: "/rank",
        }),
      ],
      schedule: undefined,
    });
  });

  it("shows row-level CSV validation for invalid device and country values", async () => {
    const { addKeywordsAction } = renderDrawer({ initialTab: "csv" });

    fireEvent.change(screen.getByLabelText("Paste CSV"), {
      target: {
        value: "keyword,country,device\nbad device,US,tablet\nbad country,ZZ,desktop",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /review keywords/i }));

    expect(await screen.findByText("Row 2: Use desktop or mobile for device.")).toBeInTheDocument();
    expect(screen.getByText("Row 3: Choose a supported SERP country.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    expect(addKeywordsAction).not.toHaveBeenCalled();
  });

  it("keeps malformed CSV out of the native submit path", async () => {
    const { addKeywordsAction } = renderDrawer({ initialTab: "csv" });

    fireEvent.change(screen.getByLabelText("Paste CSV"), {
      target: { value: 'keyword,target_url\nrank tracker,"/rank' },
    });

    expect(
      await screen.findByText("Malformed CSV: quoted field is missing a closing quote."),
    ).toBeInTheDocument();
    expect(screen.getByText("0 keywords parsed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /review keywords/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Manual" }));
    fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "rank tracker" } });
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));
    fireEvent.submit(addKeywordForm());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByRole("heading", { name: "Review keywords" })).not.toBeInTheDocument();
    expect(addKeywordsAction).not.toHaveBeenCalled();
  });

  it("does not let a hidden CSV error disable manual keyword submission", async () => {
    renderDrawer({ initialTab: "csv" });
    fireEvent.change(screen.getByLabelText("Paste CSV"), {
      target: { value: "keyword;country\nrank tracker;US" },
    });
    expect(screen.getByRole("button", { name: /review keywords/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Manual" }));
    fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "rank tracker" } });
    const submit = screen.getByRole("button", { name: "Add & track" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(addKeywordsMatrix).toHaveBeenCalledOnce());
  });

  it("offers city results in the CSV drawer tracking section", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            canonical_key: "US/Texas/Austin",
            city_name: "Austin",
            country_code: "US",
            display_name: "Austin, Texas, United States",
            id: "location:US/Texas/Austin",
            kind: "city",
            region_name: "Texas",
          },
        ],
      }),
    } as Response);

    renderDrawer({ initialTab: "csv" });
    fireEvent.change(screen.getByRole("combobox", { name: /location/i }), {
      target: { value: "aus" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(await screen.findByText("Cities")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Austin"));
    expect(screen.getByRole("combobox", { name: /location/i })).toHaveDisplayValue(
      "Austin, Texas, United States",
    );
  });

  it("reports created keywords when the action also returns a warning", async () => {
    const onAdded = vi.fn();
    renderDrawer({
      initialKeyword: "rank tracker",
      onAdded,
    });
    addKeywordsMatrix.mockResolvedValue({
      created: 1,
      keywords: [{ publicId: "kw_1", text: "rank tracker" }],
      warning: "Austin was not found; tracking United States instead.",
    } as never);

    fireEvent.click(screen.getByRole("button", { name: "Add & track" }));

    await waitFor(() => expect(addKeywordsMatrix).toHaveBeenCalledOnce());
    expect(onAdded).toHaveBeenCalledWith([{ publicId: "kw_1", text: "rank tracker" }], {
      locationKeys: ["US"],
    });
    expect(
      screen.getByText("Austin was not found; tracking United States instead."),
    ).toBeInTheDocument();
  });
});
