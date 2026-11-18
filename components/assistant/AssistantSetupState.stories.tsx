import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import en from "@/messages/core/en/assistant.json";
import es from "@/messages/core/es-ES/assistant.json";
import ja from "@/messages/core/ja/assistant.json";
import pl from "@/messages/core/pl/assistant.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AssistantFrame } from "./AssistantFrame";
import { AssistantSetupState } from "./AssistantSetupState";

const messages = { en, "es-ES": es, ja, pl };
const meta = {
  title: "Assistant/Setup",
  component: AssistantSetupState,
  parameters: { layout: "fullscreen", themeControls: false },
  args: { project: "prj_fixture", checking: false, onCheck: () => undefined },
  decorators: [
    (Story, context) => {
      const requested = context.globals.locale;
      const locale: keyof typeof messages =
        requested === "pl" || requested === "ja" || requested === "es-ES" ? requested : "en";
      return (
        <FeatureMessagesProvider locale={locale} messages={messages[locale]} timeZone="UTC">
          <AssistantFrame actions={null} close={() => undefined} open subtitle="Example project">
            <Story />
          </AssistantFrame>
        </FeatureMessagesProvider>
      );
    },
  ],
} satisfies Meta<typeof AssistantSetupState>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NotConfigured: Story = {};
export const Checking: Story = { args: { checking: true } };
