import { newColumn } from "@/lib/model-playground/composer-state";
import { columnResult } from "@/lib/model-playground/result-fixtures.test-support";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { composerCopy } from "./model-playground-composer-copy.test-support";
import { renderNative } from "./model-playground-render.test-support";

const cards = () => Array.from(document.querySelectorAll<HTMLElement>("[data-column-id]"));
const run = () => screen.getByRole("button", { name: "Run" });
const findEstimate = () => screen.findByRole("status", { name: composerCopy.estimate });
async function edit(index = 0) {
  const trigger = within(cards()[index]).getByRole("button", { name: /^Settings:/ });
  await userEvent.click(trigger);
  return { trigger, drawer: within(screen.getByRole("dialog", { name: "Column settings" })) };
}
async function close() {
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}
describe("one column surface", () => {
  it("keeps only global controls in the composer and shows honest idle cards before Run", () => {
    renderNative();
    const composer = within(
      document.querySelector('[data-model-playground-block="composer"]') as HTMLElement,
    );
    expect(
      composer.queryByRole("button", { name: /Provider|Model|Column settings|Remove|Move|Add/ }),
    ).toBeNull();
    expect(cards()).toHaveLength(2);
    for (const card of cards()) {
      expect(within(card).getByText("Ready to run")).toBeInTheDocument();
      expect(
        within(card).getByText(/Run will send the question above in English/),
      ).toBeInTheDocument();
      expect(within(card).queryByText(/Brands|Sources|not named|Unknown/)).toBeNull();
    }
    expect(document.querySelector(".model-playground-track")?.lastElementChild).toHaveAttribute(
      "data-add-column",
    );
    expect(screen.getByRole("switch", { name: "Web search" })).not.toBeChecked();
  });
  it("keeps columns without results in their idle state after a partial run response", async () => {
    const { launch, fixture } = renderNative();
    launch.mockResolvedValue({
      runId: "partial",
      columns: [{ ...columnResult(), column: fixture.input.columns[0] }],
    });
    await waitFor(() => expect(run()).toBeEnabled());
    await userEvent.click(run());
    await waitFor(() => expect(cards()[0].querySelector("[data-column-verdict]")).not.toBeNull());
    expect(within(cards()[1]).getByText("Ready to run")).toBeInTheDocument();
    expect(within(cards()[1]).queryByText("Brands")).toBeNull();
    expect(screen.getByRole("button", { name: "Add model" })).toBeInTheDocument();
  });
  it("invalidates a quote on every explicit Save, including unchanged values", async () => {
    const { holdNextQuote } = renderNative();
    await waitFor(() => expect(run()).toBeEnabled());
    const { drawer } = await edit();
    const release = holdNextQuote();
    await userEvent.click(drawer.getByRole("button", { name: "Save changes" }));
    expect(run()).toBeDisabled();
    release();
    await waitFor(() => expect(run()).toBeEnabled());
  });
  it("stages add, Cancel and Escape without changing columns or the quote", async () => {
    const { preview } = renderNative();
    await waitFor(() => expect(run()).toBeEnabled());
    const before = preview.mock.calls.length;
    const add = screen.getByRole("button", { name: "Add model" });
    await userEvent.click(add);
    const drawer = within(screen.getByRole("dialog", { name: "Add model" }));
    expect(drawer.getAllByRole("button", { name: "Close drawer" })).toHaveLength(1);
    await userEvent.clear(drawer.getByLabelText("Output token limit"));
    await userEvent.type(drawer.getByLabelText("Output token limit"), "512");
    await userEvent.click(drawer.getByRole("button", { name: "Cancel" }));
    await close();
    expect(cards()).toHaveLength(2);
    expect(add).toHaveFocus();
    expect(preview.mock.calls).toHaveLength(before);
    await userEvent.click(add);
    await userEvent.keyboard("{Escape}");
    await close();
    expect(add).toHaveFocus();
    expect(cards()).toHaveLength(2);
  });
  it("invalidates the quote only when valid drawer changes are saved", async () => {
    const { preview, holdNextQuote } = renderNative();
    await waitFor(() => expect(run()).toBeEnabled());
    const before = preview.mock.calls.length;
    const { drawer, trigger } = await edit();
    await userEvent.clear(drawer.getByLabelText("Output token limit"));
    await userEvent.type(drawer.getByLabelText("Output token limit"), "512");
    expect(preview.mock.calls).toHaveLength(before);
    const release = holdNextQuote();
    await userEvent.click(drawer.getByRole("button", { name: "Save changes" }));
    expect(run()).toBeDisabled();
    release();
    await close();
    expect(trigger).toHaveFocus();
    await waitFor(() => expect(preview.mock.calls.length).toBeGreaterThan(before));
    expect(preview.mock.lastCall?.[0].input.columns[0].settings.maxOutputTokens).toBe(512);
  });
  it("cancels edited identity and settings without changing a saved column", async () => {
    const { preview } = renderNative();
    await waitFor(() => expect(run()).toBeEnabled());
    const initial = preview.mock.lastCall?.[0];
    const { drawer } = await edit();
    await userEvent.click(drawer.getByRole("button", { name: "Provider" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Anthropic" }));
    expect(drawer.getByLabelText("Temperature")).toBeInTheDocument();
    await userEvent.click(drawer.getByRole("button", { name: "Cancel" }));
    await close();
    expect(preview.mock.lastCall?.[0]).toBe(initial);
    expect(cards()[0]).toHaveTextContent("OpenAI");
  });
  it.each(["0", "2049", "17.5", ""])(
    'refuses invalid output tokens "%s" without applying',
    async (value) => {
      renderNative();
      const { drawer } = await edit();
      await userEvent.clear(drawer.getByLabelText("Output token limit"));
      if (value) await userEvent.type(drawer.getByLabelText("Output token limit"), value);
      expect(drawer.getByRole("button", { name: "Save changes" })).toBeDisabled();
      expect(drawer.getByRole("alert")).toBeInTheDocument();
      expect(cards()).toHaveLength(2);
    },
  );
  it("lists unavailable providers with reasons and disables adding when none are ready", async () => {
    renderNative(true, (f) => {
      f.connections = f.connections.map((c) => ({ ...c, enabled: false }));
    });
    expect(run()).toBeDisabled();
    const add = screen.getByRole("button", { name: "Add model" });
    expect(add).toBeDisabled();
    expect(add.parentElement).toHaveTextContent(composerCopy.noModels);
    const { drawer } = await edit();
    await userEvent.click(drawer.getByRole("button", { name: "Provider" }));
    const options = screen.getAllByRole("menuitem");
    expect(options).toHaveLength(4);
    for (const option of options) expect(option).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByText("Disabled").length).toBeGreaterThanOrEqual(4);
  });
  it("keeps six cards and a disabled final Add tile with the limit reason", () => {
    renderNative(true, (f) => {
      f.input.columns = Array.from({ length: 6 }, () =>
        newColumn(f.catalogs[0].models[0], f.connections[0]),
      );
    });
    expect(cards()).toHaveLength(6);
    const add = screen.getByRole("button", { name: "Add model" });
    expect(add).toBeDisabled();
    expect(add.parentElement).toHaveTextContent("Maximum 6 columns");
  });
  it("puts unsupported web search on its card and shows the switch state", async () => {
    renderNative();
    await userEvent.click(screen.getByRole("switch", { name: "Web search" }));
    expect(screen.getByRole("switch", { name: "Web search" })).toBeChecked();
    expect(cards()[0]).not.toHaveTextContent(composerCopy.searchUnavailable);
    expect(cards()[1]).toHaveTextContent(composerCopy.searchUnavailable);
  });
  it("keeps provider key management off the playground page", () => {
    renderNative(true, (f) => {
      f.connections[1].status = "needs_reauth";
      f.connections[2] = { ...f.connections[2], hasStoredCredentials: false };
      f.connections[3].status = "planned";
    });
    expect(screen.queryByRole("link", { name: "Manage OpenAI" })).toBeNull();
    expect(screen.queryByText(composerCopy.keys)).toBeNull();
    expect(screen.queryByRole("link", { name: /Vercel/ })).toBeNull();
  });
  it("names Credits and own-key funding in the estimate without a funding control", async () => {
    renderNative(true, (f) => {
      f.connections[0] = {
        ...f.connections[0],
        connectionId: "platform:openai",
        credentialSource: "hosted",
      };
      f.input.columns[0] = newColumn(f.catalogs[0].models[0], f.connections[0]);
    });
    const estimate = await findEstimate();
    expect(estimate).toHaveTextContent("OpenAI · Credits");
    expect(estimate).toHaveTextContent("Anthropic · Your key");
    expect(cards()[0]).toHaveTextContent("OpenAI · Credits");
    expect(cards()[0]).not.toHaveTextContent("OpenAI · Your key");
    expect(cards()[1]).toHaveTextContent("Anthropic · Your key");
    expect(screen.queryByRole("combobox", { name: "Funding source" })).toBeNull();
  });
  it("keeps separate estimates for two columns using the same provider", async () => {
    const { fixture } = renderNative(true, (f) => {
      f.input.columns = [
        newColumn(f.catalogs[0].models[0], f.connections[0]),
        newColumn(f.catalogs[0].models[0], f.connections[0]),
      ];
    });
    const estimate = await findEstimate();
    const rows = Array.from(estimate.querySelectorAll("[data-estimate-column]"));
    expect(rows.map((row) => row.getAttribute("data-estimate-column"))).toEqual(
      fixture.input.columns.map(({ columnId }) => columnId),
    );
    for (const row of rows) expect(row).toHaveTextContent("OpenAI · Your key:");
  });
  it("shows exact money with one basis and no raw rate version in the estimate", async () => {
    renderNative();
    const estimate = await findEstimate();
    expect(estimate).toHaveTextContent("~$0.0024");
    expect(estimate).not.toHaveTextContent("story-fixture-v1");
    expect(
      within(estimate).getByRole("button", {
        name: `${composerCopy.spendNotice} ${composerCopy.rateBasis}`,
      }),
    ).toBeVisible();
  });
});
