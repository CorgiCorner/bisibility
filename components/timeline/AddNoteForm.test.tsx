import { renderWithTimelineMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AddNoteForm } from "./AddNoteForm";

vi.mock("@/components/ui/AppDrawer", () => ({
  AppDrawer: ({
    children,
    footer,
    open,
    title,
  }: {
    children: ReactNode;
    footer: ReactNode;
    open: boolean;
    title: ReactNode;
  }) =>
    open ? (
      <div>
        <h2>{title}</h2>
        {children}
        {footer}
      </div>
    ) : null,
}));

const mocks = vi.hoisted(() => ({
  addSignalNote: vi.fn(),
}));

vi.mock("@/lib/actions/signals", () => ({ addSignalNote: mocks.addSignalNote }));

describe("AddNoteForm", () => {
  it("uses the scoped client validation before invoking the unchanged action payload", async () => {
    const user = userEvent.setup();
    render(<AddNoteForm canCreate projectId="prj_1" />);

    await user.click(screen.getByRole("button", { name: "Add note" }));
    expect(screen.getByRole("heading", { name: "Add note" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Save note" }));

    expect(await screen.findByText("Add a note.")).toBeVisible();
    expect(mocks.addSignalNote).not.toHaveBeenCalled();
  });
});

it("uses shared 40px form geometry for URL and Severity", async () => {
  const user = userEvent.setup();
  render(<AddNoteForm canCreate projectId="prj_1" />);
  await user.click(screen.getByRole("button", { name: "Add note" }));
  expect(screen.getByRole("textbox", { name: "URL" })).toHaveClass(
    "min-h-10",
    "px-[13px]",
    "py-[9px]",
    "font-medium",
  );
  expect(screen.getByRole("button", { name: "Severity" })).toHaveClass(
    "min-h-10",
    "px-[13px]",
    "py-[9px]",
    "font-medium",
  );
});
