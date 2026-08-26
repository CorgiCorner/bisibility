type ProjectLockClient = {
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
};

export async function lockProjectForProviderMutation(
  tx: ProjectLockClient,
  internalProjectId: string,
) {
  await tx.$queryRaw`SELECT "id" FROM "projects" WHERE "id" = ${internalProjectId} FOR UPDATE`;
}
