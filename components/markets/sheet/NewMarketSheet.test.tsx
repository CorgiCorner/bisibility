import type { MarketDefinitionProps } from "@/components/markets/blocks/MarketDefinition";
import { DrawerBackButton } from "@/components/ui/DrawerBackButton";
import type { SheetProps } from "@/components/ui/Sheet";
import type { NewMarketCreateInput } from "@/lib/markets/create-input";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewMarketSheet } from "./NewMarketSheet";

vi.mock("@/components/ui/Sheet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/Sheet")>()),
  Sheet: ({
    backAction,
    children,
    footer,
    heightVariant,
    open,
    title,
    widthVariant,
  }: SheetProps) =>
    open ? (
      <section
        data-new-market-sheet=""
        data-height-variant={heightVariant}
        data-width-variant={widthVariant}
        role="dialog"
      >
        <header>
          {backAction ? <DrawerBackButton {...backAction} /> : null}
          <h2>{title}</h2>
        </header>
        {children}
        {footer}
      </section>
    ) : null,
}));
// The real block renders, so anything it grows - a device control above all - is counted by the
// assertions below. The extra button is only a shortcut past its four pickers.
vi.mock("@/components/markets/blocks/MarketDefinition", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/markets/blocks/MarketDefinition")>();
  return {
    ...actual,
    MarketDefinition: (props: MarketDefinitionProps) => (
      <>
        <actual.MarketDefinition {...props} />
        <button
          onClick={() =>
            props.onChange({
              countryCode: "ES",
              customName: "Spain search",
              languageCode: "es",
              location: {
                canonicalKey: "ES",
                countryCode: "ES",
                displayName: "Spain",
                kind: "country",
              },
            })
          }
          type="button"
        >
          Complete definition
        </button>
      </>
    ),
  };
});

afterEach(() => vi.unstubAllGlobals());

const projectId = `prj_${"a".repeat(24)}`;
const scheduleId = `sch_${"b".repeat(24)}`;

const createResult = {
  canonicalKey: "ES",
  countryCode: "ES",
  displayName: "Spain",
  keywordCount: 0,
  kind: "country" as const,
  languageCode: "es",
  languageLabel: "Spanish",
  publicId: `pmkt_${"c".repeat(24)}`,
};

function renderSheet({
  notifyCreated = true,
  schedules = [{ id: scheduleId, name: "Weekly Monday", frequency: "weekly" }],
} = {}) {
  const onClose = vi.fn();
  const onCreate = vi.fn(async (_input: NewMarketCreateInput) => createResult);
  const onCreated = vi.fn();
  render(
    <NewMarketSheet
      onCreated={notifyCreated ? onCreated : undefined}
      onClose={onClose}
      onCreate={onCreate}
      open
      projectId={projectId}
      scheduleContext={{
        connectedProviders: [],
        defaultScheduleName: "Weekly Monday",
        projectDefaults: { provider: null, serpDepth: 100 },
        projectTimezone: "Europe/Warsaw",
      }}
      schedules={schedules}
      sources={[{ id: `pmkt_${"d".repeat(24)}`, keywordCount: 3, name: "Madrid core" }]}
    />,
  );
  return { onClose, onCreate, onCreated };
}

async function pickDevice(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("button", { name: "Devices" }));
  await user.click(screen.getByRole("menuitem", { name: label }));
}

