import { parseKeywordImportCsvRows } from "@/lib/keywords/import-csv-parser";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImportStepper, TemplateStep } from "./ImportCsvWizardSteps";

function advertisedColumns(container: HTMLElement) {
  const chipContainer = container.querySelector(".flex.flex-wrap.gap-1\\.5");
  expect(chipContainer).not.toBeNull();
  return Array.from(chipContainer?.querySelectorAll("span") ?? []).map(
    (node) => node.textContent ?? "",
  );
}

describe("ImportStepper", () => {
  it("replaces completed step numbers with checks", () => {
    const { container } = render(<ImportStepper step={3} />);

    expect(container.querySelectorAll("svg")).toHaveLength(2);
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(container.querySelector("svg")?.parentElement).toHaveStyle({
      backgroundColor: "var(--accent-soft)",
      color: "var(--accent)",
    });
  });

  it("renders step labels at regular weight", () => {
    render(<ImportStepper step={1} />);
    for (const label of ["Template", "Upload", "Map", "Review", "Done"]) {
      const node = screen.getByText(label);
      expect(node).toHaveClass("font-normal");
      expect(node).not.toHaveClass("font-semibold");
    }
  });
});

describe("ImportCsvWizardSteps TemplateStep", () => {
  it("advertises only columns consumed by the CSV parser", () => {
    const { container } = render(<TemplateStep />);
    const columns = advertisedColumns(container);
    expect(columns).toEqual(["keyword*", "target_url", "tags", "country", "language", "device"]);

    const [row] = parseKeywordImportCsvRows(
      `${columns.map((column) => (column.endsWith("*") ? column.slice(0, -1) : column)).join(",")}\nrank tracker,https://example.com/rank,seo;tracking,PL,pl,mobile`,
    );
    expect(row).toMatchObject({
      device: "mobile",
      keyword: "rank tracker",
      location: "PL",
      language: "pl",
      tags: ["seo", "tracking"],
      targetUrl: "https://example.com/rank",
    });
  });

  it("advertises the implemented language column", () => {
    render(<TemplateStep />);
    expect(screen.getByText(/^language$/)).toBeInTheDocument();
  });
});
