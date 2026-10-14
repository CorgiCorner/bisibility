import "server-only";

export async function assertOperationAccess(_projectId: string): Promise<void> {}

/** Core/self-hosted deployment has no subscription authority; native business/key/fence guards remain mandatory. */
export async function assertOperationAccessInTransaction(
  _tx: import("@/lib/generated/prisma/client").Prisma.TransactionClient,
  _projectId: string,
): Promise<void> {}
