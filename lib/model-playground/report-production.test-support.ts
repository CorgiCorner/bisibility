import { isPublicIdOfType, makePublicId } from "@/lib/db/public-id-resources";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { preview } from "./contract-fixtures.test-support";
import { createModelPlaygroundStore } from "./store";
import type { ModelPlaygroundDatabase } from "./store-db";

export async function seedProductionReport(db: PrismaClient, database: ModelPlaygroundDatabase) {
  const owner = await db.user.create({
    data: {
      publicId: makePublicId("usr"),
      email: `${crypto.randomUUID()}@fixture.invalid`,
      name: "Fixture",
    },
  });
  const project = await db.project.create({
    data: { publicId: makePublicId("prj"), name: "Fixture", ownerId: owner.id },
  });
  const connectionId = makePublicId("conn");
  if (!isPublicIdOfType(connectionId, "conn")) throw new Error("Invalid fixture connection");
  await db.providerConnection.create({
    data: {
      publicId: connectionId,
      projectId: project.id,
      provider: "openrouter",
      kind: "model",
      credentialSource: "own",
      status: "connected",
    },
  });
  const snapshot = preview();
  snapshot.projectId = project.id;
  snapshot.previewId = crypto.randomUUID();
  snapshot.createdAt = new Date().toISOString();
  snapshot.expiresAt = new Date(Date.now() + 300000).toISOString();
  snapshot.input.columns[0].connectionId = connectionId;
  snapshot.input.columns.push({ ...snapshot.input.columns[0], columnId: crypto.randomUUID() });
  snapshot.columns.push({
    ...snapshot.columns[0],
    columnId: snapshot.input.columns[1].columnId,
  });
  const store = createModelPlaygroundStore(database);
  await store.savePreview(snapshot, owner.id);
  const run = await store.launch({
    version: 1,
    projectId: project.id,
    actorId: owner.id,
    requestId: crypto.randomUUID(),
    previewId: snapshot.previewId,
    configHash: snapshot.configHash,
  });
  const identities = [];
  for (const column of run.columns) {
    const lease = await store.claim({
      projectId: project.id,
      runId: run.id,
      columnId: column.columnId,
      leaseSeconds: 300,
    });
    if (!lease?.leaseToken) throw new Error("Expected lease");
    const identity = {
      projectId: project.id,
      runId: run.id,
      columnId: column.columnId,
      leaseToken: lease.leaseToken,
    };
    await store.fenceDispatch(identity);
    identities.push(identity);
  }
  return { owner, project, snapshot, store, run, identities };
}