describe("NewMarketSheet", () => {
  it("creates a whole-country market without separately choosing a location", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderSheet();
    await user.click(screen.getByRole("button", { name: "Country" }));
    await user.type(screen.getByRole("textbox", { name: "Search countries" }), "Spain");
    await user.click(screen.getByRole("menuitem", { name: "Spain" }));
    await user.click(screen.getByRole("button", { name: "Language" }));
    await user.click(screen.getByRole("menuitem", { name: "Spanish" }));
    expect(screen.getByRole("button", { name: "Location" })).toHaveTextContent("Spain");
    await user.click(screen.getByRole("radio", { name: "Start empty" }));
    await pickDevice(user, "Desktop");
    await user.click(screen.getByRole("button", { name: "Create market" }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalKey: "ES", kind: "country", method: { kind: "empty" } }),
    );
  });

  it.each(["copy", "paste"] as const)(
    "defaults %s to Manual without any saved schedules",
    async (method) => {
      const user = userEvent.setup();
      const { onCreate } = renderSheet({ schedules: [] });
      await user.click(screen.getByRole("button", { name: "Complete definition" }));
      await pickDevice(user, "Desktop");
      if (method === "copy") {
        await user.click(screen.getByRole("radio", { name: "Copy from market" }));
        await user.click(screen.getByRole("button", { name: "Copy from" }));
        await user.click(screen.getByRole("menuitem", { name: /Madrid core/ }));
      } else {
        await user.click(screen.getByRole("radio", { name: "Paste keywords" }));
        await user.type(screen.getByRole("textbox", { name: "Paste keywords" }), "rank tracker");
      }
      expect(screen.getByRole("button", { name: "Schedule" })).toHaveTextContent("Manual");
      await user.click(screen.getByRole("button", { name: "Schedule" }));
      await user.click(screen.getByRole("menuitem", { name: "Manual" }));
      expect(screen.queryByText("No results")).toBeNull();
      expect(screen.getByRole("button", { name: "Create market" })).toBeEnabled();
      await user.click(screen.getByRole("button", { name: "Create market" }));
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          method: expect.objectContaining({ kind: method }),
          schedule: { kind: "manual" },
        }),
      );
    },
  );

  it("preserves a chosen schedule while editing keywords and can switch back to Manual", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderSheet();
    await user.click(screen.getByRole("button", { name: "Complete definition" }));
    await pickDevice(user, "Desktop");
    await user.click(screen.getByRole("radio", { name: "Paste keywords" }));
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.click(screen.getByRole("menuitem", { name: "Weekly Monday" }));
    await user.type(screen.getByRole("textbox", { name: "Paste keywords" }), "rank tracker");
    expect(screen.getByRole("button", { name: "Schedule" })).toHaveTextContent("Weekly Monday");
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.click(screen.getByRole("menuitem", { name: "Manual" }));
    await user.click(screen.getByRole("button", { name: "Create market" }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ schedule: { kind: "manual" } }),
    );
  });

  it("saves a standard schedule and selects it on returning to the same market drawer", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderSheet();
    const createdScheduleId = `sch_${"e".repeat(24)}`;
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ data: { publicId: createdScheduleId } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await user.click(screen.getByRole("button", { name: "Complete definition" }));
    await pickDevice(user, "Mobile");
    await user.click(screen.getByRole("radio", { name: "Paste keywords" }));
    await user.type(screen.getByRole("textbox", { name: "Paste keywords" }), "rank tracker");
    await user.click(screen.getByRole("button", { name: "New schedule" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Time zone" })).toHaveTextContent("Europe/Warsaw");
    await user.click(screen.getByRole("radio", { name: "Weekly" }));
    await user.click(screen.getByRole("button", { name: "Day of week" }));
    await user.click(screen.getByRole("menuitem", { name: "Friday" }));
    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      frequency: "weekly",
      cronExpression: "0 6 * * 5",
      projectId,
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "New market" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Paste keywords" })).toHaveValue("rank tracker");
    expect(screen.getByRole("button", { name: "Schedule" })).toHaveTextContent(
      "Weekly · Fri 06:00",
    );
    await user.click(screen.getByRole("button", { name: "Create market" }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        devices: ["mobile"],
        method: { kind: "paste", text: "rank tracker" },
        schedule: { kind: "existing", scheduleId: createdScheduleId },
      }),
    );
  });

  it("starts as one 560 px sheet with no method or derived selection", () => {
    renderSheet();

    expect(document.querySelectorAll("[data-new-market-sheet]")).toHaveLength(1);
    expect(document.querySelector("[data-new-market-sheet]")).toHaveAttribute(
      "data-width-variant",
      "form",
    );
    expect(document.querySelector("[data-new-market-sheet]")).toHaveAttribute(
      "data-height-variant",
      "form",
    );
    expect(screen.getByRole("button", { name: "Create market" })).toBeDisabled();
    expect(
      screen.getByText("Creating the market spends nothing. Pick how it gets its keywords."),
    ).toBeVisible();
    expect(screen.queryByText("Run checks")).not.toBeInTheDocument();
  });

  it("keeps Copy disabled until the reader explicitly picks a source", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole("button", { name: "Complete definition" }));
    await user.click(screen.getByRole("radio", { name: "Copy from market" }));
    expect(screen.getByRole("radio", { name: "Copy from market" })).toBeChecked();

    expect(screen.getByText("Pick the market to copy from.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create market" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy from" })).toHaveTextContent("Copy from");
  });

  it("returns from the standard schedule editor without losing the market draft or saving an abandoned schedule", async () => {
    const user = userEvent.setup();
    const { onClose, onCreate } = renderSheet();

    await user.click(screen.getByRole("button", { name: "Complete definition" }));
    await user.click(screen.getByRole("radio", { name: "Paste keywords" }));
    expect(screen.getByRole("radio", { name: "Paste keywords" })).toBeChecked();
    await user.type(screen.getByRole("textbox", { name: "Paste keywords" }), "SEO\n seo ");

    expect(screen.getByText(/duplicate keyword after normalization/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Create market" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "New schedule" }));
    expect(screen.getByRole("textbox", { name: "Name" })).toBeVisible();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Create market" })).not.toBeInTheDocument();
    const back = screen.getByRole("button", { name: "Back to market" });
    expect(back.closest("header")).toContainElement(
      screen.getByRole("heading", { name: "New schedule" }),
    );
    expect(back).not.toHaveTextContent("Back to market");
    await user.click(back);
    expect(screen.getByRole("textbox", { name: "Paste keywords" })).toHaveValue("SEO\n seo ");
    expect(screen.getByRole("textbox", { name: /Custom name/ })).toHaveValue("Spain search");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("creates Empty with no schedule and preserves the neutral cost copy", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderSheet();

    await user.click(screen.getByRole("button", { name: "Complete definition" }));
    await user.click(screen.getByRole("radio", { name: "Start empty" }));
    expect(screen.getByRole("radio", { name: "Start empty" })).toBeChecked();
    expect(
      screen.getByText("Creating the market spends nothing. Pick how it gets its keywords."),
    ).toBeVisible();
    await pickDevice(user, "Desktop");
    await user.click(screen.getByRole("button", { name: "Create market" }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalKey: "ES",
        countryCode: "ES",
        devices: ["desktop"],
        kind: "country",
        languageCode: "es",
        method: { kind: "empty" },
        schedule: null,
      }),
    );
    expect(onCreate.mock.calls[0]?.[0]).not.toHaveProperty("locationId");
  });

  it("creates a market with the custom name left blank", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderSheet();

    await user.click(screen.getByRole("button", { name: "Complete definition" }));
    const customName = screen.getByRole("textbox", { name: /Custom name/ });
    await user.clear(customName);
    await user.click(screen.getByRole("radio", { name: "Start empty" }));
    await pickDevice(user, "Desktop");

    expect(screen.getByRole("button", { name: "Create market" })).toBeEnabled();
    expect(customName).not.toBeRequired();
    expect(customName).toHaveAttribute("placeholder", "Spain");
    await user.click(screen.getByRole("button", { name: "Create market" }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "" }));
  });

  it("saves an empty mobile market when the host omits the optional created callback", async () => {
    const user = userEvent.setup();
    const { onClose, onCreate, onCreated } = renderSheet({ notifyCreated: false });

    await user.click(screen.getByRole("button", { name: "Complete definition" }));
    await user.click(screen.getByRole("radio", { name: "Start empty" }));
    await pickDevice(user, "Mobile");
    await user.click(screen.getByRole("button", { name: "Create market" }));

    expect(onCreate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ devices: ["mobile"], method: { kind: "empty" } }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("keeps the sheet open and shows a failed save without a created callback", async () => {
    const user = userEvent.setup();
    const { onClose, onCreate } = renderSheet({ notifyCreated: false });
    onCreate.mockRejectedValueOnce(new Error("Market could not be created."));

    await user.click(screen.getByRole("button", { name: "Complete definition" }));
    await user.click(screen.getByRole("radio", { name: "Start empty" }));
    await pickDevice(user, "Mobile");
    await user.click(screen.getByRole("button", { name: "Create market" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Market could not be created.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("owns the only device control in the sheet and gates Create on it", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole("button", { name: "Complete definition" }));
    await user.click(screen.getByRole("radio", { name: "Start empty" }));
    expect(screen.getAllByRole("button", { name: /devices/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Country" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Create market" })).toBeDisabled();

    await pickDevice(user, "Both");

    expect(screen.getByRole("button", { name: "Create market" })).toBeEnabled();
    expect(
      screen.getByText("Each keyword is checked on both, so it bills two checks a run."),
    ).toBeVisible();
  });

  it("hands the created market's location identity to its host instead of dropping it", async () => {
    const user = userEvent.setup();
    const { onCreated } = renderSheet();

    await user.click(screen.getByRole("button", { name: "Complete definition" }));
    await user.click(screen.getByRole("radio", { name: "Start empty" }));
    await pickDevice(user, "Desktop");
    await user.click(screen.getByRole("button", { name: "Create market" }));

    expect(onCreated).toHaveBeenCalledWith(createResult);
  });
});
