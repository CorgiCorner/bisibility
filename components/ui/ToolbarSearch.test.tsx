import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToolbarSearch } from "./ToolbarSearch";

describe("ToolbarSearch", () => {
  describe("shared controlled API", () => {
    it("renders a controlled search input with the provided label, id, and placeholder", () => {
      render(
        <ToolbarSearch
          id="test-search"
          label="Search items"
          onChange={() => {}}
          placeholder="Search items..."
          value="abc"
        />,
      );

      const input = screen.getByRole("searchbox", { name: "Search items" });
      expect(input).toHaveAttribute("id", "test-search");
      expect(input).toHaveAttribute("placeholder", "Search items...");
      expect(input).toHaveAttribute("type", "search");
      expect(input).toHaveValue("abc");
    });

    it("associates the label with the input", () => {
      render(
        <ToolbarSearch
          id="filter-input"
          label="Filter results"
          onChange={() => {}}
          placeholder="Filter..."
          value=""
        />,
      );

      expect(screen.getByLabelText("Filter results")).toHaveAttribute("id", "filter-input");
    });

    it("calls onChange with the new value when the input changes", () => {
      const onChange = vi.fn();
      render(
        <ToolbarSearch
          id="test-search"
          label="Search"
          onChange={onChange}
          placeholder="Search..."
          value=""
        />,
      );

      fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
        target: { value: "hello" },
      });

      expect(onChange).toHaveBeenCalledWith("hello");
    });

    it("renders the search icon", () => {
      const { container } = render(
        <ToolbarSearch
          id="test-search"
          label="Search"
          onChange={() => {}}
          placeholder="Search..."
          value=""
        />,
      );

      expect(container.querySelector("svg")).toBeInTheDocument();
    });

    it("merges a custom className for responsive sizing", () => {
      render(
        <ToolbarSearch
          className="min-w-[200px] flex-1 sm:flex-none"
          id="test-search"
          label="Search"
          onChange={() => {}}
          placeholder="Search..."
          value=""
        />,
      );

      const input = screen.getByRole("searchbox", { name: "Search" });
      expect(input.parentElement).toHaveClass("min-w-[200px]", "flex-1", "sm:flex-none");
    });
  });

  describe('variant="toolbar" (default)', () => {
    it("reproduces the AuditFilters surface: toolbar control, px 11px, focus-within border accent", () => {
      render(
        <ToolbarSearch
          id="audit-filter-search"
          label="Search audit events"
          onChange={() => {}}
          placeholder="Search actor, event, resource ID…"
          value=""
        />,
      );

      const input = screen.getByRole("searchbox", { name: "Search audit events" });
      const label = input.parentElement;
      // toolbarControlClassName surface (min-h 34, rounded 9, border-strong, transparent)
      expect(label).toHaveClass(
        "min-h-[34px]",
        "rounded-[9px]",
        "border",
        "border-border-strong",
        "bg-transparent",
      );
      // exact horizontal padding and focus treatment
      expect(label).toHaveClass("px-[11px]", "focus-within:border-accent");
      expect(label).not.toHaveClass("h-[34px]");
      expect(label).not.toHaveClass("focus-within:outline-2");
    });

    it("uses a 14px search icon", () => {
      const { container } = render(
        <ToolbarSearch
          id="test-search"
          label="Search"
          onChange={() => {}}
          placeholder="Search..."
          value=""
        />,
      );

      const icon = container.querySelector("svg");
      expect(icon).toHaveAttribute("width", "14");
      expect(icon).toHaveAttribute("height", "14");
    });

    it("uses 12px input text and the AuditFilters input classes", () => {
      render(
        <ToolbarSearch
          id="test-search"
          label="Search"
          onChange={() => {}}
          placeholder="Search..."
          value=""
        />,
      );

      const input = screen.getByRole("searchbox", { name: "Search" });
      expect(input).toHaveClass(
        "min-w-0",
        "flex-1",
        "bg-transparent",
        "font-mono",
        "text-[12px]",
        "text-fg",
        "outline-none",
        "placeholder:text-fg-muted",
        "focus-visible:outline-none",
      );
      expect(input).not.toHaveClass("text-[12.5px]", "border-0", "p-0");
    });
  });

  describe('variant="outlined"', () => {
    it("reproduces the SavedKeywords surface: h 34px, rounded 9px, border-strong, transparent, px 12px, focus-within outline", () => {
      render(
        <ToolbarSearch
          className="min-w-[220px]"
          id="saved-keywords-filter"
          label="Filter saved keywords"
          onChange={() => {}}
          placeholder="Filter saved keywords..."
          value=""
          variant="outlined"
        />,
      );

      const input = screen.getByRole("searchbox", { name: "Filter saved keywords" });
      const label = input.parentElement;
      expect(label).toHaveClass(
        "h-8.5",
        "min-w-[220px]",
        "rounded-[9px]",
        "border",
        "border-border-strong",
        "bg-transparent",
        "px-3",
      );
      // exact focus-within outline treatment (not a border-color change)
      expect(label).toHaveClass(
        "focus-within:outline",
        "focus-within:outline-2",
        "focus-within:outline-offset-2",
        "focus-within:outline-accent-solid",
      );
      expect(label).not.toHaveClass("focus-within:border-accent");
      expect(label).not.toHaveClass("min-h-[34px]", "px-[11px]");
    });

    it("uses a 15px search icon", () => {
      const { container } = render(
        <ToolbarSearch
          id="test-search"
          label="Filter"
          onChange={() => {}}
          placeholder="Filter..."
          value=""
          variant="outlined"
        />,
      );

      const icon = container.querySelector("svg");
      expect(icon).toHaveAttribute("width", "15");
      expect(icon).toHaveAttribute("height", "15");
    });

    it("uses 12.5px input text with border-0 p-0 and the SavedKeywords input classes", () => {
      render(
        <ToolbarSearch
          id="test-search"
          label="Filter"
          onChange={() => {}}
          placeholder="Filter..."
          value=""
          variant="outlined"
        />,
      );

      const input = screen.getByRole("searchbox", { name: "Filter" });
      expect(input).toHaveClass(
        "min-w-0",
        "flex-1",
        "border-0",
        "bg-transparent",
        "p-0",
        "font-mono",
        "text-[12.5px]",
        "text-fg",
        "outline-none",
        "placeholder:text-fg-muted",
      );
      expect(input).not.toHaveClass("text-[12px]", "focus-visible:outline-none");
    });

    it("preserves caller aria label, placeholder, value, and min-width", () => {
      render(
        <ToolbarSearch
          className="min-w-[220px]"
          id="saved-keywords-filter"
          label="Filter saved keywords"
          onChange={() => {}}
          placeholder="Filter saved keywords..."
          value="alpha"
          variant="outlined"
        />,
      );

      const input = screen.getByRole("searchbox", { name: "Filter saved keywords" });
      expect(input).toHaveAttribute("id", "saved-keywords-filter");
      expect(input).toHaveAttribute("placeholder", "Filter saved keywords...");
      expect(input).toHaveValue("alpha");
      expect(input.parentElement).toHaveClass("min-w-[220px]");
    });
  });

  describe("optional inputRef", () => {
    const base = { label: "S", onChange: () => {}, placeholder: "P", value: "" };
    it("forwards the ref to the actual input element", () => {
      const ref = { current: null as HTMLInputElement | null };
      render(<ToolbarSearch id="ref-test" inputRef={ref} {...base} />);
      expect(ref.current).toBeInstanceOf(HTMLInputElement);
      expect(ref.current?.id).toBe("ref-test");
    });

    it("focuses the input through the ref", () => {
      const ref = { current: null as HTMLInputElement | null };
      render(
        <>
          <ToolbarSearch id="f" inputRef={ref} {...base} />
          <button onClick={() => ref.current?.focus()} type="button">
            Focus
          </button>
        </>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Focus" }));
      expect(screen.getByRole("searchbox", { name: "S" })).toHaveFocus();
    });

    it("works without inputRef", () => {
      render(<ToolbarSearch id="no-ref" {...base} />);
      expect(screen.getByRole("searchbox", { name: "S" })).toBeInTheDocument();
    });
  });
});
