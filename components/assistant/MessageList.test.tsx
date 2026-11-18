import type { AssistantErrorCode, ConversationView } from "@/lib/assistant/wire";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageList } from "./MessageList";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/components/ui/CopyButton", () => ({ CopyButton: () => null }));
vi.mock("@/components/assistant/ToolCard", () => ({ ToolCard: () => null }));
const conversation: ConversationView = {
  id: "c",
  projectPublicId: "prj_1",
  title: "",
  activeRunId: null,
  runs: [],
  messages: [
    {
      id: "m",
      seq: 1,
      role: "assistant",
      createdAt: "",
      runId: null,
      partial: false,
      parts: [{ type: "text", text: "hello" }],
    },
  ],
};
describe("MessageList", () => {
  it("shows the submitted text and a pending status before the server confirms the run", () => {
    render(
      <MessageList
        conversation={null}
        decide={async () => {}}
        pendingText="Which keywords dropped?"
        retry={() => {}}
      />,
    );
    expect(screen.getByText("Which keywords dropped?")).toBeTruthy();
    expect(screen.getByText("statuses.pending")).toBeTruthy();
  });
  it("shows token counts once, under the answer", () => {
    const shared = {
      id: "r",
      status: "completed" as const,
      modelId: "m",
      provider: "openai" as const,
      funding: "credits" as const,
      startedAt: "",
      finishedAt: "",
      error: null,
      usage: {
        inputTokens: 1,
        outputTokens: 10,
        costMicroUsd: "1",
        certainty: "measured" as const,
        chargedCents: "2.0000",
      },
      usageUncertain: false,
    };
    render(
      <MessageList
        conversation={{
          ...conversation,
          runs: [shared],
          messages: [
            {
              id: "user",
              seq: 1,
              role: "user",
              createdAt: "",
              runId: "r",
              partial: false,
              parts: [{ type: "text", text: "question" }],
            },
            {
              id: "answer",
              seq: 2,
              role: "assistant",
              createdAt: "",
              runId: "r",
              partial: false,
              parts: [{ type: "text", text: "answer" }],
            },
          ],
        }}
        decide={async () => {}}
        retry={() => {}}
      />,
    );
    expect(screen.getAllByText(/^tokens · charged/)).toHaveLength(1);
  });

  function refused(code: AssistantErrorCode): ConversationView {
    const run = {
      id: "r",
      status: "failed" as const,
      modelId: "m",
      provider: "openai" as const,
      funding: "credits" as const,
      startedAt: "",
      finishedAt: "",
      error: { code, message: code },
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        costMicroUsd: null,
        certainty: "unknown" as const,
        chargedCents: null,
      },
      usageUncertain: false,
    };
    return {
      ...conversation,
      runs: [run],
      messages: [
        {
          id: "user",
          seq: 1,
          role: "user" as const,
          createdAt: "",
          runId: "r",
          partial: false,
          parts: [{ type: "text" as const, text: "question" }],
        },
        {
          id: "answer",
          seq: 2,
          role: "assistant" as const,
          createdAt: "",
          runId: "r",
          partial: false,
          parts: [],
        },
      ],
    };
  }

  it("shows a pre-dispatch refusal once and does not offer a retry that cannot succeed", () => {
    render(
      <MessageList
        conversation={refused("limit_exceeded")}
        decide={async () => {}}
        retry={() => {}}
      />,
    );
    expect(screen.getAllByText("errors.limit_exceeded")).toHaveLength(1);
    expect(screen.queryByText("errors.usage_unknown")).toBeNull();
    expect(screen.queryByRole("button", { name: "retry" })).toBeNull();
  });

  it("hides retry when the wallet cannot pay and still explains why", () => {
    render(
      <MessageList
        conversation={refused("credits_insufficient")}
        decide={async () => {}}
        retry={() => {}}
      />,
    );
    expect(screen.getByText("errors.credits_insufficient")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "retry" })).toBeNull();
  });

  it("offers retry once, under the answer, when another attempt could succeed", () => {
    render(
      <MessageList
        conversation={refused("provider_unavailable")}
        decide={async () => {}}
        retry={() => {}}
      />,
    );
    expect(screen.getAllByRole("button", { name: "retry" })).toHaveLength(1);
    expect(screen.queryByText("errors.usage_unknown")).toBeNull();
  });

  it("shows an uncertain outcome once under the answer", () => {
    const view = refused("provider_unavailable");
    view.runs = [{ ...view.runs[0], status: "unknown", usageUncertain: true }];
    render(<MessageList conversation={view} decide={async () => {}} retry={() => {}} />);
    expect(screen.getAllByText("errors.usage_unknown")).toHaveLength(1);
  });

  it("does not repeat a reason the assistant message already carries", () => {
    const view = refused("limit_exceeded");
    view.messages[1] = {
      ...view.messages[1],
      parts: [{ type: "notice", code: "limit_exceeded", message: "limit_exceeded" }],
    };
    render(<MessageList conversation={view} decide={async () => {}} retry={() => {}} />);
    expect(screen.getAllByText("errors.limit_exceeded")).toHaveLength(1);
  });

  it("offers jump to latest after scrolling away and restores the bottom on click", () => {
    const { container } = render(
      <MessageList conversation={conversation} decide={async () => {}} retry={() => {}} />,
    );
    const scroller = container.querySelector(".overflow-y-auto") as HTMLElement;
    Object.defineProperties(scroller, {
      scrollHeight: { value: 1000 },
      clientHeight: { value: 200 },
    });
    scroller.scrollTop = 100;
    fireEvent.scroll(scroller);
    fireEvent.click(screen.getByRole("button", { name: "jump" }));
    expect(scroller.scrollTop).toBe(1000);
    expect(screen.queryByRole("button", { name: "jump" })).toBeNull();
  });
});
