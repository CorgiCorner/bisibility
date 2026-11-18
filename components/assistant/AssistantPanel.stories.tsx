import { AssistantFrame } from "@/components/assistant/AssistantFrame";
import { Composer } from "@/components/assistant/Composer";
import { EffortSelect, ModelSelect } from "@/components/assistant/ComposerControls";
import { MessageList } from "@/components/assistant/MessageList";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { Button } from "@/components/ui/Button";
import { ToastProvider } from "@/components/ui/Toast";
import type { AssistantConfigView, ConversationView, ToolCallView } from "@/lib/assistant/wire";
import { cn } from "@/lib/ui/cn";
import { FLOATING_DRAWER_FRAME_CLASS } from "@/lib/ui/floating-drawer";
import assistant from "@/messages/core/en/assistant.json";
import shared from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

const proposal: ToolCallView = {
  id: "tool",
  toolName: "inspect",
  title: "Inspect site",
  category: "read",
  status: "proposed",
  summary: "Inspect this project.",
  target: "example.com",
  argsPreview: [{ label: "Domain", value: "example.com" }],
  estimatedCostCents: null,
  maxCostCents: null,
  toolFunding: null,
  expiresAt: "2099-01-01T00:00:00Z",
  argsHash: "a".repeat(64),
  result: null,
  error: null,
};
const config: AssistantConfigView = {
  enabled: true,
  reason: null,
  project: { publicId: "prj_1", name: "Example project", role: "owner", readOnly: false },
  models: [
    {
      id: "sonnet",
      provider: "anthropic",
      label: "Claude Sonnet 4.5",
      toolUse: true,
      efforts: ["low", "medium", "high", "xhigh", "max"],
      defaultEffort: "medium",
      maxOutputTokens: 32000,
    },
    {
      id: "gpt",
      provider: "openai",
      label: "GPT-5.1",
      toolUse: true,
      efforts: ["none", "low", "medium", "high"],
      defaultEffort: "medium",
      maxOutputTokens: 16000,
    },
    {
      id: "deepseek",
      provider: "openrouter",
      label: "DeepSeek V4",
      toolUse: true,
      efforts: [],
      defaultEffort: null,
      maxOutputTokens: 4096,
    },
  ],
  funding: [],
  fundingPreference: [
    { provider: "anthropic", mode: "credits" },
    { provider: "openai", mode: "byok" },
    { provider: "openrouter", mode: "credits" },
  ],
  creditsEnabled: true,
  defaults: { modelId: "sonnet", funding: null },
  starters: [],
  limits: { maxUserTextChars: 8000, maxSteps: 6 },
};

type Mode = "empty" | "streaming" | "proposal" | "paid" | "error" | "long" | "noEffort";
function Fixture({ mode }: { mode: Mode }) {
  const model = config.models[mode === "noEffort" ? 2 : 0];
  const call =
    mode === "paid"
      ? {
          ...proposal,
          category: "paid" as const,
          estimatedCostCents: 5,
          maxCostCents: 10,
          toolFunding: "SEO credits",
        }
      : proposal;
  const parts: ConversationView["messages"][number]["parts"] =
    mode === "proposal" || mode === "paid"
      ? [{ type: "tool", call }]
      : [
          {
            type: "text",
            text:
              mode === "long"
                ? `# Analysis\n\n${"Long content and https://example.com/very-long-path ".repeat(50)}`
                : "Here is the latest analysis.",
          },
        ];
  const conversation: ConversationView | null =
    mode === "empty"
      ? null
      : {
          id: "c",
          projectPublicId: "prj_1",
          title: "Analysis",
          activeRunId: null,
          runs: [],
          messages: [
            {
              id: "m",
              seq: 1,
              role: "assistant",
              createdAt: "2026-01-01",
              runId: null,
              partial: mode === "error",
              parts,
            },
          ],
        };
  return (
    <FeatureMessagesProvider locale="en" messages={{ ...assistant, ...shared }} timeZone="UTC">
      <ToastProvider>
        <div
          className={cn(FLOATING_DRAWER_FRAME_CLASS, "h-[680px] w-[420px] max-w-full rounded-2xl")}
        >
          <header className="flex items-center gap-1.5 border-b border-border px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="m-0 truncate text-sm font-semibold">Assistant</h2>
              <p className="m-0 truncate text-xs text-fg-muted">Example project</p>
            </div>
            <Button size="input" variant="ghost">
              History
            </Button>
            <Button size="input" variant="outline">
              New chat
            </Button>
          </header>
          {!conversation ? <p className="p-3">Ask a question about this project.</p> : null}
          <MessageList conversation={conversation} decide={async () => {}} retry={() => {}} />
          {mode === "error" ? (
            <p className="p-3" role="alert">
              The AI provider is unavailable. Try again later.
            </p>
          ) : null}
          <Composer
            caption={
              mode === "noEffort"
                ? "OpenRouter · paid with credits"
                : "Anthropic · paid with credits"
            }
            controls={
              <>
                <ModelSelect
                  config={config}
                  disabled={mode === "streaming"}
                  models={config.models}
                  onChange={() => {}}
                  project="prj_1"
                  value={model?.id ?? ""}
                />
                <EffortSelect
                  defaultEffort={model?.defaultEffort ?? null}
                  disabled={mode === "streaming"}
                  efforts={model?.efforts ?? []}
                  onChange={() => {}}
                  value={model?.defaultEffort ?? null}
                />
              </>
            }
            disabledReason={null}
            limit={8000}
            onSend={() => {}}
            onStop={() => {}}
            streaming={mode === "streaming"}
          />
        </div>
      </ToastProvider>
    </FeatureMessagesProvider>
  );
}
const meta = { title: "Assistant/Panel states", component: Fixture } satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = { args: { mode: "empty" } };
export const Streaming: Story = { args: { mode: "streaming" } };
export const Proposal: Story = { args: { mode: "proposal" } };
export const PaidProposal: Story = { args: { mode: "paid" } };
export const ErrorState: Story = { args: { mode: "error" } };
export const LongContent: Story = { args: { mode: "long" } };
/** A model without reasoning levels: the effort select is gone. */
export const ModelWithoutEffort: Story = { args: { mode: "noEffort" } };

function DrawerMotionPreview() {
  const [open, setOpen] = useState(false);
  return (
    <FeatureMessagesProvider locale="en" messages={{ ...assistant, ...shared }} timeZone="UTC">
      <Button onClick={() => setOpen(true)}>Open assistant</Button>
      <AssistantFrame
        open={open}
        close={() => setOpen(false)}
        actions={null}
        subtitle="Preview project"
      >
        <div className="p-6">Assistant setup and conversation remain inside the moving panel.</div>
      </AssistantFrame>
    </FeatureMessagesProvider>
  );
}
export const DrawerMotion: Story = {
  args: { mode: "empty" },
  render: () => <DrawerMotionPreview />,
};
