import {
  assistantSelectionKey,
  resetAssistantSelectionCache,
} from "@/lib/assistant/client/selection-store";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantPanel } from "./AssistantPanel";

const showToast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toast-context", () => ({ useToast: () => ({ showToast }) }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ number: (value: number) => String(value) }),
}));
vi.mock("@/lib/ui/use-media-query", () => ({ useMediaQuery: () => true }));
vi.mock("@/components/ui/MenuSelect", () => ({
  MenuSelect: ({ ariaLabel, value }: { ariaLabel: string; value: string }) => (
    <div aria-label={ariaLabel} data-value={value} />
  ),
}));
const conversation = {
  config: {
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    data: {
      enabled: true,
      reason: null,
      project: { publicId: "prj_test", name: "Test", role: "member", readOnly: false },
      models: [
        {
          id: "m",
          provider: "openai",
          label: "Test",
          toolUse: true,
          efforts: [],
          defaultEffort: null,
          maxOutputTokens: 8192,
        },
      ],
      funding: [
        {
          mode: "byok",
          provider: "openai",
          available: false,
          reason: "byok_missing" as string | null,
          usage: null,
          credential: null as { id: string; last4: string; status: "active" } | null,
        },
        {
          mode: "credits",
          provider: "openai",
          available: false,
          reason: "credits_unavailable",
          usage: null,
          credential: null,
        },
      ],
      fundingPreference: [{ provider: "openai" as const, mode: "byok" as const }],
      creditsEnabled: false,
      defaults: { modelId: "m", funding: { mode: "byok" as const, provider: "openai" as const } },
      starters: [],
      limits: { maxUserTextChars: 100, maxSteps: 6 },
    },
  },
};

vi.mock("@/components/assistant/useAssistantConversation", () => ({
  useAssistantConversation: () => ({
    ...conversation,
    conversation: { isFetching: false, isError: false },
    current: null,
    history: { isPending: false, isError: false, data: [] },
    streaming: false,
    pendingText: null,
    error: null,
    networkError: false,
    canResubmit: false,
    send: vi.fn(),
    stop: vi.fn(),
    select: vi.fn(),
    decide: vi.fn(),
    resubmit: vi.fn(),
  }),
}));

beforeEach(() => {
  conversation.config.data.enabled = true;
  conversation.config.refetch.mockReset();
  conversation.config.refetch.mockResolvedValue({ data: conversation.config.data, isError: false });
  showToast.mockClear();
  window.localStorage.clear();
  resetAssistantSelectionCache();
  const model = conversation.config.data.models[0];
  if (model) Object.assign(model, { efforts: [], defaultEffort: null });
});

