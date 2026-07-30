import { CommandPaletteProvider, CommandPaletteTrigger } from "@/components/shell/CommandPalette";
import type { Meta, StoryObj } from "@storybook/react";

function PaletteStory({ open = false }: { open?: boolean }) {
  return (
    <div className="min-h-[420px] bg-bg p-8 text-fg">
      <CommandPaletteProvider defaultOpen={open} projectId="project_1" projectRef="prj_1">
        <CommandPaletteTrigger />
      </CommandPaletteProvider>
    </div>
  );
}

const meta = {
  title: "Shell/CommandPalette",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Trigger: Story = {
  render: () => <PaletteStory />,
};

export const Open: Story = {
  render: () => <PaletteStory open />,
};
