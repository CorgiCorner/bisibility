import type { LocationFieldValue } from "@/components/keywords/LocationField";
import type { NewMarketCreateInput } from "@/lib/markets/create-input";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingMarketDefinition } from "./OnboardingMarketDefinition";

const projectId = `prj_${"a".repeat(24)}`;

const unitedStates: LocationFieldValue = {
  canonicalKey: "US",
  countryCode: "US",
  displayName: "United States",
  kind: "country",
  languageCode: "en",
  languageLabel: "English",
};

function createAction() {
  return vi.fn(async (input: NewMarketCreateInput) => ({
    canonicalKey: input.canonicalKey,
    countryCode: input.countryCode,
    displayName: "Spain",
    keywordCount: 0,
    kind: input.kind,
    languageCode: input.languageCode,
    languageLabel: "Spanish",
    publicId: `pmkt_${"a".repeat(24)}`,
  }));
}

function Harness({
  createMarketAction,
  initial = [unitedStates],
  onValuesChange,
  devices = ["desktop"],
}: {
  createMarketAction?: ReturnType<typeof createAction>;
  initial?: LocationFieldValue[];
  devices?: Array<"desktop" | "mobile">;
  onValuesChange?: (values: LocationFieldValue[]) => void;
}) {
  const [values, setValues] = useState<LocationFieldValue[]>(initial);
  return (
    <OnboardingMarketDefinition
      createMarketAction={createMarketAction}
      devices={devices}
      onChange={(next) => {
        setValues(next);
        onValuesChange?.(next);
      }}
      projectId={projectId}
      values={values}
    />
  );
}

