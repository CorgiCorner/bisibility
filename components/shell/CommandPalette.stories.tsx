import { CommandPaletteProvider, CommandPaletteTrigger } from "@/components/shell/CommandPalette";
import { type RegisteredCommand, useRegisterCommands } from "@/components/shell/command-registry";
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

const contextualCommands: RegisteredCommand[] = [
  { id: "rt-add", label: "Add keyword", scope: "rank-tracker", hint: "New keyword", run: () => {} },
  {
    id: "rt-import",
    label: "Import CSV",
    scope: "rank-tracker",
    hint: "Upload file",
    run: () => {},
  },
  {
    id: "rt-export",
    label: "Export keywords",
    scope: "rank-tracker",
    hint: "Download file",
    run: () => {},
  },
];

function ContextualMarker() {
  const ref = useRegisterCommands(contextualCommands);
  return <span ref={ref} hidden aria-hidden />;
}

function ContextualStory() {
  return (
    <div className="min-h-[420px] bg-bg p-8 text-fg">
      <CommandPaletteProvider defaultOpen projectId="project_1" projectRef="prj_1">
        <CommandPaletteTrigger />
        <ContextualMarker />
      </CommandPaletteProvider>
    </div>
  );
}

const meta = {
  title: "Shell/CommandPalette",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Trigger: Story = {
  render: () => <PaletteStory />,
};

export const Open: Story = {
  render: () => <PaletteStory open />,
};

export const Contextual: Story = {
  render: () => <ContextualStory />,
};
