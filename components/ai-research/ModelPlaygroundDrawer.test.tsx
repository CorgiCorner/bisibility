import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderNative } from "./model-playground-render.test-support";

const run = () => screen.getByRole("button", { name: "Run" });
async function open(index = 0) {
  await userEvent.click(screen.getAllByRole("button", { name: /^Settings:/ })[index]);
  return within(screen.getByRole("dialog", { name: "Column settings" }));
}
async function choose(name: string, option: RegExp) {
  await userEvent.click(screen.getByRole("button", { name }));
  await userEvent.click(screen.getByRole("menuitem", { name: option }));
}
describe("staged column settings", () => {
  it("shows the human model label with its full exact id and keeps stable identity after a model change", async () => {
    const { preview, fixture, holdNextQuote } = renderNative();
    await waitFor(() => expect(run()).toBeEnabled());
    const drawer = await open();
    expect(drawer.getByRole("button", { name: "Model" })).toHaveTextContent("General Chat");
    expect(drawer.getByText("vendor/shared-model")).toBeInTheDocument();
    await choose("Model", /Reasoning Pro 2/);
    expect(drawer.getByRole("button", { name: "Model" })).toHaveTextContent("Reasoning Pro 2");
    expect(
      drawer.getByText("vendor/long-model-v2.0:extended-release-with-readable-identifier"),
    ).toBeInTheDocument();
    const release = holdNextQuote();
    await userEvent.click(drawer.getByRole("button", { name: "Save changes" }));
    expect(run()).toBeDisabled();
    release();
    await waitFor(() => expect(run()).toBeEnabled());
    expect(preview.mock.lastCall?.[0].input.columns[0]).toMatchObject({
      columnId: fixture.input.columns[0].columnId,
      modelId: fixture.catalogs[0].models[1].modelId,
    });
  });
  it("saves a provider change from its own snapshot and preserves column order", async () => {
    const { preview, fixture, holdNextQuote } = renderNative();
    await waitFor(() => expect(run()).toBeEnabled());
    const drawer = await open();
    await choose("Provider", /^OpenRouter$/);
    expect(drawer.getByLabelText("Temperature")).toBeInTheDocument();
    await userEvent.type(drawer.getByLabelText("Temperature"), "0.4");
    const release = holdNextQuote();
    await userEvent.click(drawer.getByRole("button", { name: "Save changes" }));
    expect(run()).toBeDisabled();
    release();
    await waitFor(() => expect(run()).toBeEnabled());
    expect(preview.mock.lastCall?.[0].input.columns.map((c) => c.columnId)).toEqual(
      fixture.input.columns.map((c) => c.columnId),
    );
    expect(preview.mock.lastCall?.[0].input.columns[0]).toMatchObject({
      providerId: "openrouter",
      connectionId: fixture.connections[2].connectionId,
      settings: { temperature: 0.4 },
    });
  });
  it.each(["-1", "2.1"])("rejects out of range temperature %s", async (value) => {
    renderNative();
    const drawer = await open(1);
    await userEvent.type(drawer.getByLabelText("Temperature"), value);
    expect(drawer.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
  it("invalidates on a saved search setting and preserves explicit Off when adding", async () => {
    const { preview, holdNextQuote } = renderNative();
    await userEvent.click(screen.getByRole("switch", { name: "Web search" }));
    await waitFor(() => expect(run()).toBeEnabled());
    const drawer = await open();
    const input = drawer.getByLabelText("Maximum search calls");
    await userEvent.clear(input);
    await userEvent.type(input, "2");
    const release = holdNextQuote();
    await userEvent.click(drawer.getByRole("button", { name: "Save changes" }));
    expect(run()).toBeDisabled();
    release();
    await waitFor(() => expect(run()).toBeEnabled());
    expect(preview.mock.lastCall?.[0].input.columns[0].settings.search.maxCalls).toBe(2);
    await userEvent.click(screen.getByRole("button", { name: "Add model" }));
    await choose("Search mode", /^Off$/);
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Add model" }),
    );
    await waitFor(() => expect(run()).toBeEnabled());
    expect(preview.mock.lastCall?.[0].input.columns.at(-1)?.settings.search).toEqual({
      mode: "off",
    });
  });
  it.each(["0", "4"])("rejects search call limit %s", async (value) => {
    renderNative();
    await userEvent.click(screen.getByRole("switch", { name: "Web search" }));
    const drawer = await open();
    await userEvent.clear(drawer.getByLabelText("Maximum search calls"));
    await userEvent.type(drawer.getByLabelText("Maximum search calls"), value);
    expect(drawer.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
  it("blocks an expired or removed model with a card notice and refuses saving it", async () => {
    renderNative(true, (f) => {
      f.catalogs[0].models = [];
    });
    expect(run()).toBeDisabled();
    const card = document.querySelector("[data-column-id]") as HTMLElement;
    expect(within(card).getByRole("alert")).toHaveTextContent(
      "vendor/shared-model is no longer in the OpenAI catalog",
    );
    const drawer = await open();
    expect(drawer.getByRole("button", { name: "Model" })).toBeDisabled();
    expect(drawer.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
  it("preserves the selected model label when that model disappears while alternatives remain", async () => {
    renderNative(true, (f) => {
      f.catalogs[0].models = f.catalogs[0].models.slice(1);
    });
    const drawer = await open();
    expect(drawer.getByRole("button", { name: "Model" })).toHaveTextContent("General Chat");
    expect(drawer.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await choose("Model", /Reasoning Pro 2/);
    expect(drawer.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });
  it("closes via the header without applying draft changes and restores the trigger", async () => {
    const { preview } = renderNative();
    await waitFor(() => expect(run()).toBeEnabled());
    const initial = preview.mock.lastCall?.[0];
    const trigger = screen.getAllByRole("button", { name: /^Settings:/ })[0];
    const drawer = await open();
    await userEvent.clear(drawer.getByLabelText("Output token limit"));
    await userEvent.click(drawer.getByRole("button", { name: "Close drawer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
    expect(preview.mock.lastCall?.[0]).toBe(initial);
  });
});
