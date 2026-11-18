import * as api from "@/lib/assistant/client/api";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeySettings } from "./KeySettings";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/ui/MenuSelect", () => ({ MenuSelect: () => null }));
vi.mock("@/components/ui/ConfirmModal", () => ({ ConfirmModal: () => null }));
afterEach(() => vi.restoreAllMocks());
describe("KeySettings", () => {
  it("clears the key after failure and shows the precise server error", async () => {
    vi.spyOn(api, "assistantFetch").mockRejectedValue(
      new api.AssistantRequestError({ code: "byok_invalid", message: "invalid" }),
    );
    render(<KeySettings options={[]} provider="openai" refresh={async () => {}} />);
    const input = screen.getByLabelText("keyInput") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "a".repeat(24) } });
    fireEvent.click(screen.getByRole("button", { name: "saveKey" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("errors.byok_invalid"));
    expect(input.value).toBe("");
  });
});
