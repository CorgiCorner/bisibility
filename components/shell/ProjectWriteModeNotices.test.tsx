import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ProjectReadOnlyTooltip } from "./ProjectWriteModeNotices";
import { ProjectWriteModeProvider } from "./ProjectWriteModeProvider";

it("lets keyboard users focus a disabled selection action's read-only explanation", () => {
  render(
    <ProjectWriteModeProvider
      projectRef="prj_example"
      writeMode="migration_hold"
      reasons={{ migrated: "Moved", migration_hold: "Project is read only during migration." }}
    >
      <ProjectReadOnlyTooltip focusable>
        <button disabled type="button">
          Remove
        </button>
      </ProjectReadOnlyTooltip>
    </ProjectWriteModeProvider>,
  );
  const trigger = screen.getByRole("group");
  expect(trigger).toHaveAttribute("tabindex", "0");
  expect(trigger).toHaveAccessibleDescription("Project is read only during migration.");
  trigger.focus();
  expect(trigger).toHaveFocus();
  expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
});
