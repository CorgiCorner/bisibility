import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { composerFixture } from "@/lib/model-playground/composer-fixtures.test-support";
import { columnResult } from "@/lib/model-playground/result-fixtures.test-support";
import { projectColumnResult } from "@/lib/model-playground/result-view";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import sharedMessages from "@/messages/core/en/shared.json";
import esMessages from "@/messages/core/es-ES/project-ai-research.json";
import sharedEs from "@/messages/core/es-ES/shared.json";
import jaMessages from "@/messages/core/ja/project-ai-research.json";
import sharedJa from "@/messages/core/ja/shared.json";
import plMessages from "@/messages/core/pl/project-ai-research.json";
import sharedPl from "@/messages/core/pl/shared.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ModelPlaygroundColumnFrame } from "./ModelPlaygroundColumnFrame";
import { ModelPlaygroundColumnSettings } from "./ModelPlaygroundColumnSettings";
import { composerCopy } from "./model-playground-composer-copy.test-support";

const localeMessages = {
  en: { ...sharedMessages, ...aiMessages },
  "es-ES": { ...sharedEs, ...esMessages },
  ja: { ...sharedJa, ...jaMessages },
  pl: { ...sharedPl, ...plMessages },
};

// Every identity and observed value is synthetic, including the deliberately mismatched workspace.
function RoutingStory({
  kind,
  drawer = false,
  locale = "en",
}: {
  kind: "anthropic" | "vercel_ai_gateway";
  drawer?: boolean;
  locale?: keyof typeof localeMessages;
}) {
  const fixture = composerFixture();
  const index = kind === "anthropic" ? 1 : 3;
  const column = {
    ...fixture.input.columns[1],
    providerId: kind,
    connectionId: fixture.connections[index].connectionId as `conn_${string}`,
  };
  if (kind === "anthropic")
    column.settings = { ...column.settings, workspaceId: `wrkspc_${"Requested".repeat(7)}` };
  else
    column.settings = {
      ...column.settings,
      allowedProviders: ["anthropic", "bedrock", "inference-net", "typesafe-ai"],
    };
  fixture.catalogs[index] = {
    ...fixture.catalogs[index],
    ...(column.settings.workspaceId ? { workspaceId: column.settings.workspaceId } : {}),
  };
  const result = {
    ...columnResult(0),
    column,
    actualProviderId: kind === "anthropic" ? null : "vertex",
    ...(kind === "anthropic"
      ? { resolvedWorkspaceId: `wrkspc_${"Observed".repeat(8)}` }
      : { routingViolation: "provider_outside_allowed_set" as const }),
  };
  return (
    <FeatureMessagesProvider
      locale={locale}
      timeZone="UTC"
      messages={{ ...sharedMessages, ...localeMessages[locale] }}
    >
      <div className="mx-auto max-w-lg p-4" data-routing-story>
        {drawer ? (
          <ModelPlaygroundColumnSettings
            column={column}
            catalogs={fixture.catalogs}
            connections={fixture.connections}
            mode="edit"
            open
            onClose={() => {}}
            onExited={() => {}}
            onApply={() => {}}
            disabled={false}
            searchEnabled={false}
            market="US"
            copy={composerCopy}
          />
        ) : (
          <ModelPlaygroundColumnFrame column={projectColumnResult(result)} onRemove={() => {}}>
            <p className="m-0 text-ui-body">{result.answer}</p>
          </ModelPlaygroundColumnFrame>
        )}
      </div>
    </FeatureMessagesProvider>
  );
}
const meta = {
  title: "Research/Model Playground Routing",
  component: RoutingStory,
  parameters: { layout: "fullscreen", themeControls: false },
  args: { kind: "anthropic" },
} satisfies Meta<typeof RoutingStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WorkspaceDrawer: Story = { args: { drawer: true } };
export const EligibilityDrawer: Story = { args: { kind: "vercel_ai_gateway", drawer: true } };
export const ObservedWorkspace: Story = {};
export const RoutingViolation: Story = { args: { kind: "vercel_ai_gateway" } };

export const SpanishWorkspace: Story = { args: { drawer: true, locale: "es-ES" } };
export const JapaneseWorkspace: Story = { args: { drawer: true, locale: "ja" } };
export const PolishWorkspace: Story = { args: { drawer: true, locale: "pl" } };
export const SpanishEligibility: Story = {
  args: { kind: "vercel_ai_gateway", drawer: true, locale: "es-ES" },
};
export const JapaneseEligibility: Story = {
  args: { kind: "vercel_ai_gateway", drawer: true, locale: "ja" },
};
export const PolishEligibility: Story = {
  args: { kind: "vercel_ai_gateway", drawer: true, locale: "pl" },
};
