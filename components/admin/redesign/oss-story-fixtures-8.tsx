import { type Story, sampleData } from "./oss-story-fixtures-1";
import { Administration } from "./oss-story-fixtures-2";
import { recoveryPage, recoveryScenario } from "./oss-story-fixtures-3";
import { AuditSort, evidenceHigh, evidenceLow, sortRecoveryRow } from "./oss-story-fixtures-7";
import { requireFixture } from "./require-fixture";
export const RecoverySort: Story = recoveryScenario({
  page: {
    ...recoveryPage,
    rows: [
      {
        ...sortRecoveryRow,
        token: "sort-a",
        reference: "ref-sort-a",
        project: "sort-z",
        provider: "alpha",
        send: "accepted",
        work: "completed",
        accounting: "unknown",
        evidence: {
          ...evidenceHigh,
          projection: {
            ...evidenceHigh.projection,
            acceptance: "accepted",
            recovery: {
              ...evidenceHigh.projection.recovery,
              lastAttemptAt: "2026-10-05T00:00:00Z",
            },
          },
        },
        triage: { ...sortRecoveryRow.triage, status: "open" },
      },
      {
        ...sortRecoveryRow,
        token: "sort-b",
        reference: "ref-sort-b",
        project: "sort-a",
        provider: "zulu",
        send: "unknown",
        work: "unfinished",
        accounting: "measured",
        evidence: {
          ...evidenceLow,
          projection: { ...evidenceLow.projection, acceptance: "unconfirmed" },
        },
        triage: { ...sortRecoveryRow.triage, status: "investigating" },
      },
      {
        ...sortRecoveryRow,
        token: "sort-c",
        reference: "ref-sort-c",
        project: "sort-a",
        historical: true,
        provider: "alpha",
        send: "unknown",
        work: "unfinished",
        accounting: "unknown",
        evidence: {
          ...evidenceLow,
          incident: { ...evidenceLow.incident, openedAt: "2026-09-01T00:00:00Z" },
          projection: {
            ...evidenceLow.projection,
            recovery: { ...evidenceLow.projection.recovery, lastAttemptAt: "2026-10-20T00:00:00Z" },
          },
        },
        triage: { ...sortRecoveryRow.triage, status: "waiting_evidence" },
      },
      {
        ...sortRecoveryRow,
        token: "sort-d",
        reference: "ref-sort-d",
        project: null,
        provider: "",
        send: "not_started",
        work: "unknown",
        accounting: "not_applicable",
        evidence: undefined,
        triage: { ...sortRecoveryRow.triage, status: "open" },
      },
    ],
    partialEvidence: [
      {
        id: "a",
        project: "sort-z",
        checkHref: "#sort-a",
        kind: "unresolved",
        returnedDepth: 2,
        createdAt: "2026-10-10T00:00:00Z",
      },
      {
        id: "b",
        project: "sort-a",
        checkHref: "#sort-b",
        kind: "partial",
        returnedDepth: 10,
        createdAt: "2026-10-10T00:00:00Z",
      },
      {
        id: "c",
        project: "sort-a",
        checkHref: "#sort-c",
        kind: "partial",
        returnedDepth: 2,
        createdAt: "2026-10-01T00:00:00Z",
      },
      {
        id: "d",
        project: "",
        checkHref: "#sort-d",
        kind: "unresolved",
        returnedDepth: null,
        createdAt: "2026-10-05T00:00:00Z",
      },
    ],
  },
});

export const auditSortData = requireFixture(AuditSort.args?.data?.audit);

export const AuditTargetTie: Story = {
  args: {
    ...AuditSort.args,
    data: {
      ...sampleData,
      audit: {
        ...auditSortData,
        entries: auditSortData.entries.map((row) =>
          row.id === "sort-c"
            ? { ...row, target: "target-b", targetType: "project", action: "tie-c" }
            : row,
        ),
      },
    },
  },
};

export const AuditActorTie: Story = {
  args: {
    ...AuditSort.args,
    data: {
      ...sampleData,
      audit: {
        ...auditSortData,
        entries: auditSortData.entries.map((row) =>
          row.id === "sort-c" ? { ...row, actor: "beta" } : row,
        ),
      },
    },
  },
};

export const recoverySortData = requireFixture(RecoverySort.args?.data?.recovery);

export const RecoveryDatesTie: Story = recoveryScenario({
  page: {
    ...requireFixture(recoverySortData.page),
    rows: requireFixture(recoverySortData.page).rows.map((row) =>
      row.token === "sort-c" ? { ...row, evidence: evidenceLow } : row,
    ),
  },
});

export const OperationsWorker: Story = {
  args: { initialTab: "Operations", initialView: "Worker" },
};

export const OperationsChecks: Story = {
  args: { initialTab: "Operations", initialView: "Checks" },
};

export const OperationsDataSources: Story = {
  args: { initialTab: "Operations", initialView: "Data sources" },
};

export const OperationsTasks: Story = { args: { initialTab: "Operations", initialView: "Tasks" } };

export const OperationsNotifications: Story = {
  args: { initialTab: "Operations", initialView: "Notifications" },
};

export const UsersAccounts: Story = {
  ...Administration,
  args: { ...Administration.args, initialTab: "Users", initialView: "Accounts" },
};

export const EmailSendingToday: Story = {
  args: { initialTab: "Email", initialView: "Sending today" },
};
