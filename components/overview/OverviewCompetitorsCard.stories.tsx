import type { Meta, StoryObj } from "@storybook/react";
import { OverviewCompetitorsCard } from "./OverviewCompetitorsCard";

const meta = {
  component: OverviewCompetitorsCard,
  parameters: { layout: "padded", nextjs: { appDirectory: true } },
  title: "Components/Overview/Competitors",
  args: {
    projectRef: "prj_example",
    data: {
      limited: false,
      rows: [
        {
          id: "cmp_example",
          domain: "example.org",
          label: "A custom competitor name",
          found: 5,
          checked: 8,
          above: 2,
          paired: 4,
          averagePosition: 3.4,
        },
        {
          id: "cmp_long",
          domain: "long-subdomain.example.com",
          label: "Another competitor",
          found: 3,
          checked: 8,
          above: 1,
          paired: 3,
          averagePosition: 12.1,
        },
      ],
    },
  },
} satisfies Meta<typeof OverviewCompetitorsCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const UrlLinks: Story = {};
