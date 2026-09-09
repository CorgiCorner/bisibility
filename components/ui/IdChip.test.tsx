import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IdChip, shortId } from "./IdChip";

describe("IdChip", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("shortens stable identifiers to their visible prefix", () => {
    expect(shortId("rcr_9d2e41abcdef")).toBe("rcr_9d2e41");
  });

  it("limits Mono to the opaque machine identifier", () => {
    render(<IdChip value="prj_8fK2Qf9m" />);

    expect(screen.getByText("prj_8fK2Qf")).toHaveClass("font-mono");
    expect(screen.getByRole("button", { name: "Copy ID" })).not.toHaveClass("font-mono");
  });

  it("shows a compact identifier and copies its full value without activating the row", async () => {
    const value = "sch_y9iq0n8zdadx9f7qwdg07464";
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onRowClick = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(
      <table>
        <tbody>
          <tr onClick={onRowClick} onKeyDown={() => undefined} tabIndex={0}>
            <td>
              <IdChip copyLabel="Copy schedule ID" value={value} />
            </td>
          </tr>
        </tbody>
      </table>,
    );

    expect(screen.getByText("sch_y9iq0n").parentElement).toHaveAttribute("title", value);
    expect(screen.queryByText(value)).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy schedule ID" }));
    });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(value);
    expect(onRowClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();
  });
});