describe("AssistantPanel", () => {
  it("keeps History in the header and the model and effort selects inside the composer field", () => {
    const model = conversation.config.data.models[0];
    if (!model) throw new Error("missing model");
    Object.assign(model, { efforts: ["low", "high"], defaultEffort: "high" });
    render(<AssistantPanel close={() => undefined} open project="prj_test" />);
    const header = screen.getByRole("button", { name: "history" }).closest("header");
    expect(header).not.toBeNull();
    expect(header?.contains(screen.getByRole("button", { name: "newChat" }))).toBe(true);
    expect(header?.contains(screen.getByRole("button", { name: "close" }))).toBe(true);
    const field = screen.getByRole("textbox", { name: "input" }).closest("[data-composer-field]");
    expect(field).not.toBeNull();
    const controls = field?.querySelector("[data-composer-controls]");
    expect(controls?.contains(screen.getByLabelText("model"))).toBe(true);
    expect(controls?.contains(screen.getByLabelText("effort"))).toBe(true);
    expect(controls?.contains(screen.getByLabelText("tokenLimit"))).toBe(true);
    expect(screen.getByLabelText("tokenLimit").getAttribute("data-value")).toBe("8192");
    expect(controls?.contains(screen.getByRole("button", { name: "send" }))).toBe(true);
    expect(header?.contains(screen.getByLabelText("model"))).toBe(false);
    expect(screen.getByText("OpenAI · paidWithKey · characterCount")).toBeInTheDocument();
  });

  it("restores the model and effort stored for this project", () => {
    const models = conversation.config.data.models;
    models.push({
      id: "m2",
      provider: "openai",
      label: "Second",
      toolUse: true,
      efforts: ["low", "high"] as never[],
      defaultEffort: "high" as never,
      maxOutputTokens: 8192,
    });
    window.localStorage.setItem(
      assistantSelectionKey("prj_test"),
      JSON.stringify({ modelId: "m2", effort: "low", maxOutputTokens: 4096 }),
    );
    render(<AssistantPanel close={() => undefined} open project="prj_test" />);
    expect(screen.getByLabelText("model").getAttribute("data-value")).toBe("m2");
    models.pop();
    expect(screen.getByLabelText("effort").getAttribute("data-value")).toBe("low");
    // The token limit sits in the composer row beside effort, defaulting to the model maximum.
    expect(screen.getByLabelText("tokenLimit").getAttribute("data-value")).toBe("4096");
  });

  it("shows one funding notice and keeps funding controls off the header", () => {
    render(<AssistantPanel close={() => undefined} open project="prj_test" />);
    expect(screen.getByLabelText("model")).toBeInTheDocument();
    expect(screen.queryByLabelText("funding")).toBeNull();
    expect(screen.queryByRole("button", { name: "manageKeys" })).toBeNull();
    expect(screen.getAllByText("fundingNotice")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "fundingSettingsLink" }).getAttribute("href")).toBe(
      "/app/prj_test/providers#assistant-funding",
    );
  });

  it("shows no funding notice when the saved source can serve the model", () => {
    const funding = conversation.config.data.funding[0];
    if (!funding) throw new Error("missing funding row");
    funding.available = true;
    funding.reason = null;
    funding.credential = { id: "cred", last4: "1234", status: "active" };
    render(<AssistantPanel close={() => undefined} open project="prj_test" />);
    expect(screen.queryByText("fundingNotice")).toBeNull();
  });

  it("offers a reasoning effort only for a model that has efforts", () => {
    const { unmount } = render(<AssistantPanel close={() => undefined} open project="prj_test" />);
    expect(screen.queryByLabelText("effort")).toBeNull();
    unmount();
    const model = conversation.config.data.models[0];
    if (!model) throw new Error("missing model");
    Object.assign(model, { efforts: ["low", "high"], defaultEffort: "high" });
    render(<AssistantPanel close={() => undefined} open project="prj_test" />);
    expect(screen.getByLabelText("effort")).toBeInTheDocument();
  });
});

it("shows three setup steps instead of a disabled composer when unconfigured", async () => {
  conversation.config.data.enabled = false;
  render(<AssistantPanel close={() => undefined} open project="prj_test" />);
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
  expect(screen.queryByText("empty")).toBeNull();
  expect(screen.queryByText("errors.not_configured")).toBeNull();
  expect(screen.queryByRole("textbox", { name: "input" })).toBeNull();
  expect(screen.getByRole("link", { name: "connectAction" })).toHaveAttribute(
    "href",
    "/app/prj_test/providers#assistant-funding",
  );
  expect(screen.getByRole("link", { name: "limitsAction" })).toHaveAttribute(
    "href",
    "/app/prj_test/usage",
  );
  await userEvent.click(screen.getByRole("button", { name: "startAction" }));
  expect(conversation.config.refetch).toHaveBeenCalledTimes(1);
});

it.each(["ready", "notReady", "checkFailed"] as const)(
  "shows %s feedback after checking setup",
  async (outcome) => {
    conversation.config.data.enabled = false;
    if (outcome === "checkFailed")
      conversation.config.refetch.mockRejectedValueOnce(new Error("offline"));
    else
      conversation.config.refetch.mockResolvedValueOnce({
        isError: false,
        data: {
          ...conversation.config.data,
          enabled: outcome === "ready",
          funding: conversation.config.data.funding.map((item) => ({
            ...item,
            available: item.mode === "byok",
            reason: null,
          })),
        },
      });
    render(<AssistantPanel close={() => undefined} open project="prj_test" />);
    await userEvent.click(screen.getByRole("button", { name: "startAction" }));
    expect(showToast).toHaveBeenCalledWith(`setup.${outcome}`, {
      severity: outcome === "ready" ? "success" : outcome === "notReady" ? "warning" : "error",
    });
  },
);
