import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { sharedControlTestMessages } from "@/i18n/test-support/feature-test-messages";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { emptyCostForm } from "@/lib/cost-items/form-state";
import costs from "@/messages/core/en/project-usage-costs.json";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CostDrawer } from "./CostDrawer";

const messages = mergeMessageCatalogs(sharedControlTestMessages, costs);

function renderDrawer(
  amount: string,
  split: "equal" | "percent" | "single_project" = "single_project",
) {
  return renderWithFeatureMessages(
    <CostDrawer
      catalog={[]}
      initial={{
        ...emptyCostForm("prj_current", "2026-11-01"),
        amount,
        name: "Notes",
        projectIds: split === "equal" ? ["prj_current", "prj_other"] : ["prj_current"],
        split,
      }}
      mode="create"
      onClose={() => undefined}
      onSubmit={async () => undefined}
      open
      projectPublicId="prj_current"
    />,
    { messages },
  );
}

describe("add cost drawer", () => {
  it("uses the form size for selects, inputs and billing without an inset", () => {
    const view = renderDrawer("120.00");
    for (const name of ["Tool", "Type", "Currency"]) {
      expect(view.getByRole("button", { name })).toHaveClass("min-h-10");
    }
    const billing = view.getByRole("group", { name: "Billing" });
    expect(billing).toHaveClass("m-0", "p-0");
    expect(billing.firstElementChild).toHaveClass("min-h-10");
    for (const field of view.baseElement.querySelectorAll("[data-form-field]")) {
      expect(field.firstElementChild).toHaveClass("h-5");
    }
    expect(view.getByRole("button", { name: "Add cost" })).toHaveAttribute("data-size", "input");
  });

  it("omits the retired tool-suggestion prompt", () => {
    const view = renderDrawer("120.00");
    expect(view.queryByText("Not listed? Suggest it")).toBeNull();
    expect(view.getByRole("textbox", { name: "Custom tool" })).toBeVisible();
  });

  it("keeps a partial share hidden until the switch is on", async () => {
    const view = renderDrawer("99.00");
    const toggle = view.getByRole("switch", {
      name: "Only part of this cost belongs to this project",
    });
    expect(toggle).not.toBeChecked();
    expect(view.queryByLabelText("This project's share")).toBeNull();
    expect(view.queryByTestId("cost-lands")).toBeNull();

    await userEvent.click(toggle);
    const field = view.getByLabelText("This project's share");
    expect(field).toHaveValue("50");
    expect(view.getByTestId("cost-lands").textContent).toMatch(/49\.50/);

    await userEvent.clear(field);
    await userEvent.type(field, "150");
    await userEvent.tab();
    expect(field).toHaveValue("100");
  });

  it("opens an equal cost as this project's share", () => {
    const view = renderDrawer("120.00", "equal");
    expect(
      view.getByRole("switch", { name: "Only part of this cost belongs to this project" }),
    ).toBeChecked();
    expect(view.getByLabelText("This project's share")).toHaveValue("50");
    expect(view.getByTestId("cost-lands").textContent).toMatch(/60\.00/);
  });

  it("asks for an amount before saving", async () => {
    const view = renderDrawer("");
    await userEvent.click(view.getByRole("button", { name: "Add cost" }));
    expect(view.getByText("Enter an amount.")).toBeTruthy();
  });
});
