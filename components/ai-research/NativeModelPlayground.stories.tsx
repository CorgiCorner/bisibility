import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { composerFixture } from "@/lib/model-playground/composer-fixtures.test-support";
import { applySearchIntent, newColumn } from "@/lib/model-playground/composer-state";
import { createFakeModelPlaygroundLaunchService } from "@/lib/model-playground/launch-service.fake.test-support";
import { columnResult, entities } from "@/lib/model-playground/result-fixtures.test-support";
import { transportEvidence } from "@/lib/providers/model/transport-evidence";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import trackingMessages from "@/messages/core/en/project-ai-tracking.json";
import historyMessages from "@/messages/core/en/research-history.json";
import sharedMessages from "@/messages/core/en/shared.json";
import esAiMessages from "@/messages/core/es-ES/project-ai-research.json";
import jaAiMessages from "@/messages/core/ja/project-ai-research.json";
import plAiMessages from "@/messages/core/pl/project-ai-research.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ModelPlayground } from "./ModelPlayground";
import { composerCopy } from "./model-playground-composer-copy.test-support";

function config(count = 3) {
  const fixture = composerFixture();
  fixture.input.columns = Array.from({ length: count }, (_, i) =>
    newColumn(fixture.catalogs[i % 4].models[i % 2], fixture.connections[i % 4]),
  );
  fixture.input = applySearchIntent(fixture.input, fixture.catalogs, true, "US");
  const results = fixture.input.columns.map((column, index) => ({
    ...columnResult(index),
    column,
  }));
  return {
    ...fixture,
    enabled: true as const,
    canConnect: true,
    copy: composerCopy,
    languages: [
      { code: "en", name: "English" },
      { code: "pl", name: "Polish" },
    ],
    markets: [
      { code: "US", name: "United States" },
      { code: "PL", name: "Poland" },
    ],
    service: createFakeModelPlaygroundLaunchService({
      ...fixture,
      unknownProviders: ["openrouter"],
      result: { runId: "fixture-run", columns: results },
    }),
  };
}
const meta = {
  title: "Research/Native Model Playground",
  component: ModelPlayground,
  parameters: { themeControls: false, layout: "padded", nextjs: { appDirectory: true } },
  args: {
    projectId: "prj_fixture",
    projectName: "Acme",
    domain: "acme.example",
    entities,
    topics: [],
    sourceOverrides: [],
    canRun: true,
    nativeComposer: config(),
  },
  decorators: [
    (Story, context) => {
      const requested = context.globals.locale;
      const locale: "en" | "pl" | "es-ES" | "ja" =
        requested === "pl" || requested === "es-ES" || requested === "ja" ? requested : "en";
      const localized = {
        en: aiMessages,
        pl: plAiMessages,
        "es-ES": esAiMessages,
        ja: jaAiMessages,
      }[locale];
      return (
        <FeatureMessagesProvider
          locale={locale}
          timeZone="UTC"
          messages={{
            ...sharedMessages,
            ...localized,
            ...trackingMessages,
            ...historyMessages,
            projectAiResearch: {
              ...localized.projectAiResearch,
              modelPlayground: { ...localized.projectAiResearch.modelPlayground },
            },
          }}
        >
          <Story />
        </FeatureMessagesProvider>
      );
    },
  ],
} satisfies Meta<typeof ModelPlayground>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const OneColumn: Story = { args: { nativeComposer: config(1) } };
export const TwoColumns: Story = { args: { nativeComposer: config(2) } };
function blocked(kind: "reauth" | "disconnected" | "disabled" | "model" | "settings" | "expired") {
  const value = config();
  if (kind === "reauth") value.connections[1].status = "needs_reauth";
  if (kind === "disconnected")
    value.connections[1] = { ...value.connections[1], hasStoredCredentials: false };
  if (kind === "disabled") value.connections[1] = { ...value.connections[1], enabled: false };
  if (kind === "model") value.catalogs[1].models = [];
  if (kind === "settings") value.input.columns[1].settings.maxOutputTokens = 2049;
  if (kind === "expired") {
    value.catalogs[1].fetchedAt = "2020-01-01T00:00:00.000Z";
    value.catalogs[1].expiresAt = "2020-01-02T00:00:00.000Z";
  }
  return value;
}
export const Reauthentication: Story = { args: { nativeComposer: blocked("reauth") } };
export const Disconnected: Story = { args: { nativeComposer: blocked("disconnected") } };
export const DisabledProvider: Story = { args: { nativeComposer: blocked("disabled") } };
export const MissingModel: Story = { args: { nativeComposer: blocked("model") } };
export const InvalidSettings: Story = { args: { nativeComposer: blocked("settings") } };
export const ExpiredCatalog: Story = { args: { nativeComposer: blocked("expired") } };
export const SixColumns: Story = { args: { nativeComposer: config(6) } };
export const ReadOnly: Story = { args: { canRun: false } };
const unavailable = config();
unavailable.connections[0].status = "planned";
unavailable.connections[1].status = "needs_reauth";
unavailable.connections[2] = { ...unavailable.connections[2], enabled: false };
unavailable.connections[3] = { ...unavailable.connections[3], hasStoredCredentials: false };
export const ConnectionStates: Story = { args: { nativeComposer: unavailable } };

