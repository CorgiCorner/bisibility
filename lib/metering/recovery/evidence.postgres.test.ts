import { prisma } from "@/lib/db/prisma";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
  recoveryFixture,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { afterAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ actor: "" }));
vi.mock("@/lib/auth/instance-admin", () => ({
  requireInstanceAdmin: async () => ({ user: { id: session.actor } }),
}));

import { readRecoveryPage } from "./read";
import { recoveryInstance } from "./tokens";
import { updateRecoveryTriage } from "./triage";

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "UI-8 recovery evidence PostgreSQL",
  () => {
    afterAll(async () => {
      await prisma.meteringRecoveryTriage.deleteMany({ where: { namespace: fixtureNamespace } });
      await cleanRecoveryFixtures();
      await prisma.$disconnect();
      vi.unstubAllEnvs();
    });
    it("reuses dimensions, shows UTC reopening age and lookup attempts, and lists only inert partial records", async () => {
      vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
      const f = await recoveryFixture({ canonical: true });
      session.actor = f.user.id;
      await prisma.user.update({ where: { id: f.user.id }, data: { isInstanceAdmin: true } });
      await prisma.meteringOperation.update({
        where: { operation_pk: f.operationPk },
        data: {
          input: {
            provider: "dataforseo",
            operation: "rank_check",
            scope: { group: f.project.id, connection: f.connection.id },
          },
        },
      });
      const openedAt = new Date(f.now.getTime() - 86400000);
      const reopenedAt = new Date(f.now.getTime() - 3600000);
      const incident = await prisma.providerIncident.create({
        data: {
          projectId: f.project.id,
          cause: "dataforseo:rank_check",
          openedAt,
          operations: { create: { operationPk: f.operationPk } },
          transitions: {
            create: [
              { version: 1, kind: "linked", counts: {}, createdAt: openedAt },
              {
                version: 2,
                kind: "resolved",
                counts: {},
                createdAt: new Date(openedAt.getTime() + 1000),
              },
              { version: 3, kind: "reopened", counts: {}, createdAt: reopenedAt },
              {
                version: 4,
                kind: "linked",
                counts: {},
                createdAt: new Date(f.now.getTime() - 60000),
              },
              { version: 5, kind: "count_change", counts: {}, createdAt: f.now },
            ],
          },
        },
      });
      await prisma.providerOperationEvidence.create({
        data: {
          operationPk: f.operationPk,
          acceptance: "unconfirmed",
          fulfillment: "partial",
          accounting: "unknown",
          exhaustionStatus: "pending",
          returnedDepth: 20,
          recoveryState: "operator_review",
          lastAttemptAt: reopenedAt,
          nextAttemptAt: f.now,
          recoveryReason: "history_not_ready",
        },
      });
      for (const kind of ["partial", "unresolved"] as const)
        await prisma.providerPartialEvidence.create({
          data: {
            namespace: fixtureNamespace,
            instanceId: recoveryInstance(),
            rankCheckId: f.check.id,
            kind,
            payloadEncrypted: "synthetic-ciphertext",
            identityHash: "synthetic",
            returnedDepth: kind === "partial" ? 20 : null,
            expiresAt: new Date(f.now.getTime() + 86400000),
          },
        });
      const page = await readRecoveryPage(f.user.id, {}, f.now);
      const row = page.rows.find(
        (row) => row.kind === "operation" && row.evidence?.projection?.acceptance === "unconfirmed",
      );
      expect(row?.evidence).toMatchObject({
        projection: {
          result: "partial",
          cost: "under_review",
          acceptance: "unconfirmed",
          returnedDepth: 20,
          recovery: {
            state: "operator_review",
            lastAttemptAt: reopenedAt.toISOString(),
            nextAttemptAt: f.now.toISOString(),
            reason: "history_not_ready",
          },
        },
        incident: {
          openedAt: reopenedAt.toISOString(),
          ageMinutes: 60,
          href: expect.stringContaining(`incidentId=${incident.id}`),
        },
      });
      expect(page.partialEvidence).toHaveLength(2);
      expect(page.partialEvidence?.map((row) => row.kind).sort()).toEqual([
        "partial",
        "unresolved",
      ]);
      for (const partial of page.partialEvidence ?? []) {
        expect(partial).not.toHaveProperty("action");
        expect(partial).not.toHaveProperty("payloadEncrypted");
      }
      expect(row?.action).not.toBe("restore_result");

      const invariant = async () => ({
        incident: await prisma.providerIncident.findUnique({
          where: { id: incident.id },
          include: { transitions: true, operations: true },
        }),
        evidence: await prisma.providerOperationEvidence.findUnique({
          where: { operationPk: f.operationPk },
        }),
        check: await prisma.rankCheck.findUnique({ where: { id: f.check.id } }),
        summaries: await prisma.checkNotificationSummary.findMany(),
        receipts: await prisma.meteringReceipt.findMany({
          where: { operation: { namespace: fixtureNamespace } },
        }),
        operation: await prisma.meteringOperation.findUnique({
          where: { operation_pk: f.operationPk },
        }),
      });
      const before = await invariant();
      for (const status of [
        "acknowledged",
        "investigating",
        "waiting_evidence",
        "escalated",
      ] as const) {
        const fresh = await readRecoveryPage(f.user.id, {});
        const current = fresh.rows.find(
          (value) => value.kind === row?.kind && value.evidence?.projection?.returnedDepth === 20,
        );
        if (!current) throw new Error("Fixture case disappeared");
        await updateRecoveryTriage({
          caseToken: current.token,
          expectedVersion: current.version,
          status,
          reason: "provider_support",
          assignToMe: true,
          snoozedUntil:
            status === "waiting_evidence" ? new Date(Date.now() + 3600000).toISOString() : null,
        });
        expect(await invariant()).toEqual(before);
      }
    });
  },
);
