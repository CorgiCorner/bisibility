import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${values.count}/${values.limit}` : key,
}));

describe("Composer", () => {
  it("sends on Enter but preserves Shift+Enter and IME composition", () => {
    const onSend = vi.fn();
    render(
      <Composer
        disabledReason={null}
        limit={100}
        onSend={onSend}
        onStop={() => {}}
        streaming={false}
      />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("renders the controls and send button inside one field with the caption under it", () => {
    render(
      <Composer
        caption="Anthropic · paid with credits"
        controls={<button type="button">model</button>}
        disabledReason={null}
        limit={8000}
        onSend={() => {}}
        onStop={() => {}}
        streaming={false}
      />,
    );
    const field = screen.getByRole("textbox", { name: "input" }).closest("[data-composer-field]");
    expect(field?.contains(screen.getByRole("button", { name: "model" }))).toBe(true);
    expect(field?.contains(screen.getByRole("button", { name: "send" }))).toBe(true);
    const caption = screen.getByText("Anthropic · paid with credits · characterCount:0/8000");
    expect(field?.contains(caption)).toBe(false);
  });

  it("swaps send for stop while a run streams", () => {
    const onStop = vi.fn();
    render(
      <Composer disabledReason={null} limit={100} onSend={() => {}} onStop={onStop} streaming />,
    );
    expect(screen.queryByRole("button", { name: "send" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "stop" }));
    expect(onStop).toHaveBeenCalledOnce();
  });
});
