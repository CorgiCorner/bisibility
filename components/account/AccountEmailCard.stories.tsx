import {
  AccountEmailCard,
  type AccountEmailCardProps,
  type ConfirmAccountEmailChangeInput,
  type ConfirmAccountEmailChangeResult,
  type ConfirmCurrentAccountEmailVerification,
  type RequestAccountEmailChangeInput,
  type RequestAccountEmailChangeResult,
  type RequestCurrentAccountEmailVerification,
} from "@/components/account/AccountEmailCard";
import type { Meta, StoryObj } from "@storybook/react";

const requestAccountEmailChange = async (
  input: RequestAccountEmailChangeInput,
): Promise<RequestAccountEmailChangeResult> => ({
  currentEmail: "owner@example.com",
  pendingEmail: input.newEmail,
  status: "verification_required",
});

const confirmAccountEmailChange = async (
  input: ConfirmAccountEmailChangeInput,
): Promise<ConfirmAccountEmailChangeResult> => ({
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
