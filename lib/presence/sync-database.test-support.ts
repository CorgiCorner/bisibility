import type { Mock } from "vitest";

type PresenceMocks = {
  findMany: Mock;
  findUnique: Mock;
  createMany: Mock;
  updateMany: Mock;
  upsert: Mock;
};
type DatabaseMocks = {
  $executeRaw: Mock;
  urlPresence: PresenceMocks;
  urlPresenceChange: { create: Mock };
  projectDefaults: { upsert: Mock };
};

// Candidate discovery inserts unchecked rows; storage then reads the same rows under its lock.
export function configurePresenceDatabase(prisma: DatabaseMocks, tx: DatabaseMocks = prisma) {
  prisma.urlPresence.createMany.mockImplementation(async ({ data }) => {
    const previous = await prisma.urlPresence.findMany();
    const urls = new Set(previous.map((row: { url: string }) => row.url));
    prisma.urlPresence.findMany.mockResolvedValue([
      ...previous.map((row: object) => ({ source: "keyword_target", ...row })),
      ...data.filter((row: { url: string }) => !urls.has(row.url)),
    ]);
    return { count: data.length };
  });
  tx.urlPresence.createMany = prisma.urlPresence.createMany;
  tx.urlPresence.findMany = prisma.urlPresence.findMany;
  tx.urlPresence.updateMany = prisma.urlPresence.updateMany;
  tx.urlPresence.upsert = prisma.urlPresence.upsert;
  tx.urlPresence.findUnique.mockImplementation(
    async ({ where }) =>
      (await prisma.urlPresence.findMany()).find(
        (row: { url: string }) => row.url === where.projectId_url.url,
      ) ?? null,
  );
}
