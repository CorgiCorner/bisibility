import { fireEvent, render, screen } from "@testing-library/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { KeywordEditDrawer } from "./KeywordEditDrawer";

vi.mock("@/components/ui", () => ({
  Button: ({
    children,
    loading: _loading,
    loadingLabel: _loadingLabel,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean;
    loadingLabel?: string;
    variant?: string;
  }) => <button {...props}>{children}</button>,
  SegmentedControl: ({
    onChange,
    options,
  }: {
    onChange: (value: "details" | "schedule") => void;
    options: readonly { label: string; value: "details" | "schedule" }[];
  }) =>
    options.map((option) => (
      <button key={option.value} onClick={() => onChange(option.value)} type="button">
        {option.label}
      </button>
    )),
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
vi.mock("@/components/keywords/grid/KeywordInlineEdit", () => ({
  KeywordInlineEdit: ({ formId }: { formId: string }) => (
    <form id={formId}>Keyword details form</form>
  ),
}));
vi.mock("./KeywordScheduleInlineForm", () => ({
  KeywordScheduleInlineForm: ({ formId }: { formId: string }) => (
    <form id={formId}>Keyword schedule form</form>
  ),
}));

describe("KeywordEditDrawer", () => {
  it("binds the sticky save action to the active edit section", () => {
    render(
      <KeywordEditDrawer
        keyword={{ id: "kw_1", keyword: "rank tracker" } as never}
        onClose={vi.fn()}
        open
        projectId="project_1"
        updateKeywordAction={vi.fn()}
        updateKeywordScheduleAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Keyword details form")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save details" })).toHaveAttribute(
      "form",
      "keyword-details-kw_1",
    );

    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

    expect(screen.getByText("Keyword schedule form")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save schedule" })).toHaveAttribute(
      "form",
      "keyword-schedule-kw_1",
    );
  });
});
