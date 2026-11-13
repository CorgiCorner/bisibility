import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { HistoryPage, HistoryQuery, HistoryRow } from "@/lib/research-history/contract";
import historyMessages from "@/messages/core/en/research-history.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryDrawer } from "./HistoryDrawer";
import type { HistoryAdapter } from "./history-adapter";

function row(key: string, title = key): HistoryRow {
  return {
    cost: { kind: "cached" },
    key,
    meta: { engines: ["chat_gpt"], kind: "model" },
    occurredAt: "2026-11-10T12:00:00.000Z",
    pinned: false,
    title,
  };
}

function page(rows: HistoryRow[], nextCursor: string | null = null): HistoryPage {
  return {
    chips: [{ facet: "engine", value: "chat_gpt" }],
    groups: rows.length ? [{ day: "2026-11-10", label: "today", rows }] : [],
    nextCursor,
    pinnedCount: 1,
    timeZone: "UTC",
    total: rows.length,
  };
}

function renderDrawer(adapter: HistoryAdapter) {
  return render(
    <FeatureMessagesProvider
      locale="en"
      messages={{ ...sharedMessages, ...historyMessages }}
      timeZone="UTC"
    >
      <HistoryDrawer adapter={adapter} onClose={vi.fn()} open />
    </FeatureMessagesProvider>,
  );
}

function adapter(
  loadPage: (input: HistoryQuery) => Promise<HistoryPage>,
  extras: Partial<HistoryAdapter> = {},
): HistoryAdapter {
  return {
    chipLabel: (chip) => chip.value,
    loadPage,
    noun: "runs",
    onOpen: vi.fn(),
    onTogglePin: vi.fn(async () => true),
    renderMeta: () => "ChatGPT",
    searchPlaceholder: "Search prompts",
    ...extras,
  };
}

function historyRows() {
  return screen.getAllByRole("button").filter((button) => button.hasAttribute("data-history-row"));
}

describe("HistoryDrawer", () => {
  it("loads older rows, pins and opens through the adapter", async () => {
    const loadPage = vi.fn(async (input: HistoryQuery) => {
      if (input.cursor) return page([row("older")]);
      return page([row("newer", "example.com prompt")], "cursor-1");
    });
    const onOpen = vi.fn();
    const onTogglePin = vi.fn(async () => true);
    renderDrawer(
      adapter(loadPage, {
        allHref: "/app/prj_example/agent-reports?kind=prompt_explorer",
        onOpen,
        onTogglePin,
      }),
    );
    expect(await screen.findByText("example.com prompt")).toBeVisible();
    expect(screen.getByText("ChatGPT")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open all runs as a table" })).toHaveAttribute(
      "href",
      "/app/prj_example/agent-reports?kind=prompt_explorer",
    );
    fireEvent.click(screen.getByRole("button", { name: "Load older runs" }));
    await waitFor(() => expect(historyRows()).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "Pin example.com prompt" }));
    await waitFor(() =>
      expect(onTogglePin).toHaveBeenCalledWith(expect.objectContaining({ key: "newer" }), true),
    );
    const [current] = historyRows();
    current?.focus();
    fireEvent.keyDown(current as HTMLElement, { key: "ArrowDown" });
    expect(historyRows()[1]).toHaveFocus();
    fireEvent.click(current as HTMLElement);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ key: "newer" }));
  });

  it("keeps a long title, separate time and cost, and a square pin on two tracks", async () => {
    const title = "Compare answers for search console import and weekly report.";
    expect(title).toHaveLength(60);
    const css = readFileSync(resolve(import.meta.dirname, "HistoryRowList.module.css"), "utf8");
    expect(css).toMatch(
      /\[data-history-grid\][\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/,
    );
    expect(css).toMatch(
      /\[data-history-row\][\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/,
    );
    expect(css).not.toMatch(/1fr\)\s+auto\s+auto/);
    renderDrawer(adapter(async () => page([row("long", title)])));
    const heading = await screen.findByText(title);
    expect(heading).toHaveClass("min-w-0", "truncate", "text-ui-body");
    const open = heading.closest("button");
    const item = heading.closest("li");
    expect(item).toHaveAttribute("data-history-grid");
    expect(item).toHaveClass("-mx-2", "px-2", "hover:bg-bg-sunken", "focus-within:bg-bg-sunken");
    expect(open).toHaveAttribute("data-history-row");
    expect(open).toHaveClass("min-w-0");
    const time = open?.querySelector("time");
    const cost = open?.querySelector("[data-history-cost]");
    expect(time).toHaveAttribute("data-history-time");
    expect(time).toHaveClass("tabular-nums");
    expect(cost).toHaveClass("tabular-nums");
    expect(time?.contains(cost as Node)).toBe(false);
    expect(screen.getByRole("heading", { name: "Today" })).toHaveClass(
      "text-ui-micro",
      "uppercase",
      "tracking-wider",
    );
    const pin = screen.getByRole("button", { name: `Pin ${title}` });
    expect(pin).toHaveAttribute("data-history-pin");
    expect(pin).toHaveClass("size-8");
    expect(open).not.toContainElement(pin);
    expect(item).toContainElement(pin);
  });

  it("shows the empty and error states", async () => {
    renderDrawer(adapter(async () => page([])));
    expect(await screen.findByText("No history yet")).toBeVisible();
    renderDrawer(
      adapter(async () => {
        throw new Error("down");
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("History could not be loaded.");
  });
});
