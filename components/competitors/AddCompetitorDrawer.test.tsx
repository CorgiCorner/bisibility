import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddCompetitorDrawer } from "./AddCompetitorDrawer";

const mocks = vi.hoisted(() => ({
  addManagedCompetitor: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/actions/competitors", () => ({
  addManagedCompetitor: mocks.addManagedCompetitor,
}));
vi.mock("@/components/ui", () => ({
  Button: ({
    children,
    loading,
    loadingLabel,
    startIcon,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean;
    loadingLabel?: string;
    startIcon?: ReactNode;
    variant?: string;
  }) => (
    <button {...props} disabled={loading || props.disabled}>
      {loading && loadingLabel ? loadingLabel : children}
      {!loading ? startIcon : null}
    </button>
  ),
  Sheet: ({
    children,
    footer,
    open,
  }: {
    children: ReactNode;
    footer?: ReactNode;
    open: boolean;
  }) =>
    open ? (
      <div>
        {children}
        {footer}
      </div>
    ) : null,
}));

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("AddCompetitorDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses neutral examples for competitor fields", () => {
    render(
      <AddCompetitorDrawer
        canCreate
        onClose={vi.fn()}
        open
        projectId="project_1"
        suggestions={[]}
      />,
    );

    expect(screen.getByPlaceholderText("competitor.example")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Example competitor")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/rankzly/i)).not.toBeInTheDocument();
  });

  it("shows pending feedback until the competitor is saved", async () => {
    const pending = deferred<{ domain: string; id: string; label: string }>();
    const onClose = vi.fn();
    mocks.addManagedCompetitor.mockReturnValue(pending.promise);
    render(
      <AddCompetitorDrawer
        canCreate
        onClose={onClose}
        open
        projectId="project_1"
        suggestions={[]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("competitor.example"), {
      target: { value: "example.net" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add competitor" }));

    await waitFor(() => expect(mocks.addManagedCompetitor).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Adding..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    pending.resolve({ domain: "example.net", id: "competitor_1", label: "example" });

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
