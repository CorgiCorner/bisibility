import RunsLoading from "@/app/app/(workspace)/[project]/runs/loading";
import SchedulesLoading from "@/app/app/(workspace)/[project]/runs/schedules/loading";
import {
  dataTableHeaderHeight,
  dataTableRowHeight,
} from "@/components/ui/data-table/data-table-density";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("Runs route loading boundaries", () => {
  it.each([
    {
      Component: RunsLoading,
      label: "runs",
      columns: ["Operation", "Type", "Scope", "Status", "Progress", "Unit", "Submitted", "Started"],
    },
    {
      Component: SchedulesLoading,
      label: "schedules",
      columns: ["Schedule", "Cadence", "Members", "Per run", "Next"],
    },
  ])(
    "shows $label tab, toolbar and table geometry without interactive placeholders",
    ({ Component, label, columns }) => {
      const { container } = render(<Component />);
      expect(screen.getByLabelText(`Loading ${label}`)).toHaveAttribute("aria-busy", "true");
      expect(screen.getByRole("status")).toHaveTextContent(`Loading ${label}`);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.queryByRole("banner")).not.toBeInTheDocument();
      const header = container.querySelector("[data-loading-table-header]");
      expect(header).toHaveStyle({ height: `${dataTableHeaderHeight}px` });
      expect(header).toHaveClass("border-t-0");
      for (const column of columns) expect(header).toHaveTextContent(column);
      const rows = container.querySelectorAll("[data-loading-table-row]");
      expect(rows).toHaveLength(5);
      for (const row of rows)
        expect(row).toHaveStyle({ height: `${dataTableRowHeight("standard")}px` });
      expect(container.querySelector(".overflow-x-auto")).not.toBeNull();
      expect(container.querySelector(".motion-safe\\:animate-pulse")).not.toBeNull();
    },
  );
});
