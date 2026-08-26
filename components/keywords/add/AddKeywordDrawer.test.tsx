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
  it("uses the toolbar SegmentedControl for Manual and API", () => {
    renderDrawer();
    const selected = screen.getByRole("radio", { name: "Manual" });
    expect(selected).toBeChecked();
    expect(selected.parentElement?.parentElement).toHaveClass(
      "inline-flex",
      "min-h-[34px]",
      "bg-transparent",
      "text-[12.5px]",
    );
    expect(selected.nextElementSibling).toHaveClass("bg-nav-active", "border-border-control");
    expect(screen.queryByRole("radio", { name: "CSV" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "API" }));
    expect(screen.getByRole("radio", { name: "API" })).toBeChecked();
  });

  it("keeps add disabled until at least one keyword is entered", () => {
    renderDrawer();
    const submit = screen.getByRole("button", { name: "Add keywords" });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(addKeywordsMatrix).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "   \n  " } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "rank tracker" } });
    expect(submit).toBeEnabled();
  });

  it("uses compact placeholder typography for custom keyword drawer inputs", () => {
    renderDrawer();

    expect(screen.getByLabelText("Target URL")).toHaveClass(
      "placeholder:text-[12px]",
      "placeholder:leading-4",
      "placeholder:text-fg-muted",
    );
    expect(screen.getByLabelText("Tags")).toHaveClass(
      "placeholder:text-[12px]",
      "placeholder:leading-4",
      "placeholder:text-fg-muted",
    );
  });

  it("keeps the submit tooltip wrapper on one line", () => {
    renderDrawer();

    expect(screen.getByRole("button", { name: "Add keywords" }).parentElement).toHaveClass(
      "inline-flex",
      "flex-1",
      "whitespace-nowrap",
    );
  });

  it("marks required fields instead of optional ones", () => {
    renderDrawer();

    expect(screen.getAllByText("Required")).toHaveLength(3);
    expect(screen.getByText("Keywords").nextElementSibling).toHaveTextContent("Required");
    expect(screen.getByText("Markets").nextElementSibling).toHaveTextContent("Required");
    expect(screen.getByText("Devices").nextElementSibling).toHaveTextContent("Required");
    expect(screen.queryByText("Optional")).not.toBeInTheDocument();
  });

  it("shows target-matrix math and a paused switch without a cost estimate", () => {
    renderDrawer();
    expect(
      screen.getByText("0 keywords x 1 market x 1 device = 0 checks per run for this keyword."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Pause schedule" })).toHaveAccessibleDescription(
      "Create these targets paused. You can resume them later.",
    );
  });

  it("blocks manual submission until at least one active market is selected", () => {
    renderDrawer();
    fireEvent.change(screen.getByLabelText("Keywords"), {
      target: { value: "rank tracker" },
    });
    const submit = screen.getByRole("button", { name: "Add keywords" });
    expect(submit).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "United States / English" }));

    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(addKeywordsMatrix).not.toHaveBeenCalled();
  });

  it("appends existing project tags", () => {
    renderDrawer({ tagSuggestions: ["Product", "Docs"] });

    expect(screen.getByText("In project")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Product" }));

    expect(screen.getByLabelText("Tags")).toHaveValue("Product");
  });

  it("hides project tags when the project has none", () => {
    renderDrawer();

    expect(screen.queryByText("In project")).not.toBeInTheDocument();
  });

  it("keeps a stable CTA and switches to paused copy", () => {
    renderDrawer();
    fireEvent.change(screen.getByLabelText("Keywords"), {
      target: { value: "first keyword\nsecond keyword" },
    });
    expect(screen.getByRole("button", { name: "Add keywords" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: /pause schedule/i }));
    expect(screen.getByRole("button", { name: "Add paused keywords" })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("radio", { name: "Manual" }));
    fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "rank tracker" } });
    const submit = screen.getByRole("button", { name: "Add keywords" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(addKeywordsMatrix).toHaveBeenCalledOnce());
  });

  it("keeps CSV self-contained without extra market or device controls", () => {
    renderDrawer({ initialTab: "csv" });

    expect(
      screen.getByText("keyword, target_url, tags, country, language, device"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Markets")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desktop" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mobile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /location/i })).not.toBeInTheDocument();
    expect(
      screen.queryByText("0 keywords x 1 market x 1 device = 0 checks per run for this keyword."),
    ).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Add keywords" }));

    await waitFor(() => expect(addKeywordsMatrix).toHaveBeenCalledOnce());
    expect(onAdded).toHaveBeenCalledWith([{ publicId: "kw_1", text: "rank tracker" }], {
      locationKeys: ["US"],
    });
    expect(
      screen.getByText("Austin was not found; tracking United States instead."),
    ).toBeInTheDocument();
  });
});
