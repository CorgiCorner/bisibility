import {
  AccountEmailCard,
  type AccountEmailCardProps,
  type ConfirmAccountEmailChange,
  type ConfirmCurrentAccountEmailVerification,
  type RequestAccountEmailChange,
  type RequestAccountEmailChangeCode,
  type RequestCurrentAccountEmailVerification,
} from "@/components/account/AccountEmailCard";
import type { Meta, StoryObj } from "@storybook/react";

const requestAccountEmailChangeCode: RequestAccountEmailChangeCode = async () => ({
  currentEmail: "owner@example.com",
  status: "verification_required",
});

const requestAccountEmailChange: RequestAccountEmailChange = async (input) => ({
  currentEmail: "owner@example.com",
  pendingEmail: input.newEmail,
  status: "verification_required",
});

const confirmAccountEmailChange: ConfirmAccountEmailChange = async (input) => ({
  email: input.newEmail,
  emailVerification: "verified",
  status: "changed",
});

const requestCurrentAccountEmailVerification: RequestCurrentAccountEmailVerification = async (
  input,
) => ({ email: input.email, status: "verification_required" });

const confirmCurrentAccountEmailVerification: ConfirmCurrentAccountEmailVerification = async (
  input,
) => ({ email: input.email, emailVerification: "verified", status: "verified" });

const actionProps = {
  confirmAccountEmailChange,
  confirmCurrentAccountEmailVerification,
  requestAccountEmailChange,
  requestAccountEmailChangeCode,
  requestCurrentAccountEmailVerification,
} satisfies Partial<AccountEmailCardProps>;

const meta = {
  component: AccountEmailCard,
  decorators: [
    (Story) => (
      <main className="min-h-screen bg-bg p-4 text-fg sm:p-6">
        <Story />
      </main>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Account/Account email",
} satisfies Meta<typeof AccountEmailCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Verified: Story = {
  args: { ...actionProps, email: "owner@example.com", emailVerified: true },
};

export const Unverified: Story = {
  args: { ...actionProps, email: "unverified@example.com", emailVerified: false },
};

export const NoActions: Story = {
  args: { email: "owner@example.com", emailVerified: true },
};
