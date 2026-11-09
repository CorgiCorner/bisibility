import { renderWithInstanceAdminMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { OssPreview } from "./OssPreview";
import { ossNavigation } from "./PreviewShell";

it("shows the accepted OSS pages and single-view tabs without a subtab bar", () => {
  render(<OssPreview />);
  expect(Object.keys(ossNavigation)).toEqual(["Overview", "Operations", "Users", "Email", "Audit"]);
  expect(screen.queryByRole("navigation", { name: "Overview views" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Operations" }));
  expect(
    within(screen.getByRole("navigation", { name: "Operations views" }))
      .getAllByRole("button")
      .map((el) => el.textContent),
  ).toEqual(["Worker", "Checks", "Data sources", "Tasks", "Notifications"]);
  fireEvent.click(screen.getByRole("button", { name: "Audit" }));
  expect(screen.queryByRole("navigation", { name: "Audit views" })).not.toBeInTheDocument();
});
