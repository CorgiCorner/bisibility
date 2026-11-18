import { columnResult, entities } from "@/lib/model-playground/result-fixtures.test-support";
import { projectColumnResult } from "@/lib/model-playground/result-view";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { renderNative } from "./model-playground-render.test-support";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const read = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

const run = () => screen.getByRole("button", { name: "Run" });
async function launchResult() {
  const h = renderNative();
  h.launch.mockResolvedValue({
    runId: "run",
    columns: h.fixture.input.columns.map((column, i) => ({ ...columnResult(i), column })),
  });
  await waitFor(() => expect(run()).toBeEnabled());
  await userEvent.click(run());
  await waitFor(() => expect(document.querySelectorAll("[data-column-verdict]")).toHaveLength(2));
  return h;
}

it.each(["add", "remove"])(
  "keeps the old matrix but only current column cards after %s",
  async (kind) => {
    const blobs: Blob[] = [];
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL(blob: Blob) {
          blobs.push(blob);
          return "blob:fixture";
        }
        static revokeObjectURL() {}
      },
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const h = await launchResult();
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const originalCsv = await read(blobs[0]);
    const table = screen.getByRole("table").outerHTML;
    const removed = h.fixture.input.columns[0].columnId;
    if (kind === "add") {
      await userEvent.click(screen.getByRole("button", { name: "Add model" }));
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Add model" }),
      );
    } else await userEvent.click(screen.getAllByRole("button", { name: /^Remove:/ })[0]);
    expect(document.querySelectorAll("[data-column-id]")).toHaveLength(kind === "add" ? 3 : 1);
    if (kind === "remove")
      expect(document.querySelector(`[data-column-id="${removed}"]`)).toBeNull();
    expect(document.querySelectorAll("[data-column-verdict]")).toHaveLength(kind === "add" ? 2 : 1);
    expect(screen.getByRole("table").outerHTML).toBe(table);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(await read(blobs[1])).toBe(originalCsv);
    expect(screen.getByText(/Matrix and CSV show the previous run/)).toBeInTheDocument();
    for (const card of document.querySelectorAll<HTMLElement>("[data-column-id]")) {
      expect(within(card).getByRole("button", { name: /^Settings:/ })).toBeEnabled();
      expect(within(card).getByRole("button", { name: /^Remove:/ })).toBeEnabled();
    }
  },
);

it.each(["unchanged save", "undone prompt"])(
  "keeps current answers current after %s",
  async (kind) => {
    const h = await launchResult();
    if (kind === "unchanged save") {
      await userEvent.click(screen.getAllByRole("button", { name: /^Settings:/ })[0]);
      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    } else {
      fireEvent.change(screen.getByLabelText("Your prompt"), { target: { value: "Different" } });
      expect(document.querySelectorAll("[data-previous-run]")).toHaveLength(2);
      fireEvent.change(screen.getByLabelText("Your prompt"), {
        target: { value: h.fixture.input.prompt },
      });
    }
    expect(screen.queryByText(/Previous run/)).toBeNull();
    expect(document.querySelectorAll("[data-previous-run]")).toHaveLength(0);
  },
);

it("labels initial results as retained from an earlier session without matching-input proof", () => {
  const result = columnResult();
  renderNative(
    true,
    (f) => {
      f.input.columns[0].columnId = result.column.columnId;
    },
    true,
    [],
    [projectColumnResult(result)],
  );
  expect(screen.getAllByText(/earlier session/)).toHaveLength(2);
  expect(document.querySelectorAll("[data-previous-run]")).toHaveLength(1);
});

it("exports the retained run unchanged after a model edit", async () => {
  const blobs: Blob[] = [];
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL(blob: Blob) {
        blobs.push(blob);
        return "blob:fixture";
      }
      static revokeObjectURL() {}
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const { launch, fixture } = renderNative(true, undefined, true, entities);
  launch.mockResolvedValue({
    runId: "retained",
    columns: [{ ...columnResult(), column: fixture.input.columns[0] }],
  });
  await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "Run" }));
  await userEvent.click(await screen.findByRole("button", { name: "Export CSV" }));
  const initial = await read(blobs[0]);
  await userEvent.click(screen.getAllByRole("button", { name: /^Settings:/ })[0]);
  await userEvent.click(screen.getByRole("button", { name: "Model" }));
  await userEvent.click(screen.getByRole("menuitem", { name: /Reasoning Pro 2/ }));
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  expect(await read(blobs[1])).toBe(initial);
  expect(initial).toContain("vendor/shared-model");
  expect(initial).not.toContain(fixture.catalogs[0].models[1].modelId);
  expect(screen.getByText(/Matrix and CSV show the previous run/)).toBeInTheDocument();
});
