import { CommandPaletteProvider, CommandPaletteTrigger } from "@/components/shell/CommandPalette";
import { type RegisteredCommand, useRegisterCommands } from "@/components/shell/command-registry";
import type { Meta, StoryObj } from "@storybook/react";

const markets = [
  { label: "Malaga / Spanish", ref: "pmkt_malaga00000000000000000" },
  { label: "Belgium / Dutch", ref: "pmkt_belgiumdutch00000000000" },
];

function PaletteStory({
  markets: projectMarkets = [],
  open = false,
}: {
  markets?: readonly { label: string; ref: string }[];
  open?: boolean;
}) {
  return (
    <div className="min-h-[420px] bg-bg p-8 text-fg">
      <CommandPaletteProvider
        defaultOpen={open}
        markets={projectMarkets}
        projectId="project_1"
        projectRef="prj_1"
      >
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

/** With markets tracked, the palette leads with the page-in-market rows. */
export const Markets: Story = {
  render: () => <PaletteStory markets={markets} open />,
};

export const Contextual: Story = {
  render: () => <ContextualStory />,
};
