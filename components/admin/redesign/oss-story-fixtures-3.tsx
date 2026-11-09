import type { OssAdminData } from "./OssAdminViews";
import { type Story, sampleData } from "./oss-story-fixtures-1";
import {
  Administration,
  account,
  adminOutcome,
  adminProps,
  EmailSettings,
  recovery,
} from "./oss-story-fixtures-2";
export const AccountForbidden = adminOutcome({ status: "forbidden", message: "" });

export const AccountLimited = adminOutcome({
  status: "rate_limited",
  message: "",
  retryAt: "2026-11-04T12:00:00Z",
});

export const AccountFailed = adminOutcome({ status: "failed", message: "" });

export const AccountLimitsCompleted = adminOutcome({
  status: "completed",
  clearedBuckets: 2,
  message: "",
});

export const AccountLimitsFailed = adminOutcome({ status: "failed", message: "" });

export const configuredMail = {
  credentialsConfigured: true,
  envOverridesSaved: true,
  hasPasswordCredential: true,
  provider: "smtp" as const,
  sender: "Admin <admin@example.com>",
  twoFactorEnabled: true,
};

export const mailScenario = (
  status:
    | "saved"
    | "cleared"
    | "forbidden"
    | "rate_limited"
    | "two_factor_required"
    | "unavailable"
    | "invalid",
): Story => ({
  args: {
    ...EmailSettings.args,
    data: {
      ...sampleData,
      administration: {
        ...adminProps,
        mailSettings: configuredMail,
        mailerConfigured: false,
        onSaveMail: () => ({ status }),
        onClearMail: () => ({ status }),
      },
    },
  },
});

export const MailConfigured = mailScenario("saved");

export const MailCleared = mailScenario("cleared");

export const MailForbidden = mailScenario("forbidden");

export const MailLimited = mailScenario("rate_limited");

export const MailTwoFactor = mailScenario("two_factor_required");

export const MailUnavailable = mailScenario("unavailable");

export const MailInvalid = mailScenario("invalid");

export const MailPending: Story = {
  args: {
    ...EmailSettings.args,
    data: {
      ...sampleData,
      administration: {
        ...adminProps,
        mailSettings: configuredMail,
        onSaveMail: () => new Promise(() => {}),
      },
    },
  },
};

export const MailClearPending: Story = {
  args: {
    ...EmailSettings.args,
    data: {
      ...sampleData,
      administration: {
        ...adminProps,
        mailSettings: configuredMail,
        onClearMail: () => new Promise(() => {}),
      },
    },
  },
};

export const MailTwoFactorRequired: Story = {
  args: {
    ...EmailSettings.args,
    data: {
      ...sampleData,
      administration: {
        ...adminProps,
        twoFactorEnabled: false,
        mailSettings: { ...configuredMail, twoFactorEnabled: false },
      },
    },
  },
};

export const AccountTwoFactorRequired: Story = {
  args: {
    ...Administration.args,
    data: { ...sampleData, administration: { ...adminProps, account, twoFactorEnabled: false } },
  },
};

export const recoveryScenario = (props: Partial<NonNullable<OssAdminData["recovery"]>>): Story => ({
  args: {
    initialTab: "Operations",
    initialView: "Tasks",
    data: { ...sampleData, recovery: { ...recovery, ...props } },
  },
});

export const recoveryPage = {
  ...recovery.page,
  summary: {
    ...recovery.page.summary,
    closedUnknown: 1,
    lastResultActivityAt: "2026-10-13T09:58:00Z",
  },
  nextCursor: "older",
  partialEvidence: [
    {
      id: "sample-evidence",
      kind: "partial" as const,
      project: "prj_example_pending",
      checkHref: "#sample-check",
      returnedDepth: 42,
      createdAt: "2026-10-13T09:58:00Z",
    },
  ],
  rows: recovery.page.rows.map((row, index) =>
    index === 0
      ? { ...row, closedUnknown: true }
      : index === 1
        ? {
            ...row,
            provider: "example-provider",
            spendingBlocked: { project: true, connection: true },
            evidence: {
              incident: {
                href: "#sample-incident",
                openedAt: "2026-10-13T08:00:00Z",
                ageMinutes: 118,
              },
              projection: {
                acceptance: "accepted" as const,
                fulfillment: "partial" as const,
                returnedDepth: 42,
                accounting: "unknown" as const,
                result: "partial" as const,
                cost: "unknown" as const,
                originalCheckedAt: "2026-10-13T08:00:00Z",
                recovery: {
                  state: "scheduled" as const,
                  lastAttemptAt: "2026-10-13T09:00:00Z",
                  nextAttemptAt: "2026-10-13T11:00:00Z",
                  reason: "Awaiting evidence",
                },
              },
            },
          }
        : index === 2
          ? { ...row, blockedReason: "proof_missing" as const }
          : row,
  ),
};

export const recoveryRuns = ["run-1", "run-2", "run-3"];
