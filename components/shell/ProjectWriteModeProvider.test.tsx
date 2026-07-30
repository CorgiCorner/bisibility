import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ProjectReadOnlyTooltip,
  ProjectWriteModeBanner,
  ProjectWriteModeProvider,
  useProjectWriteMode,
} from "./ProjectWriteModeProvider";

function Probe() {
  const { readOnly, writeMode } = useProjectWriteMode();
  return (
    <output aria-label="write mode">
      {writeMode}:{readOnly ? "readonly" : "writable"}
    </output>
  );
}

describe("ProjectWriteModeProvider", () => {
  it("defaults to writable when no shell seed is present", () => {
    render(<Probe />);

    expect(screen.getByLabelText("write mode")).toHaveTextContent("active:writable");
  });

  it("seeds read-only state from migration hold", () => {
    render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="migration_hold">
        <Probe />
      </ProjectWriteModeProvider>,
    );

    expect(screen.getByLabelText("write mode")).toHaveTextContent("migration_hold:readonly");
  });
});

describe("ProjectReadOnlyTooltip", () => {
  it("keeps the layout wrapper in both writable and read-only states", () => {
    const { container, rerender } = render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="active">
        <ProjectReadOnlyTooltip className="inline-flex flex-wrap gap-2">
          <button type="button">Daily</button>
        </ProjectReadOnlyTooltip>
      </ProjectWriteModeProvider>,
    );

    const writableWrapper = container.querySelector("span.inline-flex.flex-wrap.gap-2");
    expect(writableWrapper).not.toBeNull();
    expect(writableWrapper).not.toHaveAttribute("aria-label");

    rerender(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="migration_hold">
        <ProjectReadOnlyTooltip className="inline-flex flex-wrap gap-2">
          <button type="button">Daily</button>
        </ProjectReadOnlyTooltip>
      </ProjectWriteModeProvider>,
    );

    expect(screen.getByLabelText("Read-only during migration hold")).toHaveClass(
      "inline-flex",
      "flex-wrap",
      "gap-2",
    );
  });
});

describe("ProjectWriteModeBanner", () => {
  it("renders the persistent migration-hold banner only while read-only", () => {
    const { rerender } = render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="active">
        <ProjectWriteModeBanner />
      </ProjectWriteModeProvider>,
    );

    expect(screen.queryByText(/project is read-only/i)).not.toBeInTheDocument();

    rerender(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="migration_hold">
        <ProjectWriteModeBanner />
      </ProjectWriteModeProvider>,
    );

    expect(screen.getByText("Project is read-only - migration in progress.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /migration settings/i })).toHaveAttribute(
      "href",
      "/app/prj_1/settings#migration",
    );
    expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it("renders the migrated banner for migrated projects", () => {
    render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="migrated">
        <ProjectWriteModeBanner />
      </ProjectWriteModeProvider>,
    );

    expect(screen.getByText("Project migrated - disabled on this instance.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /migration settings/i })).toHaveAttribute(
      "href",
      "/app/prj_1/settings#migration",
    );
  });
});
