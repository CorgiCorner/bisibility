import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddKeywordDrawer } from "./AddKeywordDrawer";

const { addKeywordsMatrix, createProjectMarket } = vi.hoisted(() => ({
  addKeywordsMatrix: vi.fn(async (_input: unknown) => ({ created: 1, keywords: [] })),
  createProjectMarket: vi.fn(async () => ({
    canonicalKey: "ES",
    countryCode: "ES",
    displayName: "All of Spain",
    keywordCount: 0,
    kind: "country" as const,
    languageCode: "es",
    languageLabel: "Spanish",
    publicId: "pmkt_es",
  })),
}));
vi.mock("@/lib/actions/keyword", () => ({ addKeywordsMatrix }));
vi.mock("@/lib/actions/project-market-create", () => ({ createProjectMarket }));
vi.mock("@/lib/actions/project-markets", () => ({
  addProjectMarkets: vi.fn(),
}));

const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) }));
vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  addKeywordsMatrix.mockClear();
  createProjectMarket.mockClear();
  fetchMock.mockClear();
});

const scheduleId = `sch_${"a".repeat(24)}`;
const projectId = `prj_${"b".repeat(24)}`;

const marketCreation = {
  registry: [],
  schedules: [{ frequency: "weekly", id: scheduleId, name: "Weekly Monday" }],
  sources: [],
};

async function openMarketStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "New market" }));
}

async function completeDefinition(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Country" }));
  await user.click(screen.getByRole("menuitem", { name: "Spain" }));
  await user.click(screen.getByRole("button", { name: "Language" }));
  await user.click(screen.getByRole("menuitem", { name: "Spanish" }));
  await user.click(screen.getByRole("button", { name: "Location" }));
  await user.click(screen.getByRole("menuitem", { name: "Spain (Country)" }));
  await user.type(screen.getByLabelText("Custom name (optional)"), "Spain search");
  await user.click(screen.getByRole("button", { name: "Devices" }));
  await user.click(screen.getByRole("menuitem", { name: "Desktop" }));
  await user.click(screen.getByRole("radio", { name: "Start empty" }));
}

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
  projectId,
};

