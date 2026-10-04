import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScheduleCell, type ScheduleCellTarget } from "./ScheduleCell";

const target = (id: string, name: string | null, device = "Desktop"): ScheduleCellTarget => ({
  id,
  device,
  location: "United States / English",
  schedule: name ? { name, publicId: `sch_${name}` } : null,
});
describe("ScheduleCell", () => {
  it("links a single connected schedule", () => {
    render(<ScheduleCell projectRef="prj_1" targets={[target("kw_a", "Daily")]} />);
    expect(screen.getByRole("link", { name: "Daily" })).toHaveAttribute(
      "href",
      "/app/prj_1/runs/schedules/sch_Daily",
    );
  });
  it("identifies manual targets without inventing a schedule", () => {
    render(<ScheduleCell projectRef="prj_1" targets={[target("kw_a", null)]} />);
    expect(screen.getByText("Manual")).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("counts schedules by ID, and opens scoped links with manual assignments separate", async () => {
    render(
      <ScheduleCell
        projectRef="prj_1"
        targets={[
          target("kw_a", "Daily"),
          target("kw_b", "Weekly", "Mobile"),
          target("kw_c", null),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "2 schedules" }));
    expect(
      await screen.findByRole("menuitem", { name: /Daily.*United States.*Desktop/ }),
    ).toHaveAttribute("href", "/app/prj_1/runs/schedules/sch_Daily");
    expect(screen.getByRole("menuitem", { name: /Weekly.*Mobile/ })).toHaveAttribute(
      "href",
      "/app/prj_1/runs/schedules/sch_Weekly",
    );
    expect(screen.getByRole("menuitem", { name: /Manual/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
  it("shows one schedule alongside a manual target without counting it twice", () => {
    render(
      <ScheduleCell projectRef="prj_1" targets={[target("kw_a", "Daily"), target("kw_b", null)]} />,
    );
    expect(screen.getByRole("button", { name: "1 schedule" })).toBeVisible();
  });
});
