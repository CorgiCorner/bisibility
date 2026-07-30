import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { Meta, StoryObj } from "@storybook/react";
import { KeywordInlineEdit } from "./KeywordInlineEdit";

const updateKeywordAction = async () => undefined;

function installFetchStub() {
  const original = window.fetch;
  window.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes("/api/locations/search")) {
      return new Response(JSON.stringify({ data: [] }), {
        headers: { "content-type": "application/json" },
      });
    }
    return original(input);
  }) as typeof window.fetch;
}

const meta = {
  title: "Keywords/KeywordInlineEdit",
  component: KeywordInlineEdit,
  decorators: [
    (Story) => {
      installFetchStub();
      return (
        <div className="min-h-[180px] bg-bg-elev p-6 text-fg">
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof KeywordInlineEdit>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Form: Story = {
  args: {
    keyword: keywordRows[1],
    onSaved: () => undefined,
    updateKeywordAction,
  },
  parameters: {
    docs: {
      description: {
        story: "Editable keyword fields include contextual help in their labels.",
      },
    },
  },
};
