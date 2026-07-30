import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ManualCheckPanel } from "./ManualCheckPanel";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/lib/actions/settings", () => ({
  runManualProjectCheck: vi.fn(),
}));

describe("ManualCheckPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows successful manual starts as started checks instead of queued totals", async () => {
    const runCheck = vi.fn(async () => ({ failed: 0, queued: 3, total: 3 }));

    render(<ManualCheckPanel projectId="prj_1" runCheck={runCheck} />);
    fireEvent.click(screen.getByRole("button", { name: "Run check now" }));

    expect(await screen.findByText("Started 3 of 3 checks.")).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("surfaces partial manual-start failures with an error affordance", async () => {
    const runCheck = vi.fn(async () => ({ failed: 1, queued: 2, total: 3 }));

    render(<ManualCheckPanel projectId="prj_1" runCheck={runCheck} />);
    fireEvent.click(screen.getByRole("button", { name: "Run check now" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Started 2 of 3 checks. 1 check could not be started.",
      ),
    );
  });

  it("reports budget exhaustion as a failed project run", async () => {
    const runCheck = vi.fn(async () => ({
      failed: 3,
      queued: 1,
      reason: "budget_exhausted",
      total: 4,
    }));

    render(<ManualCheckPanel projectId="prj_1" runCheck={runCheck} />);
    fireEvent.click(screen.getByRole("button", { name: "Run check now" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Monthly rank check budget reached. Started 1 of 4 checks. 3 could not be started.",
    );
  });

  it("disables manual starts during migration hold", () => {
    const runCheck = vi.fn();

    render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="migration_hold">
        <ManualCheckPanel projectId="prj_1" runCheck={runCheck} />
      </ProjectWriteModeProvider>,
    );

    expect(screen.getByText("Paused - migration hold")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run check now" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Run check now" }));
    expect(runCheck).not.toHaveBeenCalled();
  });
});
