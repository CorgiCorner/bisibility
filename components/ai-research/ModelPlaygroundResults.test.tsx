import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { columnResult, entities } from "@/lib/model-playground/result-fixtures.test-support";
import {
  projectColumnResult,
  resultMatrix,
  resultMatrixCsv,
} from "@/lib/model-playground/result-view";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModelPlaygroundColumns } from "./ModelPlaygroundColumns";
import { ModelPlaygroundMatrix } from "./ModelPlaygroundMatrix";
import { ModelPlaygroundSources } from "./ModelPlaygroundSources";

const render = (node: React.ReactElement) =>
  renderWithFeatureMessages(node, {
    messages: {
      ...sharedMessages,
      ...aiMessages,
      projectAiResearch: {
        ...aiMessages.projectAiResearch,
        modelPlayground: { ...aiMessages.projectAiResearch.modelPlayground },
      },
    },
  });
function columns(count = 1) {
  return Array.from({ length: count }, (_, i) => projectColumnResult(columnResult(i)));
}
describe("fixture answer columns", () => {
  it.each([1, 3, 6])(
    "renders %i independent columns with own provenance and callbacks",
    async (count) => {
      const onRemove = vi.fn();
      const onSettings = vi.fn();
      const data = columns(count);
      render(
        <ModelPlaygroundColumns
          columns={data}
          entities={entities}
          onRemove={onRemove}
          onSettings={onSettings}
        />,
      );
      expect(screen.getAllByRole("article")).toHaveLength(count);
      expect(screen.getAllByText("API response")).toHaveLength(count);
      expect(screen.getAllByText("OpenRouter · Your key")).toHaveLength(Math.ceil(count / 4));
      await userEvent.click(screen.getAllByRole("button", { name: /Settings/ })[0]);
      await userEvent.click(screen.getAllByRole("button", { name: /Remove/ })[0]);
      expect(onSettings).toHaveBeenCalledWith(data[0].id);
      expect(onRemove).toHaveBeenCalledWith(data[0].id);
      expect(screen.queryByText("Order of first mention among tracked brands")).toBeNull();
      expect(screen.queryByRole("button", { name: "Full retained answer" })).toBeNull();
    },
  );
  it("keeps full answers beyond 4000 characters and shows truncation notices", async () => {
    const value = columnResult();
    value.answer = `Acme ${"retained words ".repeat(400)}FINAL RETAINED WORD`;
    value.truncation.application = true;
    value.state = "partial";
    render(
      <ModelPlaygroundColumns
        columns={[projectColumnResult(value)]}
        entities={entities}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Full retained answer" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("FINAL RETAINED WORD");
    expect(dialog).toHaveTextContent("Application retention limit reached");
    expect(within(dialog).getAllByRole("button")).toHaveLength(1);
  });
  it("separates 100 retained consulted sources from eight occurrences and reported total", async () => {
    render(<ModelPlaygroundSources columns={columns()} />);
    expect(screen.getByText("Provider-returned sources")).toBeInTheDocument();
    expect(screen.getByText("All 125")).toBeInTheDocument();
    expect(screen.getByText(/100 retained; 25 omitted/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show all retained sources" }));
    expect(
      screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("href")?.startsWith("https://research.example")),
    ).toHaveLength(100);
    await userEvent.click(screen.getByRole("button", { name: "Show all retained citations" }));
    expect(
      screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("href")?.startsWith("https://acme.example")),
    ).toHaveLength(8);
  });
  it("distinguishes unknown totals, duplicate labels and long names in the matrix", () => {
    const value = columnResult();
    delete value.consultedSources;
    delete value.citationTotals;
    const data = [projectColumnResult(value), ...columns(2).slice(1)];
    const brands = [{ ...entities[0], label: "VeryLongBrandName".repeat(30) }];
    data[1].state = "failed";
    render(
      <>
        <ModelPlaygroundSources columns={[data[0]]} />
        <ModelPlaygroundMatrix columns={data} rows={resultMatrix(data, brands)} />
      </>,
    );
    expect(screen.getAllByText(/Total unknown/).length).toBeGreaterThan(0);
    expect(screen.getByRole("table")).toHaveTextContent(brands[0].label);
    expect(screen.getByRole("table")).toHaveTextContent("not named");
    expect(screen.getByRole("table")).toHaveTextContent("Unknown");
    expect(screen.getByRole("table")).toHaveTextContent("OpenRouter");
    expect(screen.getByRole("table")).toHaveTextContent("Vercel AI Gateway");
  });
  it("R7 labels identical provider and model columns with their ordinal", () => {
    const data = [projectColumnResult(columnResult(0)), projectColumnResult(columnResult(4))];
    render(<ModelPlaygroundMatrix columns={data} rows={resultMatrix(data, entities)} />);
    expect(
      screen.getByRole("columnheader", { name: /vendor\/shared-model.*1/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: /vendor\/shared-model.*2/ }),
    ).toBeInTheDocument();
  });
  it.each([1, 3, 6])("keeps named table semantics for %i model columns", (count) => {
    const data = columns(count);
    const rows = resultMatrix(data, entities);
    render(<ModelPlaygroundMatrix columns={data} rows={rows} />);
    const table = screen.getByRole("table", { name: "Which tracked brands each model names" });
    expect(table).toHaveAttribute("aria-colcount", String(count + 1));
    expect(table).toHaveAttribute("aria-rowcount", String(rows.length + 1));
    const groups = within(table).getAllByRole("rowgroup");
    expect(groups).toHaveLength(2);
    expect(within(groups[0]).getAllByRole("columnheader")).toHaveLength(count + 1);
    const bodyRows = within(groups[1]).getAllByRole("row");
    expect(bodyRows).toHaveLength(rows.length);
    for (const [index, row] of bodyRows.entries()) {
      expect(within(row).getAllByRole("rowheader")).toHaveLength(1);
      expect(within(row).getByRole("rowheader")).toHaveTextContent(rows[index].entity.label);
      expect(within(row).getAllByRole("cell")).toHaveLength(count);
    }
    expect(within(table).getByRole("rowheader", { name: "Acme (You)" })).toBeInTheDocument();
    expect(within(table).getAllByText(/API response/)).toHaveLength(count);
    expect(screen.getByText("Order of first mention among tracked brands")).toBeVisible();
  });
  it("R9 all result controls are non-submitting within a form", () => {
    render(
      <form>
        <ModelPlaygroundColumns
          columns={columns()}
          entities={entities}
          onRemove={vi.fn()}
          onSettings={vi.fn()}
        />
        <ModelPlaygroundMatrix columns={columns()} rows={resultMatrix(columns(), entities)} />
      </form>,
    );
    for (const button of screen.getAllByRole("button"))
      expect(button).toHaveAttribute("type", "button");
  });
  it("exports the same CSV bytes from the matrix action", async () => {
    const data = columns(3);
    const rows = resultMatrix(data, entities);
    const createObjectURL = vi.fn((_blob: Blob) => "blob:matrix-fixture");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = revokeObjectURL;
      },
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      render(<ModelPlaygroundMatrix columns={data} rows={rows} />);
      await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
      const blob = createObjectURL.mock.calls[0][0] as Blob;
      const bytes = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsText(blob);
      });
      expect(bytes).toBe(
        resultMatrixCsv(data, rows, (cell) =>
          cell.kind === "position" ? `#${cell.position}${cell.cited ? " · cited" : ""}` : cell.kind,
        ),
      );
      expect(blob.type).toBe("text/csv;charset=utf-8");
      expect(click.mock.instances[0]).toHaveAttribute("download", "model-playground.csv");
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:matrix-fixture");
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });
  it("keeps unlinked native records visible and included in the retained count", () => {
    const column = projectColumnResult(columnResult());
    column.consultedSources = {
      sources: ["acme.example/docs", "www.x.com", ""].map((url, i) => ({
        sourceId: String(i),
        title: `Unlinked ${i}`,
        url,
      })),
      total: null,
      omitted: null,
      truncated: false,
    };
    render(<ModelPlaygroundSources columns={[column]} />);
    expect(screen.getByText("3 retained; omitted count unknown")).toBeInTheDocument();
    expect(screen.getByText("Records without a usable link")).toBeInTheDocument();
    for (let i = 0; i < 3; i++) expect(screen.getByText(`Unlinked ${i}`)).toBeInTheDocument();
  });
  it("updates edge fades from measured scroll geometry", () => {
    render(<ModelPlaygroundColumns columns={columns(6)} entities={entities} onRemove={vi.fn()} />);
    const scroll = screen.getByRole("region", { name: "Answers by model, scroll sideways" });
    Object.defineProperties(scroll, {
      scrollWidth: { configurable: true, value: 2480 },
      clientWidth: { configurable: true, value: 1200 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    });
    vi.spyOn(scroll, "getBoundingClientRect").mockImplementation(
      () => ({ left: 16, right: 1216 }) as DOMRect,
    );
    screen.getAllByRole("article").forEach((card, index) => {
      vi.spyOn(card, "getBoundingClientRect").mockImplementation(
        () =>
          ({
            left: 16 + index * 416 - scroll.scrollLeft,
            right: 416 + index * 416 - scroll.scrollLeft,
          }) as DOMRect,
      );
    });
    fireEvent.scroll(scroll);
    const left = document.querySelector('[data-edge="start"]');
    const right = document.querySelector('[data-edge="end"]');
    expect(left).not.toBeVisible();
    expect(right).toBeVisible();
    scroll.scrollLeft = 416;
    fireEvent.scroll(scroll);
    expect(left).not.toBeVisible();
    expect(right).toBeVisible();
    scroll.scrollLeft = 1280;
    fireEvent.scroll(scroll);
    expect(left).toBeVisible();
    expect(right).not.toBeVisible();
  });
});

it("shows terminal not-started copy without claiming an API response", () => {
  const value = columnResult();
  value.state = "cancelled";
  value.failure = "refused";
  value.answer = null;
  value.citations = [];
  render(
    <ModelPlaygroundColumns
      columns={[projectColumnResult(value)]}
      entities={entities}
      onRemove={vi.fn()}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Not started. Refresh the estimate and try again.",
  );
  expect(screen.queryByText("API response")).not.toBeInTheDocument();
});
