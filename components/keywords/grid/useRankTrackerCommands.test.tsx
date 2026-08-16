import {
  CommandRegistryProvider,
  useRegisteredCommands,
} from "@/components/shell/command-registry";
import { routerMock } from "@/tests/next-navigation";
import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRankTrackerCommands } from "./useRankTrackerCommands";

type Input = Parameters<typeof useRankTrackerCommands>[0];

function defaultInput(overrides: Partial<Input> = {}): Input {
  return {
    canCreateKeyword: true,
    canUpdateKeyword: true,
    initialAction: null,
    onAdd: vi.fn(),
    onExport: vi.fn(),
    onFilter: vi.fn(),
    onImport: vi.fn(),
    onRunChecks: vi.fn(),
    rowCounts: { all: 3, visible: 3 },
    ...overrides,
  };
}

function Probe({ input }: { input: Input }) {
  const { actionKey, consumeActionRef, registerRef } = useRankTrackerCommands(input);
  return (
    <>
      <span aria-hidden data-testid="register" hidden ref={registerRef} />
      <span aria-hidden data-testid="consume" hidden key={actionKey} ref={consumeActionRef} />
    </>
  );
}

function CommandList() {
  const commands = useRegisteredCommands();
  return (
    <ul data-testid="command-list">
      {commands.map((c) => (
        <li key={c.id} data-testid={`cmd-${c.id}`}>
          <span data-testid={`label-${c.id}`}>{c.label}</span>
          <span data-testid={`hint-${c.id}`}>{c.hint}</span>
          <button data-testid={`run-${c.id}`} onClick={() => c.run()} type="button">
            Run
          </button>
        </li>
      ))}
    </ul>
  );
}

function Harness({ input }: { input: Input }) {
  return (
    <CommandRegistryProvider>
      <Probe input={input} />
      <CommandList />
    </CommandRegistryProvider>
  );
}

function getCmd(id: string) {
  return {
    label: document.querySelector(`[data-testid="label-${id}"]`)?.textContent,
    hint: document.querySelector(`[data-testid="hint-${id}"]`)?.textContent,
    run: document.querySelector(`[data-testid="run-${id}"]`) as HTMLButtonElement,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  history.replaceState(null, "", "/app/prj_1/rank-tracker");
});

describe("useRankTrackerCommands registration", () => {
  it("registers all five commands with rank-tracker scope, labels, and hints", () => {
    render(<Harness input={defaultInput()} />);
    const ids = ["rt-add", "rt-import", "rt-export", "rt-filter", "rt-run-checks"];
    for (const id of ids) {
      expect(document.querySelector(`[data-testid="cmd-${id}"]`)).toBeTruthy();
    }
    expect(getCmd("rt-add").label).toBe("Add keyword");
    expect(getCmd("rt-add").hint).toBe("New keyword");
    expect(getCmd("rt-import").label).toBe("Import CSV");
    expect(getCmd("rt-import").hint).toBe("Upload file");
    expect(getCmd("rt-export").label).toBe("Export keywords");
    expect(getCmd("rt-export").hint).toBe("Download file");
    expect(getCmd("rt-filter").label).toBe("Filter");
    expect(getCmd("rt-filter").hint).toBe("Refine rows");
    expect(getCmd("rt-run-checks").label).toBe("Run rank checks");
    expect(getCmd("rt-run-checks").hint).toBe("Check visible");
  });

  it("calls the same owned handlers as the toolbar", () => {
    const onAdd = vi.fn();
    const onImport = vi.fn();
    const onExport = vi.fn();
    const onFilter = vi.fn();
    const onRunChecks = vi.fn();
    render(<Harness input={defaultInput({ onAdd, onImport, onExport, onFilter, onRunChecks })} />);
    getCmd("rt-add").run.click();
    expect(onAdd).toHaveBeenCalledOnce();
    getCmd("rt-import").run.click();
    expect(onImport).toHaveBeenCalledOnce();
    getCmd("rt-export").run.click();
    expect(onExport).toHaveBeenCalledOnce();
    getCmd("rt-filter").run.click();
    expect(onFilter).toHaveBeenCalledOnce();
    getCmd("rt-run-checks").run.click();
    expect(onRunChecks).toHaveBeenCalledOnce();
  });

  it("omits Add and Import without create permission", () => {
    render(<Harness input={defaultInput({ canCreateKeyword: false })} />);
    expect(document.querySelector('[data-testid="cmd-rt-add"]')).toBeNull();
    expect(document.querySelector('[data-testid="cmd-rt-import"]')).toBeNull();
    expect(document.querySelector('[data-testid="cmd-rt-export"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="cmd-rt-filter"]')).toBeTruthy();
  });

  it("omits Run rank checks when updates are disallowed", () => {
    render(<Harness input={defaultInput({ canUpdateKeyword: false })} />);
    expect(document.querySelector('[data-testid="cmd-rt-run-checks"]')).toBeNull();
    expect(document.querySelector('[data-testid="cmd-rt-add"]')).toBeTruthy();
  });

  it("omits Run rank checks when no visible row exists", () => {
    render(<Harness input={defaultInput({ rowCounts: { all: 3, visible: 0 } })} />);
    expect(document.querySelector('[data-testid="cmd-rt-run-checks"]')).toBeNull();
    expect(document.querySelector('[data-testid="cmd-rt-export"]')).toBeNull();
    expect(document.querySelector('[data-testid="cmd-rt-filter"]')).toBeTruthy();
  });

  it("omits Export and Filter when their surfaces have no target", () => {
    render(<Harness input={defaultInput({ rowCounts: { all: 0, visible: 0 } })} />);
    expect(document.querySelector('[data-testid="cmd-rt-export"]')).toBeNull();
    expect(document.querySelector('[data-testid="cmd-rt-filter"]')).toBeNull();
  });
});

