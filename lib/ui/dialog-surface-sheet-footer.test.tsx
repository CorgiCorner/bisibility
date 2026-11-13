import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import styles from "./dialog-surface.module.css";

const panel = `.${styles.panel}[data-placement="sheet"]`;
const buttonRow = ":not(:has(> :not(button))):has(> button)";
const sharedAction = [`${panel} footer > button`, `${panel} footer > ${buttonRow} > button`].join(
  ", ",
);

function SheetFooter({ children }: { children: ReactNode }) {
  return (
    <div className={styles.panel} data-placement="sheet">
      <footer>{children}</footer>
    </div>
  );
}

describe("sheet footer actions", () => {
  it("targets a lone button and one wrapper of buttons", () => {
    render(
      <>
        <SheetFooter>
          <button type="button">Apply</button>
        </SheetFooter>
        <SheetFooter>
          <div>
            <button type="button">Reset</button>
            <button type="button">Show results</button>
          </div>
        </SheetFooter>
      </>,
    );

    expect(screen.getByRole("button", { name: "Apply" }).matches(sharedAction)).toBe(true);
    expect(screen.getByRole("button", { name: "Reset" }).matches(sharedAction)).toBe(true);
    expect(screen.getByRole("button", { name: "Show results" }).matches(sharedAction)).toBe(true);
    expect(
      screen.getByRole("button", { name: "Apply" }).parentElement?.matches(`${panel} footer`),
    ).toBe(true);
  });

  it("does not restyle a note or the buttons nested under it", () => {
    render(
      <SheetFooter>
        <div>
          <p>Cached results stay free.</p>
          <div>
            <button type="button">Reset</button>
            <button type="button">Show results</button>
          </div>
        </div>
      </SheetFooter>,
    );

    const note = screen.getByText("Cached results stay free.");
    const reset = screen.getByRole("button", { name: "Reset" });
    expect(note.matches(`${panel} footer > ${buttonRow} > *`)).toBe(false);
    expect(reset.matches(sharedAction)).toBe(false);
    expect(note.parentElement?.matches(`${panel} footer > ${buttonRow}`)).toBe(false);
  });
});
