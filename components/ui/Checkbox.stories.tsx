import { Checkbox } from "@/components/ui/Checkbox";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/Checkbox",
  component: Checkbox,
  decorators: [
    (Story) => (
      <div className="max-w-md bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Checkbox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Checkbox
        defaultChecked
        description="Counts acme.dev and www.acme.dev across HTTP and HTTPS."
        label="Primary domain + www"
        name="rootAndWww"
      />
      <Checkbox
        description="Also counts docs.acme.dev, app.acme.dev, and other subdomains."
        label="All subdomains"
        name="includeSubdomains"
      />
      <Checkbox disabled label="URL prefix only" name="urlPrefix" />
    </div>
  ),
};

export const NotificationControl: Story = {
  render: () => (
    <Checkbox aria-label="In-app alerts" controlClassName="mt-0 size-5" defaultChecked />
  ),
};
