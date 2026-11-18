import { CommandRegistryProvider } from "@/components/shell/command-registry";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssistantProvider, AssistantTrigger } from "./AssistantProvider";

vi.mock("next-intl", () => ({
  useFormatter: () => ({ dateTime: String, number: String }),
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/lib/ui/use-media-query", () => ({ useMediaQuery: () => true }));
vi.mock("@/components/ui/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/assistant/useAssistantConversation", () => ({
  useAssistantConversation: () => ({
    config: { isPending: true },
    conversation: {},
    current: null,
    streaming: false,
  }),
}));
describe("AssistantProvider", () => {
  it("returns focus to the header button when Escape closes the desktop panel", () => {
    render(
      <AssistantProvider project="prj_1">
        <CommandRegistryProvider>
          <AssistantTrigger />
        </CommandRegistryProvider>
      </AssistantProvider>,
    );
    const trigger = screen.getByRole("button", { name: "title" });
    fireEvent.click(trigger);
    const close = screen.getByRole("button", { name: "close" });
    close.focus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  }, 30000);
});
