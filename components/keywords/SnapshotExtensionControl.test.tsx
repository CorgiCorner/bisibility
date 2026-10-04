import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { ExtendSnapshotAction, SnapshotExtensionView } from "@/lib/serp/snapshot-extension";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SnapshotExtensionControl } from "./SnapshotExtensionControl";

const props = { checkId: "check_1", projectRef: "prj_1", formatDateTime: (value: string) => value };
const extension: SnapshotExtensionView = {
  reason: "available",
  expiresAt: "2026-09-28T10:15:00.000Z",
  nextStart: 20,
  pages: [],
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T10:02:00.000Z"));
});
afterEach(() => vi.useRealTimers());
const open = () => fireEvent.click(screen.getByRole("button", { name: "Fetch next 10 results" }));
const confirm = () => fireEvent.click(screen.getByRole("button", { name: "Confirm and fetch" }));

describe("snapshot continuation control", () => {
  it("explains time, cost and duplicates before one confirmed request and reloads after saving", async () => {
    let complete!: (value: { ok: true }) => void;
    const action = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          complete = resolve;
        }),
    );
    const onReload = vi.fn(async () => undefined);
    render(
      <SnapshotExtensionControl
        {...props}
        extension={extension}
        action={action}
        onReload={onReload}
      />,
    );
    open();
    expect(screen.getByRole("dialog")).toHaveTextContent("#21 to #30");
    expect(screen.getByRole("dialog")).toHaveTextContent("Up to 1 search");
    expect(screen.getByRole("dialog")).toHaveTextContent("Repeated URLs are skipped automatically");
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Historical rank and check comparisons stay unchanged",
    );
    expect(action).not.toHaveBeenCalled();
    act(() => {
      confirm();
      confirm();
    });
    expect(action).toHaveBeenCalledExactlyOnceWith({
      checkId: props.checkId,
      projectId: props.projectRef,
      nextStart: 20,
    });
    expect(screen.getByRole("button", { name: "Fetching results…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => complete({ ok: true }));
    expect(onReload).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("rechecks the fixed deadline at confirmation", async () => {
    const action = vi.fn();
    render(
      <SnapshotExtensionControl
        {...props}
        extension={extension}
        action={action}
        onReload={async () => undefined}
      />,
    );
    open();
    vi.setSystemTime(new Date(extension.expiresAt!));
    await act(async () => confirm());
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("15-minute extension window has closed");
  });
  it("reloads after an ambiguous request and prevents a blind paid retry", async () => {
    const action = vi
      .fn<ExtendSnapshotAction>()
      .mockRejectedValue(new Error("private provider details"));
    const onReload = vi.fn(async () => undefined);
    render(
      <SnapshotExtensionControl
        {...props}
        extension={extension}
        action={action}
        onReload={onReload}
      />,
    );
    open();
    await act(async () => confirm());
    expect(onReload).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent("extension could not be confirmed");
    expect(screen.queryByText(/private provider/)).toBeNull();
    expect(screen.getByRole("button", { name: "Confirm and fetch" })).toBeDisabled();
  });
  it.each([
    "unsupported",
    "legacy",
    "expired",
    "complete",
    "running",
    "failed",
    "disconnected",
  ] as const)("offers no paid action for %s", (reason) => {
    render(
      <SnapshotExtensionControl
        {...props}
        extension={{ ...extension, reason }}
        action={vi.fn()}
        onReload={async () => undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: "Fetch next 10 results" })).toBeNull();
  });
  it("refreshes stored results without requesting another provider page", async () => {
    const action = vi.fn();
    const onReload = vi.fn(async () => undefined);
    render(
      <SnapshotExtensionControl
        {...props}
        extension={{ ...extension, reason: "running" }}
        action={action}
        onReload={onReload}
      />,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Refresh snapshot" })),
    );
    expect(onReload).toHaveBeenCalledOnce();
    expect(action).not.toHaveBeenCalled();
  });
  it("honors the project write hold", () => {
    render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="migration_hold">
        <SnapshotExtensionControl
          {...props}
          extension={extension}
          action={vi.fn()}
          onReload={async () => undefined}
        />
      </ProjectWriteModeProvider>,
    );
    expect(screen.getByRole("button", { name: "Fetch next 10 results" })).toBeDisabled();
  });
});
