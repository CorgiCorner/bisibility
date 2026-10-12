import assert from "node:assert/strict";
import { e2ePrisma } from "./rank-tracker-data-table-helpers";

/** Only this test's project in the guarded ephemeral schema is changed. Keywords stay intact. */
export async function setOwnedProjectMarketCount(projectRef: string, count: 0 | 1) {
  const db = e2ePrisma();
  await db.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({
      where: { publicId: projectRef },
      select: { id: true },
    });
    const owners = await tx.membership.findMany({
      where: { projectId: project.id, role: "owner" },
      select: { user: { select: { email: true } } },
    });
    assert(
      owners.length === 1 &&
        /^e2e-rank-table-[a-z0-9-]+@example\.com$/.test(owners[0]?.user.email ?? ""),
      "Only the owned Rank Tracker test project may be changed.",
    );
    const rows = await tx.projectMarket.findMany({
      where: { projectId: project.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    assert(rows.length >= count);
    await tx.projectMarket.deleteMany({
      where: { projectId: project.id, id: { in: rows.slice(count).map(({ id }) => id) } },
    });
    assert.equal(await tx.projectMarket.count({ where: { projectId: project.id } }), count);
  });
}