function renderDrawer(props: Partial<ComponentProps<typeof AddKeywordDrawer>> = {}) {
  const addKeywordsAction = vi.fn(async () => ({ created: 1, keywords: [] }));
  const onClose = vi.fn();

  const view = render(
    <AddKeywordDrawer
      addKeywordsAction={addKeywordsAction}
      onClose={onClose}
      open
      projectId={projectId}
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
    expect(selected.nextElementSibling).toHaveClass("bg-bg-sunken", "border-border-control");
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

  it("offers manual checks before any keywords or schedules exist", () => {
    renderDrawer();
    expect(screen.getByRole("button", { name: "Schedule" })).toHaveTextContent("Manual");
    expect(screen.getByText("Checks run only when you start them.")).toBeVisible();
    expect(screen.queryByRole("switch", { name: "Pause schedule" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers no nested market step when the project sends no creation catalogue", () => {
    renderDrawer();

    expect(screen.queryByRole("button", { name: "New market" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Country" })).not.toBeInTheDocument();
  });

  it("assigns a schedule instead of a pause switch and orders the tracking controls", () => {
    renderDrawer({ projectMarkets: { ...projectMarkets, marketCreation } });

    expect(screen.queryByRole("switch", { name: "Pause schedule" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedule" })).toHaveTextContent("Manual");
    fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "rank tracker" } });

    const schedule = screen.getByRole("button", { name: "Schedule" });
    const devices = screen.getByRole("button", { name: "Mobile" });
    expect(screen.queryByText(/per scheduled run/)).not.toBeInTheDocument();
    const target = screen.getByLabelText("Target URL");
    expect(devices.compareDocumentPosition(schedule)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(schedule.compareDocumentPosition(target)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("swaps the drawer body for a nested market step and restores the selection on Back", async () => {
    const user = userEvent.setup();
    renderDrawer({ projectMarkets: { ...projectMarkets, marketCreation } });

    fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "rank tracker" } });
    await openMarketStep(user);

    expect(screen.getAllByRole("heading", { name: "New market" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Country" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Keywords" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Default devices" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Schedule" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to keywords" }));

    expect(screen.getAllByRole("heading", { name: "Add keywords" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "United States / English" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Desktop" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Keywords")).toHaveValue("rank tracker");
  });

  it("reports what the nested step still needs and creates nothing while it is incomplete", async () => {
    const user = userEvent.setup();
    renderDrawer({ projectMarkets: { ...projectMarkets, marketCreation } });
    await openMarketStep(user);

    expect(screen.getByRole("button", { name: "Devices" })).toBeVisible();
    for (const name of ["Copy from market", "Paste keywords", "Start empty"]) {
      expect(screen.getByRole("radio", { name })).not.toBeChecked();
    }
    expect(screen.getByRole("button", { name: "Create market" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Country" }));
    await user.click(screen.getByRole("menuitem", { name: "Spain" }));
    expect(screen.getByRole("button", { name: "Create market" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Language" }));
    await user.click(screen.getByRole("menuitem", { name: "Spanish" }));
    await user.click(screen.getByRole("button", { name: "Location" }));
    await user.click(screen.getByRole("menuitem", { name: "Spain (Country)" }));
    await user.type(screen.getByLabelText("Custom name (optional)"), "Spain search");

    expect(screen.getByRole("button", { name: "Create market" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Devices" }));
    await user.click(screen.getByRole("menuitem", { name: "Mobile" }));
    expect(screen.getByRole("button", { name: "Create market" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Start empty" }));
    expect(screen.getByRole("button", { name: "Create market" })).toBeEnabled();
    expect(createProjectMarket).not.toHaveBeenCalled();
  });

  it("creates the market through the project action and selects it for these keywords", async () => {
    const user = userEvent.setup();
    renderDrawer({ projectMarkets: { ...projectMarkets, marketCreation } });
    await openMarketStep(user);
    await completeDefinition(user);

    await user.click(screen.getByRole("button", { name: "Create market" }));

    await waitFor(() => expect(createProjectMarket).toHaveBeenCalledOnce());
    expect(createProjectMarket).toHaveBeenCalledWith({
      canonicalKey: "ES",
      countryCode: "ES",
      devices: ["desktop"],
      kind: "country",
      languageCode: "es",
      method: { kind: "empty" },
      name: "Spain search",
      projectId,
      schedule: null,
    });
    const chip = await screen.findByRole("button", { name: "All of Spain / Spanish" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("refuses a market name the server would reject rather than masking the failure", async () => {
    const user = userEvent.setup();
    renderDrawer({ projectMarkets: { ...projectMarkets, marketCreation } });
    await openMarketStep(user);
    await completeDefinition(user);
    fireEvent.change(screen.getByLabelText("Custom name (optional)"), {
      target: { value: "a".repeat(121) },
    });

    await user.click(screen.getByRole("button", { name: "Create market" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Market names are 120 characters or fewer.",
    );
    expect(createProjectMarket).not.toHaveBeenCalled();
  });

  it("surfaces a duplicate market without adding a chip", async () => {
    const user = userEvent.setup();
    createProjectMarket.mockRejectedValueOnce(
      new Error("This location is already tracked by the project."),
    );
    renderDrawer({ projectMarkets: { ...projectMarkets, marketCreation } });
    await openMarketStep(user);
    await completeDefinition(user);

    await user.click(screen.getByRole("button", { name: "Create market" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This location is already tracked by the project.",
    );
    expect(
      screen.queryByRole("button", { name: "All of Spain / Spanish" }),
    ).not.toBeInTheDocument();
  });

  it("counts targets without treating a project-wide unit price as the selected schedule price", async () => {
    const user = userEvent.setup();
    renderDrawer({
      costContext: { costPerCheckCents: 25 } as never,
      projectMarkets: { ...projectMarkets, marketCreation },
    });
    fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "rank tracker" } });

    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.click(screen.getByRole("menuitem", { name: "Weekly Monday" }));

    expect(screen.getByText("1 keyword · 1 check per run.")).toBeVisible();
  });

  it("states no price when the project has no cost per check", async () => {
    const user = userEvent.setup();
    renderDrawer({ projectMarkets: { ...projectMarkets, marketCreation } });
    fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "rank tracker" } });

    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.click(screen.getByRole("menuitem", { name: "Weekly Monday" }));

    expect(screen.getByText("1 keyword · 1 check per run.")).toBeVisible();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("counts one keyword on two devices as one keyword and two checks", async () => {
    const user = userEvent.setup();
    renderDrawer({
      costContext: { costPerCheckCents: 25 } as never,
      initialDevices: ["desktop", "mobile"],
      projectMarkets: { ...projectMarkets, marketCreation },
    });
    fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "rank tracker" } });

    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.click(screen.getByRole("menuitem", { name: "Weekly Monday" }));

    expect(screen.getByText("1 keyword · 2 checks per run.")).toBeVisible();
  });

  it("submits the assigned schedule with the created keyword rows", async () => {
    const user = userEvent.setup();
    renderDrawer({ projectMarkets: { ...projectMarkets, marketCreation } });
    fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "rank tracker" } });

    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.click(screen.getByRole("menuitem", { name: "Weekly Monday" }));
    await user.click(screen.getByRole("button", { name: "Add keywords" }));

    await waitFor(() => expect(addKeywordsMatrix).toHaveBeenCalledOnce());
    expect(addKeywordsMatrix).toHaveBeenCalledWith(
      expect.objectContaining({
        checkScheduleId: scheduleId,
        locations: [{ locationKey: "US" }],
      }),
    );
  });

  it("keeps the typed target URL on every market the submission creates", async () => {
    const user = userEvent.setup();
    renderDrawer({
      initialMarketKeys: ["ES"],
      projectMarkets: {
        ...projectMarkets,
        markets: [
          ...projectMarkets.markets,
          {
            canonicalKey: "ES",
            countryCode: "ES",
            displayName: "All of Spain",
            id: "pmkt_es",
            languageCode: "es",
            languageLabel: "Spanish",
            monthlyCostCents: 30,
            researchAvailable: true,
            status: "active" as const,
          },
        ],
      },
    });
    fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "rank tracker" } });
    fireEvent.change(screen.getByLabelText("Target URL"), {
      target: { value: "https://example.com/page" },
    });

    // The reader leaves the market the drawer opened on and tracks another one instead.
    await user.click(screen.getByRole("button", { name: "All of Spain / Spanish" }));
    await user.click(screen.getByRole("button", { name: "United States / English" }));
    await user.click(screen.getByRole("button", { name: "Add keywords" }));

    await waitFor(() => expect(addKeywordsMatrix).toHaveBeenCalledOnce());
    expect(addKeywordsMatrix).toHaveBeenCalledWith(
      expect.objectContaining({
        locations: [{ locationKey: "US" }],
        targetUrl: "https://example.com/page",
      }),
    );
    // A default market key the selection no longer contains makes the server drop the URL from
    // every row it creates, so the drawer must not send one.
    expect(addKeywordsMatrix).toHaveBeenCalledWith(
      expect.not.objectContaining({ defaultLocationKey: expect.anything() }),
    );
  });

  it("uses supplied initial devices for the target matrix", () => {
    renderDrawer({ initialDevices: ["mobile"] });

    expect(screen.getByRole("button", { name: "Desktop" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Mobile" })).toHaveAttribute("aria-pressed", "true");
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

  it("keeps a stable CTA and explicitly creates manual keywords", async () => {
    renderDrawer();
    fireEvent.change(screen.getByLabelText("Keywords"), {
      target: { value: "first keyword\nsecond keyword" },
    });
    expect(screen.getByRole("button", { name: "Add keywords" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add keywords" }));
    await waitFor(() => expect(addKeywordsMatrix).toHaveBeenCalledOnce());
    expect(addKeywordsMatrix.mock.calls[0]?.[0]).toMatchObject({
      schedule: { frequency: "manual" },
    });
    expect(addKeywordsMatrix.mock.calls[0]?.[0]).not.toHaveProperty("checkScheduleId");
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
      projectId,
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
      schedule: expect.objectContaining({ frequency: "manual" }),
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

it("preselects a paused market opened for preparation and saves its keywords", async () => {
  const user = userEvent.setup();
  renderDrawer({
    initialMarketKeys: ["US"],
    projectMarkets: {
      ...projectMarkets,
      markets: [{ ...projectMarkets.markets[0], status: "paused" }],
    },
  });
  expect(screen.getByRole("button", { name: "United States / English" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "They will not be checked until those markets are resumed",
  );
  fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "launch keyword" } });
  await user.click(screen.getByRole("button", { name: "Add keywords" }));
  await waitFor(() => expect(addKeywordsMatrix).toHaveBeenCalledOnce());
  expect(addKeywordsMatrix).toHaveBeenCalledWith(
    expect.objectContaining({ locations: [{ locationKey: "US" }], keywords: ["launch keyword"] }),
  );
});
it("requires creating a market before the first manual keyword can be saved", async () => {
  renderDrawer({ projectMarkets: { ...projectMarkets, marketCreation, markets: [] } });
  fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "first keyword" } });
  expect(screen.getByRole("button", { name: "Add keywords" })).toBeDisabled();
  expect(screen.getByText(/Start with a market: choose a country/)).toBeVisible();
  expect(screen.getByRole("button", { name: "New market" })).toBeEnabled();
});

it("creates the first country-wide market without requiring an optional custom name", async () => {
  const user = userEvent.setup();
  renderDrawer({ projectMarkets: { ...projectMarkets, marketCreation, markets: [] } });
  await openMarketStep(user);
  await user.click(screen.getByRole("button", { name: "Country" }));
  await user.click(screen.getByRole("menuitem", { name: "Spain" }));
  await user.click(screen.getByRole("button", { name: "Language" }));
  await user.click(screen.getByRole("menuitem", { name: "Spanish" }));
  await user.click(screen.getByRole("button", { name: "Devices" }));
  await user.click(screen.getByRole("menuitem", { name: "Desktop" }));
  await user.click(screen.getByRole("radio", { name: "Start empty" }));
  await user.click(screen.getByRole("button", { name: "Create market" }));
  await waitFor(() => expect(createProjectMarket).toHaveBeenCalledOnce());
  expect(createProjectMarket).toHaveBeenCalledWith(
    expect.objectContaining({ canonicalKey: "ES", name: "" }),
  );
  expect(await screen.findByRole("button", { name: "All of Spain / Spanish" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("keeps one drawer and all keyword and market drafts across the schedule Back path", async () => {
  const user = userEvent.setup();
  renderDrawer({ projectMarkets: { ...projectMarkets, marketCreation } });
  const drawer = screen.getByRole("dialog");
  fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "original keyword" } });
  fireEvent.change(screen.getByLabelText("Target URL"), { target: { value: "/original" } });
  fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "Launch" } });
  await openMarketStep(user);
  await completeDefinition(user);
  await user.click(screen.getByRole("radio", { name: "Paste keywords" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Paste keywords" }), {
    target: { value: "market keyword" },
  });
  await user.click(screen.getByRole("button", { name: "New schedule" }));
  expect(screen.getByRole("dialog")).toBe(drawer);
  expect(screen.getByRole("heading", { name: "New schedule" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Save schedule" })).toBeVisible();
  const back = screen.getByRole("button", { name: "Back to market" });
  expect(back.closest("header")).toContainElement(
    screen.getByRole("heading", { name: "New schedule" }),
  );
  expect(back).not.toHaveTextContent("Back to market");
  await user.click(back);
  expect(screen.getByRole("dialog")).toBe(drawer);
  expect(screen.getByRole("textbox", { name: "Paste keywords" })).toHaveValue("market keyword");
  expect(screen.getByRole("button", { name: "Devices" })).toHaveTextContent("Desktop");
  expect(screen.getByLabelText("Custom name (optional)")).toHaveValue("Spain search");
  await user.click(screen.getByRole("button", { name: "Back to keywords" }));
  expect(screen.getByRole("dialog")).toBe(drawer);
  expect(screen.getByLabelText("Keywords")).toHaveValue("original keyword");
  expect(screen.getByLabelText("Target URL")).toHaveValue("/original");
  expect(screen.getByLabelText("Tags")).toHaveValue("Launch");
  expect(createProjectMarket).not.toHaveBeenCalled();
});

it("saves a schedule inside the market creator, creates pasted keywords and selects the market", async () => {
  const user = userEvent.setup();
  const createdScheduleId = `sch_${"s".repeat(24)}`;
  renderDrawer({ projectMarkets: { ...projectMarkets, marketCreation } });
  fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: "original keyword" } });
  await openMarketStep(user);
  await completeDefinition(user);
  await user.click(screen.getByRole("radio", { name: "Paste keywords" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Paste keywords" }), {
    target: { value: "market keyword" },
  });
  await user.click(screen.getByRole("button", { name: "New schedule" }));
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: { publicId: createdScheduleId } }),
  } as never);
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  expect(await screen.findByRole("heading", { name: "New market" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Schedule" })).toHaveTextContent("Daily 06:00");
  await user.click(screen.getByRole("button", { name: "Create market" }));
  await waitFor(() => expect(createProjectMarket).toHaveBeenCalledOnce());
  expect(createProjectMarket).toHaveBeenCalledWith(
    expect.objectContaining({
      method: { kind: "paste", text: "market keyword" },
      schedule: { kind: "existing", scheduleId: createdScheduleId },
      devices: ["desktop"],
    }),
  );
  expect(screen.getByLabelText("Keywords")).toHaveValue("original keyword");
  expect(screen.getByRole("button", { name: "All of Spain / Spanish" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.click(screen.getByRole("button", { name: "Schedule" }));
  expect(screen.getByRole("menuitem", { name: "Daily 06:00" })).toBeVisible();
});

it("copies from the same market sources with an explicitly chosen schedule and devices", async () => {
  const user = userEvent.setup();
  const sourceId = `pmkt_${"m".repeat(24)}`;
  renderDrawer({
    projectMarkets: {
      ...projectMarkets,
      marketCreation: {
        ...marketCreation,
        sources: [{ id: sourceId, keywordCount: 4, name: "US core" }],
      },
    },
  });
  await openMarketStep(user);
  await completeDefinition(user);
  await user.click(screen.getByRole("button", { name: "Devices" }));
  await user.click(screen.getByRole("menuitem", { name: "Both" }));
  await user.click(screen.getByRole("radio", { name: "Copy from market" }));
  await user.click(screen.getByRole("button", { name: "Copy from" }));
  await user.click(screen.getByRole("menuitem", { name: "US core - 4 keywords (largest)" }));
  expect(screen.getByText("8 prospective keywords")).toBeVisible();
  expect(screen.getByRole("button", { name: "Schedule" })).toHaveTextContent("Manual");
  await user.click(screen.getByRole("button", { name: "Schedule" }));
  await user.click(screen.getByRole("menuitem", { name: "Weekly Monday" }));
  await user.click(screen.getByRole("button", { name: "Create market" }));
  await waitFor(() => expect(createProjectMarket).toHaveBeenCalledOnce());
  expect(createProjectMarket).toHaveBeenCalledWith(
    expect.objectContaining({
      devices: ["desktop", "mobile"],
      method: { kind: "copy", sourceMarketId: sourceId },
      schedule: { kind: "existing", scheduleId },
    }),
  );
});
