import { busyTemporal } from "@/components/admin/admin-dashboard-test-fixtures";
import { useState } from "react";
import { OssAdminComposition } from "./OssAdminComposition";
import { dashboard, operations, type Story, sampleData } from "./oss-story-fixtures-1";
import { Administration, account, adminProps, EmailSettings } from "./oss-story-fixtures-2";
import { configuredMail } from "./oss-story-fixtures-3";
export const AccountLookupParity: Story = {
  render: (args) => {
    const [found, setFound] = useState(false);
    return (
      <OssAdminComposition
        {...args}
        data={{
          ...sampleData,
          administration: {
            ...adminProps,
            account: found ? account : null,
            onLookup: (query) => setFound(query === "sample@example.com"),
          },
        }}
      />
    );
  },
  args: Administration.args,
};

export const MailSaveParity: Story = {
  render: (args) => {
    const [saved, setSaved] = useState(false);
    return (
      <OssAdminComposition
        {...args}
        data={{
          ...sampleData,
          administration: {
            ...adminProps,
            mailSettings: saved ? { ...configuredMail, envOverridesSaved: false } : undefined,
            onSaveMail: (values) => {
              if (values.sender === "admin@example.com" && values.smtpHost === "smtp.example.com") {
                setSaved(true);
                return { status: "saved" };
              }
              return { status: "invalid" };
            },
          },
        }}
      />
    );
  },
  args: EmailSettings.args,
};

export const sortSchedules = [
  {
    ...busyTemporal.heartbeat.scheduleIssues[0],
    scheduleId: "sort-z",
    missedCatchup: 10,
    skippedOverlap: 2,
  },
  {
    ...busyTemporal.heartbeat.scheduleIssues[0],
    scheduleId: "sort-a",
    missedCatchup: 2,
    skippedOverlap: 10,
  },
  {
    ...busyTemporal.heartbeat.scheduleIssues[0],
    scheduleId: "sort-b",
    missedCatchup: 2,
    skippedOverlap: 10,
  },
  {
    ...busyTemporal.heartbeat.scheduleIssues[0],
    scheduleId: "sort-c",
    missedCatchup: 0,
    skippedOverlap: 0,
  },
];

export const OverviewSort: Story = {
  args: {
    data: {
      ...sampleData,
      operations: {
        ...operations,
        data: {
          ...dashboard,
          temporal: {
            ...dashboard.temporal,
            heartbeat: { ...dashboard.temporal.heartbeat, scheduleIssues: sortSchedules },
          },
          ops: {
            ...dashboard.ops,
            events: [
              {
                kind: "sort-b",
                severity: "info",
                attempts: 10,
                createdAt: "2026-07-17T12:00:00Z",
                deliveredAt: "2026-07-17T12:01:00Z",
              },
              {
                kind: "sort-a",
                severity: "warning",
                attempts: 2,
                createdAt: "2026-07-16T12:00:00Z",
                deliveredAt: null,
              },
              {
                kind: "sort-a",
                severity: "warning",
                attempts: 4,
                createdAt: "2026-07-16T12:00:00Z",
                deliveredAt: null,
              },
              {
                kind: "sort-z",
                severity: "error",
                attempts: 4,
                createdAt: "2026-07-14T12:00:00Z",
                deliveredAt: "2026-07-14T12:01:00Z",
              },
            ],
          },
        },
      },
    },
  },
};
