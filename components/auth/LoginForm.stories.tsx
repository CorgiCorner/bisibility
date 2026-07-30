import { LoginForm } from "@/components/auth/LoginForm";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Auth/LoginForm",
  component: LoginForm,
  args: {
    dataResidencyMessage: "Your data is stored and processed in the EU.",
    legalConsentLinks: { privacyHref: "/privacy", termsHref: "/terms" },
  },
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof LoginForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const available = {
  emailCodes: { binding: "daily" as const, cap: 200, left: 143 },
  googleSpots: { cap: 100, left: 14 },
  signupsToday: 26,
};

const cloudArgs = {
  capacity: available,
  enabledProviders: { github: true, google: true },
};

export const CloudAvailable: Story = {
  args: cloudArgs,
};

export const GoogleFull: Story = {
  args: {
    ...cloudArgs,
    capacity: { ...available, googleSpots: { cap: 100, left: 0 } },
  },
};

export const EmailFull: Story = {
  args: {
    ...cloudArgs,
    capacity: { ...available, emailCodes: { binding: "daily", cap: 200, left: 0 } },
  },
};

export const BothFull: Story = {
  args: {
    ...cloudArgs,
    capacity: {
      ...available,
      emailCodes: { binding: "daily", cap: 200, left: 0 },
      googleSpots: { cap: 100, left: 0 },
    },
  },
};

export const GoogleJustMissed: Story = {
  args: { ...cloudArgs, capacityMiss: "google" },
};

export const EmailJustMissed: Story = {
  args: { ...cloudArgs, capacityMiss: "email" },
};

export const EmailCapacityUnknown: Story = {
  args: {
    ...cloudArgs,
    capacity: { ...available, emailCodes: null },
  },
};

export const MonthlyEmailFull: Story = {
  args: {
    ...cloudArgs,
    capacity: {
      ...available,
      emailCodes: { binding: "monthly", cap: 3_000, left: 0 },
    },
  },
};
