import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertRecoveryFixtureUrl } from "./fixture-url.test-support";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
  protectedRecoverySnapshot,
  recoveryFixture,
} from "./postgres.test-support";
import { previewProviderRecovery } from "./preview";

const url = process.env.METERING_TEST_DATABASE_URL;
describe.skipIf(!url)("recovery read-only preview PostgreSQL", () => {
  beforeEach(() => {
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    assertRecoveryFixtureUrl(url);
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
  });
  afterEach(async () => {
    await cleanRecoveryFixtures();
    vi.unstubAllEnvs();
  });
  afterAll(async () => prisma.$disconnect());
  it("RE-13 database preview reports all four captured classes without modifying nonempty evidence or customer tables", async () => {
    const ambiguous = await recoveryFixture();
    const measured = await recoveryFixture();
    const incomplete = await recoveryFixture();
    const proven = await recoveryFixture();
    for (const f of [measured, incomplete]) {
      await prisma.$executeRaw`INSERT INTO metering_history_import (migration_id,source_id,source_hash,target_hash,namespace,operation_id,created_operation,body)
        VALUES ('fixture',${f.operationId},'fixture','fixture',${fixtureNamespace},${f.operationId},true,'{}'::jsonb)`;
    }
    await prisma.providerDispatchIdentity.delete({
      where: { operationPk: incomplete.operationPk },
    });
    await prisma.meteringReceipt.create({
      data: {
        receipt_pk: `receipt-${measured.operationPk}`,
        operation_pk: measured.operationPk,
        receipt_id: "measured-receipt",
        body: {},
        occurred_at: measured.now,
        recorded_at: measured.now,
        cost_units: 20n,
        cost_certainty: "measured",
        sequence: 1,
        measurements: { create: { unit: "searches", certainty: "unknown" } },
      },
    });
    await prisma.meteringReceipt.create({
      data: {
        receipt_pk: `receipt-${proven.operationPk}`,
        operation_pk: proven.operationPk,
        receipt_id: "proven-receipt",
        body: { providerRequestId: "native-proven" },
        occurred_at: proven.now,
        recorded_at: proven.now,
        cost_certainty: "unknown",
        sequence: 1,
      },
    });
    await prisma.meteringUsageEvidence.create({
      data: {
        id: `e-${proven.operationPk}`,
        namespace: fixtureNamespace,
        principal: "original-principal",
        projectId: proven.project.id,
        connectionId: proven.connection.id,
        provider: "dataforseo",
        feature: "rank_check",
        source: "api",
        correlationId: proven.check.id,
        unit: "searches",
        estimate: {},
        createdAt: proven.now,
        providerRequestId: "native-proven",
        receiptId: "native-receipt",
        receipt: { native: true },
        proofVersion: 1,
      },
    });
    await prisma.providerOperationEvidence.create({
      data: { operationPk: ambiguous.operationPk, acceptance: "unconfirmed" },
    });
    await prisma.notificationPreference.create({
      data: { userId: ambiguous.user.id, projectId: ambiguous.project.id },
    });
    await prisma.notification.create({
      data: {
        publicId: makePublicId("ntf"),
        userId: ambiguous.user.id,
        projectId: ambiguous.project.id,
        type: "system",
        title: "Unchanged fixture",
      },
    });
    const snapshot = async () => ({
      protected: await protectedRecoverySnapshot(),
      evidence: await prisma.providerOperationEvidence.findMany({
        orderBy: { operationPk: "asc" },
      }),
      identities: await prisma.providerDispatchIdentity.findMany({
        orderBy: { operationPk: "asc" },
      }),
    });
    const before = await snapshot();
    const preview = await previewProviderRecovery(fixtureNamespace);
    const byId = Object.fromEntries(
      preview.cases.map((row) => [row.operationPk, row.classification]),
    );
    expect(byId[ambiguous.operationPk]).toBe("current_ambiguous_submission");
    expect(byId[measured.operationPk]).toBe("measured_cost_import_unknown_units");
    expect(byId[incomplete.operationPk]).toBe("identity_incomplete_historical_import");
    expect(byId[proven.operationPk]).toBe("native_proven");
    expect(await snapshot()).toEqual(before);
  });
});