describe("useRankTrackerCommands initial action consumption", () => {
  it("calls onAdd for add action when create is allowed", () => {
    const onAdd = vi.fn();
    render(<Harness input={defaultInput({ initialAction: "add", onAdd })} />);
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("does not call onAdd for add action without create permission", () => {
    const onAdd = vi.fn();
    render(
      <Harness input={defaultInput({ canCreateKeyword: false, initialAction: "add", onAdd })} />,
    );
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("calls onImport for import action when create is allowed", () => {
    const onImport = vi.fn();
    render(<Harness input={defaultInput({ initialAction: "import", onImport })} />);
    expect(onImport).toHaveBeenCalledOnce();
  });

  it("calls onExport for export action", () => {
    const onExport = vi.fn();
    render(<Harness input={defaultInput({ initialAction: "export", onExport })} />);
    expect(onExport).toHaveBeenCalledOnce();
  });

  it("calls onFilter for filter action", () => {
    const onFilter = vi.fn();
    render(<Harness input={defaultInput({ initialAction: "filter", onFilter })} />);
    expect(onFilter).toHaveBeenCalledOnce();
  });

  it("does not consume unavailable export and filter actions", () => {
    const onExport = vi.fn();
    const onFilter = vi.fn();
    const { unmount } = render(
      <Harness
        input={defaultInput({
          initialAction: "export",
          onExport,
          rowCounts: { all: 3, visible: 0 },
        })}
      />,
    );
    expect(onExport).not.toHaveBeenCalled();
    unmount();
    render(
      <Harness
        input={defaultInput({
          initialAction: "filter",
          onFilter,
          rowCounts: { all: 0, visible: 0 },
        })}
      />,
    );
    expect(onFilter).not.toHaveBeenCalled();
  });

  it("does not call any handler when initialAction is null", () => {
    const onAdd = vi.fn();
    render(<Harness input={defaultInput({ initialAction: null, onAdd })} />);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("deletes only action param and preserves other query parameters", () => {
    history.replaceState(null, "", "/app/prj_1/rank-tracker?action=add&view=weekly&device=desktop");
    const onAdd = vi.fn();
    render(<Harness input={defaultInput({ initialAction: "add", onAdd })} />);
    expect(routerMock.replace).toHaveBeenCalledWith(
      "/app/prj_1/rank-tracker?view=weekly&device=desktop",
      { scroll: false },
    );
  });

  it("preserves the hash when cleaning the URL", () => {
    history.replaceState(null, "", "/app/prj_1/rank-tracker?action=filter#results");
    const onFilter = vi.fn();
    render(<Harness input={defaultInput({ initialAction: "filter", onFilter })} />);
    expect(routerMock.replace).toHaveBeenCalledWith("/app/prj_1/rank-tracker#results", {
      scroll: false,
    });
  });

  it("consumes the same action again after an action-free URL state", () => {
    const onAdd = vi.fn();
    const { rerender } = render(<Harness input={defaultInput({ initialAction: "add", onAdd })} />);
    expect(onAdd).toHaveBeenCalledOnce();

    rerender(<Harness input={defaultInput({ initialAction: null, onAdd })} />);
    expect(onAdd).toHaveBeenCalledOnce();

    rerender(<Harness input={defaultInput({ initialAction: "add", onAdd })} />);
    expect(onAdd).toHaveBeenCalledTimes(2);
  });

  it("does not re-consume when commands change but action stays the same", () => {
    const onAdd = vi.fn();
    const onExport = vi.fn();
    const { rerender } = render(
      <Harness input={defaultInput({ initialAction: "add", onAdd, onExport })} />,
    );
    expect(onAdd).toHaveBeenCalledOnce();

    rerender(<Harness input={defaultInput({ initialAction: "add", onAdd, onExport })} />);
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("consumes an initial action once in Strict Mode", () => {
    const onAdd = vi.fn();
    render(
      <StrictMode>
        <Harness input={defaultInput({ initialAction: "add", onAdd })} />
      </StrictMode>,
    );
    expect(onAdd).toHaveBeenCalledOnce();
    expect(routerMock.replace).toHaveBeenCalledOnce();
  });
});
