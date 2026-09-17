import {
  renderWithFeatureMessages,
  renderWithSharedMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Calendar } from "./Calendar";

function Harness({ max }: Readonly<{ max?: string }>) {
  const [value, setValue] = useState("2026-07-20");
  return <Calendar max={max} onChange={setValue} value={value} />;
}

const japaneseCalendarMessages = {
  shared: {
    controls: {
      calendar: {
        april: "4月",
        august: "8月",
        chooseDate: "日付を選択",
        december: "12月",
        february: "2月",
        friday: "金",
        january: "1月",
        july: "7月",
        june: "6月",
        march: "3月",
        may: "5月",
        monday: "月",
        monthYear: "{year}年{month}",
        nextMonth: "次の月",
        november: "11月",
        october: "10月",
        previousMonth: "前の月",
        saturday: "土",
        september: "9月",
        sunday: "日",
        thursday: "木",
        tuesday: "火",
        wednesday: "水",
      },
    },
  },
};

describe("Calendar", () => {
  it("renders the month of the selected value and selects a day", () => {
    const onChange = vi.fn();
    renderWithSharedMessages(<Calendar onChange={onChange} value="2026-07-20" />);

    expect(screen.getByText("July 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Jul 15, 2026" }));
    expect(onChange).toHaveBeenCalledWith("2026-07-15");
  });

  it("disables days after the max and blocks their selection", () => {
    const onChange = vi.fn();
    renderWithSharedMessages(<Calendar max="2026-07-24" onChange={onChange} value="2026-07-20" />);

    const future = screen.getByRole("button", { name: "Jul 25, 2026" });
    expect(future).toBeDisabled();
    fireEvent.click(future);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("navigates months with the previous control", () => {
    renderWithSharedMessages(<Calendar onChange={vi.fn()} value="2026-07-20" />);

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("June 2026")).toBeInTheDocument();
  });

  it("lets an injected locale reorder the complete month-year heading", () => {
    renderWithFeatureMessages(<Calendar onChange={vi.fn()} value="2026-07-20" />, {
      locale: "ja",
      messages: japaneseCalendarMessages,
    });

    expect(screen.getByText("2026年7月")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "前の月" })).toBeVisible();
  });

  it.each([
    ["es-ES", "24 de agosto de 2026"],
    ["pl", "24 sierpnia 2026"],
  ] as const)(
    "uses %s grammar for day-button labels without changing the stored key",
    (locale, label) => {
      renderWithSharedMessages(<Calendar onChange={vi.fn()} value="2026-08-24" />, {
        dateFormat: "day_first",
        locale,
      });

      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
    },
  );

  it("keeps the Japanese year-first pattern in the day-button accessible name", () => {
    renderWithFeatureMessages(<Calendar onChange={vi.fn()} value="2026-07-20" />, {
      dateFormat: "day_first",
      locale: "ja",
      messages: japaneseCalendarMessages,
    });

    expect(screen.getByRole("button", { name: "2026年7月20日" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("moves focus with the arrow keys", async () => {
    const user = userEvent.setup();
    renderWithSharedMessages(<Harness />);

    screen.getByRole("button", { name: "Jul 20, 2026" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Jul 21, 2026" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "Jul 28, 2026" })).toHaveFocus();
  });

  it("clamps arrow navigation to the max day", async () => {
    const user = userEvent.setup();
    renderWithSharedMessages(<Harness max="2026-07-24" />);

    const selected = screen.getByRole("button", { name: "Jul 20, 2026" });
    selected.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "Jul 24, 2026" })).toHaveFocus();
  });
});
