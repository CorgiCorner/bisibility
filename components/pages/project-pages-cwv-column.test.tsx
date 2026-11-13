import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import pagesMessages from "@/messages/core/en/project-pages.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { projectPagesColumns } from "./project-pages-columns";
import { pageRow, pageSource } from "./project-pages-fixtures";

const messages = mergeMessageCatalogs(sharedMessages, pagesMessages);

function renderCell(node: ReactNode) {
  return render(
    <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
      <DateDisplayProvider>
        <TooltipProvider>{node}</TooltipProvider>
      </DateDisplayProvider>
    </FeatureMessagesProvider>,
  );
}

function cell(disconnected: boolean, row = pageRow()) {
  const column = projectPagesColumns({
    format: {
      number: (value: number, options?: { maximumFractionDigits?: number }) =>
        options?.maximumFractionDigits === 1 ? value.toFixed(1) : String(value),
    } as never,
    projectId: "prj_1",
    sources: [pageSource("pagespeed", disconnected ? "not_connected" : "connected")],
    t: ((key: string) => {
      const catalog = pagesMessages.projectPages as Record<string, unknown>;
      return key.split(".").reduce<unknown>((node, part) => {
        if (!node || typeof node !== "object") return key;
        return (node as Record<string, unknown>)[part];
      }, catalog) as string;
    }) as never,
  }).find((item) => item.id === "cwv");
  if (!column || typeof column.cell !== "function") throw new Error("Missing CWV column");
  return column.cell({ row: { original: row } } as never);
}

describe("pages CWV column", () => {
  it("shows a pass chip and the field source instead of a zero", () => {
    renderCell(
      cell(
        false,
        pageRow({
          vitals: { cls: 0.02, inpMs: 120, lcpMs: 2100, source: "field", status: "good" },
        }),
      ),
    );
    expect(screen.getByText("Pass")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows a dash when PageSpeed is not connected", () => {
    renderCell(cell(true, pageRow({ vitals: null })));
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.queryByText("Pass")).not.toBeInTheDocument();
  });
});
