import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { ChoiceGroup } from "./ChoiceGroup";

const options = [
  { value: "chat_gpt", label: "ChatGPT", description: "GPT-4.1" },
  { value: "claude", label: "Claude", description: "Claude Sonnet" },
  { value: "gemini", label: "Gemini", description: "Gemini Pro" },
  { value: "perplexity", label: "Perplexity", description: "Sonar" },
];
const meta = {
  title: "UI/ChoiceGroup",
  component: ChoiceGroup,
  parameters: { layout: "padded" },
  args: { mode: "multiple", label: "AI engines", options, value: [], onChange: () => {} },
} satisfies Meta<typeof ChoiceGroup>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Multiple: Story = {
  render: () => {
    const [value, onChange] = useState<string[]>(["chat_gpt"]);
    return (
      <ChoiceGroup
        mode="multiple"
        label="AI engines"
        options={options}
        value={value}
        onChange={onChange}
      />
    );
  },
};
export const Single: Story = {
  render: () => {
    const [value, onChange] = useState("chat_gpt");
    return (
      <ChoiceGroup
        mode="single"
        label="AI engine"
        options={options}
        value={value}
        onChange={onChange}
      />
    );
  },
};
export const MaxReached: Story = {
  render: () => {
    const [value, onChange] = useState<string[]>(["chat_gpt", "claude"]);
    return (
      <ChoiceGroup
        mode="multiple"
        label="AI engines"
        options={options}
        value={value}
        onChange={onChange}
        max={2}
        maxHint="Choose up to 2 engines per check."
      />
    );
  },
};
export const Disabled: Story = {
  render: () => (
    <ChoiceGroup
      mode="multiple"
      label="AI engines"
      options={options.map((option) => ({
        ...option,
        disabledReason: "Connect a data source to use this engine.",
      }))}
      value={[]}
      onChange={() => {}}
    />
  ),
};
export const LongLabels: Story = {
  render: () => (
    <ChoiceGroup
      mode="multiple"
      label="Search coverage"
      options={[
        {
          value: "long",
          label: "Google AI Overviews for a very long named search market",
          description: "An explanation that wraps on smaller screens without clipping the option.",
        },
        ...options,
      ]}
      value={["long"]}
      onChange={() => {}}
    />
  ),
};
export const Mobile: Story = {
  ...Multiple,
  parameters: { viewport: { defaultViewport: "mobile1" } },
  decorators: [
    (Story) => (
      <div className="max-w-[320px]">
        <Story />
      </div>
    ),
  ],
};
