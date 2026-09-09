import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadUi: vi.fn() }));
vi.mock("@/components/ui/AlertBanner", () => {
  mocks.loadUi();
  return { AlertBanner: () => null };
});
vi.mock("@/components/ui/Tooltip", () => {
  mocks.loadUi();
  return { Tooltip: () => null };
});

it("provides write mode without loading the banner or tooltip components", async () => {
  const { ProjectWriteModeProvider, useProjectWriteMode } = await import(
    "./ProjectWriteModeProvider"
  );
  function Probe() {
    const { readOnly, readOnlyReason, writeMode } = useProjectWriteMode();
    return <output>{`${writeMode}:${readOnly}:${readOnlyReason}`}</output>;
  }
  const { rerender } = render(
    <ProjectWriteModeProvider projectRef="prj_1" writeMode="migration_hold">
      <Probe />
    </ProjectWriteModeProvider>,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "migration_hold:true:Read-only during migration hold",
  );
  rerender(
    <ProjectWriteModeProvider projectRef="prj_1" writeMode="active">
      <Probe />
    </ProjectWriteModeProvider>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("active:false:");
  expect(mocks.loadUi).not.toHaveBeenCalled();
});
