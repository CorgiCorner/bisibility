import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRealtimeProvider, useAppRealtime } from "./AppRealtimeProvider";

const mocks = vi.hoisted(() => ({ useAppRealtimeState: vi.fn() }));

vi.mock("@/lib/realtime/useAppRealtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/realtime/useAppRealtime")>();
  return { ...actual, useAppRealtimeState: mocks.useAppRealtimeState };
});

function Consumer() {
  const realtime = useAppRealtime();
  return <span>{`${realtime.status}:${realtime.operations.length}`}</span>;
}

describe("AppRealtimeProvider", () => {
  beforeEach(() => {
    mocks.useAppRealtimeState.mockReturnValue({
      notifications: null,
      operations: [
        {
          id: "import_1",
          kind: "gsc_import",
          progress: { done: 1, total: 2 },
          state: "running",
        },
      ],
      status: "live",
    });
  });

  it("provides the project-scoped realtime state", () => {
    render(
      <AppRealtimeProvider projectRef="prj_1">
        <Consumer />
      </AppRealtimeProvider>,
    );

    expect(screen.getByText("live:1")).toBeInTheDocument();
    expect(mocks.useAppRealtimeState).toHaveBeenCalledWith("prj_1");
  });
});
