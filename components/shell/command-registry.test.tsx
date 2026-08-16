import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CommandRegistryProvider,
  type RegisteredCommand,
  useRegisterCommands,
  useRegisteredCommands,
} from "./command-registry";

function makeCommand(
  scope: string,
  id: string,
  overrides: Partial<RegisteredCommand> = {},
): RegisteredCommand {
  return {
    id: `${scope}-${id}`,
    label: `Command ${id}`,
    scope,
    hint: "Hint",
    run: vi.fn(),
    ...overrides,
  };
}

function RegistrationMarker({ commands }: { commands: readonly RegisteredCommand[] }) {
  const ref = useRegisterCommands(commands);
  return <span ref={ref} data-testid="marker" hidden aria-hidden />;
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

function Harness({ children }: { children: React.ReactNode }) {
  return (
    <CommandRegistryProvider>
      {children}
      <CommandList />
    </CommandRegistryProvider>
  );
}

describe("CommandRegistry", () => {
  it("exposes no commands without registrations", () => {
    render(<Harness>{null}</Harness>);
    expect(screen.queryByTestId("command-list")).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^cmd-/)).toHaveLength(0);
  });

  it("mount registers and unmount removes commands", () => {
    const cmd = makeCommand("page", "1");

    function App({ show }: { show: boolean }) {
      return <Harness>{show && <RegistrationMarker commands={[cmd]} />}</Harness>;
    }

    const { rerender } = render(<App show />);
    expect(screen.getByTestId(`cmd-${cmd.id}`)).toBeInTheDocument();

    rerender(<App show={false} />);
    expect(screen.queryByTestId(`cmd-${cmd.id}`)).not.toBeInTheDocument();
  });

  it("same-scope replacement is atomic and stale cleanup cannot erase it", () => {
    const cmdA = makeCommand("page", "a", { label: "Alpha" });
    const cmdB = makeCommand("page", "b", { label: "Beta" });

    function App({ showA, showB }: { showA: boolean; showB: boolean }) {
      return (
        <Harness>
          {showA && <RegistrationMarker commands={[cmdA]} />}
          {showB && <RegistrationMarker commands={[cmdB]} />}
        </Harness>
      );
    }

    const { rerender } = render(<App showA showB />);
    expect(screen.getByTestId(`cmd-${cmdB.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`cmd-${cmdA.id}`)).not.toBeInTheDocument();

    rerender(<App showA={false} showB />);
    expect(screen.getByTestId(`cmd-${cmdB.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`cmd-${cmdA.id}`)).not.toBeInTheDocument();
  });

  it("rejects duplicate ids within one registration", () => {
    const cmd1 = makeCommand("page", "x");
    const dup = { ...cmd1, label: "Different label" };

    expect(() =>
      render(
        <Harness>
          <RegistrationMarker commands={[cmd1, dup]} />
        </Harness>,
      ),
    ).toThrow(/duplicate command id/);
  });

  it("rejects mixed scopes within one registration", () => {
    const a = makeCommand("scope-a", "1");
    const b = makeCommand("scope-b", "2");

    expect(() =>
      render(
        <Harness>
          <RegistrationMarker commands={[a, b]} />
        </Harness>,
      ),
    ).toThrow(/same scope/);
  });

  it("rerenders with unchanged commands do not loop and latest run executes", () => {
    const runV1 = vi.fn();
    const runV2 = vi.fn();

    const commandsV1: RegisteredCommand[] = [makeCommand("page", "1", { run: runV1 })];
    const commandsV2: RegisteredCommand[] = [makeCommand("page", "1", { run: runV2 })];

    function App({ commands }: { commands: RegisteredCommand[] }) {
      return (
        <Harness>
          <RegistrationMarker commands={commands} />
        </Harness>
      );
    }

    const { rerender } = render(<App commands={commandsV1} />);
    expect(screen.getByTestId(`cmd-page-1`)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("run-page-1"));
    expect(runV1).toHaveBeenCalledOnce();

    rerender(<App commands={commandsV2} />);
    expect(screen.getByTestId(`cmd-page-1`)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("run-page-1"));
    expect(runV2).toHaveBeenCalledOnce();
    expect(runV1).toHaveBeenCalledOnce();
  });

  it("non-empty to empty removes the registered command", () => {
    const cmd = makeCommand("page", "1");

    function App({ commands }: { commands: readonly RegisteredCommand[] }) {
      return (
        <Harness>
          <RegistrationMarker commands={commands} />
        </Harness>
      );
    }

    const { rerender } = render(<App commands={[cmd]} />);
    expect(screen.getByTestId(`cmd-${cmd.id}`)).toBeInTheDocument();

    rerender(<App commands={[]} />);
    expect(screen.queryByTestId(`cmd-${cmd.id}`)).not.toBeInTheDocument();
    expect(screen.queryAllByTestId(/^cmd-/)).toHaveLength(0);
  });

  it("label and hint changes update the exposed values", () => {
    const cmdV1 = makeCommand("page", "1", { label: "Old label", hint: "Old hint" });
    const cmdV2 = makeCommand("page", "1", { label: "New label", hint: "New hint" });

    function App({ commands }: { commands: readonly RegisteredCommand[] }) {
      return (
        <Harness>
          <RegistrationMarker commands={commands} />
        </Harness>
      );
    }

    const { rerender } = render(<App commands={[cmdV1]} />);
    expect(screen.getByTestId("label-page-1").textContent).toBe("Old label");
    expect(screen.getByTestId("hint-page-1").textContent).toBe("Old hint");

    rerender(<App commands={[cmdV2]} />);
    expect(screen.getByTestId("label-page-1").textContent).toBe("New label");
    expect(screen.getByTestId("hint-page-1").textContent).toBe("New hint");
  });

  it("id and scope changes remove the old command and expose the new one", () => {
    const cmdV1 = makeCommand("page-a", "1");
    const cmdV2 = makeCommand("page-b", "2");

    function App({ commands }: { commands: readonly RegisteredCommand[] }) {
      return (
        <Harness>
          <RegistrationMarker commands={commands} />
        </Harness>
      );
    }

    const { rerender } = render(<App commands={[cmdV1]} />);
    expect(screen.getByTestId(`cmd-${cmdV1.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`cmd-${cmdV2.id}`)).not.toBeInTheDocument();

    rerender(<App commands={[cmdV2]} />);
    expect(screen.queryByTestId(`cmd-${cmdV1.id}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`cmd-${cmdV2.id}`)).toBeInTheDocument();
  });
});
