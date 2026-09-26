import { renderWithInstanceAdminMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { MeteringAdminData } from "@/lib/metering/admin-types";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AdminMeteringView } from "./AdminMeteringView";

const empty: MeteringAdminData = {
  usage: [],
  budgets: [],
  exceptions: [],
  projects: [],
  disagreements: "0",
  truncated: false,
};
it("distinguishes an empty meter from unavailable accounting", () => {
  render(<AdminMeteringView data={empty} />);
  expect(screen.getByText("No recorded usage for this selection.")).toBeInTheDocument();
  expect(screen.getByText("No pending work or shadow errors.")).toBeInTheDocument();
});
it("never renders unavailable data as a zero balance", () => {
  render(<AdminMeteringView data={null} />);
  expect(screen.getByRole("status")).toHaveTextContent("Amounts and counts are unknown");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
it("shows an exact seeded disagreement and its certainty", () => {
  render(
    <AdminMeteringView
      data={{
        ...empty,
        disagreements: "1",
        usage: [
          {
            id: "c1:app:byok",
            connection: "c1",
            surface: "app",
            funding: "byok",
            meter: "1.0001",
            reserved: null,
            legacy: "1.0000",
            difference: "0.0001",
            certainty: "measured",
          },
        ],
      }}
    />,
  );
  expect(screen.getByText("0.0001")).toBeInTheDocument();
  expect(screen.getByText("measured")).toBeInTheDocument();
  expect(screen.getByText("Unavailable")).toBeInTheDocument();
});
