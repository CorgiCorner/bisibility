import { columnResult } from "@/lib/model-playground/result-fixtures.test-support";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { composerCopy } from "./model-playground-composer-copy.test-support";
import { renderNative } from "./model-playground-render.test-support";

const run = () => screen.getByRole("button", { name: "Run" });
const cards = () => Array.from(document.querySelectorAll<HTMLElement>("[data-column-id]"));
it("allows runs for members without showing connection management", async () => {
  renderNative(true, undefined, false);
  await waitFor(() => expect(run()).toBeEnabled());
  expect(screen.queryByText(/Run and Connect are disabled/)).toBeNull();
  expect(screen.getByRole("button", { name: "Add model" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Manage OpenAI" })).toBeNull();
});
async function open(index = 0) {
  await userEvent.click(screen.getAllByRole("button", { name: /^Settings:/ })[index]);
  return within(screen.getByRole("dialog", { name: "Column settings" }));
}
it("counts a valid 500-character prompt with a trailing newline as 500/500", async () => {
  const { preview } = renderNative(true, (f) => {
    f.input.prompt = `${"x".repeat(500)}\n`;
  });
  expect(screen.getByText(/500\/500/)).toBeInTheDocument();
  await waitFor(() => expect(run()).toBeEnabled());
  expect(preview.mock.lastCall?.[0].input.prompt).toHaveLength(500);
});
it("associates the prompt error with its invalid field and clears it after correction", async () => {
  renderNative();
  const input = screen.getByLabelText("Your prompt");
  fireEvent.change(input, { target: { value: "x".repeat(501) } });
  await waitFor(() => expect(input).toHaveAccessibleDescription("Prompt exceeds 500 characters."));
  expect(input).toHaveAttribute("aria-invalid", "true");
  fireEvent.change(input, { target: { value: "Valid question" } });
  await waitFor(() => expect(input).not.toHaveAttribute("aria-invalid", "true"));
  expect(input).not.toHaveAccessibleDescription("Prompt exceeds 500 characters.");
});
it.each([
  ["Output token limit", "2049", 0],
  ["Temperature", "3", 1],
  ["Maximum search calls", "4", 0],
] as const)("associates %s errors with the field and clears them", async (label, value, index) => {
  renderNative();
  await userEvent.click(screen.getByRole("switch", { name: "Web search" }));
  const drawer = await open(index);
  const input = drawer.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
  expect(input).toHaveAccessibleDescription(/.+/);
  expect(drawer.getByRole("button", { name: "Save changes" })).toBeDisabled();
  fireEvent.change(input, { target: { value: label === "Output token limit" ? "512" : "1" } });
  await waitFor(() => expect(input).not.toHaveAttribute("aria-invalid", "true"));
  expect(input).not.toHaveAccessibleDescription(/.+/);
  expect(drawer.getByRole("button", { name: "Save changes" })).toBeEnabled();
});
it("discards edits when the same column reopens before the exit finishes", async () => {
  const { preview, fixture } = renderNative();
  await waitFor(() => expect(run()).toBeEnabled());
  const trigger = screen.getAllByRole("button", { name: /^Settings:/ })[0];
  const drawer = await open();
  fireEvent.change(drawer.getByLabelText("Output token limit"), { target: { value: "512" } });
  fireEvent.click(drawer.getByRole("button", { name: "Cancel" }));
  fireEvent.click(trigger);
  expect(screen.getByLabelText("Output token limit")).toHaveValue(1024);
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(run()).toBeEnabled());
  expect(preview.mock.lastCall?.[0].input.columns).toEqual(fixture.input.columns);
});
it("treats a malformed connected id as not ready without crashing render", () => {
  const { launch, preview } = renderNative(true, (f) => {
    f.connections[0] = { ...f.connections[0], connectionId: "bad" };
  });
  expect(run()).toBeDisabled();
  expect(screen.getAllByText(/OpenAI is disconnected/)).toHaveLength(2);
  expect(preview).not.toHaveBeenCalled();
  expect(launch).not.toHaveBeenCalled();
});
it.each(["prompt", "language", "market", "search", "settings", "model"])(
  "marks retained answers and their matrix as previous after a %s edit",
  async (kind) => {
    const { launch, fixture } = renderNative();
    launch.mockResolvedValue({
      runId: "run",
      columns: fixture.input.columns.map((column, i) => ({ ...columnResult(i), column })),
    });
    await waitFor(() => expect(run()).toBeEnabled());
    await userEvent.click(run());
    await waitFor(() => expect(document.querySelectorAll("[data-column-verdict]")).toHaveLength(2));
    expect(screen.queryByText(/Previous run/)).toBeNull();
    const table = screen.getByRole("table").outerHTML;
    if (kind === "prompt")
      fireEvent.change(screen.getByLabelText("Your prompt"), {
        target: { value: "Changed question" },
      });
    if (kind === "search")
      await userEvent.click(screen.getByRole("switch", { name: "Web search" }));
    if (kind === "language" || kind === "market") {
      await userEvent.click(
        screen.getByRole("button", { name: kind === "language" ? "Answer language" : "Market" }),
      );
      await userEvent.click(
        screen.getByRole("menuitem", { name: kind === "language" ? "Polish" : "Poland" }),
      );
    }
    if (kind === "settings" || kind === "model") {
      const drawer = await open();
      if (kind === "settings")
        fireEvent.change(drawer.getByLabelText("Output token limit"), { target: { value: "512" } });
      else {
        await userEvent.click(drawer.getByRole("button", { name: "Model" }));
        await userEvent.click(screen.getByRole("menuitem", { name: /Reasoning Pro 2/ }));
      }
      await userEvent.click(drawer.getByRole("button", { name: "Save changes" }));
    }
    for (const card of cards())
      expect(within(card).getByText(/Previous run/).textContent).toMatch(/changed|saved/);
    expect(screen.getByText(/Matrix and CSV.*previous run/)).toBeInTheDocument();
    expect(screen.getByRole("table").outerHTML).toBe(table);
    await waitFor(() => expect(run()).toBeEnabled());
    await userEvent.click(run());
    await waitFor(() => expect(screen.queryByText(/Previous run/)).toBeNull());
  },
);
it("announces the estimate and displays an uncertain launch failure without retrying", async () => {
  const { launch, showToast } = renderNative();
  launch.mockRejectedValue(new Error("lost response"));
  await waitFor(() => expect(run()).toBeEnabled());
  expect(screen.getByRole("status", { name: "Estimated cost" })).toBeInTheDocument();
  await userEvent.click(run());
  await waitFor(() =>
    expect(showToast).toHaveBeenCalledWith(composerCopy.runFailed, { severity: "error" }),
  );
  await waitFor(() => expect(run()).toBeEnabled());
  await userEvent.click(run());
  expect(screen.getByRole("dialog", { name: composerCopy.retryTitle })).toBeInTheDocument();
  expect(screen.getByText(composerCopy.retryNotice)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await act(async () => {
    await Promise.resolve();
  });
  expect(launch).toHaveBeenCalledOnce();
  await userEvent.click(run());
  await userEvent.click(screen.getByRole("button", { name: composerCopy.retryRun }));
  expect(launch).toHaveBeenCalledTimes(2);
});

it("shows a definite rejection without uncertain-charge copy or a retry dialog", async () => {
  const { launch, showToast } = renderNative();
  launch.mockRejectedValueOnce({ kind: "not_dispatched", message: "Expired quote" });
  await waitFor(() => expect(run()).toBeEnabled());
  await userEvent.click(run());
  await waitFor(() =>
    expect(showToast).toHaveBeenCalledExactlyOnceWith(composerCopy.runRejected, {
      severity: "error",
    }),
  );
  await waitFor(() => expect(run()).toBeEnabled());
  await userEvent.click(run());
  expect(screen.queryByRole("dialog", { name: composerCopy.retryTitle })).toBeNull();
  await waitFor(() => expect(launch).toHaveBeenCalledTimes(2));
});
