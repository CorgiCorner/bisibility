import { type Story, sampleData } from "./oss-story-fixtures-1";
import { Audit } from "./oss-story-fixtures-2";
import { recoveryPage } from "./oss-story-fixtures-3";
import { requireFixture } from "./require-fixture";
export const AuditSort: Story = {
  args: {
    ...Audit.args,
    data: {
      ...sampleData,
      audit: {
        onNext: () => {},
        entries: [
          {
            id: "sort-a",
            time: "2026-07-17T12:00:00Z",
            actor: "zulu",
            action: "change",
            target: "target-z",
            targetType: "project",
            result: "blocked",
            category: "setup",
          },
          {
            id: "sort-b",
            time: "2026-07-16T12:00:00Z",
            actor: "beta",
            action: "reset",
            target: "target-b",
            targetType: "project",
            result: "ok",
            category: "ops",
          },
          {
            id: "sort-c",
            time: "2026-07-16T12:00:00Z",
            actor: "alpha",
            action: "reset",
            target: "target-a",
            targetType: "project",
            result: "failed",
            category: "ops",
          },
          {
            id: "sort-d",
            time: "2026-07-14T12:00:00Z",
            actor: "",
            action: "audit",
            target: "",
            targetType: "user",
            result: "failed",
            category: "account",
          },
        ],
      },
    },
  },
};

export const sortEvidence = requireFixture(recoveryPage.rows[1].evidence);

export const evidenceLow = {
  ...sortEvidence,
  incident: { ...requireFixture(sortEvidence.incident), openedAt: "2026-10-01T00:00:00Z" },
  projection: {
    ...requireFixture(sortEvidence.projection),
    result: "partial" as const,
    acceptance: "accepted" as const,
    recovery: {
      ...requireFixture(requireFixture(sortEvidence.projection).recovery),
      lastAttemptAt: "2026-10-01T00:00:00Z",
    },
  },
};

export const evidenceHigh = {
  ...sortEvidence,
  incident: { ...requireFixture(sortEvidence.incident), openedAt: "2026-10-10T00:00:00Z" },
  projection: {
    ...requireFixture(sortEvidence.projection),
    result: "recovered" as const,
    acceptance: "unconfirmed" as const,
    recovery: {
      ...requireFixture(requireFixture(sortEvidence.projection).recovery),
      lastAttemptAt: "2026-10-10T00:00:00Z",
    },
  },
};

export const sortRecoveryRow = recoveryPage.rows[1];