const unavailableProvider = config();
unavailableProvider.connections[1].status = "planned";
export const UnavailableProvider: Story = { args: { nativeComposer: unavailableProvider } };
export const AfterRun: Story = {
  play: async ({ canvasElement }) => {
    const run = within(canvasElement).getByRole("button", { name: "Run" });
    await waitFor(() => expect(run).toBeEnabled());
    await userEvent.click(run);
    await waitFor(() =>
      expect(canvasElement.querySelectorAll("[data-column-verdict]")).toHaveLength(3),
    );
  },
};
export const PreviousRun: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Run" })).toBeEnabled());
    await userEvent.click(canvas.getByRole("button", { name: "Run" }));
    await waitFor(() =>
      expect(canvasElement.querySelectorAll("[data-column-verdict]")).toHaveLength(3),
    );
    await userEvent.clear(canvas.getByLabelText("Your question"));
    await userEvent.type(
      canvas.getByLabelText("Your question"),
      "Which analytics tools suit a small team?",
    );
    await waitFor(() =>
      expect(canvasElement.querySelectorAll("[data-previous-run]")).toHaveLength(3),
    );
  },
};
const uncertain = config();
uncertain.service = {
  ...uncertain.service,
  async launch() {
    throw new Error("Unconfirmed story launch");
  },
};
export const RetryConfirmation: Story = {
  args: { nativeComposer: uncertain },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Run" })).toBeEnabled());
    await userEvent.click(canvas.getByRole("button", { name: "Run" }));
    await canvas.findByText(composerCopy.runFailed);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Run" })).toBeEnabled());
    await userEvent.click(canvas.getByRole("button", { name: "Run" }));
  },
};
export const AddDrawer: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add model" }));
  },
};
export const EditDrawer: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Settings: Reasoning Pro 2" }),
    );
  },
};

const notStarted = config();
notStarted.service = createFakeModelPlaygroundLaunchService({
  ...notStarted,
  result: {
    runId: "not-started",
    columns: notStarted.input.columns.map((column) => ({
      ...transportEvidence(column, Date.now(), null),
      state: "cancelled",
      failure: "refused",
    })),
  },
});
export const NotStarted: Story = { ...AfterRun, args: { nativeComposer: notStarted } };

const noConnections = config(0);
noConnections.connections = noConnections.connections.map((connection) => ({
  ...connection,
  hasStoredCredentials: false,
}));
export const NoConnections: Story = { args: { nativeComposer: noConnections } };

const mixedFunding = config(2);
mixedFunding.connections[0] = {
  ...mixedFunding.connections[0],
  connectionId: "platform:openai",
  credentialSource: "hosted",
};
mixedFunding.input.columns[0] = newColumn(
  mixedFunding.catalogs[0].models[0],
  mixedFunding.connections[0],
);
mixedFunding.service = createFakeModelPlaygroundLaunchService(mixedFunding);
export const CreditsAndOwnKey: Story = { args: { nativeComposer: mixedFunding } };