async function defineSpain(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Country" }));
  await user.type(screen.getByRole("textbox", { name: "Search countries" }), "Spain");
  await user.click(await screen.findByRole("menuitem", { name: "Spain" }));
  await user.click(screen.getByRole("button", { name: "Language" }));
  await user.click(screen.getByRole("menuitem", { name: "Spanish" }));
  await user.click(screen.getByRole("button", { name: "Location" }));
  await user.click(screen.getByRole("menuitem", { name: "Spain (Country)" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OnboardingMarketDefinition", () => {
  it("opens the shared drawer with only the market definition", async () => {
    const user = userEvent.setup();
    render(<Harness createMarketAction={createAction()} />);

    expect(screen.queryByRole("button", { name: "New market" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Country" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Another market" }));

    expect(screen.getByRole("button", { name: "Country" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /devices/i })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "New market" })).toBeVisible();
    expect(screen.queryByRole("radio", { name: "Start empty" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Paste keywords" })).not.toBeInTheDocument();
    expect(screen.queryByText(/prospective keywords/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create market" })).toBeDisabled();
  });

  it("validates the current devices after they change outside the market form", async () => {
    const user = userEvent.setup();
    const createMarketAction = createAction();
    const view = render(<Harness createMarketAction={createMarketAction} devices={[]} />);
    await user.click(screen.getByRole("button", { name: "Another market" }));
    await defineSpain(user);
    view.rerender(<Harness createMarketAction={createMarketAction} devices={["mobile"]} />);
    await user.click(screen.getByRole("button", { name: "Create market" }));
    await waitFor(() =>
      expect(createMarketAction).toHaveBeenCalledWith(
        expect.objectContaining({ devices: ["mobile"] }),
      ),
    );
  });

  it("refuses a market that is already in the list instead of creating it twice", async () => {
    const user = userEvent.setup();
    const createMarketAction = createAction();
    render(<Harness createMarketAction={createMarketAction} />);
    await user.click(screen.getByRole("button", { name: "Another market" }));

    await user.click(screen.getByRole("button", { name: "Country" }));
    await user.click(screen.getByRole("menuitem", { name: "United States" }));
    await user.click(screen.getByRole("button", { name: "Language" }));
    await user.click(screen.getByRole("menuitem", { name: "English" }));
    await user.click(screen.getByRole("button", { name: "Location" }));
    await user.click(screen.getByRole("menuitem", { name: "United States (Country)" }));

    expect(screen.getByRole("alert")).toHaveTextContent("This market is already active.");
    expect(screen.getByRole("button", { name: "Create market" })).toBeDisabled();
    expect(createMarketAction).not.toHaveBeenCalled();
  });

  it("re-adds a market removed from the draft without creating it a second time", async () => {
    const user = userEvent.setup();
    const createMarketAction = createAction();
    render(<Harness createMarketAction={createMarketAction} />);
    await user.click(screen.getByRole("button", { name: "Another market" }));
    await defineSpain(user);
    await user.click(screen.getByRole("button", { name: "Create market" }));
    const chip = await screen.findByRole("button", { name: "Remove Spain / Spanish" });
    expect(createMarketAction).toHaveBeenCalledTimes(1);

    await user.click(chip);
    expect(
      screen.queryByRole("button", { name: "Remove Spain / Spanish" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Another market" }));
    await defineSpain(user);
    await user.click(screen.getByRole("button", { name: "Create market" }));

    expect(await screen.findByRole("button", { name: "Remove Spain / Spanish" })).toBeVisible();
    expect(createMarketAction).toHaveBeenCalledTimes(1);
  });

  it("shows the server's refusal and keeps the draft when creation fails", async () => {
    const user = userEvent.setup();
    const createMarketAction = createAction();
    createMarketAction.mockRejectedValueOnce(new Error("Choose a valid market location."));
    render(<Harness createMarketAction={createMarketAction} />);
    await user.click(screen.getByRole("button", { name: "Another market" }));
    await defineSpain(user);
    await user.click(screen.getByRole("button", { name: "Create market" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a valid market location.");
    expect(
      screen.queryByRole("button", { name: "Remove Spain / Spanish" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove United States / English", hidden: true }),
    ).toBeInTheDocument();
  });

  it("rejects an overlong custom name without calling the create action", async () => {
    const user = userEvent.setup();
    const createMarketAction = createAction();
    render(<Harness createMarketAction={createMarketAction} />);
    await user.click(screen.getByRole("button", { name: "Another market" }));
    await defineSpain(user);
    fireEvent.change(screen.getByLabelText("Custom name (optional)"), {
      target: { value: "x".repeat(121) },
    });

    await user.click(screen.getByRole("button", { name: "Create market" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Market names are 120 characters or fewer.",
    );
    expect(createMarketAction).not.toHaveBeenCalled();
  });

  it("locks the definition while its create action is in flight", async () => {
    const user = userEvent.setup();
    let resolveCreate:
      | ((value: Awaited<ReturnType<ReturnType<typeof createAction>>>) => void)
      | undefined;
    const createMarketAction = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<ReturnType<typeof createAction>>>>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    render(<Harness createMarketAction={createMarketAction} />);
    await user.click(screen.getByRole("button", { name: "Another market" }));
    await defineSpain(user);
    await user.click(screen.getByRole("button", { name: "Create market" }));

    await waitFor(() => expect(createMarketAction).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Country" })).toBeDisabled();
    expect(screen.getByLabelText("Custom name (optional)")).toBeDisabled();
    if (!resolveCreate) throw new Error("Create action did not start.");
    resolveCreate({
      canonicalKey: "ES",
      countryCode: "ES",
      displayName: "Spain",
      keywordCount: 0,
      kind: "country",
      languageCode: "es",
      languageLabel: "Spanish",
      publicId: `pmkt_${"a".repeat(24)}`,
    });

    expect(await screen.findByRole("button", { name: "Remove Spain / Spanish" })).toBeVisible();
  });

  it("keeps the selected country and server-created city identity in the draft", async () => {
    const user = userEvent.setup();
    const onValuesChange = vi.fn();
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        data: [
          {
            canonical_key: "ES/Madrid",
            city_name: "Madrid",
            country_code: "ES",
            display_name: "Madrid, Community of Madrid, Spain",
            kind: "city",
            language_code: "es",
            language_label: "Spanish",
            region_name: "Community of Madrid",
          },
        ],
      }),
      ok: true,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const createMarketAction = vi.fn(async (input: NewMarketCreateInput) => ({
      canonicalKey: input.canonicalKey,
      countryCode: input.countryCode,
      displayName: "Madrid - saved by server",
      keywordCount: 0,
      kind: input.kind,
      languageCode: input.languageCode,
      languageLabel: "Spanish",
      publicId: `pmkt_${"m".repeat(24)}`,
    }));
    render(<Harness createMarketAction={createMarketAction} onValuesChange={onValuesChange} />);
    await user.click(screen.getByRole("button", { name: "Another market" }));
    await user.click(screen.getByRole("button", { name: "Country" }));
    await user.type(screen.getByRole("textbox", { name: "Search countries" }), "Spain");
    await user.click(await screen.findByRole("menuitem", { name: "Spain" }));
    await user.click(screen.getByRole("button", { name: "Language" }));
    await user.click(screen.getByRole("menuitem", { name: "Spanish" }));
    await user.click(screen.getByRole("button", { name: "Location" }));
    await user.type(screen.getByRole("textbox", { name: "Search regions and cities" }), "Madrid");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await user.click(
      await screen.findByRole("menuitem", {
        name: "Madrid, Community of Madrid, Spain (City)",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Create market" }));

    await waitFor(() =>
      expect(createMarketAction).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalKey: "ES/Madrid",
          countryCode: "ES",
          kind: "city",
        }),
      ),
    );
    expect(
      await screen.findByRole("button", { name: "Remove Madrid - saved by server / Spanish" }),
    ).toBeVisible();
    expect(onValuesChange).toHaveBeenLastCalledWith([
      unitedStates,
      expect.objectContaining({
        canonicalKey: "ES/Madrid",
        countryCode: "ES",
        displayName: "Madrid - saved by server",
        kind: "city",
      }),
    ]);
  });

  it("keeps an empty selection compact and waits for project creation", () => {
    render(<Harness initial={[]} />);

    expect(screen.queryByRole("button", { name: "Country" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add market" })).toBeDisabled();
  });

  it("creates the first market without a custom name or a separate country location choice", async () => {
    const user = userEvent.setup();
    const createMarketAction = createAction();
    render(<Harness createMarketAction={createMarketAction} initial={[]} />);
    await user.click(screen.getByRole("button", { name: "Add market" }));
    await user.click(screen.getByRole("button", { name: "Country" }));
    await user.type(screen.getByRole("textbox", { name: "Search countries" }), "Spain");
    await user.click(screen.getByRole("menuitem", { name: "Spain" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Language" }));
    await user.click(screen.getByRole("menuitem", { name: "Spanish" }));
    await user.click(screen.getByRole("button", { name: "Create market" }));
    expect(await screen.findByRole("button", { name: "Remove Spain / Spanish" })).toBeVisible();
    expect(createMarketAction).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalKey: "ES",
        name: "",
        method: { kind: "empty" },
        schedule: null,
      }),
    );
  });
});
