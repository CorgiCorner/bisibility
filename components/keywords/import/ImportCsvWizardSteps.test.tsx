import { parseKeywordImportCsvRows } from "@/lib/keywords/import-csv-parser";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TemplateStep } from "./ImportCsvWizardSteps";

function advertisedColumns(container: HTMLElement) {
  const chipContainer = container.querySelector(".flex.flex-wrap.gap-1\\.5");
  expect(chipContainer).not.toBeNull();
  return Array.from(chipContainer?.querySelectorAll("span") ?? []).map(
    (node) => node.textContent ?? "",
  );
}

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
